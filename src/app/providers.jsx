/**
 * REGISTRAL — AppProviders
 * src/app/providers.jsx
 *
 * Stack de providers en orden obligatorio.
 * Cada provider depende del anterior.
 *
 *   BrowserRouter
 *     └─ AuthProvider           ← sesión Supabase + tenant row
 *         └─ PresetProvider     ← carga preset JSON según tenant.rubro
 *             └─ SyncProvider   ← inicia sync engine con tenantId
 *                 └─ QueryProvider (TanStack Query v5)
 *                     └─ children
 */

import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PropTypes from 'prop-types'
import { AuthProvider }   from '../core/auth/AuthContext'
import { PresetProvider } from '../core/engine/PresetContext'
import { SyncProvider }   from '../core/offline/SyncStatusBar'
import { ToastProvider }  from '../shared/ui/Toast'
import { ErrorBoundary }  from '../shared/ui/ErrorBoundary'

// ─────────────────────────────────────────────────────────────
// TANSTACK QUERY CONFIG
// ─────────────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Los datos de Supabase con RLS son tenant-isolated → safe to cache
      staleTime:          30_000,     // 30s antes de revalidar
      gcTime:             5 * 60_000, // 5min en memoria tras desmontar
      retry:              2,
      refetchOnWindowFocus: false,    // El sync engine ya maneja cambios externos
      refetchOnReconnect:   true,     // Sí revalidar al recuperar conexión
      networkMode:          'offlineFirst', // Devolver caché inmediatamente
    },
    mutations: {
      retry:       0,     // Las mutaciones no reintentamos (useAutoSave lo maneja)
      networkMode: 'always',
    },
  },
})

// ─────────────────────────────────────────────────────────────
// PROVIDER STACK
// ─────────────────────────────────────────────────────────────

export function AppProviders({ children }) {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AuthProvider>
          <PresetProvider>
            <SyncProvider>
              <QueryClientProvider client={queryClient}>
                <ToastProvider>
                  {children}
                </ToastProvider>
              </QueryClientProvider>
            </SyncProvider>
          </PresetProvider>
        </AuthProvider>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

AppProviders.propTypes = {
  children: PropTypes.node.isRequired,
}

// Exportar queryClient para invalidaciones manuales desde fuera del árbol de React
export { queryClient }
