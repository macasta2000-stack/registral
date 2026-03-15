/**
 * REGISTRAL — Conflict Resolver
 * src/core/offline/conflictResolver.js
 *
 * 4 estrategias de resolución de conflictos.
 * No tiene dependencias en otros archivos del proyecto.
 *
 * Estrategias:
 *   LAST_WRITE_WINS   → default para la mayoría de recursos
 *   MERGE_FIELDS      → entities, products (campos distintos → merge)
 *   APPEND_ONLY       → event_log, stock_movements, accounts_receivable
 *   STOCK_SAFE        → products.stock_current (nunca sobreescribir con offline)
 *
 * Función principal:
 *   resolveConflict(table, clientRecord, serverRecord) → resolvedRecord | null
 *   Retorna null cuando APPEND_ONLY detecta duplicado → la op se descarta.
 */

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA POR TABLA
// ─────────────────────────────────────────────────────────────

export const CONFLICT_STRATEGY = {
  // APPEND_ONLY — solo INSERT, deduplicación por client_id
  event_log:           'APPEND_ONLY',
  stock_movements:     'APPEND_ONLY',
  accounts_receivable: 'APPEND_ONLY',

  // MERGE_FIELDS — fusiona campos no solapados
  entities:            'MERGE_FIELDS',
  products:            'MERGE_FIELDS',

  // LAST_WRITE_WINS — timestamps deciden
  transactions:        'LAST_WRITE_WINS',
  transaction_items:   'LAST_WRITE_WINS',
  schedules:           'LAST_WRITE_WINS',
  notifications:       'LAST_WRITE_WINS',
  tenants:             'LAST_WRITE_WINS',
  users:               'LAST_WRITE_WINS',
}

// ─────────────────────────────────────────────────────────────
// FUNCIÓN PRINCIPAL
// ─────────────────────────────────────────────────────────────

/**
 * Resuelve un conflicto entre el estado del cliente (offline) y el servidor.
 *
 * @param {string} table          - Nombre de la tabla
 * @param {Object} clientRecord   - Registro del cliente (IndexedDB)
 * @param {Object} serverRecord   - Registro actual en Supabase (puede ser null si es INSERT nuevo)
 * @returns {Object|null}         - Registro resuelto para enviar a Supabase, o null para descartar
 */
export function resolveConflict(table, clientRecord, serverRecord) {
  // Si no hay versión en el servidor, el cliente siempre gana (INSERT nuevo)
  if (!serverRecord) return clientRecord

  const strategy = CONFLICT_STRATEGY[table] ?? 'LAST_WRITE_WINS'

  switch (strategy) {
    case 'APPEND_ONLY':
      return resolveAppendOnly(clientRecord, serverRecord)

    case 'MERGE_FIELDS':
      return resolveMergeFields(table, clientRecord, serverRecord)

    case 'LAST_WRITE_WINS':
    default:
      return resolveLastWriteWins(clientRecord, serverRecord)
  }
}

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA 1: LAST_WRITE_WINS
// El registro con updated_at más reciente gana.
// ─────────────────────────────────────────────────────────────

function resolveLastWriteWins(clientRecord, serverRecord) {
  const clientTime = parseDate(clientRecord.updated_at)
  const serverTime = parseDate(serverRecord.updated_at)

  if (!clientTime) return serverRecord
  if (!serverTime) return clientRecord

  // El servidor gana en empate exacto (preferir servidor para evitar loops)
  return serverTime >= clientTime ? serverRecord : clientRecord
}

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA 2: MERGE_FIELDS
// El cliente editó campo A, el servidor editó campo B → merge ambos.
// Si editaron el mismo campo → el servidor gana en ese campo.
// Campo especial stock_current → delegar a STOCK_SAFE.
// ─────────────────────────────────────────────────────────────

function resolveMergeFields(table, clientRecord, serverRecord) {
  const clientTime = parseDate(clientRecord.updated_at)
  const serverTime = parseDate(serverRecord.updated_at)

  // Si el servidor es más reciente y el cliente tiene cambios → merge inteligente
  const merged = { ...serverRecord }

  for (const key of Object.keys(clientRecord)) {
    // Ignorar campos de infraestructura
    if (isInfraField(key)) continue

    // STOCK_SAFE: nunca sobreescribir stock con valor offline
    if (table === 'products' && key === 'stock_current') {
      merged.stock_current = resolveStockSafe(
        clientRecord.stock_current,
        serverRecord.stock_current,
        clientRecord._stock_at_disconnect ?? serverRecord.stock_current,
      )
      continue
    }

    const clientVal = clientRecord[key]
    const serverVal = serverRecord[key]

    if (clientVal === serverVal) {
      // Sin conflicto en este campo
      merged[key] = serverVal
      continue
    }

    // Campo modificado por ambos → servidor gana
    if (clientTime && serverTime && serverTime > clientTime) {
      merged[key] = serverVal
    } else {
      // Cliente es más reciente en este campo
      merged[key] = clientVal
    }
  }

  // El updated_at del resultado es el más reciente
  merged.updated_at = clientTime && serverTime
    ? (clientTime > serverTime ? clientRecord.updated_at : serverRecord.updated_at)
    : (serverRecord.updated_at ?? clientRecord.updated_at)

  return cleanRecord(merged, table)
}

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA 3: APPEND_ONLY
// Solo INSERT. Si ya existe un registro con el mismo client_id → descartar.
// ─────────────────────────────────────────────────────────────

