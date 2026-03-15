/**
 * REGISTRAL — AuthContext
 * src/core/auth/AuthContext.jsx
 *
 * Expone: { user, tenant, userRole, loading, error,
 *           signIn, signOut, signUp, updateTenant, refreshTenant }
 *
 * Flujo:
 *   1. onAuthStateChange detecta sesión → fetch user row + tenant row
 *   2. signUp → auth.signUp → createTenantAndUser → setear estado
 *   3. Los componentes consumen con useAuth()
 */

import { createContext, useCallback, useContext, useEffect, useReducer } from 'react'
import PropTypes from 'prop-types'
import { supabase } from '../supabase/client'
import { createTenantAndUser } from '../supabase/queries/provisionTenant'

// ─────────────────────────────────────────────────────────────
// ESTADO
// ─────────────────────────────────────────────────────────────

const initialState = {
  user:      null,   // auth.User de Supabase
  tenant:    null,   // fila completa de tenants{}
  userRole:  null,   // 'owner' | 'admin' | 'operator' | 'readonly'
  loading:   true,   // true durante la hidratación inicial
  error:     null,
}

function authReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload }
    case 'SET_SESSION':
      return {
        ...state,
        user:     action.payload.user,
        tenant:   action.payload.tenant,
        userRole: action.payload.userRole,
        loading:  false,
        error:    null,
      }
    case 'UPDATE_TENANT':
      return { ...state, tenant: { ...state.tenant, ...action.payload } }
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false }
    case 'SIGN_OUT':
      return { ...initialState, loading: false }
    default:
      return state
  }
}

// ─────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────

const AuthContext = createContext(null)

// ─────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────

async function fetchUserAndTenant(authUserId) {
  // Traer user row primero (necesitamos tenant_id para la segunda query)
  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('tenant_id, role, full_name, is_active')
    .eq('id', authUserId)
    .single()

  if (userError || !userRow) {
    return { userRow: null, tenant: null }
  }

  if (!userRow.is_active) {
    throw new Error('Tu cuenta está desactivada. Contactá al administrador.')
  }

  // Traer tenant completo (incluye campos que PresetContext necesita)
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .select('id, name, rubro, plan, billing_status, settings, preset_config, usage_stats')
    .eq('id', userRow.tenant_id)
    .single()

  if (tenantError || !tenant) {
    throw new Error('No se pudo cargar la configuración del negocio.')
  }

  return { userRow, tenant }
}

// ─────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────

