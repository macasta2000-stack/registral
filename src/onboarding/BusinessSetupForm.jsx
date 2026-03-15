/**
 * REGISTRAL — BusinessSetupForm
 * src/onboarding/BusinessSetupForm.jsx
 *
 * Paso 2 del onboarding.
 * Campos: nombre del negocio (required), teléfono, dirección, CUIT.
 * Autoguardado: cada campo onBlur hace UPDATE en tenants.settings.
 * Botón "Siguiente" habilitado solo cuando business_name está completo.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useAuth } from '../core/auth/useAuth'
import { updateBusinessSettings } from '../core/supabase/queries/provisionTenant'

const SAVE_DEBOUNCE_MS = 800

export default function BusinessSetupForm({ onNext }) {
  const { tenant, updateTenant } = useAuth()

  const [fields, setFields] = useState({
    business_name: tenant?.settings?.business_name || '',
    phone:         tenant?.settings?.phone         || '',
    address:       tenant?.settings?.address       || '',
    cuit:          tenant?.settings?.cuit          || '',
  })

  // Estado de guardado por campo
  const [saveStatus, setSaveStatus] = useState({}) // { [field]: 'saving' | 'saved' | 'error' }
  const [globalSaving, setGlobalSaving] = useState(false)
  const debounceRef = useRef({})
  const mountedRef = useRef(true)

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // ── Autoguardado por campo con debounce ──────────────────

  const saveField = useCallback(async (field, value) => {
    if (!tenant?.id) return

    // Cancelar debounce anterior para este campo
    if (debounceRef.current[field]) clearTimeout(debounceRef.current[field])

    setSaveStatus(prev => ({ ...prev, [field]: 'saving' }))

    debounceRef.current[field] = setTimeout(async () => {
      try {
        const savePromise = updateBusinessSettings(tenant.id, {
          ...tenant.settings,
          [field]: value,
        })
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 8000)
        )
        const updated = await Promise.race([savePromise, timeoutPromise])
        if (mountedRef.current) {
          setSaveStatus(prev => ({ ...prev, [field]: 'saved' }))
          if (updated?.settings) updateTenant({ settings: updated.settings, name: updated.name })
          // Limpiar estado "saved" después de 2s
          setTimeout(() => {
            if (mountedRef.current) {
              setSaveStatus(prev => ({ ...prev, [field]: null }))
            }
          }, 2000)
        }
      } catch {
        if (mountedRef.current) {
          // On timeout or error, clear status silently — data will save on next attempt or on "Siguiente"
          setSaveStatus(prev => ({ ...prev, [field]: null }))
        }
      }
    }, SAVE_DEBOUNCE_MS)
  }, [tenant, updateTenant])

  function handleChange(field) {
    return (e) => {
      const value = e.target.value
      setFields(prev => ({ ...prev, [field]: value }))
    }
  }

  function handleBlur(field) {
    return () => {
      saveField(field, fields[field])
    }
  }

  async function handleNext() {
    if (!fields.business_name.trim()) return
    setGlobalSaving(true)

    const localSettings = {
      ...tenant.settings,
      business_name: fields.business_name.trim(),
      phone:         fields.phone.trim(),
      address:       fields.address.trim(),
      cuit:          fields.cuit.trim(),
    }

    try {
      // Timeout de 8s — si Supabase no responde, continuar con datos locales
      const savePromise = updateBusinessSettings(tenant.id, localSettings)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 8000)
      )
      await Promise.race([savePromise, timeoutPromise])
    } catch (err) {
      console.warn('[BusinessSetupForm] Save to Supabase failed, continuing with local data:', err.message)
    }

    // Siempre actualizar el estado local y avanzar
    updateTenant({ name: fields.business_name.trim(), settings: localSettings })
    setGlobalSaving(false)
    onNext()
  }

  const canContinue = fields.business_name.trim().length > 0

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">Datos del negocio</h2>
          <p className="mt-1 text-sm text-gray-500">
            Aparecerán en el sistema. Podés cambiarlo después.
          </p>
        </div>

        <div className="space-y-5">
          {/* Nombre del negocio — required */}
          <FieldGroup
            label="Nombre del negocio"
            required
            hint="Así va a aparecer en remitos y en el sistema."
            saveStatus={saveStatus.business_name}
          >
            <input
              type="text"
              autoFocus
              autoComplete="organization"
              value={fields.business_name}
              onChange={handleChange('business_name')}
              onBlur={handleBlur('business_name')}
              placeholder="ej: Corralón Don Julio"
              maxLength={80}
              className={`
                w-full rounded-xl border px-4 py-3 text-base text-gray-900
                placeholder-gray-400 outline-none transition
                focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                ${!fields.business_name.trim() ? 'border-gray-200' : 'border-gray-200'}
                bg-white
              `}
            />
          </FieldGroup>

          {/* Teléfono */}
          <FieldGroup
            label="Teléfono de contacto"
            hint="Para que tus clientes puedan encontrarte."
            saveStatus={saveStatus.phone}
          >
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={fields.phone}
              onChange={handleChange('phone')}
              onBlur={handleBlur('phone')}
              placeholder="ej: 11-4567-8901"
              className="
                w-full rounded-xl border border-gray-200 bg-white
                px-4 py-3 text-base text-gray-900 placeholder-gray-400
                outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition
              "
            />
          </FieldGroup>

          {/* Dirección */}
          <FieldGroup
            label="Dirección"
            hint="La ubicación física del corralón."
            saveStatus={saveStatus.address}
          >
            <input
              type="text"
              autoComplete="street-address"
              value={fields.address}
              onChange={handleChange('address')}
              onBlur={handleBlur('address')}
              placeholder="ej: Av. San Martín 1234, Villa del Parque"
              className="
                w-full rounded-xl border border-gray-200 bg-white
                px-4 py-3 text-base text-gray-900 placeholder-gray-400
                outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition
              "
            />
          </FieldGroup>

          {/* CUIT */}
          <FieldGroup
            label="CUIT"
            hint="Opcional. Se puede completar después."
            saveStatus={saveStatus.cuit}
          >
            <input
              type="text"
              inputMode="numeric"
              value={fields.cuit}
              onChange={handleChange('cuit')}
              onBlur={handleBlur('cuit')}
              placeholder="ej: 20-12345678-9"
              maxLength={15}
              className="
                w-full rounded-xl border border-gray-200 bg-white
                px-4 py-3 text-base text-gray-900 placeholder-gray-400
                outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition
              "
            />
          </FieldGroup>
        </div>

        {/* Info de autoguardado */}
        <p className="mt-4 text-xs text-gray-400 flex items-center gap-1.5">
          <span>🟢</span> Los cambios se guardan automáticamente.
        </p>
      </div>

      {/* CTA */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-4">
        <button
          onClick={handleNext}
          disabled={!canContinue || globalSaving}
          className="
            w-full rounded-xl bg-amber-500 text-white font-semibold
            py-3.5 text-base transition active:scale-[0.98]
            hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed
            shadow-sm
          "
        >
          {globalSaving ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner /> Guardando...
            </span>
          ) : 'Siguiente'}
        </button>
        {!canContinue && (
          <p className="mt-2 text-center text-xs text-gray-400">
            El nombre del negocio es obligatorio para continuar.
          </p>
        )}
      </div>
    </div>
  )
}

BusinessSetupForm.propTypes = {
  onNext: PropTypes.func.isRequired,
}

// ─────────────────────────────────────────────────────────────
// FieldGroup: wrapper con label + estado de guardado
// ─────────────────────────────────────────────────────────────

function FieldGroup({ label, required, hint, saveStatus, children }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <SaveIndicator status={saveStatus} />
      </div>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

FieldGroup.propTypes = {
  label:      PropTypes.string.isRequired,
  required:   PropTypes.bool,
  hint:       PropTypes.string,
  saveStatus: PropTypes.string,
  children:   PropTypes.node.isRequired,
}

// ─────────────────────────────────────────────────────────────
// SaveIndicator: estado de autoguardado por campo
// ─────────────────────────────────────────────────────────────

function SaveIndicator({ status }) {
  if (!status) return null
  const config = {
    saving: { dot: 'bg-yellow-400', text: 'Guardando...' },
    saved:  { dot: 'bg-green-400',  text: 'Guardado' },
    error:  { dot: 'bg-red-400',    text: 'Error al guardar' },
  }
  const c = config[status]
  if (!c) return null
  return (
    <span className="flex items-center gap-1 text-xs text-gray-500">
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.text}
    </span>
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
