/**
 * REGISTRAL — DashboardPage
 * src/modules/dashboard/DashboardPage.jsx
 *
 * Panel principal del negocio. Muestra KPIs, gráfico de ingresos,
 * productos más vendidos, actividad reciente, acciones rápidas
 * y alertas de stock bajo.
 *
 * Datos: IndexedDB (offline-first) via Dexie.
 * Configuración: preset del tenant via useDashboard/useVocabulary.
 */

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../../shared/ui/useDocumentTitle'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { useAuth } from '../../core/auth/useAuth'
import {
  useDashboard,
  useVocabulary,
  usePreset,
} from '../../core/engine/PresetContext'
import { db } from '../../core/offline/db'
import {
  formatARS,
  formatNumber,
  formatDateTime,
  getStockStatus,
} from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth(date) {
  const d = new Date(date)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function shortDay(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric' })
}

function percentChange(current, previous) {
  if (!previous || previous === 0) return current > 0 ? 100 : 0
  return Math.round(((current - previous) / previous) * 100)
}

// ─────────────────────────────────────────────────────────────
// DATA FETCHING
// ─────────────────────────────────────────────────────────────

async function fetchDashboardData(tenantId) {
  const now = new Date()
  const todayStart = startOfDay(now)
  const monthStart = startOfMonth(now)
  const prevMonthStart = new Date(monthStart)
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1)
  const sevenDaysAgo = daysAgo(7)
  const fourteenDaysAgo = daysAgo(14)

  // Parallel queries to IndexedDB
  const [
    allProducts,
    allEntities,
    allTransactions,
    allTransactionItems,
    allSchedules,
  ] = await Promise.all([
    db.products.where('tenant_id').equals(tenantId).toArray(),
    db.entities.where('tenant_id').equals(tenantId).toArray(),
    db.transactions.where('tenant_id').equals(tenantId).toArray(),
    db.transaction_items.where('tenant_id').equals(tenantId).toArray(),
    db.schedules.where('tenant_id').equals(tenantId).toArray(),
  ])

  // --- KPI: Ventas del mes ---
  const thisMonthTx = allTransactions.filter(
    (t) =>
      new Date(t.created_at) >= monthStart &&
      t.status !== 'cancelled' &&
      t.status !== 'draft'
  )
  const prevMonthTx = allTransactions.filter(
    (t) =>
      new Date(t.created_at) >= prevMonthStart &&
      new Date(t.created_at) < monthStart &&
      t.status !== 'cancelled' &&
      t.status !== 'draft'
  )
  const ventasMes = thisMonthTx.reduce((s, t) => s + (Number(t.total) || 0), 0)
  const ventasMesPrev = prevMonthTx.reduce(
    (s, t) => s + (Number(t.total) || 0),
    0
  )

  // --- KPI: Articulos en stock ---
  const activeProducts = allProducts.filter((p) => p.is_active !== false)
  const totalStock = activeProducts.length

  // --- KPI: Clientes activos ---
  const activeEntities = allEntities.filter((e) => e.is_active !== false)
  const clientesActivos = activeEntities.length

  // --- KPI: Remitos pendientes ---
  const remitosPendientes = allTransactions.filter(
    (t) => t.status === 'confirmed' || t.status === 'draft'
  ).length

  // --- KPI: Stock bajo alerta ---
  const lowStockProducts = activeProducts.filter((p) => {
    const status = getStockStatus(p.stock_current, p.stock_minimum)
    return status === 'critico' || status === 'bajo'
  })

  // --- Revenue chart (last 7 days) ---
  const revenueByDay = []
  for (let i = 6; i >= 0; i--) {
    const dayStart = daysAgo(i)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    const dayTx = allTransactions.filter(
      (t) =>
        new Date(t.created_at) >= dayStart &&
        new Date(t.created_at) < dayEnd &&
        t.status !== 'cancelled' &&
        t.status !== 'draft'
    )
    const dayTotal = dayTx.reduce((s, t) => s + (Number(t.total) || 0), 0)
    revenueByDay.push({
      date: dayStart.toISOString().slice(0, 10),
      label: shortDay(dayStart),
      ingresos: dayTotal,
    })
  }

  // --- Previous 7 days revenue for comparison ---
  let prevWeekRevenue = 0
  for (let i = 13; i >= 7; i--) {
    const dayStart = daysAgo(i)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)
    prevWeekRevenue += allTransactions
      .filter(
        (t) =>
          new Date(t.created_at) >= dayStart &&
          new Date(t.created_at) < dayEnd &&
          t.status !== 'cancelled' &&
          t.status !== 'draft'
      )
      .reduce((s, t) => s + (Number(t.total) || 0), 0)
  }
  const thisWeekRevenue = revenueByDay.reduce((s, d) => s + d.ingresos, 0)

  // --- Top 5 products this month ---
  const thisMonthItemTxIds = new Set(thisMonthTx.map((t) => t.id))
  const thisMonthItems = allTransactionItems.filter((i) =>
    thisMonthItemTxIds.has(i.transaction_id)
  )
  const productSalesMap = {}
  for (const item of thisMonthItems) {
    if (!productSalesMap[item.product_id]) {
      productSalesMap[item.product_id] = { qty: 0, revenue: 0 }
    }
    productSalesMap[item.product_id].qty += Number(item.quantity) || 0
    productSalesMap[item.product_id].revenue +=
      (Number(item.quantity) || 0) * (Number(item.unit_price) || 0)
  }
  const productLookup = Object.fromEntries(allProducts.map((p) => [p.id, p]))
  const topProducts = Object.entries(productSalesMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([pid, data]) => ({
      id: pid,
      name: productLookup[pid]?.name ?? 'Producto desconocido',
      category: productLookup[pid]?.category ?? '',
      qty: data.qty,
      revenue: data.revenue,
    }))

  // --- Recent activity (last 10 transactions) ---
  const recentActivity = [...allTransactions]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 10)
    .map((t) => {
      const entity = allEntities.find((e) => e.id === t.entity_id)
      return {
        id: t.id,
        type: t.transaction_type || 'remito',
        status: t.status,
        number: t.number,
        total: t.total,
        entity_name: entity?.name ?? 'Sin cliente',
        created_at: t.created_at,
      }
    })

  // --- Pending schedules for today ---
  const todaySchedules = allSchedules.filter((s) => {
    const sDate = new Date(s.scheduled_at)
    return sDate >= todayStart && sDate < new Date(todayStart.getTime() + 86400000)
  }).length

  return {
    kpis: {
      ventasMes,
      ventasMesChange: percentChange(ventasMes, ventasMesPrev),
      totalStock,
      clientesActivos,
      remitosPendientes,
      lowStockCount: lowStockProducts.length,
      todaySchedules,
      thisWeekRevenue,
      prevWeekRevenue,
      weekChange: percentChange(thisWeekRevenue, prevWeekRevenue),
    },
    revenueByDay,
    topProducts,
    recentActivity,
    lowStockProducts: lowStockProducts.slice(0, 8),
  }
}