function resolveAppendOnly(clientRecord, serverRecord) {
  // serverRecord no null significa que el registro ya existe en Supabase
  // (deduplicado por client_id). Descartar la operación del cliente.
  if (serverRecord) return null

  // Es un INSERT nuevo que no existe en el servidor → aplicar
  return clientRecord
}

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA 4: STOCK_SAFE (usada dentro de MERGE_FIELDS)
// Nunca sobreescribir stock con valor capturado offline.
// Calcula el delta offline y lo aplica sobre el stock actual del servidor.
//
// Ejemplo:
//   stock_servidor_actual: 85
//   stock_al_desconectar:  90
//   stock_offline:         78   (usuario vendió 12 unidades offline)
//   delta:                 78 - 90 = -12
//   resultado:             85 + (-12) = 73
// ─────────────────────────────────────────────────────────────

function resolveStockSafe(clientStock, serverStock, stockAtDisconnect) {
  // Si no tenemos el stock al momento de desconexión, no podemos calcular delta
  // → servidor gana para evitar datos corruptos
  if (stockAtDisconnect === null || stockAtDisconnect === undefined) {
    return serverStock
  }

  const delta = Number(clientStock) - Number(stockAtDisconnect)

  // Delta = 0 → el usuario no modificó stock offline → server gana
  if (delta === 0) return serverStock

  const result = Number(serverStock) + delta

  // Nunca retornar stock negativo
  return Math.max(0, result)
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Parsea un string ISO de fecha a Date.
 * Retorna null si es inválido.
 */
function parseDate(val) {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Campos de infraestructura que no se sincronizan al servidor.
 */
const INFRA_FIELDS = new Set([
  '_sync_status',
  '_local_id',
  '_client_id',
  '_stock_at_disconnect',
  '_local_only',
])

function isInfraField(key) {
  return INFRA_FIELDS.has(key) || key.startsWith('_')
}

/**
 * Columnas conocidas por tabla en Supabase.
 * Si una tabla tiene whitelist, solo se envían esas columnas.
 * Esto previene errores "column X does not exist" cuando IndexedDB tiene campos extra.
 */
const KNOWN_COLUMNS = {
  products: new Set([
    'id', 'tenant_id', 'code', 'name', 'description', 'category',
    'unit_type', 'price', 'price_bulk', 'bulk_threshold', 'cost',
    'stock_current', 'stock_minimum', 'stock_location', 'supplier',
    'data', 'is_active', 'created_at', 'updated_at',
  ]),
  entities: new Set([
    'id', 'tenant_id', 'name', 'code', 'entity_type', 'balance',
    'credit_limit', 'data', 'is_active', 'created_at', 'updated_at',
  ]),
  transactions: new Set([
    'id', 'tenant_id', 'entity_id', 'transaction_type', 'number',
    'status', 'total', 'payment_method', 'notes', 'data',
    'is_active', 'created_at', 'updated_at',
  ]),
  transaction_items: new Set([
    'id', 'tenant_id', 'transaction_id', 'product_id', 'product_name',
    'quantity', 'unit_price', 'subtotal', 'data',
    'created_at', 'updated_at',
  ]),
  stock_movements: new Set([
    'id', 'tenant_id', 'product_id', 'movement_type', 'quantity',
    'stock_before', 'stock_after', 'transaction_id', 'reason',
    'created_by', 'data', 'created_at',
  ]),
  accounts_receivable: new Set([
    'id', 'tenant_id', 'entity_id', 'transaction_id', 'amount',
    'balance_before', 'balance_after', 'movement_type', 'description',
    'is_paid', 'data', 'created_at',
  ]),
  caja_sessions: new Set([
    'id', 'tenant_id', 'status', 'opening_balance', 'closing_balance',
    'current_balance', 'actual_balance', 'difference',
    'total_ingresos', 'total_egresos',
    'opened_by', 'opened_by_name', 'closed_by',
    'opened_at', 'closed_at', 'closing_notes', 'data',
  ]),
  caja_movements: new Set([
    'id', 'tenant_id', 'session_id', 'movement_type', 'amount',
    'balance_after', 'category', 'description', 'payment_method',
    'data', 'created_by', 'created_at',
  ]),
  schedules: new Set([
    'id', 'tenant_id', 'entity_id', 'transaction_id', 'schedule_type',
    'title', 'description', 'status', 'scheduled_at', 'completed_at',
    'data', 'created_at', 'updated_at',
  ]),
  notifications: new Set([
    'id', 'tenant_id', 'title', 'body', 'priority', 'category',
    'is_read', 'data', 'created_at', 'expires_at',
  ]),
}

/**
 * Limpia campos de infraestructura y campos desconocidos antes de enviar al servidor.
 * @param {Object} record - Registro a limpiar
 * @param {string} [tableName] - Si se pasa, filtra por whitelist de columnas conocidas
 */
export function cleanRecord(record, tableName) {
  const whitelist = tableName ? KNOWN_COLUMNS[tableName] : null
  const clean = {}
  for (const [key, val] of Object.entries(record)) {
    if (isInfraField(key)) continue
    if (whitelist && !whitelist.has(key)) continue
    clean[key] = val
  }
  return clean
}

/**
 * Detecta si dos registros tienen conflicto real (campos con valores distintos).
 * Excluye campos de infraestructura y timestamps.
 */
export function hasConflict(clientRecord, serverRecord) {
  if (!serverRecord) return false

  const ignoreKeys = new Set(['updated_at', 'created_at', ...INFRA_FIELDS])

  for (const key of Object.keys(clientRecord)) {
    if (ignoreKeys.has(key) || isInfraField(key)) continue
    if (clientRecord[key] !== serverRecord[key]) return true
  }

  return false
}
