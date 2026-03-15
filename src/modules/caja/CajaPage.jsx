/**
 * REGISTRAL — CajaPage
 * src/modules/caja/CajaPage.jsx
 *
 * Gestión de caja diaria: apertura/cierre de sesión, registro de
 * ingresos y egresos, historial de sesiones anteriores.
 */

import { useState, useMemo } from 'react'
import { useDocumentTitle } from '../../shared/ui/useDocumentTitle'
import { toast } from '../../shared/ui/Toast'
import {
  useCurrentSession,
  useCajaMovements,
  useCajaHistory,
  useCajaActions,
} from './useCaja'
import {
  PageHeader,
  PrimaryButton,
  ModalSheet,
  ConfirmDialog,
  EmptyState,
  formatARS,
  formatDateTime,
  formatDate,
} from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Venta',
  'Cobro cuenta corriente',
  'Pago proveedor',
  'Gastos varios',
  'Retiro',
  'Ajuste',
]

const PAYMENT_METHODS = [
  { value: 'efectivo',       label: 'Efectivo' },
  { value: 'transferencia',  label: 'Transferencia' },
  { value: 'tarjeta_debito', label: 'Tarjeta de débito' },
  { value: 'tarjeta_credito',label: 'Tarjeta de crédito' },
  { value: 'cheque',         label: 'Cheque' },
  { value: 'otro',           label: 'Otro' },
]

// ─────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────

