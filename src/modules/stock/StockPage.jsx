/**
 * REGISTRAL — StockPage
 * src/modules/stock/StockPage.jsx
 */

import { useState } from 'react'
import { usePreset }       from '../../core/engine/PresetContext'
import { useProducts, useLowStockProducts } from './useStock'
import ProductModal         from './ProductModal'
import {
  EmptyState, PageHeader, PrimaryButton,
  StatusBadge, STOCK_STATUS_CONFIG,
  formatARS, formatNumber, getStockStatus,
} from '../../shared/ui/index'

export default function StockPage() {
  const { preset }       = usePreset()
  const vocab            = preset?.vocabulary ?? {}
  const stockCfg         = preset?.modules_config?.stock ?? {}
  const categories       = stockCfg.categories ?? []

  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState('')
  const [lowOnly, setLowOnly]   = useState(false)
  const [selected, setSelected] = useState(null) // null | 'new' | product object
  const [showModal, setShowModal] = useState(false)

  const products     = useProducts({ search, category, lowStockOnly: lowOnly })
  const lowProducts  = useLowStockProducts()
  const lowCount     = lowProducts?.length ?? 0

  function openNew()   { setSelected(null); setShowModal(true) }
  function openEdit(p) { setSelected(p);    setShowModal(true) }
  function closeModal(){ setShowModal(false); setSelected(null) }

  const productLabel    = vocab.product    ?? 'Artículo'
  const productsLabel   = vocab.products   ?? 'Artículos'

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={productsLabel}
        subtitle={
          products
            ? `${products.length} ${productsLabel.toLowerCase()}${lowCount > 0 ? ` · ${lowCount} bajo mínimo` : ''}`
            : 'Cargando...'
        }
        action={
          <PrimaryButton onClick={openNew}>
            + {productLabel}
          </PrimaryButton>
        }
      />

      {/* ── Filtros ── */}
      <div className="px-4 py-2 flex flex-col gap-2">
        {/* Búsqueda */}
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar ${productsLabel.toLowerCase()}...`}
            className="
              w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200
              bg-white text-sm text-gray-900 placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-amber-400
            "
          />
        </div>

        {/* Fila de filtros rápidos */}
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-0 scrollbar-hide">
          {/* Categoría */}
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="
              flex-shrink-0 text-sm border border-gray-200 rounded-xl
              px-3 py-2 bg-white text-gray-700
              focus:outline-none focus:ring-2 focus:ring-amber-400
            "
          >
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Bajo mínimo toggle */}
          <button
            onClick={() => setLowOnly(s => !s)}
            className={`
              flex-shrink-0 text-sm px-3 py-2 rounded-xl border transition
              ${lowOnly
                ? 'bg-red-50 border-red-300 text-red-700 font-semibold'
                : 'bg-white border-gray-200 text-gray-600'
              }
            `}
          >
            ⚠️ Solo bajo mínimo
          </button>
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="flex-1 px-4 pb-4">
        {!products ? (
          <ListSkeleton />
        ) : products.length === 0 ? (
          <EmptyState
            icon="📦"
            title={`Sin ${productsLabel.toLowerCase()}`}
            description={search || category || lowOnly
              ? 'No hay artículos que coincidan con los filtros.'
              : `Cargá tu primer ${productLabel.toLowerCase()} para empezar.`
            }
            action={!search && !category && !lowOnly && (
              <PrimaryButton onClick={openNew}>
                + Cargar {productLabel.toLowerCase()}
              </PrimaryButton>
            )}
          />
        ) : (
          <>
            {/* Desktop: tabla */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Código</th>
                    <th className="text-left px-4 py-3 font-medium">{productLabel}</th>
                    <th className="text-left px-4 py-3 font-medium">Categoría</th>
                    <th className="text-left px-4 py-3 font-medium">Unidad</th>
                    <th className="text-right px-4 py-3 font-medium">Stock actual</th>
                    <th className="text-right px-4 py-3 font-medium">Mínimo</th>
                    <th className="text-right px-4 py-3 font-medium">Precio</th>
                    <th className="text-center px-4 py-3 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p, i) => {
                    const status = getStockStatus(p.stock_current, p.stock_minimum)
                    return (
                      <tr
                        key={p.id}
                        onClick={() => openEdit(p)}
                        className={`
                          cursor-pointer hover:bg-gray-50 transition
                          ${i < products.length - 1 ? 'border-b border-gray-50' : ''}
                        `}
                      >
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.code ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-gray-500">{p.category ?? '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{p.unit_type}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">
                          {formatNumber(p.stock_current)}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-400">
                          {formatNumber(p.stock_minimum)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          {formatARS(p.price)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StatusBadge status={status} config={STOCK_STATUS_CONFIG} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile: cards */}
            <div className="md:hidden space-y-2">
              {products.map(p => {
                const status = getStockStatus(p.stock_current, p.stock_minimum)
                return (
                  <button
                    key={p.id}
                    onClick={() => openEdit(p)}
                    className="w-full text-left bg-white rounded-2xl border border-gray-100 px-4 py-3 active:scale-[0.98] transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {p.code ? `${p.code} · ` : ''}{p.category ?? ''}
                        </p>
                      </div>
                      <StatusBadge status={status} config={STOCK_STATUS_CONFIG} />
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-sm text-gray-600">
                        Stock: <span className="font-semibold text-gray-900">{formatNumber(p.stock_current)} {p.unit_type}</span>
                        {' '}/ mín: {formatNumber(p.stock_minimum)}
                      </span>
                      <span className="text-sm font-bold text-gray-900">{formatARS(p.price)}</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <ProductModal
          product={selected}
          onClose={closeModal}
        />
      )}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2 mt-2">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
      ))}
    </div>
  )
}
