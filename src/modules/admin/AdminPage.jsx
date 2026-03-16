/**
 * REGISTRAL — AdminPage
 * src/modules/admin/AdminPage.jsx
 *
 * Panel de superadministrador.
 * Permite ver todos los tenants, sus stats, y entrar a cualquier cuenta.
 * Solo accesible para usuarios con is_superadmin = true.
 */

import { useCallback, useEffect, useState } from 'react'
import { useAuth }    from '../../core/auth/useAuth'
import { supabase }   from '../../core/supabase/client'
import { PageHeader, formatARS } from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// RUBRO CONFIG
// ─────────────────────────────────────────────────────────────

const RUBRO_ICONS = {
  correlon:            '🧱',
  gastronomia:         '🍽️',
  medicina:            '🏥',
  abogacia:            '⚖️',
  retail:              '🛍️',
  servicios_generales: '🔧',
  'servicios-generales': '🔧',
}

const RUBRO_LABELS = {
  correlon:            'Corralón',
  gastronomia:         'Gastronomía',
  medicina:            'Medicina',
  abogacia:            'Abogacía',
  retail:              'Retail',
  servicios_generales: 'Servicios',
  'servicios-generales': 'Servicios',
}

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user, tenant: myTenant, isSuperAdmin } = useAuth()

  const [stats, setStats]           = useState(null)
  const [tenants, setTenants]       = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [selectedTenant, setSelectedTenant] = useState(null)
  const [tenantDetail, setTenantDetail]     = useState(null)
  const [detailLoading, setDetailLoading]   = useState(false)

  // ── Fetch admin data ──
  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        supabase.rpc('admin_dashboard_stats'),
        supabase.rpc('admin_list_tenants'),
      ])

      if (statsRes.error) throw statsRes.error
      if (tenantsRes.error) throw tenantsRes.error

      setStats(statsRes.data)
      setTenants(tenantsRes.data || [])
    } catch (err) {
      setError(err.message || 'Error cargando datos de admin')
      console.error('[Admin]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── View tenant detail ──
  const viewTenant = useCallback(async (tenantId) => {
    setSelectedTenant(tenantId)
    setDetailLoading(true)
    try {
      const { data, error: err } = await supabase.rpc('admin_get_tenant', {
        p_tenant_id: tenantId,
      })
      if (err) throw err
      setTenantDetail(data)
    } catch (err) {
      console.error('[Admin] Error loading tenant:', err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // ── Access denied ──
  if (!isSuperAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <span className="text-3xl">🚫</span>
        </div>
        <h2 className="text-lg font-bold text-gray-900">Acceso denegado</h2>
        <p className="mt-2 text-sm text-gray-500">
          Solo el administrador maestro puede acceder a este panel.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500 flex items-center justify-center animate-pulse">
            <span className="text-white font-bold">A</span>
          </div>
          <p className="text-sm text-gray-500">Cargando panel de admin...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-4 max-w-md">
          <p className="text-sm text-red-700 font-medium">{error}</p>
          <button
            onClick={loadData}
            className="mt-3 text-sm text-red-600 font-semibold hover:underline"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Panel de Administración"
        subtitle={`Usuario maestro: ${user?.email}`}
      />

      <div className="px-4 pb-8 space-y-6">
        {/* ── STATS CARDS ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label="Negocios"
            value={stats?.total_tenants ?? 0}
            icon="🏢"
            color="bg-blue-50 text-blue-700"
          />
          <StatCard
            label="Usuarios"
            value={stats?.total_users ?? 0}
            icon="👥"
            color="bg-green-50 text-green-700"
          />
          <StatCard
            label="Rubros activos"
            value={Object.keys(stats?.tenants_by_rubro ?? {}).length}
            icon="📊"
            color="bg-purple-50 text-purple-700"
          />
          <StatCard
            label="Mi tenant"
            value={myTenant?.name || '—'}
            icon="⭐"
            color="bg-amber-50 text-amber-700"
            isText
          />
        </div>

        {/* ── RUBROS BREAKDOWN ── */}
        {stats?.tenants_by_rubro && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Negocios por rubro</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stats.tenants_by_rubro).map(([rubro, count]) => (
                <span
                  key={rubro}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-50 border border-gray-100 text-sm"
                >
                  <span>{RUBRO_ICONS[rubro] || '📦'}</span>
                  <span className="font-medium text-gray-700">
                    {RUBRO_LABELS[rubro] || rubro}
                  </span>
                  <span className="text-gray-400 font-semibold">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── TENANT LIST ── */}
        <div className="bg-white rounded-2xl border border-gray-100">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              Todos los negocios ({tenants.length})
            </h3>
            <button
              onClick={loadData}
              className="text-xs text-amber-600 font-medium hover:underline"
            >
              Actualizar
            </button>
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 font-medium text-gray-500">Negocio</th>
                  <th className="px-5 py-3 font-medium text-gray-500">Rubro</th>
                  <th className="px-5 py-3 font-medium text-gray-500">Plan</th>
                  <th className="px-5 py-3 font-medium text-gray-500">Owner</th>
                  <th className="px-5 py-3 font-medium text-gray-500">Usuarios</th>
                  <th className="px-5 py-3 font-medium text-gray-500">Creado</th>
                  <th className="px-5 py-3 font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {tenants.map(t => (
                  <tr
                    key={t.id}
                    className={`hover:bg-amber-50/50 transition cursor-pointer ${
                      t.id === myTenant?.id ? 'bg-amber-50/30' : ''
                    }`}
                    onClick={() => viewTenant(t.id)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{RUBRO_ICONS[t.rubro] || '📦'}</span>
                        <div>
                          <p className="font-medium text-gray-900">
                            {t.settings?.business_name || t.name || 'Sin nombre'}
                          </p>
                          {t.id === myTenant?.id && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                              TU CUENTA
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {RUBRO_LABELS[t.rubro] || t.rubro || '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`
                        inline-flex px-2 py-0.5 rounded-full text-xs font-semibold
                        ${t.plan === 'pro' ? 'bg-purple-100 text-purple-700' :
                          t.plan === 'agencia' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'}
                      `}>
                        {(t.plan || 'básico').charAt(0).toUpperCase() + (t.plan || 'básico').slice(1)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-gray-500 text-xs">{t.owner_email || '—'}</td>
                    <td className="px-5 py-3 text-gray-600">{t.user_count}</td>
                    <td className="px-5 py-3 text-gray-400 text-xs">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString('es-AR') : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); viewTenant(t.id) }}
                        className="text-xs text-amber-600 font-semibold hover:underline"
                      >
                        Ver →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-gray-50">
            {tenants.map(t => (
              <button
                key={t.id}
                onClick={() => viewTenant(t.id)}
                className="w-full text-left px-4 py-3 hover:bg-amber-50/50 transition"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{RUBRO_ICONS[t.rubro] || '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {t.settings?.business_name || t.name || 'Sin nombre'}
                      {t.id === myTenant?.id && (
                        <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">
                          TU CUENTA
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500">
                      {RUBRO_LABELS[t.rubro] || t.rubro || 'Sin rubro'} · {t.owner_email}
                    </p>
                  </div>
                  <span className="text-gray-300">→</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ── TENANT DETAIL MODAL ── */}
        {selectedTenant && (
          <TenantDetailModal
            tenantId={selectedTenant}
            data={tenantDetail}
            loading={detailLoading}
            myTenantId={myTenant?.id}
            onClose={() => { setSelectedTenant(null); setTenantDetail(null) }}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────────────────────

function StatCard({ label, value, icon, color, isText }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm ${color}`}>
          {icon}
        </span>
        <span className="text-xs font-medium text-gray-500">{label}</span>
      </div>
      <p className={`font-bold text-gray-900 ${isText ? 'text-sm truncate' : 'text-2xl'}`}>
        {value}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TENANT DETAIL MODAL
// ─────────────────────────────────────────────────────────────

function TenantDetailModal({ tenantId, data, loading, myTenantId, onClose }) {
  const { switchTenant } = useAuth()
  const [switching, setSwitching] = useState(false)

  const tenant = data?.tenant
  const users  = data?.users || []
  const stats  = data?.stats || {}

  const handleSwitch = async () => {
    if (!tenant) return
    setSwitching(true)
    try {
      await switchTenant(tenantId)
    } catch (err) {
      console.error('[Admin] Error switching tenant:', err)
    } finally {
      setSwitching(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-3xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{RUBRO_ICONS[tenant?.rubro] || '📦'}</span>
            <div>
              <h2 className="font-bold text-gray-900">
                {tenant?.settings?.business_name || tenant?.name || 'Cargando...'}
              </h2>
              <p className="text-xs text-gray-400">
                {RUBRO_LABELS[tenant?.rubro] || tenant?.rubro || '—'} · Plan {tenant?.plan || 'básico'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500 animate-pulse">Cargando datos...</p>
          </div>
        ) : (
          <div className="px-6 py-4 space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Productos" value={stats.products ?? 0} />
              <MiniStat label="Clientes" value={stats.entities ?? 0} />
              <MiniStat label="Remitos" value={stats.transactions ?? 0} />
            </div>

            {/* Tenant info */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <InfoRow label="ID" value={tenant?.id} mono />
              <InfoRow label="Rubro" value={tenant?.rubro || 'Sin definir'} />
              <InfoRow label="Plan" value={tenant?.plan || 'básico'} />
              <InfoRow label="Estado billing" value={tenant?.billing_status || 'trial'} />
              <InfoRow label="Creado" value={
                tenant?.created_at
                  ? new Date(tenant.created_at).toLocaleString('es-AR')
                  : '—'
              } />
              {tenant?.settings?.address && (
                <InfoRow label="Dirección" value={tenant.settings.address} />
              )}
              {tenant?.settings?.phone && (
                <InfoRow label="Teléfono" value={tenant.settings.phone} />
              )}
            </div>

            {/* Users */}
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">
                Usuarios ({users.length})
              </h3>
              <div className="space-y-2">
                {users.map(u => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {u.full_name || u.email}
                      </p>
                      <p className="text-xs text-gray-400">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`
                        text-xs px-2 py-0.5 rounded-full font-medium
                        ${u.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                          u.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'}
                      `}>
                        {u.role}
                      </span>
                      {!u.is_active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                          Inactivo
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              {tenantId !== myTenantId ? (
                <button
                  onClick={handleSwitch}
                  disabled={switching}
                  className="
                    flex-1 py-3 rounded-xl bg-purple-600 text-white text-sm font-semibold
                    hover:bg-purple-700 transition active:scale-[0.98]
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2
                  "
                >
                  {switching ? (
                    <>
                      <Spinner /> Cambiando...
                    </>
                  ) : (
                    <>
                      👁️ Entrar a esta cuenta
                    </>
                  )}
                </button>
              ) : (
                <div className="flex-1 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold text-center">
                  ⭐ Esta es tu cuenta
                </div>
              )}
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUBCOMPONENTS
// ─────────────────────────────────────────────────────────────

function MiniStat({ label, value }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function InfoRow({ label, value, mono }) {
  return (
    <div className="flex justify-between items-start gap-4">
      <span className="text-xs text-gray-500 flex-shrink-0">{label}</span>
      <span className={`text-xs text-gray-900 text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