export default function CajaPage() {
  useDocumentTitle('Caja')
  const session    = useCurrentSession()
  const movements  = useCajaMovements(session?.id)
  const history    = useCajaHistory()
  const actions    = useCajaActions()

  const [showOpenModal, setShowOpenModal]   = useState(false)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const [showMovModal, setShowMovModal]     = useState(false)
  const [typeFilter, setTypeFilter]         = useState('') // '' | 'ingreso' | 'egreso'
  const [expandedHistory, setExpandedHistory] = useState(null)

  const isLoading = session === undefined

  // Filtrar movimientos
  const filteredMovements = useMemo(() => {
    if (!movements) return []
    if (!typeFilter) return movements
    return movements.filter(m => m.movement_type === typeFilter)
  }, [movements, typeFilter])

  // Duración de la sesión
  const sessionDuration = useMemo(() => {
    if (!session?.opened_at) return null
    const start = new Date(session.opened_at)
    const now = new Date()
    const diffMs = now - start
    const hours = Math.floor(diffMs / 3_600_000)
    const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }, [session?.opened_at])

  // Subtitle
  const subtitle = isLoading
    ? 'Cargando...'
    : session
      ? `Sesion abierta desde ${formatDateTime(session.opened_at)}`
      : 'Sin sesion abierta'

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Caja"
        subtitle={subtitle}
        action={
          session ? (
            <PrimaryButton onClick={() => setShowMovModal(true)}>
              + Movimiento
            </PrimaryButton>
          ) : null
        }
      />

      <div className="flex-1 px-4 pb-6 space-y-4">
        {isLoading ? (
          <PageSkeleton />
        ) : !session ? (
          /* ── Caja cerrada ── */
          <ClosedSessionCard onOpen={() => setShowOpenModal(true)} />
        ) : (
          <>
            {/* ── Resumen de sesión ── */}
            <SessionSummaryCard
              session={session}
              duration={sessionDuration}
              movementCount={movements?.length ?? 0}
              onClose={() => setShowCloseModal(true)}
            />

            {/* ── Filtros de movimientos ── */}
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {[
                { value: '',        label: 'Todos' },
                { value: 'ingreso', label: 'Ingresos' },
                { value: 'egreso',  label: 'Egresos' },
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={`
                    flex-shrink-0 text-sm px-3 py-2 rounded-xl border transition
                    ${typeFilter === f.value
                      ? 'bg-amber-50 border-amber-300 text-amber-700 font-semibold'
                      : 'bg-white border-gray-200 text-gray-600'
                    }
                  `}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* ── Lista de movimientos ── */}
            {filteredMovements.length === 0 ? (
              <EmptyState
                icon="💰"
                title="Sin movimientos"
                description={typeFilter
                  ? `No hay ${typeFilter === 'ingreso' ? 'ingresos' : 'egresos'} en esta sesion.`
                  : 'Registra el primer movimiento de la sesion.'
                }
                action={
                  !typeFilter && (
                    <PrimaryButton onClick={() => setShowMovModal(true)}>
                      + Movimiento
                    </PrimaryButton>
                  )
                }
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">Hora</th>
                        <th className="text-left px-4 py-3 font-medium">Tipo</th>
                        <th className="text-left px-4 py-3 font-medium">Categoria</th>
                        <th className="text-left px-4 py-3 font-medium">Descripcion</th>
                        <th className="text-left px-4 py-3 font-medium">Medio de pago</th>
                        <th className="text-right px-4 py-3 font-medium">Monto</th>
                        <th className="text-right px-4 py-3 font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMovements.map((m, i) => (
                        <tr
                          key={m.id}
                          className={`
                            ${i < filteredMovements.length - 1 ? 'border-b border-gray-50' : ''}
                          `}
                        >
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {formatDateTime(m.created_at)}
                          </td>
                          <td className="px-4 py-3">
                            <MovementTypeBadge type={m.movement_type} />
                          </td>
                          <td className="px-4 py-3 text-gray-600">{m.category ?? '—'}</td>
                          <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate">
                            {m.description || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {PAYMENT_METHODS.find(p => p.value === m.payment_method)?.label ?? m.payment_method}
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold ${
                            m.movement_type === 'ingreso' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {m.movement_type === 'ingreso' ? '+' : '-'}{formatARS(m.amount)}
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">
                            {formatARS(m.balance_after)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {filteredMovements.map(m => (
                    <div
                      key={m.id}
                      className="bg-white rounded-2xl border border-gray-100 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <MovementTypeBadge type={m.movement_type} />
                            <span className="text-xs text-gray-400">
                              {formatDateTime(m.created_at)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1 truncate">
                            {m.category ?? ''}{m.description ? ` — ${m.description}` : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-bold ${
                            m.movement_type === 'ingreso' ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {m.movement_type === 'ingreso' ? '+' : '-'}{formatARS(m.amount)}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Saldo: {formatARS(m.balance_after)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Historial de sesiones ── */}
        {history && history.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Sesiones anteriores
            </h2>
            <div className="space-y-2">
              {history.map(s => (
                <HistoryCard
                  key={s.id}
                  session={s}
                  isExpanded={expandedHistory === s.id}
                  onToggle={() => setExpandedHistory(
                    expandedHistory === s.id ? null : s.id
                  )}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showOpenModal && (
        <OpenSessionModal
          onClose={() => setShowOpenModal(false)}
          onOpen={async (balance) => {
            await actions.openSession(balance)
            setShowOpenModal(false)
            toast.success('Caja abierta')
          }}
        />
      )}

      {showCloseModal && session && (
        <CloseSessionModal
          session={session}
          onClose={() => setShowCloseModal(false)}
          onConfirm={async (actualBalance, notes) => {
            await actions.closeSession(session.id, actualBalance, notes)
            setShowCloseModal(false)
            toast.success('Caja cerrada')
          }}
        />
      )}

      {showMovModal && session && (
        <MovimientoModal
          onClose={() => setShowMovModal(false)}
          onSave={async (data) => {
            await actions.addMovement(session.id, data)
            setShowMovModal(false)
            toast.success(data.movement_type === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function MovementTypeBadge({ type }) {
  const isIngreso = type === 'ingreso'
  return (
    <span className={`
      inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold
      ${isIngreso ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}
    `}>
      {isIngreso ? 'Ingreso' : 'Egreso'}
    </span>
  )
}

function ClosedSessionCard({ onOpen }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
        <span className="text-3xl">🔒</span>
      </div>
      <h2 className="text-lg font-bold text-gray-900">Caja cerrada</h2>
      <p className="text-sm text-gray-500 mt-1 mb-5">
        Abri la caja para comenzar a registrar movimientos del dia.
      </p>
      <PrimaryButton onClick={onOpen} className="mx-auto">
        Abrir caja
      </PrimaryButton>
    </div>
  )
}

function SessionSummaryCard({ session, duration, movementCount, onClose }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      {/* Header con estado */}
      <div className="bg-green-50 border-b border-green-100 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-semibold text-green-700">Caja abierta</span>
        </div>
        {duration && (
          <span className="text-xs text-green-600 font-medium">{duration}</span>
        )}
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
        <MetricCell
          label="Saldo actual"
          value={formatARS(session.current_balance)}
          highlight
        />
        <MetricCell
          label="Apertura"
          value={formatARS(session.opening_balance)}
        />
        <MetricCell
          label="Ingresos"
          value={formatARS(session.total_ingresos || 0)}
          color="text-green-600"
        />
        <MetricCell
          label="Egresos"
          value={formatARS(session.total_egresos || 0)}
          color="text-red-600"
        />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 flex items-center justify-between border-t border-gray-100">
        <div className="text-xs text-gray-400">
          Abierta por {session.opened_by_name ?? 'Usuario'} ·{' '}
          {movementCount} movimiento{movementCount !== 1 ? 's' : ''}
        </div>
        <button
          onClick={onClose}
          className="text-sm font-semibold text-red-600 hover:text-red-700 transition px-3 py-1.5 rounded-lg hover:bg-red-50"
        >
          Cerrar caja
        </button>
      </div>
    </div>
  )
}

function MetricCell({ label, value, color = 'text-gray-900', highlight = false }) {
  return (
    <div className={`px-4 py-3 ${highlight ? 'bg-amber-50' : 'bg-white'}`}>
      <p className="text-xs text-gray-400 font-medium">{label}</p>
      <p className={`text-lg font-bold ${highlight ? 'text-amber-600' : color} mt-0.5`}>
        {value}
      </p>
    </div>
  )
}

function HistoryCard({ session, isExpanded, onToggle }) {
  const diff = session.difference ?? 0
  const diffLabel = diff > 0 ? 'Sobrante' : diff < 0 ? 'Faltante' : 'Sin diferencia'
  const diffColor = diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-gray-500'

  return (
    <button
      onClick={onToggle}
      className="w-full text-left bg-white rounded-2xl border border-gray-100 px-4 py-3 transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm">
            {formatDate(session.opened_at)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">
            {formatDateTime(session.opened_at)} — {formatDateTime(session.closed_at)}
            {session.opened_by_name ? ` · ${session.opened_by_name}` : ''}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-sm font-bold text-gray-900">
            {formatARS(session.closing_balance)}
          </p>
          <p className={`text-xs font-medium ${diffColor}`}>
            {diffLabel}{diff !== 0 ? `: ${formatARS(Math.abs(diff))}` : ''}
          </p>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-gray-400">Apertura</span>
            <p className="font-semibold text-gray-700">{formatARS(session.opening_balance)}</p>
          </div>
          <div>
            <span className="text-gray-400">Ingresos</span>
            <p className="font-semibold text-green-600">{formatARS(session.total_ingresos || 0)}</p>
          </div>
          <div>
            <span className="text-gray-400">Egresos</span>
            <p className="font-semibold text-red-600">{formatARS(session.total_egresos || 0)}</p>
          </div>
          <div>
            <span className="text-gray-400">Contado</span>
            <p className="font-semibold text-gray-700">{formatARS(session.actual_balance)}</p>
          </div>
          {session.closing_notes && (
            <div className="col-span-2 sm:col-span-4">
              <span className="text-gray-400">Notas</span>
              <p className="text-gray-600 mt-0.5">{session.closing_notes}</p>
            </div>
          )}
        </div>
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────

function OpenSessionModal({ onClose, onOpen }) {
  const [balance, setBalance] = useState('')
  const [saving, setSaving]   = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await onOpen(Number(balance) || 0)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalSheet
      title="Abrir caja"
      onClose={onClose}
      footer={
        <PrimaryButton
          onClick={handleSubmit}
          loading={saving}
          disabled={saving}
          className="w-full justify-center"
        >
          Abrir caja
        </PrimaryButton>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Saldo de apertura
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
            <input
              type="number"
              value={balance}
              onChange={e => setBalance(e.target.value)}
              placeholder="0"
              min="0"
              step="0.01"
              autoFocus
              className="
                w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200
                bg-white text-lg font-semibold text-gray-900 placeholder-gray-300
                focus:outline-none focus:ring-2 focus:ring-amber-400
              "
            />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Monto en efectivo con el que se inicia la caja.
          </p>
        </div>
      </form>
    </ModalSheet>
  )
}

function CloseSessionModal({ session, onClose, onConfirm }) {
  const [actualBalance, setActualBalance] = useState('')
  const [notes, setNotes]                 = useState('')
  const [saving, setSaving]               = useState(false)
  const [showConfirm, setShowConfirm]     = useState(false)

  const expectedBalance = session.current_balance
  const actual = Number(actualBalance) || 0
  const difference = actualBalance !== '' ? actual - expectedBalance : null
  const diffLabel = difference !== null
    ? difference > 0
      ? 'Sobrante'
      : difference < 0
        ? 'Faltante'
        : 'Sin diferencia'
    : null

  const handleSubmit = (e) => {
    e.preventDefault()
    setShowConfirm(true)
  }

  const handleConfirm = async () => {
    setShowConfirm(false)
    setSaving(true)
    try {
      await onConfirm(actual, notes)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <ModalSheet
        title="Cerrar caja"
        onClose={onClose}
        footer={
          <PrimaryButton
            onClick={handleSubmit}
            loading={saving}
            disabled={saving || actualBalance === ''}
            className="w-full justify-center bg-red-500 hover:bg-red-600"
          >
            Cerrar caja
          </PrimaryButton>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Resumen */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Saldo de apertura</span>
              <span className="font-medium text-gray-900">{formatARS(session.opening_balance)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total ingresos</span>
              <span className="font-medium text-green-600">+{formatARS(session.total_ingresos || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total egresos</span>
              <span className="font-medium text-red-600">-{formatARS(session.total_egresos || 0)}</span>
            </div>
            <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
              <span className="font-semibold text-gray-700">Saldo esperado</span>
              <span className="font-bold text-gray-900">{formatARS(expectedBalance)}</span>
            </div>
          </div>

          {/* Saldo contado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Saldo contado (efectivo real)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
              <input
                type="number"
                value={actualBalance}
                onChange={e => setActualBalance(e.target.value)}
                placeholder="0"
                min="0"
                step="0.01"
                autoFocus
                className="
                  w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200
                  bg-white text-lg font-semibold text-gray-900 placeholder-gray-300
                  focus:outline-none focus:ring-2 focus:ring-amber-400
                "
              />
            </div>
          </div>

          {/* Diferencia */}
          {difference !== null && (
            <div className={`
              rounded-xl p-3 text-center
              ${difference > 0 ? 'bg-green-50 border border-green-200' :
                difference < 0 ? 'bg-red-50 border border-red-200' :
                'bg-gray-50 border border-gray-200'}
            `}>
              <p className={`text-sm font-medium ${
                difference > 0 ? 'text-green-700' :
                difference < 0 ? 'text-red-700' :
                'text-gray-600'
              }`}>
                {diffLabel}: {difference !== 0 ? formatARS(Math.abs(difference)) : ''}
              </p>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas de cierre (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Observaciones del cierre..."
              className="
                w-full px-4 py-2.5 rounded-xl border border-gray-200
                bg-white text-sm text-gray-900 placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none
              "
            />
          </div>
        </form>
      </ModalSheet>

      {showConfirm && (
        <ConfirmDialog
          title="Confirmar cierre de caja"
          description={`Se cerrara la caja con un saldo contado de ${formatARS(actual)}.${
            difference !== null && difference !== 0
              ? ` ${diffLabel}: ${formatARS(Math.abs(difference))}.`
              : ''
          } Esta accion no se puede deshacer.`}
          confirmLabel="Cerrar caja"
          danger
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

function MovimientoModal({ onClose, onSave }) {
  const [type, setType]               = useState('ingreso')
  const [amount, setAmount]           = useState('')
  const [category, setCategory]       = useState('')
  const [description, setDescription] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('efectivo')
  const [saving, setSaving]           = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!amount || Number(amount) <= 0) return
    setSaving(true)
    try {
      await onSave({
        movement_type:  type,
        amount:         Number(amount),
        category,
        description,
        payment_method: paymentMethod,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalSheet
      title="Nuevo movimiento"
      onClose={onClose}
      footer={
        <PrimaryButton
          onClick={handleSubmit}
          loading={saving}
          disabled={saving || !amount || Number(amount) <= 0}
          className="w-full justify-center"
        >
          Registrar {type === 'ingreso' ? 'ingreso' : 'egreso'}
        </PrimaryButton>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tipo toggle */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType('ingreso')}
              className={`
                py-2.5 rounded-xl text-sm font-semibold border transition
                ${type === 'ingreso'
                  ? 'bg-green-50 border-green-300 text-green-700'
                  : 'bg-white border-gray-200 text-gray-600'
                }
              `}
            >
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => setType('egreso')}
              className={`
                py-2.5 rounded-xl text-sm font-semibold border transition
                ${type === 'egreso'
                  ? 'bg-red-50 border-red-300 text-red-700'
                  : 'bg-white border-gray-200 text-gray-600'
                }
              `}
            >
              Egreso
            </button>
          </div>
        </div>

        {/* Monto */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="0"
              min="0.01"
              step="0.01"
              autoFocus
              className="
                w-full pl-8 pr-4 py-3 rounded-xl border border-gray-200
                bg-white text-lg font-semibold text-gray-900 placeholder-gray-300
                focus:outline-none focus:ring-2 focus:ring-amber-400
              "
            />
          </div>
        </div>

        {/* Categoría */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="
              w-full px-4 py-2.5 rounded-xl border border-gray-200
              bg-white text-sm text-gray-900
              focus:outline-none focus:ring-2 focus:ring-amber-400
            "
          >
            <option value="">Sin categoria</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Medio de pago */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Medio de pago</label>
          <select
            value={paymentMethod}
            onChange={e => setPaymentMethod(e.target.value)}
            className="
              w-full px-4 py-2.5 rounded-xl border border-gray-200
              bg-white text-sm text-gray-900
              focus:outline-none focus:ring-2 focus:ring-amber-400
            "
          >
            {PAYMENT_METHODS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Descripción */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Descripcion (opcional)
          </label>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detalle del movimiento..."
            className="
              w-full px-4 py-2.5 rounded-xl border border-gray-200
              bg-white text-sm text-gray-900 placeholder-gray-400
              focus:outline-none focus:ring-2 focus:ring-amber-400
            "
          />
        </div>
      </form>
    </ModalSheet>
  )
}

// ─────────────────────────────────────────────────────────────
// SKELETONS
// ─────────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-4 mt-2">
      {/* Session card skeleton */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="h-12 bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-gray-100">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white px-4 py-3">
              <div className="h-3 w-16 bg-gray-100 rounded animate-pulse" />
              <div className="h-6 w-24 bg-gray-100 rounded animate-pulse mt-2" />
            </div>
          ))}
        </div>
        <div className="h-12 bg-gray-50 animate-pulse" />
      </div>
      {/* Movement rows */}
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />
      ))}
    </div>
  )
}
