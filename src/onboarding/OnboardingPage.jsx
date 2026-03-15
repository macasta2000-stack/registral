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

import { useCallback, useState } from 'react'
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
  const { tenant, updateTenant, user } = useAuth()
  const navigate = useNavigate()

  // Si tiene rubro y step guardado, retomar desde ese step
  const initialStep = tenant?.rubro
    ? Math.min(tenant.settings?.onboarding_step ?? 2, 4)
    : 1

  const [step, setStep]             = useState(initialStep)
  const [selectedRubro, setSelectedRubro] = useState(tenant?.rubro ?? null)
  const [provisioning, setProvisioning]   = useState(false)
  const [provisionError, setProvisionError] = useState(null)

  // ── Paso 1 → selección de rubro ─────────────────────────

  const handleRubroSelect = useCallback(async (rubro) => {
    setSelectedRubro(rubro)
    setProvisionError(null)
    setProvisioning(true)

    try {
      // Provisionar el rubro: crea sequences + modules_access
      const modules = MODULES_BY_RUBRO[rubro] ?? []
      await provisionRubro({
        tenantId:      tenant.id,
        rubro,
        presetModules: modules,
      })

      // Actualizar el tenant en el contexto local
      updateTenant({ rubro, settings: { ...tenant.settings, onboarding_step: 2 } })

      // Avanzar al paso 2
      setStep(2)
      setProvisioning(false)

      // Guardar paso en background (no bloquea)
      saveOnboardingStep(tenant.id, 2, { ...tenant.settings }).catch(() => {})
    } catch (err) {
      setProvisionError(err.message)
      setProvisioning(false)
    }
  }, [tenant, updateTenant])

  // ── Paso 2 → siguiente ──────────────────────────────────

  const handleBusinessNext = useCallback(async () => {
    await saveOnboardingStep(tenant.id, 3, tenant.settings)
    setStep(3)
  }, [tenant])

  // ── Paso 3 → empezar ────────────────────────────────────

  const handleDemoStart = useCallback(async () => {
    await saveOnboardingStep(tenant.id, 4, tenant.settings)
    setStep(4)
  }, [tenant])

  // ── Paso 4 → terminar onboarding ────────────────────────

  const handleTourFinish = useCallback(async () => {
    try {
      const updated = await completeOnboarding(tenant.id, tenant.settings)
      updateTenant({ settings: updated.settings })
    } catch (err) {
      console.warn('[OnboardingPage] No se pudo marcar onboarding completo:', err.message)
    }
    navigate('/dashboard', { replace: true })
  }, [tenant, updateTenant, navigate])

  // ── Estado de provisioning (loading entre paso 1 y 2) ───

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
              Estamos preparando todo para tu corralón. Un momento...
            </p>
          </div>
        </div>
      </OnboardingShell>
    )
  }

  // ── Error de provisioning ────────────────────────────────

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

  // ── Paso 4: GuidedTour usa overlay sobre toda la pantalla ─

  if (step === 4) {
    return (
      <>
        {/* Fondo vacío del dashboard (el tour va encima) */}
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
          {/* Barra de progreso */}
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
          {/* Label del paso actual */}
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
