/**
 * REGISTRAL — SyncStatusBar + SyncContext
 * src/core/offline/SyncStatusBar.jsx
 *
 * Componente visual + Context para el estado de sync.
 *
 * Estados visuales:
 *   🟢 "Todo guardado"                          → pending=0, online
 *   🟡 "Guardando N cambios..."                 → syncing=true
 *   🟡 "Sin conexión — N cambios pendientes"    → offline
 *   🔴 "N cambios no pudieron guardarse"        → failed>0
 *
 * Posición: fixed bottom mobile / fixed top desktop
 * 🟢 se oculta a los 3s del último sync exitoso.
 * Click en 🔴 abre modal con detalle + botón reintentar.
 *
 * Exports:
 *   SyncProvider          → wrapper que inicializa el sync engine
 *   SyncStatusBar         → barra visual (colocar en AppShell)
 *   useSyncStatus         → hook para consumir estado en cualquier componente
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import PropTypes from 'prop-types'
import {
  startSyncEngine,
  stopSyncEngine,
  forceSync,
  getSyncStatus,
  syncEvents,
} from './syncEngine'
import { db } from './db'
import { useAuth } from '../auth/useAuth'

// ─────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────

const SyncContext = createContext(null)

// ─────────────────────────────────────────────────────────────
// PROVIDER
// Inicializa el sync engine cuando el usuario está autenticado.
// ─────────────────────────────────────────────────────────────

export function SyncProvider({ children }) {
  const { tenantId, isAuthenticated } = useAuth()

  const [status, setStatus] = useState({
    pending:   0,
    failed:    0,
    isOnline:  navigator.onLine,
    isRunning: false,
    lastSync:  null,
    syncing:   false,
    hasFailed: false,
  })

  // Timer para ocultar la barra verde
  const hideTimerRef = useRef(null)
  const [visible, setVisible] = useState(false)

  // ── Iniciar / detener sync engine según auth ────────────────

  useEffect(() => {
    if (!isAuthenticated || !tenantId) return

    startSyncEngine(tenantId)

    // Cargar estado inicial
    getSyncStatus().then(s => {
      setStatus(s)
      setVisible(s.pending > 0 || s.failed > 0)
    })

    return () => {
      stopSyncEngine()
    }
  }, [isAuthenticated, tenantId])

  // ── Escuchar eventos del sync engine ───────────────────────

  useEffect(() => {
    function handleStatusEvent(e) {
      const newStatus = e.detail
      setStatus(newStatus)

      // Determinar visibilidad
      const shouldShow = newStatus.pending > 0
        || newStatus.failed > 0
        || newStatus.syncing
        || !newStatus.isOnline

      if (shouldShow) {
        setVisible(true)
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      } else if (newStatus.pending === 0 && newStatus.failed === 0) {
        // Todo guardado → mostrar brevemente el 🟢 y luego ocultar
        setVisible(true)
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
        hideTimerRef.current = setTimeout(() => setVisible(false), 3_000)
      }
    }

    syncEvents.addEventListener('sync:status', handleStatusEvent)
    return () => {
      syncEvents.removeEventListener('sync:status', handleStatusEvent)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
  }, [])

  const retry = useCallback(async () => {
    await forceSync()
  }, [])

  const value = { status, visible, retry }

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  )
}

SyncProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────

export function useSyncStatus() {
  const ctx = useContext(SyncContext)
  if (!ctx) throw new Error('useSyncStatus debe usarse dentro de <SyncProvider>')
  return ctx
}

// ─────────────────────────────────────────────────────────────
// BARRA VISUAL
// ─────────────────────────────────────────────────────────────

export function SyncStatusBar() {
  const { status, visible, retry } = useSyncStatus()
  const [showModal, setShowModal]  = useState(false)
  const [failedOps, setFailedOps]  = useState([])

  if (!visible) return null

  const { pending, failed, isOnline, syncing, lastSync } = status

  // Determinar el estado visual
  let variant = 'saved'
  if (!isOnline)         variant = 'offline'
  else if (failed > 0)   variant = 'error'
  else if (syncing)      variant = 'syncing'
  else if (pending > 0)  variant = 'syncing'
  else                   variant = 'saved'

  async function handleErrorClick() {
    const ops = await db.pendingOps
      .where('status')
      .equals('failed')
      .toArray()
    setFailedOps(ops)
    setShowModal(true)
  }

  async function handleRetry() {
    // Resetear operaciones fallidas a pending para reintentar
    await db.pendingOps
      .where('status')
      .equals('failed')
      .modify({ status: 'pending', retry_count: 0 })

    await retry()
    setShowModal(false)
  }

  return (
    <>
      <Bar
        variant={variant}
        pending={pending}
        failed={failed}
        lastSync={lastSync}
        onErrorClick={variant === 'error' ? handleErrorClick : undefined}
      />

      {showModal && (
        <FailedOpsModal
          ops={failedOps}
          onRetry={handleRetry}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// Bar interna: mobile fixed-bottom / desktop fixed-top-right
// ─────────────────────────────────────────────────────────────

const VARIANT_CONFIG = {
  saved: {
    dot:   'bg-green-400',
    bg:    'bg-green-50 border-green-200',
    text:  'text-green-700',
    label: 'Todo guardado',
    pulse: false,
  },
  syncing: {
    dot:   'bg-yellow-400 animate-pulse',
    bg:    'bg-yellow-50 border-yellow-200',
    text:  'text-yellow-700',
    label: null, // dinámico
    pulse: true,
  },
  offline: {
    dot:   'bg-yellow-400',
    bg:    'bg-yellow-50 border-yellow-200',
    text:  'text-yellow-700',
    label: null, // dinámico
    pulse: false,
  },
  error: {
    dot:   'bg-red-400',
    bg:    'bg-red-50 border-red-200',
    text:  'text-red-700',
    label: null, // dinámico
    pulse: false,
  },
}

function Bar({ variant, pending, failed, lastSync, onErrorClick }) {
  const config = VARIANT_CONFIG[variant]

  let label = config.label
  if (!label) {
    if (variant === 'syncing')  label = pending === 1 ? 'Guardando 1 cambio...' : `Guardando ${pending} cambios...`
    if (variant === 'offline')  label = pending > 0 ? `Sin conexión · ${pending} cambio${pending !== 1 ? 's' : ''} pendiente${pending !== 1 ? 's' : ''}` : 'Sin conexión'
    if (variant === 'error')    label = `${failed} cambio${failed !== 1 ? 's' : ''} no ${failed !== 1 ? 'pudieron' : 'pudo'} guardarse`
  }

  const isClickable = !!onErrorClick

  return (
    <div
      className="
        fixed z-30

        /* Mobile: barra completa en el bottom */
        bottom-0 left-0 right-0
        /* Desktop: pill en top-right */
        sm:bottom-auto sm:top-4 sm:right-4 sm:left-auto sm:w-auto sm:rounded-full

        bg-white sm:shadow-md
        border-t sm:border
        border-gray-100
        px-4 py-2.5 sm:px-4 sm:py-2
        flex items-center justify-center sm:justify-start gap-2
        transition-all duration-200
        ${config.bg}
        ${isClickable ? 'cursor-pointer active:scale-[0.98]' : ''}
      "
      onClick={isClickable ? onErrorClick : undefined}
      role={isClickable ? 'button' : undefined}
      aria-label={isClickable ? 'Ver errores de sincronización' : undefined}
    >
      {/* Dot */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${config.dot}`} />

      {/* Label */}
      <span className={`text-xs font-medium ${config.text}`}>
        {label}
      </span>

      {/* Flecha si es clickable */}
      {isClickable && (
        <svg className={`w-3.5 h-3.5 ${config.text}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}

      {/* Timestamp del último sync exitoso (solo en variant saved, desktop) */}
      {variant === 'saved' && lastSync && (
        <span className="hidden sm:inline text-xs text-green-500 ml-1">
          {formatRelativeTime(lastSync)}
        </span>
      )}
    </div>
  )
}