// ─────────────────────────────────────────────────────────────
// SKELETON COMPONENTS
// ─────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-gray-200" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-gray-200 rounded w-20" />
          <div className="h-5 bg-gray-200 rounded w-28" />
        </div>
      </div>
      <div className="h-3 bg-gray-100 rounded w-24 mt-1" />
    </div>
  )
}

function SkeletonChart() {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-40 mb-4" />
      <div className="h-48 bg-gray-100 rounded-xl" />
    </div>
  )
}

function SkeletonList({ rows = 5 }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm animate-pulse space-y-3">
      <div className="h-4 bg-gray-200 rounded w-36 mb-4" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-200" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-gray-200 rounded w-3/4" />
            <div className="h-2.5 bg-gray-100 rounded w-1/2" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-16" />
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// KPI CARD
// ─────────────────────────────────────────────────────────────

const KPI_ICONS = {
  ventas: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  stock: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  clientes: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  remitos: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  ),
  alerta: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  ),
}

const KPI_COLORS = {
  green: {
    bg: 'bg-emerald-50',
    icon: 'text-emerald-600',
    badge_up: 'text-emerald-600 bg-emerald-50',
    badge_down: 'text-red-600 bg-red-50',
  },
  amber: {
    bg: 'bg-amber-50',
    icon: 'text-amber-600',
    badge_up: 'text-emerald-600 bg-emerald-50',
    badge_down: 'text-red-600 bg-red-50',
  },
  blue: {
    bg: 'bg-blue-50',
    icon: 'text-blue-600',
    badge_up: 'text-emerald-600 bg-emerald-50',
    badge_down: 'text-red-600 bg-red-50',
  },
  red: {
    bg: 'bg-red-50',
    icon: 'text-red-600',
    badge_up: 'text-red-600 bg-red-50',
    badge_down: 'text-emerald-600 bg-emerald-50',
  },
  orange: {
    bg: 'bg-orange-50',
    icon: 'text-orange-600',
    badge_up: 'text-red-600 bg-red-50',
    badge_down: 'text-emerald-600 bg-emerald-50',
  },
}

