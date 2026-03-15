/**
 * REGISTRAL — Global Search
 * src/shared/ui/GlobalSearch.jsx
 *
 * Offline-first command palette that searches Products, Entities and Transactions
 * from IndexedDB via Dexie. Opened with Ctrl+K / Cmd+K.
 *
 * Usage:
 *   import { GlobalSearch, useGlobalSearchShortcut } from './GlobalSearch'
 *
 *   function App() {
 *     const { isOpen, open, close } = useGlobalSearchShortcut()
 *     return <GlobalSearch isOpen={isOpen} onClose={close} />
 *   }
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '../../core/offline/db'
import { useAuth } from '../../core/auth/useAuth'

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const MAX_PER_GROUP = 5
const DEBOUNCE_MS = 200

const GROUPS = {
  products:     { label: 'Artículos',  icon: '\u{1F4E6}', path: '/stock' },
  entities:     { label: 'Clientes',   icon: '\u{1F465}', path: '/clientes' },
  transactions: { label: 'Remitos',    icon: '\u{1F4CB}', path: '/remitos' },
}

// ─────────────────────────────────────────────────────────────
// SEARCH ENGINE (IndexedDB queries)
// ─────────────────────────────────────────────────────────────

async function searchAll(query, tenantId) {
  const q = query.toLowerCase().trim()
  if (!q || !tenantId) return { products: [], entities: [], transactions: [] }

  const [products, entities, transactions] = await Promise.all([
    searchProducts(q, tenantId),
    searchEntities(q, tenantId),
    searchTransactions(q, tenantId),
  ])

  return { products, entities, transactions }
}

async function searchProducts(q, tenantId) {
  const all = await db.products
    .where('tenant_id')
    .equals(tenantId)
    .toArray()

  return all
    .filter(p =>
      p.is_active !== false &&
      (p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q))
    )
    .slice(0, MAX_PER_GROUP)
    .map(p => ({
      id:       p.id,
      type:     'products',
      title:    p.name,
      subtitle: p.code ? `Código: ${p.code}` : null,
    }))
}

async function searchEntities(q, tenantId) {
  const all = await db.entities
    .where('tenant_id')
    .equals(tenantId)
    .toArray()

  return all
    .filter(e =>
      e.is_active !== false &&
      e.name?.toLowerCase().includes(q)
    )
    .slice(0, MAX_PER_GROUP)
    .map(e => ({
      id:       e.id,
      type:     'entities',
      title:    e.name,
      subtitle: e.entity_type ?? null,
    }))
}

async function searchTransactions(q, tenantId) {
  const all = await db.transactions
    .where('tenant_id')
    .equals(tenantId)
    .toArray()

  return all
    .filter(t => {
      const num = String(t.number ?? t.id ?? '').toLowerCase()
      return num.includes(q)
    })
    .slice(0, MAX_PER_GROUP)
    .map(t => ({
      id:       t.id,
      type:     'transactions',
      title:    `Remito #${t.number ?? t.id?.slice(0, 8)}`,
      subtitle: t.created_at
        ? new Date(t.created_at).toLocaleDateString('es-AR')
        : null,
    }))
}

// ─────────────────────────────────────────────────────────────
// HOOK: useGlobalSearchShortcut
// ─────────────────────────────────────────────────────────────

export function useGlobalSearchShortcut() {
  const [isOpen, setIsOpen] = useState(false)

  const open  = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { isOpen, open, close }
}

// ─────────────────────────────────────────────────────────────
// COMPONENT: GlobalSearch
// ─────────────────────────────────────────────────────────────

export function GlobalSearch({ isOpen, onClose }) {
  const navigate = useNavigate()
  const { tenantId } = useAuth()
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState({ products: [], entities: [], transactions: [] })
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(false)

  // Flatten results into a single ordered list for keyboard navigation
  const flatResults = useMemo(() => {
    const flat = []
    for (const key of ['products', 'entities', 'transactions']) {
      for (const item of results[key]) {
        flat.push(item)
      }
    }
    return flat
  }, [results])

  const totalResults = flatResults.length
  const hasQuery = query.trim().length > 0

  // ── Debounced search ──────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return

    const trimmed = query.trim()
    if (!trimmed) {
      setResults({ products: [], entities: [], transactions: [] })
      setActiveIndex(-1)
      return
    }

    setLoading(true)
    const timer = setTimeout(() => {
      searchAll(trimmed, tenantId)
        .then(r => {
          setResults(r)
          setActiveIndex(-1)
        })
        .catch(() => {
          setResults({ products: [], entities: [], transactions: [] })
        })
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [query, tenantId, isOpen])

  // ── Reset on close ────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      setQuery('')
      setResults({ products: [], entities: [], transactions: [] })
      setActiveIndex(-1)
    }
  }, [isOpen])

  // ── Focus input on open ───────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      // Small delay to allow the DOM to render
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [isOpen])

  // ── Scroll active item into view ──────────────────────────
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) return
    const items = listRef.current.querySelectorAll('[data-search-item]')
    items[activeIndex]?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  // ── Navigation helper ─────────────────────────────────────
  const navigateToResult = useCallback((item) => {
    onClose()
    const group = GROUPS[item.type]
    if (!group) return

    navigate(group.path, {
      state: { searchResultId: item.id, openDetail: true },
    })
  }, [navigate, onClose])

  // ── Keyboard handling ─────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(prev =>
          prev < totalResults - 1 ? prev + 1 : 0
        )
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(prev =>
          prev > 0 ? prev - 1 : totalResults - 1
        )
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && flatResults[activeIndex]) {
          navigateToResult(flatResults[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      default:
        break
    }
  }, [activeIndex, totalResults, flatResults, navigateToResult, onClose])

  // ── Don't render when closed ──────────────────────────────
  if (!isOpen) return null

  // ── Render ────────────────────────────────────────────────
  let flatIndex = -1

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda global"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className={`
          relative z-10 w-full bg-white shadow-2xl
          flex flex-col overflow-hidden
          max-h-screen sm:max-h-[min(80vh,560px)]
          sm:mt-[12vh] sm:mx-4 sm:max-w-lg sm:rounded-2xl sm:border sm:border-gray-100
        `}
      >
        {/* Search input area */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          {/* Search icon */}
          <svg
            className="w-5 h-5 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar artículos, clientes o remitos..."
            className="flex-1 text-base text-gray-900 placeholder-gray-400 bg-transparent outline-none"
            autoComplete="off"
            spellCheck={false}
          />

          {/* Loading spinner */}
          {loading && (
            <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          )}

          {/* Shortcut badge / close */}
          <button
            onClick={onClose}
            className="flex-shrink-0 text-xs text-gray-400 bg-gray-100 rounded-lg px-2 py-1 hover:bg-gray-200 transition-colors"
          >
            <span className="hidden sm:inline">ESC</span>
            <span className="sm:hidden">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </span>
          </button>
        </div>

        {/* Results area */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto overscroll-contain"
          role="listbox"
        >
          {/* Empty state — no query */}
          {!hasQuery && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-gray-400">
                Escribí para buscar artículos, clientes o remitos
              </p>
            </div>
          )}

          {/* No results */}
          {hasQuery && !loading && totalResults === 0 && (
            <div className="px-4 py-12 text-center">
              <p className="text-sm text-gray-500">
                Sin resultados para &lsquo;{query.trim()}&rsquo;
              </p>
            </div>
          )}

          {/* Grouped results */}
          {['products', 'entities', 'transactions'].map(groupKey => {
            const items = results[groupKey]
            if (!items || items.length === 0) return null
            const group = GROUPS[groupKey]

            return (
              <div key={groupKey} className="py-2">
                {/* Group header */}
                <div className="px-4 py-1.5 flex items-center gap-2">
                  <span className="text-sm" aria-hidden="true">{group.icon}</span>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {group.label}
                  </span>
                  <span className="text-xs text-gray-300">
                    {items.length === MAX_PER_GROUP ? `${MAX_PER_GROUP}+` : items.length}
                  </span>
                </div>

                {/* Items */}
                {items.map(item => {
                  flatIndex++
                  const idx = flatIndex // capture for closure
                  const isActive = idx === activeIndex

                  return (
                    <button
                      key={item.id}
                      data-search-item
                      role="option"
                      aria-selected={isActive}
                      onClick={() => navigateToResult(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`
                        w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer
                        ${isActive
                          ? 'bg-amber-50 text-amber-900'
                          : 'text-gray-900 hover:bg-gray-50'
                        }
                      `}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className={`text-xs truncate ${isActive ? 'text-amber-500' : 'text-gray-400'}`}>
                            {item.subtitle}
                          </p>
                        )}
                      </div>

                      {/* Arrow indicator */}
                      {isActive && (
                        <svg
                          className="w-4 h-4 text-amber-400 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Footer with keyboard hints (desktop only) */}
        {hasQuery && totalResults > 0 && (
          <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-gray-100 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">&uarr;</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">&darr;</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">Enter</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-[10px]">Esc</kbd>
              cerrar
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
