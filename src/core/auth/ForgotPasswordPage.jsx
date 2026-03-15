/**
 * REGISTRAL — ForgotPasswordPage
 * src/core/auth/ForgotPasswordPage.jsx
 *
 * Pantalla para solicitar recuperación de contraseña.
 * Envía un email con link de reseteo via Supabase Auth.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState('')
  const [sent, setSent]         = useState(false)
  const [error, setError]       = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!email.trim() || !email.includes('@')) {
      setError('Ingresá un email válido.')
      return
    }

    setSubmitting(true)
    try {
      const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}reset-password`

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        { redirectTo }
      )

      if (resetError) throw resetError
      setSent(true)
    } catch (err) {
      if (err.message?.includes('rate_limit')) {
        setError('Demasiados intentos. Esperá unos minutos.')
      } else {
        // Don't reveal if user exists - always show success
        setSent(true)
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
              Recuperá tu<br />
              contraseña.
            </h2>
            <p className="text-lg text-amber-100 max-w-md">
              Te enviamos un link a tu email para que puedas crear una contraseña nueva.
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

            {sent ? (
              /* ── SUCCESS STATE ── */
              <div className="text-center space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mx-auto">
                  <span className="text-3xl">📧</span>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">¡Revisá tu email!</h1>
                <p className="text-sm text-gray-500 max-w-xs mx-auto">
                  Si existe una cuenta con <span className="font-semibold">{email}</span>,
                  te enviamos un link para restablecer tu contraseña.
                </p>
                <p className="text-xs text-gray-400">
                  Revisá la carpeta de spam si no lo encontrás.
                </p>
                <div className="pt-4 space-y-2">
                  <button
                    onClick={() => { setSent(false); setEmail('') }}
                    className="w-full rounded-xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
                  >
                    Reintentar con otro email
                  </button>
                  <Link
                    to="/login"
                    className="block w-full rounded-xl bg-amber-500 text-white py-3 text-sm font-semibold text-center hover:bg-amber-600 transition"
                  >
                    Volver al login
                  </Link>
                </div>
              </div>
            ) : (
              /* ── FORM STATE ── */
              <>
                <div className="mb-8">
                  <h1 className="text-2xl font-bold text-gray-900">¿Olvidaste tu contraseña?</h1>
                  <p className="mt-1 text-sm text-gray-500">
                    Ingresá tu email y te enviamos un link para restablecerla.
                  </p>
                </div>

                {error && (
                  <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
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
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ejemplo@correo.com"
                      className="
                        w-full rounded-xl border border-gray-200 bg-white px-4 py-3
                        text-base text-gray-900 placeholder-gray-400 outline-none transition
                        focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                      "
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
                        <Spinner /> Enviando...
                      </span>
                    ) : 'Enviar link de recuperación'}
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

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
