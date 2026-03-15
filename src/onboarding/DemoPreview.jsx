/**
 * REGISTRAL — DemoPreview
 * src/onboarding/DemoPreview.jsx
 *
 * Paso 3 del onboarding.
 * Carga src/demo/[rubro].json (estático, sin API).
 * Muestra una versión simplificada del dashboard con datos demo.
 * Banner: "Estos son datos de ejemplo."
 * CTA: "¡Empezar con mis datos!"
 */

import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'

// Mapa de loaders de demo data (import dinámico estático)
const DEMO_LOADERS = {
  correlon:            () => import('../demo/correlon.json'),
  gastronomia:         () => import('../demo/gastronomia.json').catch(() => ({ default: FALLBACK_DEMO })),
  abogacia:            () => import('../demo/abogacia.json').catch(() => ({ default: FALLBACK_DEMO })),
  medicina:            () => import('../demo/medicina.json').catch(() => ({ default: FALLBACK_DEMO })),
  retail:              () => import('../demo/retail.json').catch(() => ({ default: FALLBACK_DEMO })),
  servicios_generales: () => import('../demo/servicios_generales.json').catch(() => ({ default: FALLBACK_DEMO })),
}

const FALLBACK_DEMO = {
  products: [],
  entities: [],
  transactions: [],
  dashboard_summary: { ventas_hoy: 0, remitos_pendientes: 0, clientes_con_deuda: 0, entregas_hoy: 0, stock_bajo_minimo: 0 },
}

export default function DemoPreview({ rubro, businessName, onStart }) {
  const [demo, setDemo]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loader = DEMO_LOADERS[rubro]
    if (!loader) { setLoading(false); return }
    loader().then(mod => {
      setDemo(mod.default)
      setLoading(false)
    })
  }, [rubro])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 animate-pulse" />
          <p className="text-sm text-gray-400">Cargando vista previa...</p>
        </div>
      </div>
    )
  }

  const summary = demo?.dashboard_summary ?? FALLBACK_DEMO.dashboard_summary
  const products = demo?.products ?? []
  const entities = demo?.entities ?? []
  const transactions = demo?.transactions ?? []

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-4 py-6">
        {/* Header */}
        <div className="mb-5">
          <h2 className="text-xl font-bold text-gray-900">
            Así va a quedar {businessName ? `"${businessName}"` : 'tu negocio'}
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Todo configurado para un corralón. Tus datos reales van acá.
          </p>
        </div>

        {/* Banner de demo */}
        <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-2">
          <span className="text-base flex-shrink-0 mt-0.5">💡</span>
          <p className="text-sm text-amber-800">
            Estos son datos de ejemplo. Los tuyos aparecerán acá cuando empieces a cargarlos.
          </p>
        </div>

        {/* Dashboard preview simplificado */}
        <div className="space-y-4">

          {/* Métricas del día */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Resumen del día
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <MetricCard
                icon="💰"
                label="Ventas de hoy"
                value={formatCurrency(summary.ventas_hoy)}
                color="green"
              />
              <MetricCard
                icon="📋"
                label="Remitos pendientes"
                value={summary.remitos_pendientes}
                color="yellow"
              />
              <MetricCard
                icon="👥"
                label="Clientes con deuda"
                value={summary.clientes_con_deuda}
                color="red"
              />
              <MetricCard
                icon="🚛"
                label="Entregas de hoy"
                value={summary.entregas_hoy}
                color="blue"
              />
            </div>
          </div>

          {/* Stock de artículos */}
          {products.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Artículos en stock
              </p>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {products.slice(0, 4).map((p, i) => (
                  <div
                    key={p.id}
                    className={`flex items-center justify-between px-4 py-3 ${
                      i < products.slice(0, 4).length - 1 ? 'border-b border-gray-50' : ''
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-800 leading-tight">{p.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {p.stock_current} {p.unit_type} · {p.category}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(p.price)}
                      </p>
                      <p className="text-xs text-gray-400">x {p.unit_type}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Últimos remitos */}
          {transactions.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Últimos remitos
              </p>
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {transactions.map((t, i) => {
                  const client = entities.find(e => e.id === t.entity_id)
                  return (
                    <div
                      key={t.id}
                      className={`flex items-center justify-between px-4 py-3 ${
                        i < transactions.length - 1 ? 'border-b border-gray-50' : ''
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-800">{t.number}</p>
                        <p className="text-xs text-gray-400">{client?.name ?? 'Cliente'}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={t.status} />
                        <span className="text-sm font-semibold text-gray-900">
                          {formatCurrency(t.total)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* CTA */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-4">
        <button
          onClick={onStart}
          className="
            w-full rounded-xl bg-amber-500 text-white font-bold
            py-3.5 text-base transition active:scale-[0.98]
            hover:bg-amber-600 shadow-sm
          "
        >
          ¡Empezar con mis datos! 🚀
        </button>
        <p className="mt-2 text-center text-xs text-gray-400">
          Los datos de ejemplo se eliminan. Tu sistema empieza vacío.
        </p>
      </div>
    </div>
  )
}

DemoPreview.propTypes = {
  rubro:        PropTypes.string.isRequired,
  businessName: PropTypes.string,
  onStart:      PropTypes.func.isRequired,
}

// ─────────────────────────────────────────────────────────────
// Subcomponentes
// ─────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, color }) {
  const colorMap = {
    green:  'bg-green-50  text-green-700',
    yellow: 'bg-yellow-50 text-yellow-700',
    red:    'bg-red-50    text-red-700',
    blue:   'bg-blue-50   text-blue-700',
  }
  return (
    <div className={`rounded-xl p-3 ${colorMap[color] ?? colorMap.green}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-base">{icon}</span>
        <p className="text-xs font-medium opacity-80">{label}</p>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = {
    draft:     { label: 'Borrador',  cls: 'bg-gray-100 text-gray-600' },
    confirmed: { label: 'Confirmado',cls: 'bg-blue-100 text-blue-700' },
    delivered: { label: 'Entregado', cls: 'bg-green-100 text-green-700' },
    paid:      { label: 'Cobrado',   cls: 'bg-emerald-100 text-emerald-700' },
    cancelled: { label: 'Anulado',   cls: 'bg-red-100 text-red-600' },
  }
  const s = map[status] ?? map.draft
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${s.cls}`}>
      {s.label}
    </span>
  )
}

function formatCurrency(value) {
  if (typeof value !== 'number') return value
  return new Intl.NumberFormat('es-AR', {
    style:    'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value)
}
