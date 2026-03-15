/**
 * REGISTRAL — RemitosPage
 * src/modules/remitos/RemitosPage.jsx
 */

import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDocumentTitle } from '../../shared/ui/useDocumentTitle'
import { toast }           from '../../shared/ui/Toast'
import { usePreset }       from '../../core/engine/PresetContext'
import { useRemitos, useRemitoActions } from './useRemitos'
import { useLiveQuery }    from 'dexie-react-hooks'
import { db }              from '../../core/offline/db'
import { useAuth }         from '../../core/auth/useAuth'
import RemitoForm          from './RemitoForm'
import RemitoDetail        from './RemitoDetail'
import {
  EmptyState, PageHeader, PrimaryButton, ConfirmDialog,
  StatusBadge, TRANSACTION_STATUS_CONFIG,
  formatARS, formatDate, Spinner,
} from '../../shared/ui/index'

const STATUS_TABS = [
  { key: 'all',       label: 'Todos' },
  { key: 'draft',     label: 'Borrador' },
  { key: 'confirmed', label: 'Confirmado' },
  { key: 'delivered', label: 'Entregado' },
  { key: 'paid',      label: 'Cobrado' },
]

export default function RemitosPage() {
  useDocumentTitle('Remitos')
  const { preset }   = usePreset()
  const { tenantId } = useAuth()
  const location     = useLocation()
  const navigate     = useNavigate()
  const vocab        = preset?.vocabulary ?? {}
  const transLabel   = vocab.transaction ?? 'Remito'
  const transLabels  = vocab.transactions ?? 'Remitos'

  const [activeTab, setActiveTab]   = useState('all')
  const [search, setSearch]         = useState('')
  const [view, setView]             = useState(null) // null | {mode:'new'} | {mode:'edit',id} | {mode:'detail',id}
  const [confirmAction, setConfirmAction] = useState(null) // { type, id, label }
  const [actionLoading, setActionLoading] = useState(null)

  // Handle navigation state from dashboard
  useEffect(() => {
    if (location.state?.openNew) {
      setView({ mode: 'new' })
      navigate(location.pathname, { replace: true, state: {} })
    } else if (location.state?.viewId || location.state?.searchResultId) {
      const id = location.state.viewId || location.state.searchResultId
      setView({ mode: 'detail', id })
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state])

  const remitos = useRemitos({ status: activeTab, search })
  const { confirmRemito, deliverRemito, cancelRemito } = useRemitoActions()

  // Mapa de nombres de clientes para mostrar en tabla
  const entityNames = useLiveQuery(
    async () => {
      if (!tenantId) return {}
      const entities = await db.entities.where('tenant_id').equals(tenantId).toArray()
      return Object.fromEntries(entities.map(e => [e.id, e.name]))
    },
    [tenantId],
    {}
  )

  // Total de remitos visibles
  const total = remitos?.reduce((sum, r) => sum + Number(r.total ?? 0), 0) ?? 0

  async function executeAction(type, id) {
    setActionLoading(id)
    try {
      if (type === 'confirm')  { await confirmRemito(id); toast.success('Remito confirmado') }
      if (type === 'deliver')  { await deliverRemito(id); toast.success('Remito marcado como entregado') }
      if (type === 'cancel')   { await cancelRemito(id); toast.success('Remito anulado') }
    } catch (err) {
      console.error('[RemitosPage]', err)
      toast.error('Error: ' + (err.message || 'No se pudo completar la acción'))
    } finally {
      setActionLoading(null)
      setConfirmAction(null)
    }
  }

  if (view?.mode === 'new') {
    return <RemitoForm onClose={() => setView(null)} />
  }

  if (view?.mode === 'detail') {
    return <RemitoDetail id={view.id} onClose={() => setView(null)} />
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={transLabels}
        subtitle={remitos ? `${remitos.length} ${transLabels.toLowerCase()}` : 'Cargando...'}
        action={<PrimaryButton onClick={() => setView({ mode: 'new' })}>+ {transLabel}</PrimaryButton>}
      />

      {/* Búsqueda */}
      <div className="px-4 pt-2 pb-1">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número o cliente..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 flex gap-1 overflow-x-auto scrollbar-hide">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`
              flex-shrink-0 text-sm px-4 py-2 rounded-xl font-medium transition
              ${activeTab === tab.key
                ? 'bg-amber-500 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="flex-1 px-4 pb-4">
        {!remitos ? (
          <div className="space-y-2 mt-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
        ) : remitos.length === 0 ? (
          <EmptyState
            icon="📋"
            title={`Sin ${transLabels.toLowerCase()}`}
            description={search ? 'No hay resultados.' : `Creá tu primer ${transLabel.toLowerCase()}.`}
            action={!search && activeTab === 'all' && (
              <PrimaryButton onClick={() => setView({ mode: 'new' })}>
                + Nuevo {transLabel.toLowerCase()}
              </PrimaryButton>
            )}
          />
        ) : (
          <div className="space-y-2">
            {remitos.map(r => {
              const isLoading = actionLoading === r.id
              const entityName = entityNames?.[r.entity_id] ?? '—'

              return (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
                >
                  {/* Fila principal */}
                  <button
                    onClick={() => setView({ mode: 'detail', id: r.id })}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 transition"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900">{r.number}</span>
                          <StatusBadge status={r.status} config={TRANSACTION_STATUS_CONFIG} />
                          {r._sync_status === 'pending' && (
                            <span className="text-[10px] text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded-full">pendiente sync</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5 truncate">{entityName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDate(r.created_at)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-base font-bold text-gray-900">{formatARS(r.total)}</p>
                        {r.payment_method && (
                          <p className="text-xs text-gray-400">{r.payment_method}</p>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Acciones rápidas según estado */}
                  {r.status !== 'paid' && r.status !== 'cancelled' && (
                    <div className="flex items-center gap-1 px-3 pb-3">
                      {r.status === 'draft' && (
                        <>
                          <ActionBtn
                            label="Confirmar"
                            color="blue"
                            loading={isLoading}
                            onClick={() => setConfirmAction({ type: 'confirm', id: r.id, label: `confirmar el remito ${r.number}` })}
                          />
                          <ActionBtn label="Editar" color="gray" loading={false}
                            onClick={() => setView({ mode: 'detail', id: r.id })} />
                          <ActionBtn label="Anular" color="red" loading={false}
                            onClick={() => setConfirmAction({ type: 'cancel', id: r.id, label: `anular el remito ${r.number}` })} />
                        </>
                      )}
                      {r.status === 'confirmed' && (
                        <>
                          <ActionBtn label="Marcar entregado" color="indigo" loading={isLoading}
                            onClick={() => executeAction('deliver', r.id)} />
                          <ActionBtn label="Ver" color="gray" loading={false}
                            onClick={() => setView({ mode: 'detail', id: r.id })} />
                          <ActionBtn label="Anular" color="red" loading={false}
                            onClick={() => setConfirmAction({ type: 'cancel', id: r.id, label: `anular el remito ${r.number}` })} />
                        </>
                      )}
                      {r.status === 'delivered' && (
                        <>
                          <ActionBtn label="Registrar cobro" color="green" loading={isLoading}
                            onClick={() => setView({ mode: 'detail', id: r.id })} />
                          <ActionBtn label="Ver" color="gray" loading={false}
                            onClick={() => setView({ mode: 'detail', id: r.id })} />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Totales al pie */}
            {remitos.length > 0 && (
              <div className="mt-3 bg-gray-50 rounded-2xl px-4 py-3 flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {remitos.length} {transLabels.toLowerCase()}
                </p>
                <p className="text-sm font-bold text-gray-900">{formatARS(total)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogo de confirmación */}
      {confirmAction && (
        <ConfirmDialog
          title="¿Estás seguro?"
          description={`Vas a ${confirmAction.label}. Esta acción no se puede deshacer.`}
          confirmLabel={confirmAction.type === 'cancel' ? 'Anular' : 'Confirmar'}
          danger={confirmAction.type === 'cancel'}
          onConfirm={() => executeAction(confirmAction.type, confirmAction.id)}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

function ActionBtn({ label, color, loading, onClick }) {
  const colorMap = {
    blue:   'bg-blue-50 text-blue-700 border-blue-100',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    green:  'bg-green-50 text-green-700 border-green-100',
    red:    'bg-red-50 text-red-600 border-red-100',
    gray:   'bg-gray-50 text-gray-600 border-gray-100',
  }
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`
        flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5
        rounded-xl border transition active:scale-[0.97] disabled:opacity-60
        ${colorMap[color] ?? colorMap.gray}
      `}
    >
      {loading && <Spinner />}
      {label}
    </button>
  )
}
