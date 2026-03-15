/**
 * REGISTRAL — ProductModal
 * src/modules/stock/ProductModal.jsx
 *
 * Modo create: DynamicForm entityType='product' + stock_movement inicial.
 * Modo edit: DynamicForm autoguardado + sección "Ajustar stock".
 */

import { useState } from 'react'
import PropTypes from 'prop-types'
import { toast }        from '../../shared/ui/Toast'
import { usePreset }    from '../../core/engine/PresetContext'
import { useAuth }      from '../../core/auth/useAuth'
import DynamicForm      from '../../shared/forms/DynamicForm'
import { useStockActions, useStockMovements } from './useStock'
import {
  ModalSheet, ConfirmDialog, Spinner,
  formatARS, formatNumber, formatDate, getStockStatus, STOCK_STATUS_CONFIG,
} from '../../shared/ui/index'

const MOVEMENT_TYPES = [
  { value: 'entrada',   label: '➕ Entrada'    },
  { value: 'salida',    label: '➖ Salida'      },
  { value: 'ajuste',    label: '🔧 Ajuste'     },
  { value: 'devolucion',label: '↩️ Devolución' },
]

export default function ProductModal({ product, onClose }) {
  const isEdit = !!product
  const { preset }   = usePreset()
  const { userRole } = useAuth()
  const vocab        = preset?.vocabulary ?? {}

  const { createProduct, adjustStock, deleteProduct } = useStockActions()

  const [submitting,      setSubmitting]      = useState(false)
  const [submitError,     setSubmitError]     = useState('')
  const [showAdjust,      setShowAdjust]      = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [adjustForm,      setAdjustForm]      = useState({ quantity: '', movementType: 'entrada', reason: '' })
  const [adjusting,       setAdjusting]       = useState(false)
  const [adjustError,     setAdjustError]     = useState('')

  // Últimos movimientos (solo en edit)
  const movements = useStockMovements(product?.id, 5)

  const productLabel = vocab.product ?? 'Artículo'
  const canSeeCost   = userRole === 'owner' || userRole === 'admin'
  const stockStatus  = product ? getStockStatus(product.stock_current, product.stock_minimum) : null

  // ── Create ────────────────────────────────────────────────

  async function handleCreate(values) {
    setSubmitting(true)
    setSubmitError('')
    try {
      await createProduct(values)
      toast.success('Artículo creado')
      onClose()
    } catch (err) {
      setSubmitError(err.message)
      toast.error('Error al crear artículo')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Adjust stock ─────────────────────────────────────────

  async function handleAdjust() {
    if (!adjustForm.quantity || isNaN(Number(adjustForm.quantity))) {
      setAdjustError('Ingresá una cantidad válida.')
      return
    }
    setAdjusting(true)
    setAdjustError('')
    try {
      await adjustStock(product.id, Number(adjustForm.quantity), adjustForm.movementType, adjustForm.reason)
      toast.success('Stock actualizado')
      setShowAdjust(false)
      setAdjustForm({ quantity: '', movementType: 'entrada', reason: '' })
    } catch (err) {
      setAdjustError(err.message)
      toast.error('Error al ajustar stock')
    } finally {
      setAdjusting(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────

  async function handleDelete() {
    await deleteProduct(product.id)
    toast.success('Artículo eliminado')
    setShowDeleteConfirm(false)
    onClose()
  }

  return (
    <>
      <ModalSheet
        title={isEdit ? `Editar ${productLabel.toLowerCase()}` : `Nuevo ${productLabel.toLowerCase()}`}
        onClose={onClose}
      >
        {/* ── CREATE MODE ── */}
        {!isEdit && (
          <>
            {submitError && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}
            <DynamicForm
              entityType="product"
              tableName="products"
              mode="create"
              onSubmit={handleCreate}
              onCancel={onClose}
              disabled={submitting}
            />
          </>
        )}

        {/* ── EDIT MODE ── */}
        {isEdit && (
          <div className="space-y-6">
            {/* Stock actual badge */}
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-gray-50">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {formatNumber(product.stock_current)}
                </p>
                <p className="text-xs text-gray-500">{product.unit_type}</p>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`
                    text-xs font-bold px-2 py-0.5 rounded-full
                    ${STOCK_STATUS_CONFIG[stockStatus]?.bg} ${STOCK_STATUS_CONFIG[stockStatus]?.text}
                  `}>
                    {STOCK_STATUS_CONFIG[stockStatus]?.label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Mínimo: {formatNumber(product.stock_minimum)} {product.unit_type}
                </p>
              </div>
              <button
                onClick={() => setShowAdjust(s => !s)}
                className="px-3 py-2 rounded-xl bg-white border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-100"
              >
                Ajustar
              </button>
            </div>

            {/* Sección ajuste de stock */}
            {showAdjust && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">Ajustar stock</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">Tipo</label>
                    <select
                      value={adjustForm.movementType}
                      onChange={e => setAdjustForm(f => ({ ...f, movementType: e.target.value }))}
                      className="w-full text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                      {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 block mb-1">
                      {adjustForm.movementType === 'ajuste' ? 'Nuevo stock total' : 'Cantidad'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={adjustForm.quantity}
                      onChange={e => setAdjustForm(f => ({ ...f, quantity: e.target.value }))}
                      placeholder="0"
                      className="w-full text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Motivo (opcional)</label>
                  <input
                    type="text"
                    value={adjustForm.reason}
                    onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))}
                    placeholder="ej: Corrección de inventario"
                    className="w-full text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>

                {adjustError && <p className="text-xs text-red-600">{adjustError}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={() => setShowAdjust(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
                  >Cancelar</button>
                  <button
                    onClick={handleAdjust}
                    disabled={adjusting}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {adjusting ? <><Spinner /> Guardando...</> : 'Registrar movimiento'}
                  </button>
                </div>
              </div>
            )}

            {/* Formulario de edición (autoguardado) */}
            <DynamicForm
              entityType="product"
              tableName="products"
              initialValues={product}
              mode="edit"
              disabled={false}
            />

            {/* Últimos movimientos */}
            {movements && movements.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Últimos movimientos
                </p>
                <div className="space-y-1">
                  {movements.map(m => (
                    <div key={m.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <span className={`text-xs font-medium ${
                          m.movement_type === 'entrada' || m.movement_type === 'devolucion'
                            ? 'text-green-600' : 'text-red-500'
                        }`}>
                          {m.movement_type.charAt(0).toUpperCase() + m.movement_type.slice(1)}
                        </span>
                        {m.reason && <span className="text-xs text-gray-400 ml-2">{m.reason}</span>}
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {m.movement_type === 'salida' ? '-' : '+'}{formatNumber(m.quantity)}
                        </p>
                        <p className="text-xs text-gray-400">{formatDate(m.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Zona peligrosa */}
            <div className="pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="text-sm text-red-500 hover:text-red-700"
              >
                🗑️ Eliminar artículo
              </button>
            </div>
          </div>
        )}
      </ModalSheet>

      {/* Confirm delete */}
      {showDeleteConfirm && (
        <ConfirmDialog
          title="¿Eliminar artículo?"
          description="El artículo se desactivará. Los remitos existentes no se verán afectados."
          confirmLabel="Eliminar"
          danger
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}

ProductModal.propTypes = {
  product: PropTypes.object,
  onClose: PropTypes.func.isRequired,
}