Bar.propTypes = {
  variant:      PropTypes.string.isRequired,
  pending:      PropTypes.number.isRequired,
  failed:       PropTypes.number.isRequired,
  lastSync:     PropTypes.instanceOf(Date),
  onErrorClick: PropTypes.func,
}

// ─────────────────────────────────────────────────────────────
// Modal: detalle de operaciones fallidas
// ─────────────────────────────────────────────────────────────

function FailedOpsModal({ ops, onRetry, onClose }) {
  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="
        fixed z-50
        bottom-0 left-0 right-0
        sm:bottom-auto sm:top-1/2 sm:left-1/2
        sm:-translate-x-1/2 sm:-translate-y-1/2
        sm:max-w-md sm:w-full
        bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl
        max-h-[80vh] flex flex-col
      ">
        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-5 pt-4 pb-2 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">Cambios sin guardar</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {ops.length} operación{ops.length !== 1 ? 'es' : ''} no pudo sincronizarse con el servidor.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
          >
            ✕
          </button>
        </div>

        {/* Lista de operaciones fallidas */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {ops.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Sin errores registrados.</p>
          )}
          {ops.map((op) => (
            <div key={op._local_id} className="rounded-xl bg-red-50 border border-red-100 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    {formatOperation(op.operation)} en {op.table_name}
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    ID: {op.record_id?.slice(0, 8)}...
                  </p>
                  {op._error && (
                    <p className="text-xs text-red-500 mt-1">{op._error}</p>
                  )}
                </div>
                <span className="text-xs text-red-400 flex-shrink-0">
                  {op.retry_count} intento{op.retry_count !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={onRetry}
            className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold"
          >
            Reintentar ahora
          </button>
        </div>
      </div>
    </>
  )
}

FailedOpsModal.propTypes = {
  ops:     PropTypes.array.isRequired,
  onRetry: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatRelativeTime(date) {
  if (!date) return ''
  const diffMs = Date.now() - new Date(date).getTime()
  const diffS  = Math.floor(diffMs / 1000)

  if (diffS < 10)  return 'ahora mismo'
  if (diffS < 60)  return `hace ${diffS}s`
  const diffM = Math.floor(diffS / 60)
  if (diffM < 60)  return `hace ${diffM}min`
  return ''
}

function formatOperation(op) {
  const map = { INSERT: 'Crear', UPDATE: 'Actualizar', DELETE: 'Eliminar' }
  return map[op] ?? op
}
