/**
 * REGISTRAL — RegisterPage
 * src/core/auth/RegisterPage.jsx
 *
 * Commercial split-screen registration.
 */

import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export default function RegisterPage() {
  const { signUp, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()

  const [form, setForm] = useState({
    fullName: '',
    email:    '',
    password: '',
    confirm:  '',
  })
  const [errors, setErrors]         = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [globalError, setGlobalError] = useState('')

  if (!loading && isAuthenticated) {
    return <Navigate to="/onboarding" replace />
  }

  function validate() {
    const e = {}
    if (!form.email.trim() || !form.email.includes('@'))
      e.email = 'Ingresá un email válido.'
    if (!form.password || form.password.length < 6)
      e.password = 'La contraseña debe tener al menos 6 caracteres.'
    if (form.password !== form.confirm)
      e.confirm = 'Las contraseñas no coinciden.'
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
      await signUp({
        email:    form.email.trim(),
        password: form.password,
        fullName: form.fullName.trim(),
      })
      navigate('/onboarding', { replace: true })
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
          <div className="absolute top-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-32 right-10 w-60 h-60 bg-white/5 rounded-full blur-2xl" />
          <div className="absolute top-1/3 right-1/4 w-40 h-40 bg-orange-400/20 rounded-full blur-2xl" />
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
              Empezá a gestionar<br />
              en minutos.
            </h2>
            <p className="text-lg text-amber-100 max-w-md">
              Creá tu cuenta, elegí tu rubro y el sistema se configura automáticamente.
              Sin setup, sin complicaciones.
            </p>

            {/* Steps */}
            <div className="space-y-3 pt-2">
              {[
                { n: '1', t: 'Creá tu cuenta' },
                { n: '2', t: 'Elegí tu rubro' },
                { n: '3', t: 'Empezá a trabajar' },
              ].map(s => (
                <div key={s.n} className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                    {s.n}
                  </div>
                  <span className="text-base font-medium">{s.t}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-sm text-amber-200">
            14 días gratis · Sin tarjeta · Cancelá cuando quieras
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
              <h1 className="text-2xl font-bold text-gray-900">Creá tu cuenta</h1>
              <p className="mt-1 text-sm text-gray-500">Empezá gratis, sin tarjeta de crédito.</p>
            </div>

            {globalError && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{globalError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  autoComplete="name"
                  value={form.fullName}
                  onChange={handleChange('fullName')}
                  placeholder="Tu nombre completo"
                  className="
                    w-full rounded-xl border border-gray-200 bg-white
                    px-4 py-3 text-base text-gray-900 placeholder-gray-400
                    outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 transition
                  "
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
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

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña <span className="text-red-500">*</span>
                </label>
                <PasswordInput
                  id="password"
                  value={form.password}
                  onChange={handleChange('password')}
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  error={!!errors.password}
                />
                {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password}</p>}
              </div>

              <div>
                <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmá la contraseña <span className="text-red-500">*</span>
                </label>
                <PasswordInput
                  id="confirm"
                  value={form.confirm}
                  onChange={handleChange('confirm')}
                  placeholder="Repetí la contraseña"
                  autoComplete="new-password"
                  error={!!errors.confirm}
                />
                {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm}</p>}
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
                    <Spinner /> Creando cuenta...
                  </span>
                ) : 'Crear cuenta gratis'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-gray-400 leading-relaxed">
              Al crear tu cuenta aceptás los términos de uso. <br />
              14 días de prueba gratuita · Sin tarjeta requerida.
            </p>

            <p className="mt-4 text-center text-sm text-gray-500">
              ¿Ya tenés cuenta?{' '}
              <Link to="/login" className="font-semibold text-amber-600 hover:text-amber-700">
                Ingresá acá
              </Link>
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

function PasswordInput({ id, value, onChange, placeholder, autoComplete, error }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
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
        aria-label={show ? 'Ocultar' : 'Mostrar'}
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
