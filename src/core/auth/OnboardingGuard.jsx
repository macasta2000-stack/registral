/**
 * REGISTRAL — OnboardingGuard
 * src/core/auth/OnboardingGuard.jsx
 *
 * Protege rutas de la app principal.
 * Si autenticado pero sin rubro elegido → /onboarding
 * Si autenticado, con rubro, pero onboarding incompleto → /onboarding
 * Si todo OK → pasa.
 */

import PropTypes from 'prop-types'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth'

export function OnboardingGuard({ children }) {
  const { isAuthenticated, loading, hasRubro, isOnboarded } = useAuth()

  if (loading) return null

  // No autenticado → AuthGuard lo maneja antes que este
  if (!isAuthenticated) return children

  // Autenticado pero sin completar onboarding → forzar onboarding
  if (!hasRubro || !isOnboarded) {
    return <Navigate to="/onboarding" replace />
  }

  return children
}

OnboardingGuard.propTypes = {
  children: PropTypes.node.isRequired,
}
