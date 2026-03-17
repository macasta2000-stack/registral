/**
 * REGISTRAL — CsvImportModal
 * src/modules/stock/CsvImportModal.jsx
 *
 * Modal para importar productos masivamente desde un archivo CSV.
 * Parseo manual (sin librerías externas).
 * Soporta delimitador coma y punto y coma, UTF-8 con BOM.
 */

import { useState, useRef } from 'react'
import PropTypes from 'prop-types'
import { toast } from '../../shared/ui/Toast'
import { useAuth } from '../../core/auth/useAuth'
import { uuid4, formatARS, formatNumber } from '../../shared/ui/index'
import { db } from '../../core/offline/db'
import { APPLY_ORDER } from '../../core/offline/db'

// ─────────────────────────────────────────────────────────────
// COLUMN MAPPINGS (case-insensitive)
// ─────────────────────────────────────────────────────────────

const NAME_ALIASES    = ['nombre', 'name', 'descripcion', 'description', 'producto', 'articulo']
const PRICE_ALIASES   = ['precio', 'price', 'precio_venta', 'precio venta', 'preciov']
const STOCK_ALIASES   = ['stock', 'cantidad', 'quantity', 'stock_current', 'existencia']
const UNIT_ALIASES    = ['unidad', 'unit', 'unit_type', 'tipo_unidad']
const CODE_ALIASES    = ['codigo', 'sku', 'code', 'cod', 'código']
const COST_ALIASES    = ['costo', 'cost', 'precio_costo', 'precio costo', 'costo_unitario']
const CATEGORY_ALIASES = ['categoria', 'category', 'categoría', 'rubro']
const STOCK_MIN_ALIASES = ['stock_minimo', 'stock_min', 'minimo', 'mínimo', 'stock_minimum']

function matchColumn(header, aliases) {
  const h = header.toLowerCase().trim()
  return aliases.includes(h)
}

// ─────────────────────────────────────────────────────────────
// CSV PARSER
// ─────────────────────────────────────────────────────────────

function detectDelimiter(firstLine) {
  const semicolons = (firstLine.match(/;/g) || []).length
  const commas = (firstLine.match(/,/g) || []).length
  return semicolons > commas ? ';' : ','
}

function parseCsvLine(line, delimiter) {
  const fields = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++ // skip escaped quote
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === delimiter) {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

function parseCsv(text) {
  // Remove BOM if present
  let clean = text
  if (clean.charCodeAt(0) === 0xFEFF) {
    clean = clean.slice(1)
  }

  // Normalize line endings
  clean = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const lines = clean.split('\n').filter(l => l.trim() !== '')
  if (lines.length < 2) {
    return { error: 'El archivo necesita al menos una fila de encabezados y una de datos.' }
  }

  const delimiter = detectDelimiter(lines[0])
  const headers = parseCsvLine(lines[0], delimiter)

  // Map columns
  const colMap = {}
  headers.forEach((h, i) => {
    if (matchColumn(h, NAME_ALIASES))      colMap.name = i
    if (matchColumn(h, PRICE_ALIASES))     colMap.price = i
    if (matchColumn(h, STOCK_ALIASES))     colMap.stock = i
    if (matchColumn(h, UNIT_ALIASES))      colMap.unit = i
    if (matchColumn(h, CODE_ALIASES))      colMap.code = i
    if (matchColumn(h, COST_ALIASES))      colMap.cost = i
    if (matchColumn(h, CATEGORY_ALIASES))  colMap.category = i
    if (matchColumn(h, STOCK_MIN_ALIASES)) colMap.stock_min = i
  })

  if (colMap.name === undefined) {
    return {
      error: `No se encontró la columna de nombre. Usá alguno de estos encabezados: ${NAME_ALIASES.join(', ')}`,
    }
  }

  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i], delimiter)
    const rowNum = i + 1

    const name = fields[colMap.name]?.trim()
    if (!name) {
      // Skip empty rows silently
      continue
    }

    const price     = colMap.price !== undefined    ? parseFloat(fields[colMap.price])    : 0
    const stock     = colMap.stock !== undefined     ? parseFloat(fields[colMap.stock])    : 0
    const cost      = colMap.cost !== undefined      ? parseFloat(fields[colMap.cost])     : 0
    const stockMin  = colMap.stock_min !== undefined ? parseFloat(fields[colMap.stock_min]): 0
    const unit      = colMap.unit !== undefined      ? (fields[colMap.unit]?.trim() || 'unidad') : 'unidad'
    const code      = colMap.code !== undefined      ? (fields[colMap.code]?.trim() || null) : null
    const category  = colMap.category !== undefined  ? (fields[colMap.category]?.trim() || null) : null

    if (isNaN(price) && colMap.price !== undefined) {
      errors.push({ row: rowNum, name, error: 'Precio no es un número válido' })
      continue
    }
    if (isNaN(stock) && colMap.stock !== undefined) {
      errors.push({ row: rowNum, name, error: 'Stock no es un número válido' })
      continue
    }

    rows.push({
      name,
      price:     isNaN(price) ? 0 : price,
      stock:     isNaN(stock) ? 0 : stock,
      cost:      isNaN(cost) ? 0 : cost,
      stock_min: isNaN(stockMin) ? 0 : stockMin,
      unit,
      code,
      category,
    })
  }

  return { rows, errors, colMap, headers }
}

