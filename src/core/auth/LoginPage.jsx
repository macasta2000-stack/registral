/**
 * REGISTRAL — LoginPage
 * src/core/auth/LoginPage.jsx
 *
 * Commercial split-screen login.
 * Left: branding panel (desktop only).
 * Right: login form.
 */

import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export default function LoginPage() {
  const { signIn, isAuthenticated, isOnboarded, hasRubro, loading } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname ?? '/dashboard'

  const [form, setForm]       = useState({ email: '', password: '' })
  const [errors, setErrors]   = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState('')

  if (!loading && isAuthenticated) {
    if (isOnboarded && hasRubro) return <Navigate to={from} replace />
    return <Navigate to="/onboarding" replace />
  }

  function validate() {
    const e = {}
    if (!form.email.trim())    e.email    = 'Ingresá tu email.'
    if (!form.email.includes('@')) e.email = 'Email inválido.'
    if (!form.password)        e.password = 'Ingresá tu contraseña.'
    if (form.password.length < 6) e.password = 'Mínimo 6 caracteres.'
    return e
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setGlobalError('')
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setSubmitting(true)
    try {
      await signIn({ email: form.email.trim(), password: form.password })
      navigate(from, { replace: true })
    } catch (err) {
      setGlobalError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleChange(field) {
    return (e) => {
      setForm(prev => ({ ...prev, [field]: e.target.value }))
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  return (
    <div className="min-h-screen flex">
      {/* ── LEFT BRANDING PANEL (desktop only) ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-amber-600 via-amber-500 to-orange-500 relative overflow-hidden">
        <div className="absolute inset-0">
          {/* Decorative shapes */}
          <div className="absolute top-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-60 h-60 bg-white/5 rounded-full blur-2xl" />
          <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-orange-400/20 rounded-full blur-2xl" />
        </div>
        <div className="relative flex flex-col justify-between p-12 text-white w-full">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center">
              <span className="text-white font-extrabold text-xl">R</span>
            </div>
            <span className="text-2xl font-bold">Registral</span>
          </div>

          {/* Value proposition */}
          <div className="space-y-6">
            <h2 className="text-4xl font-extrabold leading-tight">
              Tu negocio,<br />
              bajo control total.
            </h2>
            <p className="text-lg text-amber-100 max-w-md">
              Stock, remitos, clientes, caja y cuenta corriente.
              Todo en un solo lugar, desde cualquier dispositivo.
            </p>

            {/* Feature chips */}
            <div className="flex flex-wrap gap-2 pt-2">
              {['Stock en tiempo real', 'Cuenta corriente', 'Funciona sin internet', 'Multi-rubro'].map(f => (
                <span
                  key={f}
                  className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-sm text-sm font-medium"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>

          {/* Footer */}
          <p className="text-sm text-amber-200">
            Más de 6 industrias soportadas · Argentina
          </p>
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
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-gray-900">Ingresá a tu cuenta</h1>
              <p className="mt-1 text-sm text-gray-500">Gestioná tu negocio desde cualquier lugar.</p>
            </div>

            {globalError && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{globalError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  inputMode="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="ejemplo@correo.com"
                  className={`
                    w-full rounded-xl border px-4 py-3 text-base text-gray-900
                    placeholder-gray-400 outline-none transition
                    focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                    ${errors.email ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}
                  `}
                />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>

              {/* Password */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña
                </label>
                <PasswordInput
                  id="password"
                  value={form.password}
                  onChange={handleChange('password')}
                  placeholder="Tu contraseña"
                  error={!!errors.password}
                />
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
              </div>

              {/* Submit */}
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
                    <Spinner /> Ingresando...
                  </span>
                ) : 'Ingresar'}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-gray-500">
              ¿No tenés cuenta?{' '}
              <Link to="/register" className="font-semibold text-amber-600 hover:text-amber-700">
                Crear cuenta gratis
              </Link>
            </p>

            <p className="mt-3 text-center text-xs text-gray-400">
              14 días gratis · Sin tarjeta de crédito
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────

function PasswordInput({ id, value, onChange, placeholder, error }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete="current-password"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`
          w-full rounded-xl border px-4 py-3 pr-11 text-base text-gray-900
          placeholder-gray-400 outline-none transition
          focus:ring-2 focus:ring-amber-400 focus:border-amber-400
          ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}
        `}
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
