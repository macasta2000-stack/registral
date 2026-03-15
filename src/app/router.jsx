/**
 * REGISTRAL — Router
 * src/app/router.jsx
 *
 * React Router v6 con lazy loading en todas las páginas.
 * Guards en orden: AuthGuard → OnboardingGuard → ModuleGuard.
 *
 * AppShell es el layout padre de todas las rutas protegidas.
 * Cada página se carga con React.lazy + Suspense.
 */

import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import PropTypes from 'prop-types'
import { AuthGuard }        from '../core/auth/AuthGuard'
import { OnboardingGuard }  from '../core/auth/OnboardingGuard'
import { usePreset }        from '../core/engine/PresetContext'
import AppShell             from '../shared/layout/AppShell'

// ─────────────────────────────────────────────────────────────
// LAZY PAGES
// ─────────────────────────────────────────────────────────────

// Auth / Onboarding
const LoginPage            = lazy(() => import('../core/auth/LoginPage'))
const RegisterPage         = lazy(() => import('../core/auth/RegisterPage'))
const ForgotPasswordPage   = lazy(() => import('../core/auth/ForgotPasswordPage'))
const ResetPasswordPage    = lazy(() => import('../core/auth/ResetPasswordPage'))
const OnboardingPage       = lazy(() => import('../onboarding/OnboardingPage'))

// App pages
const DashboardPage        = lazy(() => import('../modules/dashboard/DashboardPage'))
const StockPage            = lazy(() => import('../modules/stock/StockPage'))
const RemitosPage          = lazy(() => import('../modules/remitos/RemitosPage'))
const CuentaCorrientePage  = lazy(() => import('../modules/cuenta-corriente/CuentaCorrientePage'))
const AgendaEntregasPage   = lazy(() => import('../modules/agenda-entregas/AgendaEntregasPage'))
const ClientesPage         = lazy(() => import('../modules/clientes/ClientesPage'))
const CajaPage             = lazy(() => import('../modules/caja/CajaPage'))
const ReportesPage         = lazy(() => import('../modules/reportes/ReportesPage'))
const ConfiguracionPage    = lazy(() => import('../modules/configuracion/ConfiguracionPage'))

// ─────────────────────────────────────────────────────────────
// SUSPENSE FALLBACK
// Skeleton minimalista mientras carga el chunk JS de la página
// ─────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="flex-1 p-4 space-y-3 animate-pulse">
      <div className="h-6 w-48 bg-gray-100 rounded-lg" />
      <div className="h-4 w-72 bg-gray-50 rounded-lg" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-20 bg-gray-100 rounded-2xl" />
        ))}
      </div>
      <div className="mt-4 h-48 bg-gray-100 rounded-2xl" />
    </div>
  )
}

function SuspensePage({ children }) {
  return <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
}

SuspensePage.propTypes = { children: PropTypes.node.isRequired }

// ─────────────────────────────────────────────────────────────
// MODULE GUARD
// Protege rutas de módulos específicos.
// Orden de verificación:
//   1. ¿El preset del rubro tiene este módulo en modules_enabled? → si no: LockedScreen
//   2. ¿El plan actual del tenant lo incluye? → si no: UpgradeScreen
//   3. Pasa.
// ─────────────────────────────────────────────────────────────

function ModuleGuard({ moduleId }) {
  const { preset, tenantData } = usePreset()

  if (!preset) return <PageSkeleton />

  const plan           = tenantData?.plan ?? 'basico'
  const isInPreset     = preset.modules_enabled?.includes(moduleId)
  const isLocked       = preset.modules_locked?.some(m => m.id === moduleId)
  const lockReason     = preset.modules_locked?.find(m => m.id === moduleId)?.reason

  // El módulo es de otro rubro
  if (isLocked) {
    return <ModuleLockedScreen reason={lockReason} />
  }

  // El módulo existe en el preset pero requiere plan superior
  if (isInPreset) {
    const planLimits  = preset.plan_limits ?? {}
    const planModules = planLimits[plan]?.modules ?? []
    const inPlan      = planModules.includes('*') || planModules.includes(moduleId)

    if (!inPlan) {
      return <UpgradeScreen moduleId={moduleId} currentPlan={plan} />
    }

    // Habilitado y en el plan → renderizar la página
    return <Outlet />
  }

  // No está en el preset ni bloqueado → 404
  return <NotFoundPage />
}

ModuleGuard.propTypes = { moduleId: PropTypes.string.isRequired }

// ─────────────────────────────────────────────────────────────
// SCREENS AUXILIARES
// ─────────────────────────────────────────────────────────────

function ModuleLockedScreen({ reason }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
        <span className="text-3xl">🔒</span>
      </div>
      <h2 className="text-lg font-bold text-gray-900">Módulo no disponible</h2>
      <p className="mt-2 text-sm text-gray-500 max-w-xs">
        {reason ?? 'Este módulo no está disponible para tu rubro.'}
      </p>
    </div>
  )
}

