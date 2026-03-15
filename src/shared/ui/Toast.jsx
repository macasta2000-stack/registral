/**
 * REGISTRAL — Toast Notification System
 * src/shared/ui/Toast.jsx
 *
 * Global toast notifications with auto-dismiss.
 * Usage:
 *   import { toast } from './Toast'
 *   toast.success('Guardado correctamente')
 *   toast.error('Error al guardar')
 *   toast.info('Sincronizando...')
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

// ─────────────────────────────────────────────────────────────
// STORE (singleton fuera de React para acceso global)
// ─────────────────────────────────────────────────────────────

let _addToast = () => {}

export const toast = {
  success: (message, duration) => _addToast({ type: 'success', message, duration }),
  error:   (message, duration) => _addToast({ type: 'error',   message, duration }),
  info:    (message, duration) => _addToast({ type: 'info',    message, duration }),
  warn:    (message, duration) => _addToast({ type: 'warn',    message, duration }),
}

// ─────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────

const TOAST_CONFIG = {
  success: {
    bg:   'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-800',
    icon: '✓',
    iconBg: 'bg-emerald-500',
  },
  error: {
    bg:   'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: '✕',
    iconBg: 'bg-red-500',
  },
  info: {
    bg:   'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: 'ℹ',
    iconBg: 'bg-blue-500',
  },
  warn: {
    bg:   'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: '⚠',
    iconBg: 'bg-amber-500',
  },
}

// ─────────────────────────────────────────────────────────────
// PROVIDER
// ─────────────────────────────────────────────────────────────

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  const addToast = useCallback(({ type, message, duration = 4000 }) => {
    const id = ++counterRef.current
    setToasts(prev => [...prev.slice(-4), { id, type, message, duration }])
  }, [])

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  // Register global handler
  useEffect(() => {
    _addToast = addToast
    return () => { _addToast = () => {} }
  }, [addToast])

  return (
    <>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(t => (
          <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
        ))}
      </div>
    </>
  )
}

ToastProvider.propTypes = {
  children: PropTypes.node.isRequired,
}

// ─────────────────────────────────────────────────────────────
// TOAST ITEM
// ─────────────────────────────────────────────────────────────

function ToastItem({ toast: t, onDismiss }) {
  const [exiting, setExiting] = useState(false)
  const config = TOAST_CONFIG[t.type] || TOAST_CONFIG.info

  useEffect(() => {
    const timer = setTimeout(() => setExiting(true), t.duration - 300)
    const removeTimer = setTimeout(() => onDismiss(t.id), t.duration)
    return () => { clearTimeout(timer); clearTimeout(removeTimer) }
  }, [t.id, t.duration, onDismiss])

  return (
    <div
      className={`
        pointer-events-auto
        flex items-center gap-3 px-4 py-3
        rounded-2xl border shadow-lg
        ${config.bg}
        ${exiting ? 'toast-exit' : 'toast-enter'}
      `}
      role="alert"
    >
      <div className={`w-6 h-6 rounded-full ${config.iconBg} flex items-center justify-center flex-shrink-0`}>
        <span className="text-white text-xs font-bold">{config.icon}</span>
      </div>
      <p className={`text-sm font-medium ${config.text} flex-1`}>{t.message}</p>
      <button
        onClick={() => onDismiss(t.id)}
        className="text-gray-400 hover:text-gray-600 flex-shrink-0"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

ToastItem.propTypes = {
  toast: PropTypes.object.isRequired,
  onDismiss: PropTypes.func.isRequired,
}
