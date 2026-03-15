/**
 * REGISTRAL — RemitoForm
 * src/modules/remitos/RemitoForm.jsx
 *
 * Formulario de creación de remito.
 * - Búsqueda de cliente (IndexedDB)
 * - Campos extra del preset (con_flete, etc.)
 * - Ítems dinámicos con búsqueda de artículos
 * - Totales en tiempo real
 * - Dos acciones: Guardar borrador / Confirmar
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { useLiveQuery } from 'dexie-react-hooks'
import { toast }       from '../../shared/ui/Toast'
import { usePreset }   from '../../core/engine/PresetContext'
import { useAuth }     from '../../core/auth/useAuth'
import { db }          from '../../core/offline/db'
import { useRemitoActions } from './useRemitos'
import {
  formatARS, formatNumber, uuid4, Spinner, PageHeader,
} from '../../shared/ui/index'

const PAYMENT_METHODS = [
  'Efectivo', 'Transferencia', 'Cheque', 'Tarjeta débito',
  'Tarjeta crédito', 'Cuenta corriente',
]

const EMPTY_ITEM = () => ({
  _key:        uuid4(),
  product_id:  null,
  description: '',
  unit_type:   'unidad',
  quantity:    1,
  unit_price:  0,
  discount_pct:0,
  subtotal:    0,
})

export default function RemitoForm({ onClose }) {
  const { preset }   = usePreset()
  const { tenantId } = useAuth()
  const vocab        = preset?.vocabulary ?? {}
  const transLabel   = vocab.transaction ?? 'Remito'

  const { createRemito, confirmRemito } = useRemitoActions()

  // Header fields
  const [entityId,       setEntityId]       = useState(null)
  const [entityName,     setEntityName]      = useState('')
  const [conFlete,       setConFlete]        = useState(false)
  const [dirEntrega,     setDirEntrega]      = useState('')
  const [chofer,         setChofer]          = useState('')
  const [paymentMethod,  setPaymentMethod]   = useState('')
  const [notes,          setNotes]           = useState('')
  const [discount,       setDiscount]        = useState(0)

  // Ítems
  const [items, setItems] = useState([EMPTY_ITEM()])

  // Submit state
  const [submitting, setSubmitting]   = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Calcular totales en tiempo real
  const subtotal = items.reduce((s, it) => s + Number(it.subtotal || 0), 0)
  const total    = subtotal - Number(discount || 0)

  // ── Acciones de ítems ─────────────────────────────────────

  function addItem()     { setItems(prev => [...prev, EMPTY_ITEM()]) }
  function removeItem(k) { setItems(prev => prev.filter(i => i._key !== k)) }

  const updateItem = useCallback((key, field, value) => {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const updated = { ...it, [field]: value }

      // Recalcular subtotal
      const qty  = Number(field === 'quantity'    ? value : updated.quantity)
      const price= Number(field === 'unit_price'  ? value : updated.unit_price)
      const disc = Number(field === 'discount_pct'? value : updated.discount_pct) / 100
      updated.subtotal = qty * price * (1 - disc)

      return updated
    }))
  }, [])

  function selectProduct(key, product) {
    setItems(prev => prev.map(it => {
      if (it._key !== key) return it
      const qty   = Number(it.quantity) || 1
      const price = Number(product.price) || 0
      return {
        ...it,
        product_id:  product.id,
        description: product.name,
        unit_type:   product.unit_type,
        unit_price:  price,
        subtotal:    qty * price,
      }
    }))
  }

  // ── Validación ────────────────────────────────────────────

  function validate() {
    if (!entityId)                     return 'Seleccioná un cliente.'
    if (items.some(it => !it.description)) return 'Todos los ítems deben tener descripción.'
    if (items.some(it => Number(it.quantity) <= 0)) return 'Todos los ítems deben tener cantidad mayor a 0.'
    return null
  }

  // ── Submit ────────────────────────────────────────────────

  async function handleSave(confirm = false) {
    const err = validate()
    if (err) { setSubmitError(err); return }
    setSubmitError('')
    setSubmitting(true)

    try {
      const remitoData = {
        entity_id:          entityId,
        con_flete:          conFlete,
        direccion_entrega:  dirEntrega,
        chofer,
        payment_method:     paymentMethod,
        notes,
        discount:           Number(discount || 0),
      }

      const cleanItems = items.map(it => ({
        product_id:  it.product_id,
        description: it.description,
        unit_type:   it.unit_type,
        quantity:    Number(it.quantity),
        unit_price:  Number(it.unit_price),
        discount_pct:Number(it.discount_pct || 0),
        subtotal:    Number(it.subtotal || 0),
      }))

      const result = await createRemito(remitoData, cleanItems)

      if (confirm) {
        // Obtener el ID del remito recién creado
        // bulkSave retorna la primera op que es el remito
        const remitoId = result?.[0]?.id ?? null
        if (remitoId) await confirmRemito(remitoId)
        toast.success('Remito creado y confirmado')
      } else {
        toast.success('Borrador guardado')
      }

      onClose()
    } catch (err) {
      setSubmitError(err.message)
      toast.error('Error al guardar remito')
    } finally {
      setSubmitting(false)
    }
  }

  const hasItems = items.length > 0 && items.some(it => it.description)

  return (
    <div className="flex flex-col min-h-full bg-gray-50">
      <PageHeader
        title={`Nuevo ${transLabel.toLowerCase()}`}
        action={
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1">
            Cancelar
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 pb-32 space-y-4">
        {submitError && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}

        {/* ── CLIENTE ── */}
        <Section title={`${vocab.client ?? 'Cliente'} *`}>
          <EntitySearchInput
            tenantId={tenantId}
            value={entityName}
            onSelect={(id, name) => { setEntityId(id); setEntityName(name) }}
            placeholder={`Buscar ${(vocab.client ?? 'cliente').toLowerCase()}...`}
          />
        </Section>

        {/* ── CAMPOS EXTRA PRESET ── */}
        <Section title="Entrega">
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-700">Incluye flete</span>
            <ToggleSwitch checked={conFlete} onChange={setConFlete} />
          </div>
          {conFlete && (
            <div className="space-y-3 mt-2">
              <FieldInput label="Dirección de entrega" value={dirEntrega} onChange={setDirEntrega} placeholder="Dirección donde se entrega" />
              <FieldInput label="Chofer" value={chofer} onChange={setChofer} placeholder="Nombre del chofer" />
            </div>
          )}
        </Section>

        {/* ── ÍTEMS ── */}
        <Section
          title={`${vocab.products ?? 'Artículos'} *`}
          action={
            <button onClick={addItem} className="text-sm font-semibold text-amber-600">
              + Agregar
            </button>
          }
        >
          <div className="space-y-3">
            {items.map((item, idx) => (
              <ItemRow
                key={item._key}
                item={item}
                tenantId={tenantId}
                onUpdate={(field, val) => updateItem(item._key, field, val)}
                onSelectProduct={(p) => selectProduct(item._key, p)}
                onRemove={() => removeItem(item._key)}
                canRemove={items.length > 1}
                index={idx}
              />
            ))}
          </div>
        </Section>

        {/* ── PAGO Y NOTAS ── */}
        <Section title="Pago">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Forma de pago</label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                <option value="">Seleccioná forma de pago</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Descuento general ($)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number" min="0" step="any"
                  value={discount}
                  onChange={e => setDiscount(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2.5 text-sm border border-gray-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
                />
              </div>
            </div>
            <FieldTextarea label="Observaciones" value={notes} onChange={setNotes} placeholder="Notas internas, referencias, etc." />
          </div>
        </Section>

        {/* ── TOTALES ── */}
        <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Subtotal</span><span className="font-medium">{formatARS(subtotal)}</span>
          </div>
          {Number(discount) > 0 && (
            <div className="flex justify-between text-sm text-green-600">
              <span>Descuento</span><span>- {formatARS(discount)}</span>
            </div>
          )}
          <div className="flex justify-between text-base font-bold text-gray-900 border-t border-gray-100 pt-2 mt-2">
            <span>Total</span><span>{formatARS(total)}</span>
          </div>
        </div>
      </div>

      {/* ── CTAs FIJOS ── */}
      <div className="fixed bottom-0 left-0 right-0 md:relative bg-white border-t border-gray-100 px-4 py-4 flex gap-3">
        <button
          onClick={() => handleSave(false)}
          disabled={submitting || !hasItems}
          className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium disabled:opacity-50"
        >
          {submitting ? <span className="flex items-center justify-center gap-2"><Spinner /> Guardando...</span> : 'Guardar borrador'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={submitting || !hasItems || !entityId}
          className="flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? <><Spinner /> Confirmando...</> : `Confirmar ${transLabel.toLowerCase()}`}
        </button>
      </div>
    </div>
  )
}

RemitoForm.propTypes = { onClose: PropTypes.func.isRequired }

// ─────────────────────────────────────────────────────────────
// ItemRow — fila de ítem con búsqueda de producto
// ─────────────────────────────────────────────────────────────

function ItemRow({ item, tenantId, onUpdate, onSelectProduct, onRemove, canRemove, index }) {
  const [productQuery, setProductQuery] = useState(item.description ?? '')
  const [showResults, setShowResults]   = useState(false)
  const [debQ, setDebQ]                 = useState('')
  const debRef = useRef(null)
  const containerRef = useRef(null)

  // Show all products on focus (empty query), filter when typing
  const results = useLiveQuery(
    async () => {
      if (!tenantId) return []
      const all = await db.products.where('tenant_id').equals(tenantId).toArray()
      const active = all.filter(p => p.is_active !== false)
      if (!debQ) return active.slice(0, 10) // Show first 10 on focus
      const q = debQ.toLowerCase()
      return active.filter(p =>
        p.name?.toLowerCase().includes(q) || p.code?.toLowerCase().includes(q)
      ).slice(0, 10)
    },
    [tenantId, debQ],
    []
  )

  function handleQueryChange(e) {
    const val = e.target.value
    setProductQuery(val)
    onUpdate('description', val)
    setShowResults(true)
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setDebQ(val), 200)
  }

  function handleSelect(product) {
    setProductQuery(product.name)
    setShowResults(false)
    onSelectProduct(product)
  }

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowResults(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="bg-gray-50 rounded-2xl p-3 space-y-2">
      {/* Header del ítem */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">Ítem {index + 1}</span>
        {canRemove && (
          <button onClick={onRemove} className="text-xs text-red-400 hover:text-red-600">✕ Quitar</button>
        )}
      </div>

      {/* Búsqueda de artículo */}
      <div className="relative" ref={containerRef}>
        <input
          type="text"
          value={productQuery}
          onChange={handleQueryChange}
          onFocus={() => setShowResults(true)}
          placeholder="Buscar artículo o escribir descripción..."
          autoComplete="off"
          className="w-full px-3 py-2.5 text-sm border border-gray-200 bg-white rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {showResults && results && results.length > 0 && (
          <ul className="absolute left-0 right-0 top-full z-20 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg max-h-40 overflow-y-auto">
            {results.map(p => (
              <li key={p.id}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(p)}
                  className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 text-gray-400 text-xs">{formatARS(p.price)} / {p.unit_type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Cantidad, unidad, precio */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Cantidad</label>
          <input
            type="number" min="0.001" step="any"
            value={item.quantity}
            onChange={e => onUpdate('quantity', e.target.value)}
            className="w-full px-2 py-2 text-sm border border-gray-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Unidad</label>
          <input
            type="text"
            value={item.unit_type}
            onChange={e => onUpdate('unit_type', e.target.value)}
            className="w-full px-2 py-2 text-sm border border-gray-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-0.5">Precio unit.</label>
          <div className="relative">
            <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
            <input
              type="number" min="0" step="any"
              value={item.unit_price}
              onChange={e => onUpdate('unit_price', e.target.value)}
              className="w-full pl-5 pr-1 py-2 text-sm border border-gray-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Descuento + subtotal */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500">Dto %</label>
          <input
            type="number" min="0" max="100" step="0.1"
            value={item.discount_pct}
            onChange={e => onUpdate('discount_pct', e.target.value)}
            className="w-16 px-2 py-1.5 text-xs border border-gray-200 bg-white rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
          />
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-gray-900">{formatARS(item.subtotal)}</p>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Subcomponentes del form
// ─────────────────────────────────────────────────────────────

function Section({ title, children, action }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
        <p className="text-sm font-semibold text-gray-700">{title}</p>
        {action}
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}

function FieldInput({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
    </div>
  )
}

function FieldTextarea({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 block mb-1">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full text-sm border border-gray-200 bg-white rounded-xl px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
      />
    </div>
  )
}

function ToggleSwitch({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${checked ? 'bg-amber-500' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

function EntitySearchInput({ tenantId, value, onSelect, placeholder }) {
  const [query, setQuery]   = useState(value ?? '')
  const [debQ, setDebQ]     = useState('')
  const [open, setOpen]     = useState(false)
  const debRef              = useRef(null)
  const containerRef        = useRef(null)

  // Show all clients on focus (empty query), filter when typing
  const results = useLiveQuery(
    async () => {
      if (!tenantId) return []
      const all = await db.entities
        .where('[tenant_id+entity_type]')
        .equals([tenantId, 'cliente'])
        .filter(e => e.is_active !== false)
        .toArray()

      if (!debQ) return all.slice(0, 20) // Show first 20 on focus
      const q = debQ.toLowerCase()
      return all.filter(e => e.name?.toLowerCase().includes(q)).slice(0, 10)
    },
    [tenantId, debQ],
    []
  )

  function handleChange(e) {
    const val = e.target.value
    setQuery(val)
    setOpen(true)
    if (debRef.current) clearTimeout(debRef.current)
    debRef.current = setTimeout(() => setDebQ(val), 200)
  }

  function handleSelect(entity) {
    setQuery(entity.name)
    setOpen(false)
    onSelect(entity.id, entity.name)
  }

  function handleClear() {
    setQuery('')
    setDebQ('')
    onSelect(null, '')
    setOpen(true)
  }

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 pr-8 focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        {query && (
          <button
            type="button"
            onMouseDown={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
          >✕</button>
        )}
      </div>
      {open && results && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-20 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg max-h-48 overflow-y-auto">
          {results.map(e => (
            <li key={e.id}>
              <button
                type="button"
                onMouseDown={() => handleSelect(e)}
                className="w-full text-left px-3 py-2.5 hover:bg-amber-50 text-sm"
              >
                <span className="font-medium">{e.name}</span>
                {e.data?.telefono && <span className="ml-2 text-xs text-gray-400">{e.data.telefono}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && results && results.length === 0 && query && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg px-3 py-3 text-sm text-gray-400">
          Sin resultados para &ldquo;{query}&rdquo;
        </div>
      )}
    </div>
  )
}
