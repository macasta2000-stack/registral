/**
 * REGISTRAL — ResetPasswordPage
 * src/core/auth/ResetPasswordPage.jsx
 *
 * Pantalla para establecer nueva contraseña.
 * El usuario llega aquí desde el link del email de recuperación.
 * Supabase detecta el token en la URL automáticamente (detectSessionInUrl: true).
 */

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase/client'

export default function ResetPasswordPage() {
  const navigate = useNavigate()

  const [password, setPassword]       = useState('')
  const [confirm, setConfirm]         = useState('')
  const [error, setError]             = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [success, setSuccess]         = useState(false)
  const [hasSession, setHasSession]   = useState(null) // null = loading

  // Verificar que hay una sesión de recovery activa.
  // Supabase detectSessionInUrl processes the hash/query tokens asynchronously,
  // so we listen for auth state changes and also add a delayed fallback check.
  useEffect(() => {
    let settled = false

    // Listen for auth state changes — PASSWORD_RECOVERY or SIGNED_IN from token exchange
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'PASSWORD_RECOVERY') {
          settled = true
          setHasSession(true)
        } else if (event === 'SIGNED_IN' && !settled) {
          // PKCE flow fires SIGNED_IN instead of PASSWORD_RECOVERY
          settled = true
          setHasSession(true)
        }
      }
    )

    // Check if there's already a session (e.g., token was processed before this component mounted)
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session && !settled) {
        settled = true
        setHasSession(true)
      }
    }

    checkSession()

    // Fallback: if after 4 seconds no session was detected, show expired message.
    // This gives Supabase enough time to exchange the token from the URL.
    const timeout = setTimeout(() => {
      if (!settled) {
        setHasSession(false)
      }
    }, 4000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      })

      if (updateError) throw updateError
      setSuccess(true)

      // Redirect to dashboard after 2 seconds
      setTimeout(() => navigate('/dashboard', { replace: true }), 2000)
    } catch (err) {
      if (err.message?.includes('same_password')) {
        setError('La nueva contraseña debe ser diferente a la anterior.')
      } else {
        setError(err.message || 'Error al actualizar la contraseña. Intentá de nuevo.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT BRANDING PANEL (desktop only) ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-amber-600 via-amber-500 to-orange-500 relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-60 h-60 bg-white/5 rounded-full blur-2xl" />
        </div>
        <div className="relative flex flex-col justify-between p-12 text-white w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-white font-extrabold text-xl">R</span>
            </div>
            <span className="text-2xl font-bold">Registral</span>
          </div>
          <div className="space-y-6">
            <h2 className="text-4xl font-extrabold leading-tight">
              Nueva<br />
              contraseña.
            </h2>
            <p className="text-lg text-amber-100 max-w-md">
              Elegí una contraseña segura para tu cuenta.
            </p>
          </div>
          <p className="text-sm text-amber-200">Registral · Argentina</p>
        </div>
      </div>

      {/* ── RIGHT FORM PANEL ── */}
      <div className="flex-1 flex flex-col bg-white lg:bg-gray-50">
        {/* Mobile header */}
        <div className="lg:hidden bg-white border-b border-gray-100 px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center shadow">
            <span className="text-white font-bold text-base">R</span>
          </div>
          <span className="text-lg font-semibold text-gray-900">Registral</span>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 py-8 max-w-md mx-auto w-full">
          <div className="lg:bg-white lg:p-8 lg:rounded-3xl lg:shadow-sm lg:border lg:border-gray-100">

            {/* Loading */}
            {hasSession === null && (
              <div className="text-center space-y-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center mx-auto animate-pulse">
                  <span className="text-white text-xl font-bold">R</span>
                </div>
                <p className="text-sm text-gray-500">Verificando link...</p>
              </div>
            )}

            {/* No session - invalid/expired link */}
            {hasSession === false && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto">
                  <span className="text-3xl">⚠️</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Link expirado</h1>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  Este link ya fue usado o expiró. Pedí uno nuevo desde la pantalla de login.
                </p>
                <Link
                  to="/forgot-password"
                  className="inline-block mt-4 px-6 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition"
                >
                  Pedir nuevo link
                </Link>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
                  <span className="text-3xl">✅</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">¡Contraseña actualizada!</h1>
                <p className="text-sm text-gray-500">
                  Redirigiendo a tu cuenta...
                </p>
              </div>
            )}

            {/* Form */}
            {hasSession && !success && (
              <>
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-gray-900">Nueva contraseña</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Ingresá tu nueva contraseña. Mínimo 6 caracteres.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                      Nueva contraseña
                    </label>
                    <PasswordInput
                      id="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                    />
                  </div>

                  <div>
                    <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                      Repetir contraseña
                    </label>
                    <PasswordInput
                      id="confirm"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Repetí la contraseña"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="
                      w-full rounded-xl bg-amber-500 text-white font-semibold
                      py-3.5 text-base transition active:scale-[0.98]
                      hover:bg-amber-600 disabled:opacity-60 disabled:cursor-not-allowed
                      shadow-sm mt-2
                    "
                  >
                    {submitting ? (
                      <span className="flex items-center justify-center gap-2">
                        <Spinner /> Actualizando...
                      </span>
                    ) : 'Cambiar contraseña'}
                  </button>
                </form>

                <p className="mt-6 text-center text-sm text-gray-500">
                  <Link to="/login" className="font-semibold text-amber-600 hover:text-amber-700">
                    ← Volver al login
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function PasswordInput({ id, value, onChange, placeholder }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="
          w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-11
          text-base text-gray-900 placeholder-gray-400 outline-none transition
          focus:ring-2 focus:ring-amber-400 focus:border-amber-400
        "
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
