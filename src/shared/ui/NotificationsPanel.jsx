/**
 * REGISTRAL — NotificationsPanel
 * src/shared/ui/NotificationsPanel.jsx
 *
 * Slide-in panel showing smart notifications generated from IndexedDB data.
 * Generates alerts for:
 *   - Products below minimum stock
 *   - Remitos unpaid > 30 days
 *   - Clients exceeding credit limit
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import PropTypes from 'prop-types'
import { db }      from '../../core/offline/db'
import { useAuth } from '../../core/auth/useAuth'
import { formatARS } from './index'

// ─────────────────────────────────────────────────────────────
// SMART NOTIFICATIONS (generated from live IndexedDB data)
// ─────────────────────────────────────────────────────────────

function useSmartNotifications() {
  const { tenantId } = useAuth()

  const alerts = useLiveQuery(
    async () => {
      if (!tenantId) return []
      const result = []
      const now = Date.now()

      // 1. Low stock products
      const products = await db.products.where('tenant_id').equals(tenantId).toArray()
      const lowStock = products.filter(p =>
        p.is_active !== false &&
        Number(p.stock_current) <= Number(p.stock_minimum)
      )
      for (const p of lowStock.slice(0, 5)) {
        result.push({
          id:       `low-stock-${p.id}`,
          type:     'stock',
          icon:     '📦',
          priority: Number(p.stock_current) === 0 ? 'high' : 'medium',
          title:    `${p.name}: ${p.stock_current} ${p.unit_type || 'un.'}`,
          subtitle: `Mínimo: ${p.stock_minimum}`,
          action:   { path: '/stock', state: { lowStockFilter: true } },
        })
      }

      // 2. Unpaid remitos > 30 days
      const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)
      const transactions = await db.transactions.where('tenant_id').equals(tenantId).toArray()
      const overdue = transactions.filter(t =>
        (t.status === 'confirmed' || t.status === 'delivered') &&
        new Date(t.created_at).getTime() < thirtyDaysAgo
      )
      for (const t of overdue.slice(0, 3)) {
        result.push({
          id:       `overdue-${t.id}`,
          type:     'overdue',
          icon:     '⏰',
          priority: 'high',
          title:    `${t.number || 'Remito'} sin cobrar hace +30 días`,
          subtitle: formatARS(t.total),
          action:   { path: '/remitos', state: { viewId: t.id } },
        })
      }

      // 3. Clients exceeding credit limit
      const entities = await db.entities.where('tenant_id').equals(tenantId).toArray()
      const overLimit = entities.filter(e =>
        e.is_active !== false &&
        Number(e.credit_limit) > 0 &&
        Number(e.balance) > Number(e.credit_limit)
      )
      for (const e of overLimit.slice(0, 3)) {
        result.push({
          id:       `credit-${e.id}`,
          type:     'credit',
          icon:     '💸',
          priority: 'medium',
          title:    `${e.name} excede su límite de crédito`,
          subtitle: `${formatARS(e.balance)} / ${formatARS(e.credit_limit)}`,
          action:   { path: '/clientes', state: { editId: e.id } },
        })
      }

      // Sort: high priority first
      result.sort((a, b) => (a.priority === 'high' ? 0 : 1) - (b.priority === 'high' ? 0 : 1))
      return result
    },
    [tenantId],
    []
  )

  return alerts
}

// ─────────────────────────────────────────────────────────────
// PANEL COMPONENT
// ─────────────────────────────────────────────────────────────

export function NotificationsPanel({ open, onClose }) {
  const navigate = useNavigate()
  const panelRef = useRef(null)
  const alerts = useSmartNotifications()

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        onClose()
      }
    }
    // Delay to avoid closing immediately from the same click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, onClose])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function handler(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  function handleAlertClick(alert) {
    onClose()
    if (alert.action) {
      navigate(alert.action.path, { state: alert.action.state })
    }
  }

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="
        absolute right-0 top-11 z-50
        w-80 max-h-[70vh] bg-white rounded-2xl shadow-2xl border border-gray-100
        flex flex-col overflow-hidden
      "
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-sm font-bold text-gray-900">Notificaciones</h3>
        <span className="text-xs text-gray-400">
          {alerts.length > 0 ? `${alerts.length} alerta${alerts.length !== 1 ? 's' : ''}` : 'Sin alertas'}
        </span>
      </div>

      {/* Alerts list */}
      <div className="flex-1 overflow-y-auto">
        {alerts.length === 0 ? (
          <div className="py-10 text-center">
            <span className="text-3xl">✅</span>
            <p className="text-sm text-gray-500 mt-2">Todo en orden</p>
            <p className="text-xs text-gray-400 mt-0.5">No hay alertas activas</p>
          </div>
        ) : (
          <div className="py-1">
            {alerts.map(alert => (
              <button
                key={alert.id}
                onClick={() => handleAlertClick(alert)}
                className="
                  w-full text-left px-4 py-3 hover:bg-gray-50 transition
                  flex items-start gap-3 border-b border-gray-50 last:border-0
                "
              >
                <span className="text-lg flex-shrink-0 mt-0.5">{alert.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{alert.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{alert.subtitle}</p>
                </div>
                {alert.priority === 'high' && (
                  <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full flex-shrink-0 mt-0.5">
                    Urgente
                  </span>
                )}
                <svg className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

NotificationsPanel.propTypes = {
  open:    PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
}

/**
 * Hook to get the count of smart notifications for the badge.
 */
export function useNotificationCount() {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!tenantId) return 0
      let count = 0

      // Low stock
      const products = await db.products.where('tenant_id').equals(tenantId).toArray()
      count += products.filter(p =>
        p.is_active !== false && Number(p.stock_current) <= Number(p.stock_minimum)
      ).length

      // Overdue remitos > 30 days
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000)
      const transactions = await db.transactions.where('tenant_id').equals(tenantId).toArray()
      count += transactions.filter(t =>
        (t.status === 'confirmed' || t.status === 'delivered') &&
        new Date(t.created_at).getTime() < thirtyDaysAgo
      ).length

      // Credit limit exceeded
      const entities = await db.entities.where('tenant_id').equals(tenantId).toArray()
      count += entities.filter(e =>
        e.is_active !== false &&
        Number(e.credit_limit) > 0 &&
        Number(e.balance) > Number(e.credit_limit)
      ).length

      return count
    },
    [tenantId],
    0
  )
}