function KpiCard({ icon, label, value, change, color = 'amber', invertTrend = false }) {
  const c = KPI_COLORS[color] ?? KPI_COLORS.amber
  const isPositive = change >= 0
  const trendIsGood = invertTrend ? !isPositive : isPositive
  const badgeClass = trendIsGood ? c.badge_up : c.badge_down

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
        {change !== null && change !== undefined && (
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${badgeClass}`}
          >
            {isPositive ? (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 4.5l15 15m0 0V8.25m0 11.25H8.25" />
              </svg>
            )}
            {Math.abs(change)}%
          </span>
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-gray-900 tracking-tight">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// CHART TOOLTIP
// ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-gray-900 text-white text-xs px-3 py-2 rounded-lg shadow-lg">
      <p className="font-medium mb-0.5">{label}</p>
      <p className="text-amber-300 font-semibold">{formatARS(payload[0].value)}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// STATUS CONFIG
// ─────────────────────────────────────────────────────────────

const STATUS_LABELS = {
  draft: { label: 'Borrador', dot: 'bg-gray-400' },
  confirmed: { label: 'Confirmado', dot: 'bg-blue-500' },
  delivered: { label: 'Entregado', dot: 'bg-indigo-500' },
  paid: { label: 'Cobrado', dot: 'bg-emerald-500' },
  cancelled: { label: 'Anulado', dot: 'bg-red-500' },
  pending: { label: 'Pendiente', dot: 'bg-yellow-500' },
}

// ─────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────

export default function DashboardPage() {
  useDocumentTitle('Panel')
  const { tenantId, businessName, user } = useAuth()
  const { t } = useVocabulary()
  const { metrics } = useDashboard()
  const { loading: presetLoading } = usePreset()
  const navigate = useNavigate()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch data from IndexedDB
  useEffect(() => {
    if (!tenantId || presetLoading) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        const result = await fetchDashboardData(tenantId)
        if (!cancelled) {
          setData(result)
          setError(null)
        }
      } catch (err) {
        console.error('[DashboardPage] Error loading data:', err)
        if (!cancelled) {
          setError('No se pudieron cargar los datos del dashboard.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tenantId, presetLoading])

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 12) return 'Buenos dias'
    if (hour < 19) return 'Buenas tardes'
    return 'Buenas noches'
  }, [])

  const firstName = useMemo(() => {
    const name = user?.user_metadata?.full_name || businessName || ''
    return name.split(' ')[0] || ''
  }, [user, businessName])

  // Quick actions
  const quickActions = useMemo(
    () => [
      {
        label: t('new_transaction', 'Nuevo remito'),
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
          </svg>
        ),
        path: '/remitos',
        state: { openNew: true },
        color: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200',
      },
      {
        label: t('new_product', 'Nuevo articulo'),
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m6 4.125l2.25 2.25m0 0l2.25-2.25M12 13.875V7.5M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
          </svg>
        ),
        path: '/stock',
        state: { openNew: true },
        color: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
      },
      {
        label: t('new_entity', 'Nuevo cliente'),
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m3-3h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
          </svg>
        ),
        path: '/clientes',
        state: { openNew: true },
        color: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
      },
      {
        label: 'Abrir caja',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
          </svg>
        ),
        path: '/caja',
        color: 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200',
      },
    ],
    [t]
  )

  // ─────────────────────────────────────────────────────────────
  // LOADING STATE
  // ─────────────────────────────────────────────────────────────

  if (loading || presetLoading) {
    return (
      <div className="min-h-screen bg-gray-50/80 px-4 py-6 lg:px-8">
        {/* Header skeleton */}
        <div className="animate-pulse mb-6">
          <div className="h-6 bg-gray-200 rounded w-48 mb-1" />
          <div className="h-4 bg-gray-100 rounded w-64" />
        </div>

        {/* KPI skeletons */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>

        {/* Charts + sidebar skeletons */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <SkeletonChart />
          </div>
          <SkeletonList rows={5} />
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  // ERROR STATE
  // ─────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50/80 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-1">Error al cargar</h3>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl hover:bg-amber-600 transition"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  const { kpis, revenueByDay, topProducts, recentActivity, lowStockProducts } =
    data ?? {}

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50/80">
      <div className="max-w-7xl mx-auto px-4 py-6 lg:px-8">
        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
              {greeting}{firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t('dashboard_title', 'Panel de control')} — {new Date().toLocaleDateString('es-AR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </p>
          </div>
          <button
            onClick={() => navigate('/remitos', { state: { openNew: true } })}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-500 text-white text-sm font-semibold rounded-xl shadow-sm shadow-amber-200 hover:bg-amber-600 active:scale-[0.98] transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            {t('new_transaction', 'Nuevo remito')}
          </button>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <KpiCard
            icon={KPI_ICONS.ventas}
            label="Ventas del mes"
            value={formatARS(kpis?.ventasMes ?? 0)}
            change={kpis?.ventasMesChange}
            color="green"
          />
          <KpiCard
            icon={KPI_ICONS.stock}
            label={t('products', 'Articulos') + ' en stock'}
            value={formatNumber(kpis?.totalStock ?? 0, 0)}
            change={null}
            color="amber"
          />
          <KpiCard
            icon={KPI_ICONS.clientes}
            label={t('clients', 'Clientes') + ' activos'}
            value={formatNumber(kpis?.clientesActivos ?? 0, 0)}
            change={null}
            color="blue"
          />
          <KpiCard
            icon={KPI_ICONS.remitos}
            label={t('transactions', 'Remitos') + ' pendientes'}
            value={formatNumber(kpis?.remitosPendientes ?? 0, 0)}
            change={null}
            color="amber"
            invertTrend
          />
          <KpiCard
            icon={KPI_ICONS.alerta}
            label="Stock bajo alerta"
            value={formatNumber(kpis?.lowStockCount ?? 0, 0)}
            change={null}
            color={kpis?.lowStockCount > 0 ? 'orange' : 'green'}
            invertTrend
          />
        </div>

        {/* ── Main grid: Chart + Top Products ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Revenue chart */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  Ingresos - Ultimos 7 dias
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Total: {formatARS(kpis?.thisWeekRevenue ?? 0)}
                  {kpis?.weekChange !== 0 && (
                    <span
                      className={`ml-2 font-semibold ${
                        kpis?.weekChange >= 0 ? 'text-emerald-600' : 'text-red-500'
                      }`}
                    >
                      {kpis?.weekChange >= 0 ? '+' : ''}
                      {kpis?.weekChange}% vs semana anterior
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={revenueByDay}
                  margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradientAmber" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#f3f4f6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickFormatter={(v) =>
                      v >= 1000000
                        ? `${(v / 1000000).toFixed(1)}M`
                        : v >= 1000
                        ? `${(v / 1000).toFixed(0)}K`
                        : v
                    }
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="ingresos"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    fill="url(#gradientAmber)"
                    dot={{ r: 3, fill: '#f59e0b', strokeWidth: 0 }}
                    activeDot={{
                      r: 5,
                      fill: '#f59e0b',
                      stroke: '#fff',
                      strokeWidth: 2,
                    }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Top 5 products */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4">
              Top {t('products', 'articulos')} del mes
            </h2>
            {topProducts && topProducts.length > 0 ? (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                        i === 0
                          ? 'bg-amber-100 text-amber-700'
                          : i === 1
                          ? 'bg-gray-100 text-gray-600'
                          : i === 2
                          ? 'bg-orange-50 text-orange-600'
                          : 'bg-gray-50 text-gray-500'
                      }`}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {p.name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatNumber(p.qty, 0)} uds vendidas
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                      {formatARS(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Sin ventas este mes</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Las ventas apareceran aqui
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {quickActions.map((action) => (
            <button
              key={action.path}
              onClick={() => navigate(action.path, action.state ? { state: action.state } : undefined)}
              className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold transition active:scale-[0.98] shadow-sm ${action.color}`}
            >
              {action.icon}
              <span className="truncate">{action.label}</span>
            </button>
          ))}
        </div>

        {/* ── Bottom grid: Activity + Low Stock ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Recent activity */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">
                Actividad reciente
              </h2>
              <button
                onClick={() => navigate('/remitos')}
                className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
              >
                Ver todo
              </button>
            </div>
            {recentActivity && recentActivity.length > 0 ? (
              <div className="space-y-2">
                {recentActivity.map((item) => {
                  const st = STATUS_LABELS[item.status] ?? STATUS_LABELS.pending
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 py-2 px-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer group"
                      onClick={() => navigate('/remitos', { state: { viewId: item.id } })}
                    >
                      <div className="relative flex-shrink-0">
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 group-hover:bg-amber-50 group-hover:text-amber-600 transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                        </div>
                        <div
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${st.dot}`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {item.number
                            ? `${t('transaction', 'Remito')} #${item.number}`
                            : t('transaction', 'Remito')}
                          <span className="font-normal text-gray-500">
                            {' '}
                            — {item.entity_name}
                          </span>
                        </p>
                        <p className="text-xs text-gray-400">
                          {st.label} · {formatDateTime(item.created_at)}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900 whitespace-nowrap">
                        {formatARS(item.total)}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Sin actividad aun</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Crea tu primer {t('transaction', 'remito').toLowerCase()} para comenzar
                </p>
              </div>
            )}
          </div>

          {/* Low stock alerts */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Alertas de stock
                </h2>
                {lowStockProducts && lowStockProducts.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-red-100 text-red-600 rounded-full">
                    {lowStockProducts.length}
                  </span>
                )}
              </div>
              <button
                onClick={() => navigate('/stock', { state: { lowStockFilter: true } })}
                className="text-xs text-amber-600 hover:text-amber-700 font-semibold"
              >
                Ver stock
              </button>
            </div>
            {lowStockProducts && lowStockProducts.length > 0 ? (
              <div className="space-y-2">
                {lowStockProducts.map((p) => {
                  const status = getStockStatus(p.stock_current, p.stock_minimum)
                  const isCritical = status === 'critico'
                  return (
                    <div
                      key={p.id}
                      className={`flex items-center gap-3 py-2.5 px-3 rounded-xl ${
                        isCritical
                          ? 'bg-red-50/70 border border-red-100'
                          : 'bg-yellow-50/70 border border-yellow-100'
                      }`}
                    >
                      <div
                        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                          isCritical
                            ? 'bg-red-100 text-red-600'
                            : 'bg-yellow-100 text-yellow-600'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {p.name}
                        </p>
                        <p className="text-xs text-gray-500">
                          {p.category ? `${p.category} · ` : ''}
                          Min: {formatNumber(p.stock_minimum, 0)}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p
                          className={`text-sm font-bold ${
                            isCritical ? 'text-red-600' : 'text-yellow-600'
                          }`}
                        >
                          {formatNumber(p.stock_current, 0)}
                        </p>
                        <p className="text-[10px] uppercase font-semibold tracking-wide text-gray-400">
                          {isCritical ? 'Critico' : 'Bajo'}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-emerald-500" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-gray-500">Todo en orden</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  No hay {t('products', 'articulos').toLowerCase()} bajo stock minimo
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
