/**
 * REGISTRAL — AuthGuard
 * src/core/auth/AuthGuard.jsx
 *
 * Protege rutas que requieren autenticación.
 * Si no autenticado → redirige a /login.
 * Mientras carga → spinner de pantalla completa.
 */

import PropTypes from 'prop-types'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './useAuth'

export function AuthGuard({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <AppLoadingScreen />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

AuthGuard.propTypes = {
  children: PropTypes.node.isRequired,
}

// ─────────────────────────────────────────────────────────────
// Loading screen compartida
// ─────────────────────────────────────────────────────────────

function AppLoadingScreen() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg animate-pulse">
          <span className="text-white text-2xl font-bold">R</span>
        </div>
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}
