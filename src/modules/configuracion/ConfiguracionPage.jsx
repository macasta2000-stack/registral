/**
 * REGISTRAL — ConfiguracionPage
 * src/modules/configuracion/ConfiguracionPage.jsx
 *
 * Settings page with 3 tabs: Mi Negocio, Mi Cuenta, Preferencias.
 * Auto-saves business fields on blur via updateTenant.
 * Password change via supabase.auth.updateUser.
 * Preferences stored in tenant.preset_config.
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth }    from '../../core/auth/useAuth'
import { supabase }   from '../../core/supabase/client'
import { useDocumentTitle } from '../../shared/ui/useDocumentTitle'
import { PageHeader } from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// TABS
// ─────────────────────────────────────────────────────────────

const TABS = [
  { key: 'negocio',      label: 'Mi Negocio' },
  { key: 'cuenta',       label: 'Mi Cuenta' },
  { key: 'preferencias', label: 'Preferencias' },
]

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  useDocumentTitle('Configuración')
  const [activeTab, setActiveTab] = useState('negocio')

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Configuracion"
        subtitle="Ajustes de tu negocio y cuenta"
      />

      {/* Tabs */}
      <div className="px-4 py-2 flex gap-1 overflow-x-auto scrollbar-hide">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              flex-shrink-0 text-sm px-4 py-2 rounded-xl font-medium transition
              ${activeTab === tab.key
                ? 'bg-amber-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 px-4 pb-6 pt-2">
        {activeTab === 'negocio'      && <NegocioTab />}
        {activeTab === 'cuenta'       && <CuentaTab />}
        {activeTab === 'preferencias' && <PreferenciasTab />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SHARED UI PIECES
// ─────────────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      {title && (
        <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      )}
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ label, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
  )
}

function ReadOnlyField({ label, value }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div className="w-full px-3 py-2.5 rounded-xl border border-gray-100 bg-gray-50 text-sm text-gray-500">
        {value || '—'}
      </div>
    </div>
  )
}

