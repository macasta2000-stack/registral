/**
 * REGISTRAL — Motor de Módulos Condicionales
 * PresetContext.jsx
 *
 * Expone a toda la app:
 *   - usePreset()       → preset completo del tenant
 *   - useModules()      → control de acceso a módulos
 *   - useVocabulary()   → labels dinámicos según rubro
 *   - useFields()       → schema de campos por entidad
 *   - usePlanLimits()   → límites del plan del tenant
 *   - useDashboard()    → métricas y widgets del dashboard
 *   - useAlertRules()   → reglas de alertas del rubro
 *
 * Decisión de arquitectura:
 *   - Los presets son archivos JSON bundleados (import dinámico).
 *   - Sin API call. Sin IA. Costo cero por tenant adicional.
 *   - El tenant puede sobreescribir vocabulary y fields dentro del preset
 *     via preset_config en Supabase (columna JSONB en tenants).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react'
import { supabase } from '../supabase/client'

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

/**
 * Qué módulos están disponibles en cada plan.
 * El preset define modules_enabled para el rubro.
 * El plan filtra cuáles de esos módulos están activos.
 * Si plan_limits existe en el preset, tiene prioridad.
 */
const PLAN_MODULE_OVERRIDES = {
  basico: null,  // usa modules_enabled del preset filtrado por plan_limits.basico.modules
  pro: null,     // usa todos los modules_enabled del preset
  agencia: null, // sin restricciones
}

// ─────────────────────────────────────────────────────────────
// DEEP MERGE UTILITY
// ─────────────────────────────────────────────────────────────

function deepMerge(base, override) {
  if (!override) return base
  const result = { ...base }
  for (const key of Object.keys(override)) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object' &&
      base[key] !== null &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], override[key])
    } else {
      result[key] = override[key]
    }
  }
  return result
}

// ─────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────

const PresetContext = createContext(null)

// ─────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────

/**
 * Envuelve la app completa (debajo de AuthProvider).
 * Lee el tenant del contexto de auth y carga el preset correspondiente.
 */
export function PresetProvider({ children }) {
  const [preset, setPreset]           = useState(null)
  const [tenantData, setTenantData]   = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState(null)

  // Cargar datos del tenant desde Supabase
  useEffect(() => {
    let cancelled = false

    async function loadTenant() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('tenant_id, role')
          .eq('id', user.id)
          .single()

        if (userError) throw userError

        const { data: tenant, error: tenantError } = await supabase
          .from('tenants')
          .select('id, rubro, plan, billing_status, settings, preset_config, usage_stats')
          .eq('id', userData.tenant_id)
          .single()

        if (tenantError) throw tenantError

        if (!cancelled) {
          setTenantData({ ...tenant, userRole: userData.role })
        }
      } catch (err) {
        if (!cancelled) setError(err.message)
      }
    }

    loadTenant()
    return () => { cancelled = true }
  }, [])

  // Cargar preset cuando tenemos el rubro del tenant
  useEffect(() => {
    if (!tenantData?.rubro) return

    let cancelled = false

    async function loadPreset() {
      try {
        // Import dinámico — el preset vive en /src/presets/ (bundleado)
        // Formato de archivo: preset.[rubro].json
        const mod = await import(`../../presets/preset.${tenantData.rubro}.json`)
        const basePreset = mod.default

        // Aplicar restricciones del plan
        const planConfig = basePreset.plan_limits?.[tenantData.plan] ?? {}
        let enabledModules = basePreset.modules_enabled

        if (planConfig.modules && !planConfig.modules.includes('*')) {
          enabledModules = basePreset.modules_enabled.filter(m =>
            planConfig.modules.includes(m)
          )
        }

        // Merge con customizaciones del tenant (preset_config en Supabase)
        const customizations = tenantData.preset_config ?? {}
        const mergedPreset = deepMerge(basePreset, {
          ...customizations,
          modules_enabled: enabledModules,
          // vocabulary puede ser personalizado por el tenant
          vocabulary: deepMerge(basePreset.vocabulary, customizations.vocabulary),
          // fields: solo se pueden customizar los campos optional
          fields: deepMerge(basePreset.fields, customizations.fields),
        })

        if (!cancelled) {
          setPreset(mergedPreset)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          console.error(`[PresetProvider] Failed to load preset for rubro: ${tenantData.rubro}`, err)
          setError(`No se pudo cargar el preset para el rubro "${tenantData.rubro}"`)
          setLoading(false)
        }
      }
    }

    loadPreset()
    return () => { cancelled = true }
  }, [tenantData])

  const value = useMemo(() => ({
    preset,
    tenantData,
    loading,
    error,
  }), [preset, tenantData, loading, error])

  return (
    <PresetContext.Provider value={value}>
      {children}
    </PresetContext.Provider>
  )
}

