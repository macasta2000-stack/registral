/**
 * REGISTRAL — useAuth hook
 * src/core/auth/useAuth.js
 *
 * Uso:
 *   const { user, tenant, signIn, signOut, loading } = useAuth()
 */

import { useContext } from 'react'
import { AuthContext } from './AuthContext'

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  }
  return ctx
}