ModuleLockedScreen.propTypes = { reason: PropTypes.string }

function UpgradeScreen({ moduleId, currentPlan }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <span className="text-3xl">⬆️</span>
      </div>
      <h2 className="text-lg font-bold text-gray-900">Disponible en plan Pro</h2>
      <p className="mt-2 text-sm text-gray-500 max-w-xs">
        Estás en el plan <span className="font-semibold capitalize">{currentPlan}</span>.
        Actualizá tu plan para acceder a este módulo.
      </p>
      <button className="
        mt-6 px-6 py-3 rounded-xl bg-amber-500 text-white
        text-sm font-semibold shadow-sm hover:bg-amber-600 transition
      ">
        Ver planes
      </button>
    </div>
  )
}

UpgradeScreen.propTypes = {
  moduleId:    PropTypes.string,
  currentPlan: PropTypes.string,
}

function NotFoundPage() {
  return <Navigate to="/dashboard" replace />
}

// ─────────────────────────────────────────────────────────────
// LAYOUT PROTEGIDO
// AuthGuard + OnboardingGuard + AppShell
// ─────────────────────────────────────────────────────────────

function ProtectedLayout() {
  return (
    <AuthGuard>
      <OnboardingGuard>
        <AppShell />
      </OnboardingGuard>
    </AuthGuard>
  )
}

// ─────────────────────────────────────────────────────────────
// ROUTER PRINCIPAL
// ─────────────────────────────────────────────────────────────

export function AppRouter() {
  return (
    <Suspense fallback={<FullPageLoader />}>
      <Routes>
        {/* ── Rutas públicas ── */}
        <Route path="/login"           element={<SuspensePage><LoginPage /></SuspensePage>} />
        <Route path="/register"        element={<SuspensePage><RegisterPage /></SuspensePage>} />
        <Route path="/forgot-password" element={<SuspensePage><ForgotPasswordPage /></SuspensePage>} />
        <Route path="/reset-password"  element={<SuspensePage><ResetPasswordPage /></SuspensePage>} />

        {/* ── Onboarding — solo si autenticado pero sin completar ── */}
        <Route
          path="/onboarding"
          element={
            <AuthGuard>
              <SuspensePage><OnboardingPage /></SuspensePage>
            </AuthGuard>
          }
        />

        {/* ── App protegida ── */}
        <Route path="/" element={<ProtectedLayout />}>
          {/* Redirect raíz al dashboard */}
          <Route index element={<Navigate to="/dashboard" replace />} />

          {/* Dashboard — siempre habilitado, sin ModuleGuard */}
          <Route
            path="dashboard"
            element={<SuspensePage><DashboardPage /></SuspensePage>}
          />

          {/* Módulos con ModuleGuard */}
          <Route path="stock" element={<ModuleGuard moduleId="stock" />}>
            <Route index element={<SuspensePage><StockPage /></SuspensePage>} />
          </Route>

          <Route path="remitos" element={<ModuleGuard moduleId="remitos" />}>
            <Route index element={<SuspensePage><RemitosPage /></SuspensePage>} />
          </Route>

          <Route path="cuenta-corriente" element={<ModuleGuard moduleId="cuenta_corriente" />}>
            <Route index element={<SuspensePage><CuentaCorrientePage /></SuspensePage>} />
          </Route>

          <Route path="agenda-entregas" element={<ModuleGuard moduleId="agenda_entregas" />}>
            <Route index element={<SuspensePage><AgendaEntregasPage /></SuspensePage>} />
          </Route>

          <Route path="clientes" element={<ModuleGuard moduleId="clientes" />}>
            <Route index element={<SuspensePage><ClientesPage /></SuspensePage>} />
          </Route>

          <Route path="caja" element={<ModuleGuard moduleId="caja" />}>
            <Route index element={<SuspensePage><CajaPage /></SuspensePage>} />
          </Route>

          <Route path="reportes" element={<ModuleGuard moduleId="reportes" />}>
            <Route index element={<SuspensePage><ReportesPage /></SuspensePage>} />
          </Route>

          {/* Configuración — siempre habilitado, sin ModuleGuard */}
          <Route
            path="configuracion"
            element={<SuspensePage><ConfiguracionPage /></SuspensePage>}
          />

          {/* 404 dentro del shell */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Redirect global para rutas desconocidas */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Suspense>
  )
}

// ─────────────────────────────────────────────────────────────
// Full-page loader (solo mientras Suspense espera el bundle inicial)
// ─────────────────────────────────────────────────────────────

function FullPageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center animate-pulse">
          <span className="text-white text-xl font-bold">R</span>
        </div>
        <div className="flex gap-1">
          {[0, 150, 300].map(delay => (
            <span
              key={delay}
              className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
              style={{ animationDelay: `${delay}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