// ─────────────────────────────────────────────────────────────
// CSV TEMPLATE
// ─────────────────────────────────────────────────────────────

function downloadTemplate() {
  const header = 'nombre;codigo;precio;costo;stock;stock_minimo;unidad;categoria'
  const example1 = 'Cemento Portland;CEM-001;8500;6200;50;10;bolsa;Materiales'
  const example2 = 'Arena gruesa;ARE-001;3200;2100;100;20;m3;Materiales'
  const example3 = 'Hierro 8mm;HIE-008;12000;9500;200;30;barra;Hierros'
  const csv = [header, example1, example2, example3].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'plantilla_productos.csv'
  a.click()
  URL.revokeObjectURL(url)
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function CsvImportModal({ onClose }) {
  const { tenantId, user } = useAuth()
  const fileRef = useRef(null)

  const [step, setStep]         = useState('select')  // select | preview | importing | done
  const [parsed, setParsed]     = useState(null)
  const [parseError, setParseError] = useState('')
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState(null)

  // ── File selection ──────────────────────────────────────

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setParseError('')
    setParsed(null)

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const result = parseCsv(text)
      if (result.error) {
        setParseError(result.error)
        return
      }
      setParsed(result)
      setStep('preview')
    }
    reader.onerror = () => setParseError('Error al leer el archivo.')
    reader.readAsText(file, 'UTF-8')
  }

  // ── Import ──────────────────────────────────────────────

  async function handleImport() {
    if (!parsed?.rows?.length) return
    setStep('importing')
    setImportProgress(0)

    const now = new Date().toISOString()
    const products = []
    const movements = []
    const pendingOps = []

    for (const row of parsed.rows) {
      const productId = uuid4()
      const product = {
        id:            productId,
        tenant_id:     tenantId,
        code:          row.code,
        name:          row.name,
        description:   null,
        category:      row.category,
        unit_type:     row.unit,
        price:         row.price,
        price_bulk:    null,
        bulk_threshold:null,
        cost:          row.cost || null,
        stock_current: row.stock,
        stock_minimum: row.stock_min,
        stock_location:null,
        supplier:      null,
        data:          {},
        is_active:     true,
        created_at:    now,
        updated_at:    now,
        _sync_status:  'pending',
      }
      products.push(product)

      // Pending op for product
      pendingOps.push({
        id:          uuid4(),
        table_name:  'products',
        operation:   'INSERT',
        record_id:   productId,
        payload:     product,
        apply_order: APPLY_ORDER.products,
        created_at:  now,
        status:      'pending',
        retry_count: 0,
      })

      // Stock movement if > 0
      if (row.stock > 0) {
        const movId = uuid4()
        const movement = {
          id:            movId,
          tenant_id:     tenantId,
          product_id:    productId,
          movement_type: 'entrada',
          quantity:      row.stock,
          stock_before:  0,
          stock_after:   row.stock,
          transaction_id:null,
          reason:        'Importación CSV',
          created_by:    user?.id ?? null,
          created_at:    now,
          _client_id:    uuid4(),
          _sync_status:  'pending',
        }
        movements.push(movement)

        pendingOps.push({
          id:          uuid4(),
          table_name:  'stock_movements',
          operation:   'INSERT',
          record_id:   movId,
          payload:     movement,
          apply_order: APPLY_ORDER.stock_movements,
          created_at:  now,
          status:      'pending',
          retry_count: 0,
        })
      }
    }

    try {
      // Bulk insert using Dexie transaction for atomicity
      await db.transaction('rw', db.products, db.stock_movements, db.pendingOps, async () => {
        await db.products.bulkPut(products)
        if (movements.length > 0) {
          await db.stock_movements.bulkPut(movements)
        }
        await db.pendingOps.bulkAdd(pendingOps)
      })

      setImportProgress(100)
      setImportResult({
        success: products.length,
        errors: parsed.errors || [],
      })
      setStep('done')
      toast.success(`Se importaron ${products.length} productos correctamente`)
    } catch (err) {
      console.error('[CsvImport] Error:', err)
      setStep('preview')
      toast.error('Error al importar: ' + err.message)
    }
  }

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="
        relative bg-white w-full sm:max-w-2xl sm:mx-4 sm:rounded-2xl
        rounded-t-3xl shadow-2xl flex flex-col
        max-h-[92vh] sm:max-h-[85vh]
      ">
        {/* Handle mobile */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Importar productos desde CSV</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
          >✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* ── Step: select ── */}
          {step === 'select' && (
            <>
              {/* Instructions */}
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-800">Formato esperado del CSV</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  La primera fila debe tener los encabezados. Columna obligatoria: <strong>nombre</strong>.
                  Opcionales: precio, stock, unidad, codigo, costo, categoria, stock_minimo.
                </p>
                <p className="text-xs text-amber-700">
                  Se aceptan delimitadores coma (,) o punto y coma (;). Codificación UTF-8.
                </p>
                <button
                  onClick={downloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 underline underline-offset-2 mt-1"
                >
                  Descargar plantilla de ejemplo (.csv)
                </button>
              </div>

              {/* File input */}
              <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-2xl hover:border-amber-300 transition cursor-pointer"
                onClick={() => fileRef.current?.click()}
              >
                <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center mb-3">
                  <span className="text-2xl">📄</span>
                </div>
                <p className="text-sm font-semibold text-gray-700">Seleccioná un archivo CSV</p>
                <p className="text-xs text-gray-400 mt-1">Click o arrastrá el archivo acá</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Parse error */}
              {parseError && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                  <p className="text-sm text-red-700">{parseError}</p>
                </div>
              )}
            </>
          )}

          {/* ── Step: preview ── */}
          {step === 'preview' && parsed && (
            <>
              {/* Summary */}
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border border-green-200">
                <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center">
                  <span className="text-white font-bold text-sm">{parsed.rows.length}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">
                    Se importarán {parsed.rows.length} productos
                  </p>
                  <p className="text-xs text-green-600">
                    Columnas detectadas: {Object.keys(parsed.colMap).join(', ')}
                  </p>
                </div>
              </div>

              {/* Row errors from parsing */}
              {parsed.errors?.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 space-y-1">
                  <p className="text-xs font-semibold text-red-700">
                    {parsed.errors.length} fila(s) con errores (se omitirán):
                  </p>
                  {parsed.errors.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      Fila {e.row}: {e.name ? `"${e.name}" — ` : ''}{e.error}
                    </p>
                  ))}
                  {parsed.errors.length > 5 && (
                    <p className="text-xs text-red-400">...y {parsed.errors.length - 5} más</p>
                  )}
                </div>
              )}

              {/* Preview table */}
              <div className="overflow-x-auto">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  Vista previa (primeras {Math.min(5, parsed.rows.length)} filas)
                </p>
                <table className="w-full text-xs border border-gray-100 rounded-xl overflow-hidden">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 font-medium text-gray-500">#</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Nombre</th>
                      {parsed.colMap.code !== undefined && <th className="text-left px-3 py-2 font-medium text-gray-500">Código</th>}
                      {parsed.colMap.price !== undefined && <th className="text-right px-3 py-2 font-medium text-gray-500">Precio</th>}
                      {parsed.colMap.cost !== undefined && <th className="text-right px-3 py-2 font-medium text-gray-500">Costo</th>}
                      {parsed.colMap.stock !== undefined && <th className="text-right px-3 py-2 font-medium text-gray-500">Stock</th>}
                      {parsed.colMap.unit !== undefined && <th className="text-left px-3 py-2 font-medium text-gray-500">Unidad</th>}
                      {parsed.colMap.category !== undefined && <th className="text-left px-3 py-2 font-medium text-gray-500">Categoría</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.rows.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-gray-50 last:border-0">
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                        {parsed.colMap.code !== undefined && <td className="px-3 py-2 text-gray-500 font-mono">{row.code ?? '—'}</td>}
                        {parsed.colMap.price !== undefined && <td className="px-3 py-2 text-right text-gray-900">{formatARS(row.price)}</td>}
                        {parsed.colMap.cost !== undefined && <td className="px-3 py-2 text-right text-gray-500">{formatARS(row.cost)}</td>}
                        {parsed.colMap.stock !== undefined && <td className="px-3 py-2 text-right font-semibold text-gray-900">{formatNumber(row.stock)}</td>}
                        {parsed.colMap.unit !== undefined && <td className="px-3 py-2 text-gray-500">{row.unit}</td>}
                        {parsed.colMap.category !== undefined && <td className="px-3 py-2 text-gray-500">{row.category ?? '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsed.rows.length > 5 && (
                  <p className="text-xs text-gray-400 mt-1 text-center">
                    ...y {parsed.rows.length - 5} productos más
                  </p>
                )}
              </div>

              {/* Change file */}
              <button
                onClick={() => { setStep('select'); setParsed(null); setParseError('') }}
                className="text-xs text-gray-400 hover:text-gray-600 underline underline-offset-2"
              >
                Elegir otro archivo
              </button>
            </>
          )}

          {/* ── Step: importing ── */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <svg className="animate-spin h-8 w-8 text-amber-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm font-semibold text-gray-700">Importando productos...</p>
              <p className="text-xs text-gray-400">No cierres esta ventana</p>
            </div>
          )}

          {/* ── Step: done ── */}
          {step === 'done' && importResult && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
                <span className="text-3xl">✓</span>
              </div>
              <div className="text-center">
                <p className="text-base font-bold text-gray-900">
                  {importResult.success} productos importados
                </p>
                {importResult.errors.length > 0 && (
                  <p className="text-sm text-red-500 mt-1">
                    {importResult.errors.length} filas con errores fueron omitidas
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-5 py-4 flex gap-3">
          {step === 'select' && (
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
            >
              Cancelar
            </button>
          )}

          {step === 'preview' && (
            <>
              <button
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleImport}
                disabled={!parsed?.rows?.length}
                className="
                  flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold
                  hover:bg-amber-600 transition active:scale-[0.98]
                  disabled:opacity-50 disabled:cursor-not-allowed
                "
              >
                Importar {parsed?.rows?.length ?? 0} productos
              </button>
            </>
          )}

          {step === 'done' && (
            <button
              onClick={onClose}
              className="
                flex-1 py-3 rounded-xl bg-amber-500 text-white text-sm font-semibold
                hover:bg-amber-600 transition active:scale-[0.98]
              "
            >
              Listo
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

CsvImportModal.propTypes = {
  onClose: PropTypes.func.isRequired,
}