export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // ── Hidratar sesión al mount ──────────────────────────────

  useEffect(() => {
    let cancelled = false
    let hydrated  = false

    async function hydrate() {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (cancelled) return

        if (!session?.user) {
          dispatch({ type: 'SET_SESSION', payload: { user: null, tenant: null, userRole: null } })
          return
        }

        const { userRow, tenant } = await fetchUserAndTenant(session.user.id)

        if (!cancelled) {
          hydrated = true
          dispatch({
            type: 'SET_SESSION',
            payload: {
              user:     session.user,
              tenant:   tenant ?? null,
              userRole: userRow?.role ?? null,
            },
          })
        }
      } catch (err) {
        if (!cancelled) dispatch({ type: 'SET_ERROR', payload: err.message })
      }
    }

    hydrate()

    // Listener para cambios de sesión (login/logout/token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return

        if (event === 'SIGNED_OUT' || !session) {
          dispatch({ type: 'SIGN_OUT' })
          return
        }

        // Solo re-hidratar si ya terminó la hidratación inicial
        // para evitar race conditions con StrictMode
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          if (!hydrated) return // hydrate() lo maneja

          try {
            const { userRow, tenant } = await fetchUserAndTenant(session.user.id)
            if (!cancelled) {
              dispatch({
                type: 'SET_SESSION',
                payload: {
                  user:     session.user,
                  tenant:   tenant ?? null,
                  userRole: userRow?.role ?? null,
                },
              })
            }
          } catch (err) {
            if (!cancelled) dispatch({ type: 'SET_ERROR', payload: err.message })
          }
        }
      }
    )

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  // ── signIn ────────────────────────────────────────────────

  const signIn = useCallback(async ({ email, password }) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw new Error(translateAuthError(error.message))
      return { user: data.user }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message })
      throw err
    }
  }, [])

  // ── signUp ────────────────────────────────────────────────

  const signUp = useCallback(async ({ email, password, fullName = '' }) => {
    dispatch({ type: 'SET_LOADING', payload: true })
    try {
      // 1. Crear auth user en Supabase
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw new Error(translateAuthError(error.message))

      const authUser = data.user
      if (!authUser) throw new Error('No se pudo crear la cuenta. Intentá de nuevo.')

      // 2. Crear tenant + user row en la base de datos
      const tenant = await createTenantAndUser({
        userId:   authUser.id,
        email,
        fullName,
      })

      // El onAuthStateChange va a disparar SIGNED_IN y cargar el estado
      // Pero como puede haber delay, lo seteamos manualmente también
      dispatch({
        type: 'SET_SESSION',
        payload: {
          user:     authUser,
          tenant,
          userRole: 'owner',
        },
      })

      return { user: authUser, tenant }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message })
      throw err
    }
  }, [])

  // ── signOut ───────────────────────────────────────────────

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch {
      // Network error on signOut — clear local state anyway
    }
    dispatch({ type: 'SIGN_OUT' })
  }, [])

  // ── updateTenant ──────────────────────────────────────────
  // Actualización optimista: UI primero, luego Supabase

  const updateTenant = useCallback(async (partialTenant) => {
    // Optimistic update
    dispatch({ type: 'UPDATE_TENANT', payload: partialTenant })

    const { data, error } = await supabase
      .from('tenants')
      .update(partialTenant)
      .eq('id', state.tenant?.id)
      .select()
      .single()

    if (error) {
      // Rollback: refetch del tenant real
      await refreshTenant()
      throw new Error(`Error actualizando tenant: ${error.message}`)
    }

    dispatch({ type: 'UPDATE_TENANT', payload: data })
    return data
  }, [state.tenant?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── refreshTenant ─────────────────────────────────────────

  const refreshTenant = useCallback(async () => {
    if (state.tenant?.id) {
      const { data, error } = await supabase
        .from('tenants')
        .select('*')
        .eq('id', state.tenant.id)
        .single()

      if (!error && data) {
        dispatch({ type: 'UPDATE_TENANT', payload: data })
      }
    } else if (state.user?.id) {
      // No tenant yet — try to fetch from user row
      const { userRow, tenant } = await fetchUserAndTenant(state.user.id)
      if (tenant) {
        dispatch({
          type: 'SET_SESSION',
          payload: { user: state.user, tenant, userRole: userRow?.role ?? 'owner' },
        })
      }
    }
  }, [state.tenant?.id, state.user?.id])

  const value = {
    user:          state.user,
    tenant:        state.tenant,
    userRole:      state.userRole,
    loading:       state.loading,
    error:         state.error,
    signIn,
    signOut,
    signUp,
    updateTenant,
    refreshTenant,
    // Shortcuts de uso frecuente
    isAuthenticated: !!state.user,
    hasRubro:        !!state.tenant?.rubro,
    isOnboarded:     !!state.tenant?.settings?.onboarding_completed,
    tenantId:        state.tenant?.id ?? null,
    businessName:    state.tenant?.settings?.business_name || state.tenant?.name || '',
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

// ─────────────────────────────────────────────────────────────
// HELPER: Traducir errores de Supabase Auth al español
// ─────────────────────────────────────────────────────────────

function translateAuthError(message) {
  const map = {
    'Invalid login credentials':        'Email o contraseña incorrectos.',
    'Email not confirmed':              'Confirmá tu email antes de ingresar.',
    'User already registered':          'Ya existe una cuenta con ese email.',
    'Password should be at least 6 characters': 'La contraseña debe tener al menos 6 caracteres.',
    'signup_disabled':                  'El registro está temporalmente deshabilitado.',
    'over_email_send_rate_limit':       'Demasiados intentos. Esperá unos minutos.',
    'email_not_confirmed':              'Necesitás confirmar tu email primero.',
  }
  for (const [key, val] of Object.entries(map)) {
    if (message.toLowerCase().includes(key.toLowerCase())) return val
  }
  return message
}

// ─────────────────────────────────────────────────────────────
// EXPORT CONTEXT (para useAuth.js)
// ─────────────────────────────────────────────────────────────

export { AuthContext }
