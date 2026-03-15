/**
 * REGISTRAL — RemitoDetail
 * src/modules/remitos/RemitoDetail.jsx
 *
 * Vista de detalle (read-only) de un remito.
 * Barra de estado visual con los pasos del status_flow.
 * Botones de acción según estado actual.
 */

import { useState } from 'react'
import PropTypes from 'prop-types'
import { usePreset }   from '../../core/engine/PresetContext'
import { useRemito, useRemitoActions } from './useRemitos'
import {
  ConfirmDialog, PageHeader, Spinner,
  StatusBadge, TRANSACTION_STATUS_CONFIG,
  formatARS, formatNumber, formatDate, formatDateTime,
} from '../../shared/ui/index'

const STATUS_FLOW = ['draft', 'confirmed', 'delivered', 'paid']

export default function RemitoDetail({ id, onClose }) {
  const { preset }   = usePreset()
  const vocab        = preset?.vocabulary ?? {}
  const transLabel   = vocab.transaction ?? 'Remito'

  const { remito, items, entity } = useRemito(id)
  const { confirmRemito, deliverRemito, payRemito, cancelRemito } = useRemitoActions()

  const [loading,       setLoading]       = useState(null)
  const [confirmDialog, setConfirmDialog] = useState(null)
  const [showPayModal,  setShowPayModal]  = useState(false)
  const [payForm,       setPayForm]       = useState({ amount: '', method: '' })
  const [payError,      setPayError]      = useState('')

  async function executeAction(type) {
    setLoading(type)
    try {
      if (type === 'confirm') await confirmRemito(id)
      if (type === 'deliver') await deliverRemito(id)
      if (type === 'cancel')  await cancelRemito(id)
      setConfirmDialog(null)
    } catch (err) {
      console.error('[RemitoDetail]', err)
    } finally {
      setLoading(null)
    }
  }

  async function handlePay() {
    const amount = Number(payForm.amount || remito?.total)
    if (!amount || amount <= 0) { setPayError('Ingresá un monto válido.'); return }
    setLoading('pay')
    setPayError('')
    try {
      await payRemito(id, amount, payForm.method || remito?.payment_method)
      setShowPayModal(false)
    } catch (err) {
      setPayError(err.message)
    } finally {
      setLoading(null)
    }
  }

  if (!remito) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gray-100 animate-pulse" />
          <p className="text-sm text-gray-400">Cargando {transLabel.toLowerCase()}...</p>
        </div>
      </div>
    )
  }

  const currentStepIdx = STATUS_FLOW.indexOf(remito.status)
  const isCancelled    = remito.status === 'cancelled'

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <PageHeader
        title={`${transLabel} ${remito.number}`}
        action={
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1">
            ← Volver
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 pb-24 space-y-4">

        {/* ── BARRA DE ESTADO VISUAL ── */}
        {!isCancelled && (
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
            <div className="flex items-center">
              {STATUS_FLOW.map((s, i) => {
                const cfg       = TRANSACTION_STATUS_CONFIG[s]
                const isActive  = i === currentStepIdx
                const isPast    = i < currentStepIdx
                const isLast    = i === STATUS_FLOW.length - 1

                return (
                  <div key={s} className="flex items-center flex-1">
                    <div className="flex flex-col items-center">
                      <div className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition
                        ${isPast  ? 'bg-amber-500 text-white'  : ''}
                        ${isActive ? 'bg-amber-500 text-white ring-4 ring-amber-100' : ''}
                        ${!isPast && !isActive ? 'bg-gray-100 text-gray-400' : ''}
                      `}>
                        {isPast ? '✓' : i + 1}
                      </div>
                      <span className={`
                        mt-1 text-[10px] font-medium text-center leading-tight
                        ${isActive ? 'text-amber-600' : isPast ? 'text-gray-500' : 'text-gray-300'}
                      `}>
                        {cfg?.label}
                      </span>
                    </div>
                    {!isLast && (
                      <div className={`flex-1 h-0.5 mx-1 mb-4 transition ${i < currentStepIdx ? 'bg-amber-400' : 'bg-gray-100'}`} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 flex items-center gap-2">
            <span>🚫</span>
            <p className="text-sm text-red-700 font-medium">Este remito fue anulado</p>
          </div>
        )}

        {/* ── DATOS PRINCIPALES ── */}
        <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
          <Row label="Cliente"   value={entity?.name ?? '—'} />
          <Row label="Fecha"     value={formatDate(remito.created_at)} />
          {remito.confirmed_at && <Row label="Confirmado" value={formatDateTime(remito.confirmed_at)} />}
          {remito.delivered_at && <Row label="Entregado"  value={formatDateTime(remito.delivered_at)} />}
          {remito.paid_at      && <Row label="Cobrado"    value={formatDateTime(remito.paid_at)} />}
          {remito.payment_method && <Row label="Forma de pago" value={remito.payment_method} />}
          {remito.data?.con_flete && (
            <>
              <Row label="Flete" value="Sí" />
              {remito.data?.direccion_entrega && <Row label="Dirección de entrega" value={remito.data.direccion_entrega} />}
              {remito.data?.chofer && <Row label="Chofer" value={remito.data.chofer} />}
            </>
          )}
          {remito.notes && <Row label="Notas" value={remito.notes} />}
        </div>

        {/* ── ÍTEMS ── */}
        {items && items.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-semibold text-gray-700">
                {vocab.products ?? 'Artículos'}
              </p>
            </div>
            <div className="divide-y divide-gray-50">
              {items.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{item.description}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {formatNumber(item.quantity)} {item.unit_type} × {formatARS(item.unit_price)}
                        {item.discount_pct > 0 && ` · ${item.discount_pct}% dto`}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 flex-shrink-0">
                      {formatARS(item.subtotal)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Totales */}
            <div className="px-4 py-3 border-t border-gray-100 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span><span>{formatARS(remito.subtotal)}</span>
              </div>
              {remito.discount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Descuento</span><span>- {formatARS(remito.discount)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-2">
                <span>Total</span><span>{formatARS(remito.total)}</span>
              </div>
              {remito.paid_amount > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Cobrado</span><span>{formatARS(remito.paid_amount)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ZONA PELIGROSA (si no está cobrado ni cancelado) ── */}
        {!isCancelled && remito.status !== 'paid' && (
          <div className="pt-2">
            <button
              onClick={() => setConfirmDialog({ type: 'cancel', label: 'anular este remito' })}
              className="text-sm text-red-500 hover:text-red-700"
            >
              🚫 Anular remito
            </button>
          </div>
        )}
      </div>

      {/* ── ACCIONES FIJAS ── */}
      {!isCancelled && (
        <div className="fixed bottom-0 left-0 right-0 md:relative bg-white border-t border-gray-100 px-4 py-4">
          {remito.status === 'draft' && (
            <button
              onClick={() => setConfirmDialog({ type: 'confirm', label: 'confirmar este remito' })}
              disabled={!!loading}
              className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading === 'confirm' ? <><Spinner /> Confirmando...</> : '✓ Confirmar remito'}
            </button>
          )}
          {remito.status === 'confirmed' && (
            <button
              onClick={() => executeAction('deliver')}
              disabled={!!loading}
              className="w-full py-3.5 rounded-xl bg-indigo-500 text-white font-bold text-sm disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading === 'deliver' ? <><Spinner /> Procesando...</> : '🚛 Marcar como entregado'}
            </button>
          )}
          {remito.status === 'delivered' && (
            <button
              onClick={() => setShowPayModal(true)}
              disabled={!!loading}
              className="w-full py-3.5 rounded-xl bg-green-500 text-white font-bold text-sm disabled:opacity-60"
            >
              💰 Registrar cobro — {formatARS(remito.total)}
            </button>
          )}
        </div>
      )}

      {/* ── Modal de cobro ── */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPayModal(false)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-sm px-5 pt-6 pb-8 shadow-2xl space-y-4">
            <div className="flex justify-center pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-200 rounded-full" />
            </div>
            <h3 className="text-base font-bold text-gray-900">Registrar cobro</h3>

            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Monto cobrado</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                <input
                  type="number" min="0" step="any"
                  value={payForm.amount || remito.total}
                  onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  className="w-full pl-7 pr-3 py-3 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>

            {remito.payment_method !== 'Cuenta corriente' && (
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Forma de pago</label>
                <select
                  value={payForm.method || remito.payment_method || ''}
                  onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-3 focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  {['Efectivo','Transferencia','Cheque','Tarjeta débito','Tarjeta crédito'].map(m =>
                    <option key={m} value={m}>{m}</option>
                  )}
                </select>
              </div>
            )}

            {payError && <p className="text-xs text-red-600">{payError}</p>}

            <div className="flex gap-3">
              <button onClick={() => setShowPayModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm">
                Cancelar
              </button>
              <button onClick={handlePay} disabled={!!loading}
                className="flex-1 py-3 rounded-xl bg-green-500 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                {loading === 'pay' ? <><Spinner /> Procesando...</> : 'Confirmar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm dialog ── */}
      {confirmDialog && (
        <ConfirmDialog
          title="¿Estás seguro?"
          description={`Vas a ${confirmDialog.label}. Esta acción no se puede deshacer.`}
          confirmLabel={confirmDialog.type === 'cancel' ? 'Anular' : 'Confirmar'}
          danger={confirmDialog.type === 'cancel'}
          onConfirm={() => executeAction(confirmDialog.type)}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </div>
  )
}

RemitoDetail.propTypes = {
  id:      PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 gap-3">
      <span className="text-sm text-gray-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 text-right">{value}</span>
    </div>
  )
}
