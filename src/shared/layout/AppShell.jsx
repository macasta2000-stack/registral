/**
 * REGISTRAL — AppShell
 * src/shared/layout/AppShell.jsx
 *
 * Layout principal de toda la app autenticada.
 *
 * Desktop (≥768px):
 *   [Sidebar 240px fijo izquierda] | [TopBar + Contenido scrolleable]
 *
 * Mobile (<768px):
 *   [TopBar full-width con hamburger]
 *   [Contenido full-width]
 *   [Sidebar como drawer desde la izquierda, overlay]
 *   [SyncStatusBar fixed-bottom — viene del SyncProvider]
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import PropTypes from 'prop-types'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth }   from '../../core/auth/useAuth'
import { db }        from '../../core/offline/db'
import { SyncStatusBar } from '../../core/offline/SyncStatusBar'
import { GlobalSearch, useGlobalSearchShortcut } from '../ui/GlobalSearch'
import Sidebar       from './Sidebar'

// ─────────────────────────────────────────────────────────────
// APPSHELL
// ─────────────────────────────────────────────────────────────

export default function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const { isOpen: searchOpen, open: openSearch, close: closeSearch } = useGlobalSearchShortcut()

  // Cerrar drawer al navegar
  useEffect(() => {
    setDrawerOpen(false)
  }, [location.pathname])

  // Ctrl+N → nuevo remito
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        navigate('/remitos', { state: { openNew: true } })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate])

  // Bloquear scroll del body cuando el drawer está abierto
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [drawerOpen])

  const toggleDrawer = useCallback(() => setDrawerOpen(s => !s), [])
  const closeDrawer  = useCallback(() => setDrawerOpen(false), [])

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── SIDEBAR DESKTOP (fijo, visible en md+) ── */}
      <aside className="
        hidden md:flex flex-col
        w-60 flex-shrink-0
        bg-white border-r border-gray-100
        h-screen sticky top-0
        z-20
      ">
        <Sidebar onNavigate={closeDrawer} />
      </aside>

      {/* ── MAIN AREA ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* TopBar */}
        <TopBar onHamburger={toggleDrawer} onSearchOpen={openSearch} />

        {/* Contenido */}
        <main className="
          flex-1 overflow-y-auto
          /* Padding bottom en mobile para no solapar con SyncStatusBar */
          pb-16 md:pb-0
        ">
          <Outlet />
        </main>
      </div>

      {/* ── SIDEBAR MOBILE (drawer deslizable desde izquierda) ── */}
      {/* Overlay */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={closeDrawer}
          aria-label="Cerrar menú"
        />
      )}

      {/* Drawer */}
      <aside
        className={`
          fixed top-0 left-0 h-full w-72 max-w-[85vw]
          bg-white shadow-2xl z-40
          flex flex-col
          md:hidden
          transform transition-transform duration-250 ease-in-out
          ${drawerOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Header del drawer */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <span className="text-base font-semibold text-gray-900">Registral</span>
          </div>
          <button
            onClick={closeDrawer}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
            aria-label="Cerrar menú"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Sidebar onNavigate={closeDrawer} />
        </div>
      </aside>

      {/* ── SYNC STATUS BAR (siempre visible) ── */}
      <SyncStatusBar />

      {/* ── GLOBAL SEARCH (Ctrl+K) ── */}
      <GlobalSearch isOpen={searchOpen} onClose={closeSearch} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TOP BAR
// ─────────────────────────────────────────────────────────────

function TopBar({ onHamburger, onSearchOpen }) {
  const { tenant, user, signOut, businessName } = useAuth()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Contar notificaciones no leídas desde IndexedDB
  const unreadCount = useLiveQuery(
    async () => {
      if (!tenant?.id) return 0
      return db.notifications
        .where('[tenant_id+is_read]')
        .equals([tenant.id, 0]) // 0 = false en Dexie indexing
        .count()
    },
    [tenant?.id],
    0
  )

  // Cerrar dropdown al click fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false)
      }
    }
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  const initials = getInitials(businessName || user?.email || 'U')

  return (
    <header className="
      sticky top-0 z-10
      bg-white border-b border-gray-100
      px-4 py-3
      flex items-center justify-between gap-3
    ">
      {/* Izquierda: hamburger (mobile) + nombre del negocio */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — solo mobile */}
        <button
          onClick={onHamburger}
          className="md:hidden w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 flex-shrink-0"
          aria-label="Abrir menú"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Logo — solo desktop */}
        <div className="hidden md:flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500 flex items-center justify-center">
            <span className="text-white font-bold text-xs">R</span>
          </div>
        </div>

        {/* Nombre del negocio */}
        <h1 className="text-base font-semibold text-gray-900 truncate">
          {businessName || 'Mi negocio'}
        </h1>
      </div>

      {/* Derecha: search + notificaciones + avatar */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Search button */}
        <button
          onClick={onSearchOpen}
          className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-400 hover:bg-gray-100 transition"
          aria-label="Buscar (Ctrl+K)"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="text-xs">Buscar...</span>
          <kbd className="text-[10px] bg-white border border-gray-200 px-1 py-0.5 rounded font-mono">⌘K</kbd>
        </button>

        {/* Search icon mobile */}
        <button
          onClick={onSearchOpen}
          className="sm:hidden w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
          aria-label="Buscar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>

        {/* Notificaciones */}
        <button
          className="relative w-9 h-9 rounded-xl flex items-center justify-center text-gray-500 hover:bg-gray-100 transition"
          aria-label={`${unreadCount} notificaciones sin leer`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Avatar / User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(s => !s)}
            className="
              w-9 h-9 rounded-xl bg-amber-100 text-amber-700
              flex items-center justify-center
              text-sm font-bold
              hover:bg-amber-200 transition
            "
            aria-label="Menú de usuario"
          >
            {initials}
          </button>

          {userMenuOpen && (
            <UserDropdown
              user={user}
              businessName={businessName}
              onSignOut={() => { setUserMenuOpen(false); signOut() }}
              onClose={() => setUserMenuOpen(false)}
              onNavigate={(path) => { setUserMenuOpen(false); navigate(path) }}
            />
          )}
        </div>
      </div>
    </header>
  )
}

TopBar.propTypes = {
  onHamburger:  PropTypes.func.isRequired,
  onSearchOpen: PropTypes.func.isRequired,
}

// ─────────────────────────────────────────────────────────────
// USER DROPDOWN
// ─────────────────────────────────────────────────────────────

function UserDropdown({ user, businessName, onSignOut, onClose, onNavigate }) {
  return (
    <div className="
      absolute right-0 top-11 z-50
      w-56 bg-white rounded-2xl shadow-xl border border-gray-100
      overflow-hidden
    ">
      {/* Info del usuario */}
      <div className="px-4 py-3 border-b border-gray-50">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {businessName || 'Mi negocio'}
        </p>
        <p className="text-xs text-gray-400 truncate mt-0.5">{user?.email}</p>
      </div>

      {/* Opciones */}
      <div className="py-1">
        <button
          onClick={() => { onClose(); onNavigate('/configuracion') }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition"
        >
          <span className="text-base">⚙️</span>
          Configuración
        </button>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition"
        >
          <span className="text-base">👋</span>
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}

UserDropdown.propTypes = {
  user:         PropTypes.object,
  businessName: PropTypes.string,
  onSignOut:    PropTypes.func.isRequired,
  onClose:      PropTypes.func.isRequired,
  onNavigate:   PropTypes.func.isRequired,
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function getInitials(name) {
  if (!name) return 'U'
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
