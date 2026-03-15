/**
 * REGISTRAL — ClienteModal
 * src/modules/clientes/ClienteModal.jsx
 */

import { useState } from 'react'
import PropTypes from 'prop-types'
import { toast }        from '../../shared/ui/Toast'
import { usePreset }    from '../../core/engine/PresetContext'
import DynamicForm      from '../../shared/forms/DynamicForm'
import { useClienteActions, useClienteBalance } from './useClientes'
import {
  ModalSheet, ConfirmDialog, Spinner,
  formatARS, formatDate,
} from '../../shared/ui/index'

export default function ClienteModal({ cliente, onClose }) {
  const isEdit = !!cliente
  const { preset }    = usePreset()
  const vocab         = preset?.vocabulary ?? {}
  const clienteLabel  = vocab.client ?? 'Cliente'

  const { createCliente, updateCliente, deleteCliente, registrarPago } = useClienteActions()
  const { balance, creditLimit, movements, isOverLimit } = useClienteBalance(cliente?.id)

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [showDelete,  setShowDelete]  = useState(false)
  const [showPago,    setShowPago]    = useState(false)
  const [pagoForm,    setPagoForm]    = useState({ amount: '', notes: '' })
  const [pagando,     setPagando]     = useState(false)
  const [pagoError,   setPagoError]   = useState('')

  async function handleCreate(values) {
    setSubmitting(true)
    setSubmitError('')
    try {
      await createCliente(values)
      toast.success('Cliente creado')
      onClose()
    } catch (err) {
      setSubmitError(err.message)
      toast.error('Error al crear cliente')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    await deleteCliente(cliente.id)
    toast.success('Cliente eliminado')
    setShowDelete(false)
    onClose()
  }

  async function handlePago() {
    const amount = Number(pagoForm.amount)
    if (!amount || amount <= 0) { setPagoError('Ingresá un monto válido.'); return }
    setPagando(true)
    setPagoError('')
    try {
      await registrarPago(cliente.id, amount, pagoForm.notes)
      toast.success('Pago registrado')
      setShowPago(false)
      setPagoForm({ amount: '', notes: '' })
    } catch (err) {
      setPagoError(err.message)
      toast.error('Error al registrar pago')
    } finally {
      setPagando(false)
    }
  }

  return (
    <>
      <ModalSheet
        title={isEdit ? cliente.name : `Nuevo ${clienteLabel.toLowerCase()}`}
        onClose={onClose}
      >
        {/* CREATE */}
        {!isEdit && (
          <>
            {submitError && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}
            <DynamicForm
              entityType="entity"
              tableName="entities"
              mode="create"
              onSubmit={handleCreate}
              onCancel={onClose}
              disabled={submitting}
            />
          </>
        )}

        {/* EDIT */}
        {isEdit && (
          <div className="space-y-6">
            {/* Sección cuenta corriente */}
            <div className={`rounded-2xl p-4 ${isOverLimit ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {vocab.balance ?? 'Cuenta corriente'}
                </p>
                {balance > 0 && (
                  <button
                    onClick={() => setShowPago(s => !s)}
                    className="text-xs font-semibold text-amber-600 bg-amber-100 px-3 py-1 rounded-full"
                  >
                    Registrar pago
                  </button>
                )}
              </div>

              <p className={`text-3xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {formatARS(balance)}
              </p>

              {creditLimit && creditLimit > 0 && (
                <p className={`text-xs mt-1 ${isOverLimit ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                  {isOverLimit ? '⚠️ Límite excedido — ' : ''}
                  Límite de crédito: {formatARS(creditLimit)}
                </p>
              )}

              {/* Form de pago inline */}
              {showPago && (
                <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
                  <p className="text-sm font-semibold text-gray-700">Registrar pago</p>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Monto</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={pagoForm.amount}
                        onChange={e => setPagoForm(f => ({ ...f, amount: e.target.value }))}
                        placeholder="0"
                        className="w-full pl-7 pr-3 py-2.5 text-sm border border-gray-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600 block mb-1">Notas (opcional)</label>
                    <input
                      type="text"
                      value={pagoForm.notes}
                      onChange={e => setPagoForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="ej: Pago parcial en efectivo"
                      className="w-full px-3 py-2.5 text-sm border border-gray-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  {pagoError && <p className="text-xs text-red-600">{pagoError}</p>}
                  <div className="flex gap-2">
                    <button onClick={() => setShowPago(false)}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600">
                      Cancelar
                    </button>
                    <button onClick={handlePago} disabled={pagando}
                      className="flex-1 py-2.5 rounded-xl bg-green-500 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
                      {pagando ? <><Spinner /> Guardando...</> : '✓ Confirmar pago'}
                    </button>
                  </div>
                </div>
              )}

              {/* Últimos movimientos */}
              {movements.length > 0 && !showPago && (
                <div className="mt-3 space-y-1">
                  {movements.slice(0, 5).map(m => (
                    <div key={m.id} className="flex items-center justify-between py-1.5 border-b border-gray-100 last:border-0">
                      <div>
                        <span className={`text-xs font-medium ${
                          m.movement_type === 'pago' || m.movement_type === 'nota_credito'
                            ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {m.movement_type === 'pago' ? 'Pago' :
                           m.movement_type === 'cargo' ? 'Cargo' :
                           m.movement_type === 'nota_credito' ? 'Nota de crédito' : m.movement_type}
                        </span>
                        {m.notes && <span className="text-xs text-gray-400 ml-1.5">{m.notes}</span>}
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-semibold ${Number(m.amount) < 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {Number(m.amount) < 0 ? '-' : '+'}{formatARS(Math.abs(m.amount))}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(m.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form datos del cliente (autoguardado) */}
            <DynamicForm
              entityType="entity"
              tableName="entities"
              initialValues={{ ...cliente, ...cliente?.data }}
              mode="edit"
            />

            {/* Zona peligrosa */}
            <div className="pt-2 border-t border-gray-100">
              <button onClick={() => setShowDelete(true)} className="text-sm text-red-500 hover:text-red-700">
                🗑️ Eliminar cliente
              </button>
            </div>
          </div>
        )}
      </ModalSheet>

      {showDelete && (
        <ConfirmDialog
          title="¿Eliminar cliente?"
          description="El cliente se desactivará. Los remitos y movimientos no se verán afectados."
          confirmLabel="Eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </>
  )
}

ClienteModal.propTypes = {
  cliente: PropTypes.object,
  onClose: PropTypes.func.isRequired,
}