// ─────────────────────────────────────────────────────────────
// HOOK BASE
// ─────────────────────────────────────────────────────────────

export function usePreset() {
  const ctx = useContext(PresetContext)
  if (!ctx) throw new Error('usePreset must be used within PresetProvider')
  return ctx
}

// ─────────────────────────────────────────────────────────────
// HOOK: useModules
// Control de acceso a módulos según rubro + plan
// ─────────────────────────────────────────────────────────────

/**
 * @returns {Object}
 *   isEnabled(moduleId)   → boolean — el módulo está habilitado para este tenant
 *   isLocked(moduleId)    → boolean — el módulo existe pero es de otro rubro
 *   getLockReason(id)     → string  — por qué está bloqueado
 *   canAccess(moduleId)   → boolean — isEnabled && !isLocked
 *   enabledModules        → string[] — lista de módulos activos
 *   allModules            → {id, enabled, locked, reason}[]
 */
export function useModules() {
  const { preset } = usePreset()

  const enabledModules = preset?.modules_enabled ?? []
  const lockedModules  = preset?.modules_locked  ?? []

  const isEnabled = useCallback(
    (moduleId) => enabledModules.includes(moduleId),
    [enabledModules]
  )

  const isLocked = useCallback(
    (moduleId) => lockedModules.some(m => m.id === moduleId),
    [lockedModules]
  )

  const getLockReason = useCallback(
    (moduleId) => lockedModules.find(m => m.id === moduleId)?.reason ?? null,
    [lockedModules]
  )

  const canAccess = useCallback(
    (moduleId) => isEnabled(moduleId) && !isLocked(moduleId),
    [isEnabled, isLocked]
  )

  // Lista unificada de todos los módulos conocidos con su estado
  const allModules = useMemo(() => {
    const allIds = new Set([
      ...enabledModules,
      ...lockedModules.map(m => m.id),
    ])
    return Array.from(allIds).map(id => ({
      id,
      enabled: isEnabled(id),
      locked: isLocked(id),
      reason: getLockReason(id),
    }))
  }, [enabledModules, lockedModules, isEnabled, isLocked, getLockReason])

  return { isEnabled, isLocked, getLockReason, canAccess, enabledModules, allModules }
}

// ─────────────────────────────────────────────────────────────
// HOOK: useVocabulary
// Labels dinámicos según rubro (sin hardcodear strings en componentes)
// ─────────────────────────────────────────────────────────────

/**
 * @returns {Object}
 *   t(key)      → string — label del vocabulary, o el key si no existe
 *   vocab       → objeto completo de vocabulary
 *
 * Uso: const { t } = useVocabulary()
 *      <button>{t('new_transaction')}</button>
 *      // Corralón → "Nuevo remito"
 *      // Gastronomía → "Nueva comanda"
 */
export function useVocabulary() {
  const { preset } = usePreset()
  const vocab = preset?.vocabulary ?? {}

  const t = useCallback(
    (key, fallback) => vocab[key] ?? fallback ?? key,
    [vocab]
  )

  return { t, vocab }
}

// ─────────────────────────────────────────────────────────────
// HOOK: useFields
// Schema de campos para cada tipo de entidad
// ─────────────────────────────────────────────────────────────

/**
 * @param {string} entityType — 'product', 'entity', 'transaction', 'schedule'
 * @returns {Object}
 *   schema         → {field_key: field_definition}
 *   required       → string[] — campos obligatorios
 *   optional       → string[] — campos opcionales
 *   locked         → string[] — campos que el usuario no puede modificar
 *   isRequired(k)  → boolean
 *   isLocked(k)    → boolean
 *   getField(k)    → field_definition completa
 */
export function useFields(entityType) {
  const { preset } = usePreset()
  const fieldConfig = preset?.fields?.[entityType] ?? {}

  const schema   = fieldConfig.schema   ?? {}
  const required = fieldConfig.required ?? []
  const optional = fieldConfig.optional ?? []
  const locked   = fieldConfig.locked   ?? []

  const isRequired = useCallback(
    (key) => required.includes(key),
    [required]
  )

  const isLocked = useCallback(
    (key) => locked.includes(key),
    [locked]
  )

  const getField = useCallback(
    (key) => schema[key] ?? null,
    [schema]
  )

  // Todos los campos en orden: required primero, luego optional
  const allFields = useMemo(() => {
    const orderedKeys = [...required, ...optional.filter(k => !required.includes(k))]
    return orderedKeys.map(key => ({
      key,
      ...schema[key],
      isRequired: required.includes(key),
      isLocked: locked.includes(key),
    }))
  }, [required, optional, locked, schema])

  return { schema, required, optional, locked, isRequired, isLocked, getField, allFields }
}

