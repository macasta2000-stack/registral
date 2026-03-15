/**
 * REGISTRAL — Shared UI Utilities
 * src/shared/ui/index.js
 *
 * Helpers compartidos usados en los módulos MVP.
 * Sin dependencias de React — solo lógica pura y formatters.
 */

// ─────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────

export function formatARS(value) {
  if (value === null || value === undefined || value === '') return '—'
  const num = typeof value === 'string' ? parseFloat(value) : Number(value)
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

export function formatNumber(value, decimals = 2) {
  if (value === null || value === undefined) return '—'
  const num = Number(value)
  if (isNaN(num)) return '—'
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(num)
}

export function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

export function formatDateTime(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ─────────────────────────────────────────────────────────────
// UUID v4 mínimo
// ─────────────────────────────────────────────────────────────

export function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ─────────────────────────────────────────────────────────────
// STOCK STATUS
// ─────────────────────────────────────────────────────────────

export function getStockStatus(stockCurrent, stockMinimum) {
  const curr = Number(stockCurrent)
  const min  = Number(stockMinimum)
  if (curr <= min)         return 'critico'
  if (curr <= min * 1.5)   return 'bajo'
  return 'normal'
}

export const STOCK_STATUS_CONFIG = {
  normal:  { label: 'Normal',  bg: 'bg-green-100',  text: 'text-green-700' },
  bajo:    { label: 'Bajo',    bg: 'bg-yellow-100', text: 'text-yellow-700' },
  critico: { label: 'Crítico', bg: 'bg-red-100',    text: 'text-red-700' },
}

// ─────────────────────────────────────────────────────────────
// TRANSACTION STATUS
// ─────────────────────────────────────────────────────────────

export const TRANSACTION_STATUS_CONFIG = {
  draft:     { label: 'Borrador',   bg: 'bg-gray-100',    text: 'text-gray-600' },
  confirmed: { label: 'Confirmado', bg: 'bg-blue-100',    text: 'text-blue-700' },
  delivered: { label: 'Entregado',  bg: 'bg-indigo-100',  text: 'text-indigo-700' },
  paid:      { label: 'Cobrado',    bg: 'bg-green-100',   text: 'text-green-700' },
  cancelled: { label: 'Anulado',    bg: 'bg-red-100',     text: 'text-red-600' },
  overdue:   { label: 'Vencido',    bg: 'bg-orange-100',  text: 'text-orange-700' },
  pending:   { label: 'Pendiente',  bg: 'bg-yellow-100',  text: 'text-yellow-700' },
}

// ─────────────────────────────────────────────────────────────
// REUSABLE UI PRIMITIVES (JSX exports)
// ─────────────────────────────────────────────────────────────

export function StatusBadge({ status, config }) {
  const cfg = config?.[status]
  if (!cfg) return <span className="text-xs text-gray-400">{status}</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  )
}

export function EmptyState({ icon = '📭', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-4 shadow-sm">
        <span className="text-3xl">{icon}</span>
      </div>
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-gray-500 max-w-xs leading-relaxed">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ConfirmDialog({ title, description, onConfirm, onCancel, confirmLabel = 'Confirmar', danger = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm mx-auto px-5 pt-5 pb-8 sm:pb-5 shadow-2xl">
        <div className="flex justify-center pt-1 pb-3 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        <h3 className="text-base font-bold text-gray-900">{title}</h3>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
          >Cancelar</button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl text-white text-sm font-semibold ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'}`}
          >{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

export function Spinner({ size = 'sm' }) {
  const s = size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'
  return (
    <svg className={`animate-spin ${s}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-2">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PrimaryButton({ onClick, disabled, loading, children, className = '' }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-white
        text-sm font-semibold shadow-sm hover:bg-amber-600 transition
        active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      {loading && <Spinner />}
      {children}
    </button>
  )
}

export function ModalSheet({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="
        relative bg-white w-full sm:max-w-lg sm:mx-4 sm:rounded-2xl
        rounded-t-3xl shadow-2xl flex flex-col
        max-h-[92vh] sm:max-h-[85vh]
      ">
        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
          >✕</button>
        </div>
        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>
        {/* Footer */}
        {footer && (
          <div className="border-t border-gray-100 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