function SaveIndicator({ saving }) {
  if (!saving) return null
  return (
    <span className="text-xs text-amber-600 font-medium animate-pulse">
      Guardando...
    </span>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB: MI NEGOCIO
// ─────────────────────────────────────────────────────────────

function NegocioTab() {
  const { tenant, updateTenant } = useAuth()
  const settings = tenant?.settings ?? {}

  const [form, setForm] = useState({
    business_name: settings.business_name || tenant?.name || '',
    cuit:          settings.cuit          || '',
    address:       settings.address       || '',
    phone:         settings.phone         || '',
    email:         settings.email         || '',
  })
  const [saving, setSaving] = useState(false)

  // Sync form when tenant changes externally
  useEffect(() => {
    const s = tenant?.settings ?? {}
    setForm({
      business_name: s.business_name || tenant?.name || '',
      cuit:          s.cuit          || '',
      address:       s.address       || '',
      phone:         s.phone         || '',
      email:         s.email         || '',
    })
  }, [tenant?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
  }

  const handleBlur = useCallback(async (field) => {
    const currentSettings = tenant?.settings ?? {}
    // Skip save if value hasn't changed
    if (currentSettings[field] === form[field]) return
    // For business_name, also check against tenant.name
    if (field === 'business_name' && !currentSettings[field] && form[field] === (tenant?.name || '')) return

    setSaving(true)
    try {
      const updatedSettings = { ...currentSettings, [field]: form[field] }
      await updateTenant({ settings: updatedSettings })
    } catch (err) {
      console.error('[Configuracion] Error guardando:', err.message)
      // Importar toast dinámicamente para no agregar dependencia innecesaria al bundle
      import('../../shared/ui/Toast').then(m => m.toast.error('Error al guardar. Intentá de nuevo.'))
    } finally {
      setSaving(false)
    }
  }, [form, tenant, updateTenant])

  const rubroLabel = tenant?.rubro
    ? tenant.rubro.charAt(0).toUpperCase() + tenant.rubro.slice(1).replace(/_/g, ' ')
    : '—'

  return (
    <div className="space-y-4">
      <SectionCard title="Datos del negocio">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Auto-guardado al salir de cada campo</span>
          <SaveIndicator saving={saving} />
        </div>

        <div>
          <FieldLabel label="Nombre del negocio" htmlFor="business_name" />
          <input
            id="business_name"
            type="text"
            value={form.business_name}
            onChange={handleChange('business_name')}
            onBlur={() => handleBlur('business_name')}
            placeholder="Ej: Distribuidora San Martin"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        <div>
          <FieldLabel label="CUIT" htmlFor="cuit" />
          <input
            id="cuit"
            type="text"
            value={form.cuit}
            onChange={handleChange('cuit')}
            onBlur={() => handleBlur('cuit')}
            placeholder="20-12345678-9"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        <div>
          <FieldLabel label="Direccion" htmlFor="address" />
          <input
            id="address"
            type="text"
            value={form.address}
            onChange={handleChange('address')}
            onBlur={() => handleBlur('address')}
            placeholder="Calle 123, Ciudad"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        <div>
          <FieldLabel label="Telefono" htmlFor="phone" />
          <input
            id="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange('phone')}
            onBlur={() => handleBlur('phone')}
            placeholder="+54 11 1234-5678"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        <div>
          <FieldLabel label="Email del negocio" htmlFor="business_email" />
          <input
            id="business_email"
            type="email"
            value={form.email}
            onChange={handleChange('email')}
            onBlur={() => handleBlur('email')}
            placeholder="contacto@minegocio.com"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        <ReadOnlyField label="Rubro actual" value={rubroLabel} />
      </SectionCard>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB: MI CUENTA
// ─────────────────────────────────────────────────────────────

function CuentaTab() {
  const { user, tenant, updateTenant } = useAuth()
  const settings = tenant?.settings ?? {}

  const [fullName, setFullName]       = useState(settings.full_name || '')
  const [nameSaving, setNameSaving]   = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdError, setPwdError]       = useState('')
  const [pwdLoading, setPwdLoading]   = useState(false)
  const [pwdSuccess, setPwdSuccess]   = useState(false)

  // Sync full_name from tenant
  useEffect(() => {
    const s = tenant?.settings ?? {}
    setFullName(s.full_name || '')
  }, [tenant?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNameBlur = useCallback(async () => {
    const currentName = (tenant?.settings ?? {}).full_name || ''
    if (fullName === currentName) return

    setNameSaving(true)
    try {
      const updatedSettings = { ...(tenant?.settings ?? {}), full_name: fullName }
      await updateTenant({ settings: updatedSettings })
      console.log('[Configuracion] Nombre guardado')
    } catch (err) {
      console.error('[Configuracion] Error guardando nombre:', err.message)
    } finally {
      setNameSaving(false)
    }
  }, [fullName, tenant, updateTenant])

  const handlePasswordChange = useCallback(async () => {
    setPwdError('')
    setPwdSuccess(false)

    if (!newPassword) {
      setPwdError('Ingresa la nueva contrasena.')
      return
    }
    if (newPassword.length < 6) {
      setPwdError('La contrasena debe tener al menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPwdError('Las contrasenas no coinciden.')
      return
    }

    setPwdLoading(true)
    try {
      const updatePromise = supabase.auth.updateUser({ password: newPassword })
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 10000)
      )
      const { error } = await Promise.race([updatePromise, timeoutPromise])
      if (error) throw error

      setNewPassword('')
      setConfirmPassword('')
      setPwdSuccess(true)

      // Clear success message after 3 seconds
      setTimeout(() => setPwdSuccess(false), 3000)
    } catch (err) {
      const msg = err.message || ''
      if (msg === 'timeout') {
        setPwdError('La solicitud tardó demasiado. Verificá tu conexión e intentá de nuevo.')
      } else {
        setPwdError(msg || 'Error al cambiar la contraseña.')
      }
    } finally {
      setPwdLoading(false)
    }
  }, [newPassword, confirmPassword])

  return (
    <div className="space-y-4">
      {/* Profile */}
      <SectionCard title="Perfil">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Auto-guardado al salir del campo</span>
          <SaveIndicator saving={nameSaving} />
        </div>

        <div>
          <FieldLabel label="Nombre completo" htmlFor="full_name" />
          <input
            id="full_name"
            type="text"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            onBlur={handleNameBlur}
            placeholder="Tu nombre y apellido"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        <ReadOnlyField label="Email" value={user?.email || '—'} />
      </SectionCard>

      {/* Password */}
      <SectionCard title="Cambiar contrasena">
        <div>
          <FieldLabel label="Nueva contrasena" htmlFor="new_password" />
          <input
            id="new_password"
            type="password"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setPwdError(''); setPwdSuccess(false) }}
            placeholder="Minimo 6 caracteres"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        <div>
          <FieldLabel label="Confirmar contrasena" htmlFor="confirm_password" />
          <input
            id="confirm_password"
            type="password"
            value={confirmPassword}
            onChange={e => { setConfirmPassword(e.target.value); setPwdError(''); setPwdSuccess(false) }}
            placeholder="Repeti la contrasena"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
          />
        </div>

        {pwdError && (
          <p className="text-sm text-red-600 font-medium">{pwdError}</p>
        )}

        {pwdSuccess && (
          <p className="text-sm text-green-600 font-medium">Contrasena actualizada correctamente.</p>
        )}

        <button
          onClick={handlePasswordChange}
          disabled={pwdLoading || !newPassword}
          className="
            w-full py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold
            shadow-sm hover:bg-amber-600 transition active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed
            flex items-center justify-center gap-2
          "
        >
          {pwdLoading && (
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Actualizar contrasena
        </button>
      </SectionCard>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TAB: PREFERENCIAS
// ─────────────────────────────────────────────────────────────

const CURRENCY_OPTIONS = [
  { value: 'ARS', label: 'ARS — Peso argentino' },
  { value: 'USD', label: 'USD — Dolar estadounidense' },
  { value: 'UYU', label: 'UYU — Peso uruguayo' },
]

const DATE_FORMAT_OPTIONS = [
  { value: 'dd/mm/yyyy', label: 'dd/mm/yyyy' },
  { value: 'mm/dd/yyyy', label: 'mm/dd/yyyy' },
]

function PreferenciasTab() {
  const { tenant, updateTenant } = useAuth()
  const presetConfig = tenant?.preset_config ?? {}

  const [currency, setCurrency]       = useState(presetConfig.currency || 'ARS')
  const [dateFormat, setDateFormat]    = useState(presetConfig.date_format || 'dd/mm/yyyy')
  const [saving, setSaving]           = useState(false)

  // Sync from tenant
  useEffect(() => {
    const pc = tenant?.preset_config ?? {}
    setCurrency(pc.currency || 'ARS')
    setDateFormat(pc.date_format || 'dd/mm/yyyy')
  }, [tenant?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const savePreference = useCallback(async (field, value) => {
    setSaving(true)
    try {
      const updatedPresetConfig = { ...(tenant?.preset_config ?? {}), [field]: value }
      await updateTenant({ preset_config: updatedPresetConfig })
      console.log(`[Configuracion] Preferencia guardada: ${field} = ${value}`)
    } catch (err) {
      console.error('[Configuracion] Error guardando preferencia:', err.message)
    } finally {
      setSaving(false)
    }
  }, [tenant, updateTenant])

  const handleCurrencyChange = (e) => {
    const val = e.target.value
    setCurrency(val)
    savePreference('currency', val)
  }

  const handleDateFormatChange = (e) => {
    const val = e.target.value
    setDateFormat(val)
    savePreference('date_format', val)
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Preferencias de la aplicacion">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Los cambios se guardan automaticamente</span>
          <SaveIndicator saving={saving} />
        </div>

        <div>
          <FieldLabel label="Moneda" htmlFor="currency" />
          <select
            id="currency"
            value={currency}
            onChange={handleCurrencyChange}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition appearance-none"
          >
            {CURRENCY_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div>
          <FieldLabel label="Formato de fecha" htmlFor="date_format" />
          <select
            id="date_format"
            value={dateFormat}
            onChange={handleDateFormatChange}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition appearance-none"
          >
            {DATE_FORMAT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <ReadOnlyField label="Zona horaria" value="America/Buenos_Aires" />
      </SectionCard>
    </div>
  )
}