// ─────────────────────────────────────────────────────────────
// HOOK: usePlanLimits
// Límites del plan del tenant
// ─────────────────────────────────────────────────────────────

/**
 * @returns {Object}
 *   plan            → 'basico' | 'pro' | 'agencia'
 *   limits          → { max_entities, max_products, max_transactions_month, max_users }
 *   isWithinLimit(resource, currentCount) → boolean
 *   canUpgrade       → boolean
 */
export function usePlanLimits() {
  const { preset, tenantData } = usePreset()
  const plan   = tenantData?.plan ?? 'basico'
  const usage  = tenantData?.usage_stats ?? {}
  const limits = preset?.plan_limits?.[plan] ?? {}

  const isWithinLimit = useCallback(
    (resource, currentCount) => {
      const limit = limits[`max_${resource}`]
      if (limit === -1 || limit === undefined) return true
      return currentCount < limit
    },
    [limits]
  )

  const canUpgrade = plan !== 'agencia'

  return { plan, limits, usage, isWithinLimit, canUpgrade }
}

// ─────────────────────────────────────────────────────────────
// HOOK: useDashboard
// Configuración de widgets y métricas del dashboard
// ─────────────────────────────────────────────────────────────

export function useDashboard() {
  const { preset } = usePreset()
  return {
    metrics: preset?.dashboard_metrics ?? [],
    moduleWidgets: preset?.modules_config?.dashboard?.widgets ?? [],
  }
}

// ─────────────────────────────────────────────────────────────
// HOOK: useAlertRules
// Reglas de alertas deterministas del preset
// ─────────────────────────────────────────────────────────────

export function useAlertRules() {
  const { preset } = usePreset()
  return {
    rules: preset?.alert_rules ?? [],
    getRule: (id) => preset?.alert_rules?.find(r => r.id === id) ?? null,
  }
}

// ─────────────────────────────────────────────────────────────
// HOOK: useInsights
// Queries predefinidas por rubro para el panel de insights
// ─────────────────────────────────────────────────────────────

export function useInsights() {
  const { preset, tenantData } = usePreset()
  const plan = tenantData?.plan ?? 'basico'

  const allInsights = preset?.insights_queries ?? []

  // Filtrar los que requieren plan superior al actual
  const planOrder = { basico: 0, pro: 1, agencia: 2 }
  const availableInsights = allInsights.filter(insight => {
    if (!insight.requires_plan) return true
    return planOrder[plan] >= planOrder[insight.requires_plan]
  })

  const lockedInsights = allInsights.filter(insight => {
    if (!insight.requires_plan) return false
    return planOrder[plan] < planOrder[insight.requires_plan]
  })

  return { availableInsights, lockedInsights, allInsights }
}

// ─────────────────────────────────────────────────────────────
// HOOK: useTransactionFlow
// Flujo de estados de transacciones según rubro
// ─────────────────────────────────────────────────────────────

export function useTransactionFlow() {
  const { preset } = usePreset()
  const flow = preset?.transaction_flow ?? {}

  const getAvailableTransitions = useCallback(
    (currentStatus) => flow.steps?.filter(s => s.from === currentStatus) ?? [],
    [flow]
  )

  return {
    primaryType: flow.primary_type ?? 'transaction',
    ctaLabel: flow.cta_label ?? 'Nueva operación',
    quickActions: flow.quick_actions ?? [],
    steps: flow.steps ?? [],
    getAvailableTransitions,
  }
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: ModuleGuard
// Bloquea el render de un módulo si no está habilitado
// ─────────────────────────────────────────────────────────────

/**
 * Uso:
 *   <ModuleGuard moduleId="cuenta_corriente" fallback={<UpgradeBanner />}>
 *     <CuentaCorrienteModule />
 *   </ModuleGuard>
 */
export function ModuleGuard({ moduleId, children, fallback = null }) {
  const { canAccess, isLocked, getLockReason } = useModules()

  if (isLocked(moduleId)) {
    return fallback ?? (
      <div className="module-locked-banner">
        <span>🔒 {getLockReason(moduleId)}</span>
      </div>
    )
  }

  if (!canAccess(moduleId)) {
    return fallback ?? (
      <div className="module-upgrade-banner">
        <span>⬆️ Disponible en plan Pro</span>
      </div>
    )
  }

  return children
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: VocabLabel
// Renderiza un label del vocabulary del rubro
// ─────────────────────────────────────────────────────────────

/**
 * Uso: <VocabLabel k="new_transaction" />
 * Corralón → "Nuevo remito"
 * Gastronomía → "Nueva comanda"
 */
export function VocabLabel({ k, fallback }) {
  const { t } = useVocabulary()
  return <>{t(k, fallback)}</>
}
