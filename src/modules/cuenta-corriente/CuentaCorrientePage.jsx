/**
 * REGISTRAL — CuentaCorrientePage
 * src/modules/cuenta-corriente/CuentaCorrientePage.jsx
 *
 * Muestra clientes con saldos pendientes (cuenta corriente / cuentas a cobrar).
 * Summary cards, lista filtrable, skeleton loading, responsive.
 */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { usePreset } from '../../core/engine/PresetContext'
import { useAuth } from '../../core/auth/useAuth'
import { db } from '../../core/offline/db'
import { useDocumentTitle } from '../../shared/ui/useDocumentTitle'
import {
  PageHeader, EmptyState, formatARS, formatDate,
} from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// DATA HOOK
// ─────────────────────────────────────────────────────────────

function useCuentaCorrienteData() {
  const { tenantId } = useAuth()

  const clientes = useLiveQuery(
    async () => {
      if (!tenantId) return null
      return db.entities
        .where('[tenant_id+entity_type]')
        .equals([tenantId, 'cliente'])
        .filter(e => e.is_active !== false)
        .toArray()
    },
    [tenantId],
    null
  )

  const arMovements = useLiveQuery(
    async () => {
      if (!tenantId) return null
      return db.accounts_receivable
        .where('tenant_id')
        .equals(tenantId)
        .toArray()
    },
    [tenantId],
    null
  )

  return { clientes, arMovements }
}

// ─────────────────────────────────────────────────────────────
// FILTERS
// ─────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'todos',    label: 'Todos' },
  { key: 'con_deuda', label: 'Con deuda' },
  { key: 'vencidos', label: 'Vencidos' },
]

// ─────────────────────────────────────────────────────────────
// STATUS HELPERS
// ─────────────────────────────────────────────────────────────

function getClienteStatus(balance, creditLimit) {
  const bal = Number(balance)
  if (bal <= 0) return { key: 'al_dia', label: 'Al dia', bg: 'bg-green-100', text: 'text-green-700' }
  if (creditLimit > 0 && bal > creditLimit) return { key: 'excedido', label: 'Excedido', bg: 'bg-red-100', text: 'text-red-700' }
  if (bal > 0) return { key: 'con_deuda', label: 'Con deuda', bg: 'bg-yellow-100', text: 'text-yellow-700' }
  return { key: 'al_dia', label: 'Al dia', bg: 'bg-green-100', text: 'text-green-700' }
}

