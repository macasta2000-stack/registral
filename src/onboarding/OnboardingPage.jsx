/**
 * REGISTRAL — OnboardingPage
 * src/onboarding/OnboardingPage.jsx
 *
 * Orquesta los 4 pasos del onboarding:
 *   1. RubroSelector   → elige el rubro, dispara provisionRubro()
 *   2. BusinessSetupForm → datos del negocio
 *   3. DemoPreview     → preview con datos demo del rubro
 *   4. GuidedTour      → 5 tooltips de módulos
 *
 * Al completar el paso 4 → marca onboarding_completed = true → redirige al dashboard.
 *
 * Si el usuario ya tiene rubro (vuelve al onboarding incompleto),
 * retoma desde el último step guardado en tenant.settings.onboarding_step.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../core/auth/useAuth'
import {
  provisionRubro,
  completeOnboarding,
  saveOnboardingStep,
} from '../core/supabase/queries/provisionTenant'
import RubroSelector    from './RubroSelector'
import BusinessSetupForm from './BusinessSetupForm'
import DemoPreview      from './DemoPreview'
import GuidedTour       from './GuidedTour'

// Módulos por rubro para pasar al tour (fallback si el preset no está cargado aún)
const MODULES_BY_RUBRO = {
  correlon:            ['dashboard','stock','clientes','remitos','cuenta_corriente','agenda_entregas','caja','reportes'],
  gastronomia:         ['dashboard','mesas','comandas','menu','caja','reservas','stock','reportes'],
  abogacia:            ['dashboard','expedientes','honorarios','agenda_vencimientos','partes','reportes'],
  medicina:            ['dashboard','pacientes','historia_clinica','turnos','consultas','reportes'],
  retail:              ['dashboard','productos','ventas','clientes','stock','caja','reportes'],
  servicios_generales: ['dashboard','clientes','presupuestos','trabajos','agenda','cobros','reportes'],
}

export default function OnboardingPage() {
  const { tenant, updateTenant, user, refreshTenant } = useAuth()
  const navigate = useNavigate()
  const [tenantLoading, setTenantLoading] = useState(!tenant)

  // ALL hooks MUST be declared before any conditional return
  const initialStep = tenant?.rubro
    ? Math.min(tenant.settings?.onboarding_step ?? 2, 4)
    : 1

  const [step, setStep]                       = useState(initialStep)
  const [selectedRubro, setSelectedRubro]     = useState(tenant?.rubro ?? null)
  const [provisioning, setProvisioning]       = useState(false)
  const [provisionError, setProvisionError]   = useState(null)

  // Si no hay tenant, intentar crearlo (el registro pudo fallar antes)
  useEffect(() => {
    if (!tenant && user) {
      let cancelled = false
      import('../core/supabase/queries/provisionTenant').then(({ createTenantAndUser }) => {
        if (cancelled) return
        createTenantAndUser({
          userId: user.id,
          email: user.email,
          fullName: user.user_metadata?.full_name || '',
        })
          .then((newTenant) => {
            if (!cancelled) {
              updateTenant(newTenant)
              setTenantLoading(false)
            }
          })
          .catch(async () => {
            if (cancelled) return
            // Maybe tenant already exists, try refreshing
            if (refreshTenant) await refreshTenant()
            setTenantLoading(false)
          })
      })
      return () => { cancelled = true }
    } else if (tenant) {
      setTenantLoading(false)
    }
  }, [tenant, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers (hooks, must be before returns) ───────────

  const handleRubroSelect = useCallback(async (rubro) => {
    setSelectedRubro(rubro)
    setProvisionError(null)
    setProvisioning(true)

    try {
      const modules = MODULES_BY_RUBRO[rubro] ?? []
      await provisionRubro({
        tenantId:      tenant.id,
        rubro,
        presetModules: modules,
      })

      updateTenant({ rubro, settings: { ...tenant.settings, onboarding_step: 2 } })
      setStep(2)
      setProvisioning(false)
      saveOnboardingStep(tenant.id, 2, { ...tenant.settings }).catch(() => {})
    } catch (err) {
      setProvisionError(err.message)
      setProvisioning(false)
    }
  }, [tenant, updateTenant])

  const handleBusinessNext = useCallback(async () => {
    // Fire-and-forget — don't block step transition on Supabase
    saveOnboardingStep(tenant.id, 3, tenant.settings).catch(() => {})
    setStep(3)
  }, [tenant])

  const handleDemoStart = useCallback(async () => {
    saveOnboardingStep(tenant.id, 4, tenant.settings).catch(() => {})
    setStep(4)
  }, [tenant])

  const handleTourFinish = useCallback(async () => {
    try {
      const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
      const updated = await Promise.race([completeOnboarding(tenant.id, tenant.settings), timeout])
      updateTenant({ settings: updated.settings })
    } catch (err) {
      console.warn('[OnboardingPage] No se pudo marcar onboarding completo:', err.message)
      // Mark locally even if Supabase fails
      updateTenant({ settings: { ...tenant.settings, onboarding_completed: true, onboarding_step: 4 } })
    }
    navigate('/dashboard', { replace: true })
  }, [tenant, updateTenant, navigate])

  // ── Conditional renders (AFTER all hooks) ──────────────

  if (!tenant || tenantLoading) {
    return (
      <OnboardingShell step={1}>
        <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 py-12">
          <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
            <svg className="animate-spin w-6 h-6 text-amber-500" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
          <p className="text-sm text-gray-500">Preparando tu cuenta...</p>
        </div>
      </OnboardingShell>
    )
  }

  if (provisioning) {
    return (
      <OnboardingShell step={step}>
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-6 py-12">
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
              <span className="text-3xl">🧱</span>
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-500 flex items-center justify-center">
              <svg className="animate-spin w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">Configurando tu sistema</p>
            <p className="mt-1 text-sm text-gray-500">
              Estamos preparando todo para tu negocio. Un momento...
            </p>
          </div>
        </div>
      </OnboardingShell>
    )
  }

  if (provisionError) {
    return (
      <OnboardingShell step={step}>
        <div className="flex flex-col items-center justify-center flex-1 gap-5 px-6 py-12">
          <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center">
            <span className="text-3xl">❌</span>
          </div>
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">Algo salió mal</p>
            <p className="mt-1 text-sm text-gray-500">{provisionError}</p>
          </div>
          <button
            onClick={() => { setProvisionError(null); setStep(1) }}
            className="mt-2 px-6 py-3 rounded-xl bg-amber-500 text-white font-semibold text-sm"
          >
            Volver a intentar
          </button>
        </div>
      </OnboardingShell>
    )
  }

  if (step === 4) {
    return (
      <>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-300 text-sm">Tu dashboard está listo</p>
        </div>
        <GuidedTour
          rubro={selectedRubro ?? tenant?.rubro ?? 'correlon'}
          enabledModules={MODULES_BY_RUBRO[selectedRubro ?? tenant?.rubro] ?? []}
          onFinish={handleTourFinish}
        />
      </>
    )
  }

  return (
    <OnboardingShell step={step}>
      {step === 1 && (
        <RubroSelector onSelect={handleRubroSelect} />
      )}
      {step === 2 && (
        <BusinessSetupForm onNext={handleBusinessNext} />
      )}
      {step === 3 && (
        <DemoPreview
          rubro={selectedRubro ?? tenant?.rubro ?? 'correlon'}
          businessName={tenant?.settings?.business_name || tenant?.name || ''}
          onStart={handleDemoStart}
        />
      )}
    </OnboardingShell>
  )
}

// ─────────────────────────────────────────────────────────────
// Shell del onboarding: header + progress bar + contenido
// ─────────────────────────────────────────────────────────────

function OnboardingShell({ step, children }) {
  const { signOut } = useAuth()

  const STEP_LABELS = [
    'Elegí tu rubro',
    'Datos del negocio',
    'Vista previa',
    'Tour guiado',
  ]

  return (
    <div className="min-h-screen bg-white flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center">
            <span className="text-white font-bold text-sm">R</span>
          </div>
          <span className="text-base font-semibold text-gray-900">Registral</span>
        </div>
        <button
          onClick={signOut}
          className="text-sm text-gray-400 hover:text-gray-600 transition"
        >
          Salir
        </button>
      </div>

      {/* Progress steps */}
      {step <= 3 && (
        <div className="px-4 pt-4 pb-2">
          <div className="flex gap-1 mb-2">
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                  s <= step ? 'bg-amber-500' : 'bg-gray-100'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-gray-400">
            Paso {step} de 3 · {STEP_LABELS[step - 1]}
          </p>
        </div>
      )}

      {/* Contenido del paso */}
      <div className="flex flex-col flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
