/**
 * REGISTRAL — ReportesPage
 * src/modules/reportes/ReportesPage.jsx
 *
 * Panel de reportes con tarjetas pre-construidas, mini graficos (Recharts),
 * filtros de fecha, y vista expandida.
 */

import { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  ResponsiveContainer, XAxis, YAxis, Tooltip,
} from 'recharts'
import { useAuth } from '../../core/auth/useAuth'
import { usePreset } from '../../core/engine/PresetContext'
import { db } from '../../core/offline/db'
import {
  PageHeader, ModalSheet, EmptyState, formatARS, formatNumber,
} from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

const PERIOD_OPTIONS = [
  { key: '7d',  label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
  { key: 'year', label: 'Este anio' },
]

function getPeriodStart(key) {
  const now = new Date()
  switch (key) {
    case '7d':   return new Date(now.getTime() - 7 * 86400000)
    case '30d':  return new Date(now.getTime() - 30 * 86400000)
    case '90d':  return new Date(now.getTime() - 90 * 86400000)
    case 'year': return new Date(now.getFullYear(), 0, 1)
    default:     return new Date(now.getTime() - 30 * 86400000)
  }
}

// ─────────────────────────────────────────────────────────────
// DATA HOOK
// ─────────────────────────────────────────────────────────────

function useReportData() {
  const { tenantId } = useAuth()

  const transactions = useLiveQuery(
    async () => {
      if (!tenantId) return null
      return db.transactions.where('tenant_id').equals(tenantId).toArray()
    },
    [tenantId],
    null
  )

  const products = useLiveQuery(
    async () => {
      if (!tenantId) return null
      return db.products
        .where('[tenant_id+is_active]')
        .equals([tenantId, 1])
        .toArray()
        .catch(() => db.products.where('tenant_id').equals(tenantId).toArray())
    },
    [tenantId],
    null
  )

  const entities = useLiveQuery(
    async () => {
      if (!tenantId) return null
      return db.entities
        .where('[tenant_id+entity_type]')
        .equals([tenantId, 'cliente'])
        .toArray()
    },
    [tenantId],
    null
  )

  const transactionItems = useLiveQuery(
    async () => {
      if (!tenantId) return null
      return db.transaction_items.where('tenant_id').equals(tenantId).toArray()
    },
    [tenantId],
    null
  )

  const arMovements = useLiveQuery(
    async () => {
      if (!tenantId) return null
      return db.accounts_receivable.where('tenant_id').equals(tenantId).toArray()
    },
    [tenantId],
    null
  )

  return { transactions, products, entities, transactionItems, arMovements }
}

// ─────────────────────────────────────────────────────────────
// REPORT GENERATORS
// ─────────────────────────────────────────────────────────────

function buildVentasReport(transactions, periodStart) {
  if (!transactions) return null
  const ventas = transactions.filter(
    t => t.status !== 'cancelled' && new Date(t.created_at) >= periodStart
  )
  const totalVentas = ventas.reduce((s, t) => s + (Number(t.total) || 0), 0)
  const count = ventas.length

  // Group by day for chart
  const byDay = {}
  ventas.forEach(t => {
    const d = new Date(t.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
    byDay[d] = (byDay[d] || 0) + (Number(t.total) || 0)
  })
  const chartData = Object.entries(byDay)
    .map(([name, value]) => ({ name, value }))
    .slice(-14)

  return { totalVentas, count, chartData }
}

function buildStockReport(products) {
  if (!products) return null
  const active = products.filter(p => p.is_active !== false)
  const totalValue = active.reduce((s, p) => {
    const stock = Number(p.stock_current) || 0
    const cost = Number(p.cost) || Number(p.price) || 0
    return s + stock * cost
  }, 0)
  const totalItems = active.reduce((s, p) => s + (Number(p.stock_current) || 0), 0)

  // Top 6 by stock value for chart
  const sorted = active
    .map(p => ({
      name: (p.name ?? '').substring(0, 15),
      value: (Number(p.stock_current) || 0) * (Number(p.cost) || Number(p.price) || 0),
    }))
    .filter(p => p.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return { totalValue, totalItems, productCount: active.length, chartData: sorted }
}

function buildCCReport(entities) {
  if (!entities) return null
  const conDeuda = entities.filter(e => Number(e.balance) > 0)
  const totalDeuda = conDeuda.reduce((s, e) => s + Number(e.balance), 0)

  // Top 6 debtors for chart
  const chartData = conDeuda
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 6)
    .map(e => ({ name: (e.name ?? '').substring(0, 12), value: Number(e.balance) }))

  return { totalDeuda, clientesConDeuda: conDeuda.length, chartData }
}

function buildCajaReport(transactions, arMovements, periodStart) {
  if (!transactions || !arMovements) return null
  const ingresos = transactions
    .filter(t => t.status !== 'cancelled' && new Date(t.created_at) >= periodStart)
    .reduce((s, t) => s + (Number(t.total) || 0), 0)

  const cobros = arMovements
    .filter(m => m.movement_type === 'pago' && new Date(m.created_at) >= periodStart)
    .reduce((s, m) => s + Math.abs(Number(m.amount) || 0), 0)

  const chartData = [
    { name: 'Ventas', value: ingresos },
    { name: 'Cobros CC', value: cobros },
  ]

  return { ingresos, cobros, total: ingresos + cobros, chartData }
}

function buildTopProductsReport(transactionItems, products, periodStart, transactions) {
  if (!transactionItems || !products || !transactions) return null

  const validTxIds = new Set(
    transactions
      .filter(t => t.status !== 'cancelled' && new Date(t.created_at) >= periodStart)
      .map(t => t.id)
  )

  const productMap = {}
  products.forEach(p => { productMap[p.id] = p })

  const sales = {}
  transactionItems
    .filter(item => validTxIds.has(item.transaction_id))
    .forEach(item => {
      const pid = item.product_id
      if (!pid) return
      if (!sales[pid]) sales[pid] = { qty: 0, revenue: 0 }
      sales[pid].qty += Number(item.quantity) || 0
      sales[pid].revenue += (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
    })

  const chartData = Object.entries(sales)
    .map(([pid, data]) => ({
      name: (productMap[pid]?.name ?? 'Producto').substring(0, 15),
      value: data.qty,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8)

  return { topCount: chartData.length, chartData }
}

function buildTopClientsReport(transactions, entities, periodStart) {
  if (!transactions || !entities) return null
  const entityMap = {}
  entities.forEach(e => { entityMap[e.id] = e })

  const clientSales = {}
  transactions
    .filter(t => t.entity_id && t.status !== 'cancelled' && new Date(t.created_at) >= periodStart)
    .forEach(t => {
      const eid = t.entity_id
      if (!clientSales[eid]) clientSales[eid] = 0
      clientSales[eid] += Number(t.total) || 0
    })

  const chartData = Object.entries(clientSales)
    .map(([eid, value]) => ({
      name: (entityMap[eid]?.name ?? 'Cliente').substring(0, 12),
      value,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)

  return { topCount: chartData.length, chartData }
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function ReportesPage() {
  const { preset } = usePreset()
  const vocab = preset?.vocabulary ?? {}

  const [period, setPeriod] = useState('30d')
  const [expanded, setExpanded] = useState(null)

  const data = useReportData()
  const loading = data.transactions === null
  const periodStart = useMemo(() => getPeriodStart(period), [period])

  // ── Build reports ──
  const reports = useMemo(() => {
    if (loading) return []
    return [
      {
        id: 'ventas',
        icon: '📊',
        title: 'Ventas del periodo',
        data: buildVentasReport(data.transactions, periodStart),
        renderSummary: (r) => (
          <>
            <p className="text-lg font-bold text-gray-900">{formatARS(r.totalVentas)}</p>
            <p className="text-xs text-gray-400">{r.count} operaciones</p>
          </>
        ),
        chartType: 'bar',
      },
      {
        id: 'stock',
        icon: '📦',
        title: 'Stock valorizado',
        data: buildStockReport(data.products),
        renderSummary: (r) => (
          <>
            <p className="text-lg font-bold text-gray-900">{formatARS(r.totalValue)}</p>
            <p className="text-xs text-gray-400">{formatNumber(r.totalItems, 0)} unidades · {r.productCount} productos</p>
          </>
        ),
        chartType: 'bar',
      },
      {
        id: 'cc',
        icon: '💳',
        title: 'Cuenta corriente',
        data: buildCCReport(data.entities),
        renderSummary: (r) => (
          <>
            <p className="text-lg font-bold text-red-600">{formatARS(r.totalDeuda)}</p>
            <p className="text-xs text-gray-400">{r.clientesConDeuda} clientes con deuda</p>
          </>
        ),
        chartType: 'pie',
      },
      {
        id: 'caja',
        icon: '💵',
        title: 'Movimientos de caja',
        data: buildCajaReport(data.transactions, data.arMovements, periodStart),
        renderSummary: (r) => (
          <>
            <p className="text-lg font-bold text-green-600">{formatARS(r.total)}</p>
            <p className="text-xs text-gray-400">Ventas: {formatARS(r.ingresos)} · Cobros: {formatARS(r.cobros)}</p>
          </>
        ),
        chartType: 'bar',
      },
      {
        id: 'top_productos',
        icon: '🏆',
        title: 'Productos mas vendidos',
        data: buildTopProductsReport(data.transactionItems, data.products, periodStart, data.transactions),
        renderSummary: (r) => (
          <>
            <p className="text-lg font-bold text-gray-900">{r.topCount} productos</p>
            <p className="text-xs text-gray-400">Ranking por unidades vendidas</p>
          </>
        ),
        chartType: 'bar',
      },
      {
        id: 'top_clientes',
        icon: '👑',
        title: 'Clientes top',
        data: buildTopClientsReport(data.transactions, data.entities, periodStart),
        renderSummary: (r) => (
          <>
            <p className="text-lg font-bold text-gray-900">{r.topCount} clientes</p>
            <p className="text-xs text-gray-400">Mayor facturacion del periodo</p>
          </>
        ),
        chartType: 'pie',
      },
    ]
  }, [loading, data, periodStart])

  const expandedReport = expanded ? reports.find(r => r.id === expanded) : null

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Reportes"
        subtitle={loading ? 'Cargando datos...' : 'Analisis del negocio'}
      />

      {/* ── Period selector ── */}
      <div className="px-4 py-2 flex gap-1.5 overflow-x-auto">
        {PERIOD_OPTIONS.map(p => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`
              text-sm px-3 py-2 rounded-xl border transition whitespace-nowrap
              ${period === p.key
                ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold'
                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}
            `}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Report Cards Grid ── */}
      <div className="flex-1 px-4 py-3 pb-4">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="h-52 bg-gray-100 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {reports.map(report => (
              <ReportCard
                key={report.id}
                report={report}
                onExpand={() => setExpanded(report.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Expanded Report Modal ── */}
      {expandedReport && (
        <ExpandedReport
          report={expandedReport}
          period={PERIOD_OPTIONS.find(p => p.key === period)?.label ?? ''}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// REPORT CARD
// ─────────────────────────────────────────────────────────────

function ReportCard({ report, onExpand }) {
  const { icon, title, data: reportData, renderSummary, chartType } = report

  const hasData = reportData && reportData.chartData?.length > 0

  return (
    <button
      onClick={onExpand}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition active:scale-[0.99]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{icon}</span>
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      </div>

      {/* Summary */}
      {reportData && (
        <div className="mb-3">
          {renderSummary(reportData)}
        </div>
      )}

      {/* Mini chart */}
      {hasData ? (
        <div className="h-24">
          <MiniChart data={reportData.chartData} type={chartType} />
        </div>
      ) : (
        <div className="h-24 flex items-center justify-center">
          <p className="text-xs text-gray-300">Sin datos para graficar</p>
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-end">
        <span className="text-xs text-amber-600 font-medium">Ver detalle →</span>
      </div>
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// MINI CHART
// ─────────────────────────────────────────────────────────────

function MiniChart({ data, type }) {
  if (type === 'pie') {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={20}
            outerRadius={40}
            dataKey="value"
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barSize={12}>
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─────────────────────────────────────────────────────────────
// EXPANDED REPORT
// ─────────────────────────────────────────────────────────────

function ExpandedReport({ report, period, onClose }) {
  const { icon, title, data: reportData, renderSummary, chartType } = report
  const hasData = reportData && reportData.chartData?.length > 0

  return (
    <ModalSheet
      title={`${icon} ${title}`}
      onClose={onClose}
      footer={
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition"
          >
            Cerrar
          </button>
          <button
            className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 transition active:scale-[0.98]"
            onClick={() => {
              // Placeholder for export
              alert('Funcion de exportacion disponible proximamente.')
            }}
          >
            📤 Exportar
          </button>
        </div>
      }
    >
      {/* Period label */}
      <div className="mb-4">
        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
          Periodo: {period}
        </span>
      </div>

      {/* Summary */}
      {reportData && (
        <div className="bg-gray-50 rounded-2xl p-4 mb-4">
          {renderSummary(reportData)}
        </div>
      )}

      {/* Full chart */}
      {hasData ? (
        <div className="h-64 mb-4">
          {chartType === 'pie' ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={reportData.chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  dataKey="value"
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                  stroke="none"
                >
                  {reportData.chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatARS(v)} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportData.chartData} barSize={20}>
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 10 }} width={50} />
                <Tooltip formatter={(v) => formatARS(v)} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {reportData.chartData.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      ) : (
        <EmptyState
          icon="📊"
          title="Sin datos"
          description="No hay datos suficientes para este reporte en el periodo seleccionado."
        />
      )}

      {/* Data table */}
      {hasData && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left px-4 py-2.5 font-medium">#</th>
                <th className="text-left px-4 py-2.5 font-medium">Nombre</th>
                <th className="text-right px-4 py-2.5 font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {reportData.chartData.map((item, i) => (
                <tr key={i} className={i < reportData.chartData.length - 1 ? 'border-b border-gray-50' : ''}>
                  <td className="px-4 py-2.5 text-gray-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 font-medium text-gray-900">{item.name}</td>
                  <td className="px-4 py-2.5 text-right font-semibold text-gray-700">{formatARS(item.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ModalSheet>
  )
}