function getLastPaymentDate(entityId, movements) {
  if (!movements?.length) return null
  const pagos = movements
    .filter(m => m.entity_id === entityId && m.movement_type === 'pago')
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  return pagos[0]?.created_at ?? null
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function CuentaCorrientePage() {
  useDocumentTitle('Cuenta Corriente')
  const { preset } = usePreset()
  const vocab = preset?.vocabulary ?? {}
  const clienteLabel = vocab.client ?? 'Cliente'
  const clientesLabel = vocab.clients ?? 'Clientes'

  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('todos')

  const { clientes, arMovements } = useCuentaCorrienteData()
  const loading = clientes === null

  // ── Computed data ──
  const enrichedClientes = useMemo(() => {
    if (!clientes) return null
    return clientes.map(c => ({
      ...c,
      balanceNum: Number(c.balance) || 0,
      status: getClienteStatus(c.balance, c.credit_limit),
      lastPayment: getLastPaymentDate(c.id, arMovements),
    }))
  }, [clientes, arMovements])

  const filtered = useMemo(() => {
    if (!enrichedClientes) return null
    let arr = enrichedClientes

    if (search) {
      const q = search.toLowerCase()
      arr = arr.filter(c =>
        c.name?.toLowerCase().includes(q) ||
        c.code?.toLowerCase().includes(q) ||
        c.data?.cuit_dni?.toLowerCase().includes(q)
      )
    }

    if (filter === 'con_deuda') {
      arr = arr.filter(c => c.balanceNum > 0)
    } else if (filter === 'vencidos') {
      arr = arr.filter(c => c.status.key === 'excedido')
    }

    return arr.sort((a, b) => b.balanceNum - a.balanceNum)
  }, [enrichedClientes, search, filter])

  // ── Summary stats ──
  const stats = useMemo(() => {
    if (!enrichedClientes) return null
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    const totalDeuda = enrichedClientes.reduce((sum, c) => sum + Math.max(0, c.balanceNum), 0)
    const conDeuda = enrichedClientes.filter(c => c.balanceNum > 0).length
    const vencidos = enrichedClientes.filter(c => c.status.key === 'excedido').length

    const cobradoEsteMes = (arMovements ?? [])
      .filter(m => m.movement_type === 'pago' && new Date(m.created_at) >= monthStart)
      .reduce((sum, m) => sum + Math.abs(Number(m.amount) || 0), 0)

    return { totalDeuda, conDeuda, vencidos, cobradoEsteMes }
  }, [enrichedClientes, arMovements])

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Cuenta Corriente"
        subtitle={loading ? 'Cargando...' : `${filtered?.length ?? 0} ${clientesLabel.toLowerCase()}`}
      />

      {/* ── Summary Cards ── */}
      {loading ? (
        <div className="px-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : stats && (
        <div className="px-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard
            icon="💰"
            label="Total deuda"
            value={formatARS(stats.totalDeuda)}
            color="text-red-600"
          />
          <SummaryCard
            icon="👥"
            label="Con deuda"
            value={stats.conDeuda}
            color="text-amber-600"
          />
          <SummaryCard
            icon="⚠️"
            label="Excedidos"
            value={stats.vencidos}
            color={stats.vencidos > 0 ? 'text-red-600' : 'text-gray-600'}
          />
          <SummaryCard
            icon="✅"
            label="Cobrado este mes"
            value={formatARS(stats.cobradoEsteMes)}
            color="text-green-600"
          />
        </div>
      )}

      {/* ── Search & Filters ── */}
      <div className="px-4 py-3 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar ${clientesLabel.toLowerCase()}...`}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <div className="flex gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`
                text-sm px-3 py-2 rounded-xl border transition whitespace-nowrap
                ${filter === f.key
                  ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold'
                  : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}
              `}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      <div className="flex-1 px-4 pb-4">
        {loading ? (
          <SkeletonList />
        ) : !filtered || filtered.length === 0 ? (
          <EmptyState
            icon="💳"
            title="Sin resultados"
            description={
              search || filter !== 'todos'
                ? 'No hay clientes con esos filtros.'
                : 'No hay clientes registrados.'
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Cod.</th>
                    <th className="text-left px-4 py-3 font-medium">{clienteLabel}</th>
                    <th className="text-right px-4 py-3 font-medium">Deuda</th>
                    <th className="text-right px-4 py-3 font-medium">Limite</th>
                    <th className="text-left px-4 py-3 font-medium">Ultimo pago</th>
                    <th className="text-center px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <tr
                      key={c.id}
                      onClick={() => navigate('/clientes', { state: { editId: c.id } })}
                      className={`cursor-pointer hover:bg-gray-50 transition ${i < filtered.length - 1 ? 'border-b border-gray-50' : ''}`}
                    >
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.code ?? '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{c.name}</p>
                        <p className="text-xs text-gray-400">{c.data?.telefono || c.data?.cuit_dni || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${c.balanceNum > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatARS(c.balanceNum)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {c.credit_limit ? formatARS(c.credit_limit) : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {formatDate(c.lastPayment)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${c.status.bg} ${c.status.text}`}>
                          {c.status.label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate('/clientes', { state: { editId: c.id } })}
                  className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 active:scale-[0.98] transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${c.status.bg} ${c.status.text}`}>
                          {c.status.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {c.data?.telefono ? c.data.telefono : ''}
                        {c.lastPayment ? ` · Ult. pago: ${formatDate(c.lastPayment)}` : ''}
                      </p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <p className={`text-sm font-bold ${c.balanceNum > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatARS(c.balanceNum)}
                      </p>
                      {c.credit_limit > 0 && (
                        <p className="text-[10px] text-gray-400">Lim. {formatARS(c.credit_limit)}</p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function SummaryCard({ icon, label, value, color = 'text-gray-900' }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <span className="text-xs text-gray-400 font-medium">{label}</span>
      </div>
      <p className={`text-lg font-bold ${color}`}>{value}</p>
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-2 mt-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
      ))}
    </div>
  )
}
