/**
 * REGISTRAL — Sync Engine
 * src/core/offline/syncEngine.js
 *
 * Motor de sincronización offline → Supabase.
 * Procesa la cola pendingOps en orden apply_order ASC.
 * Retry exponencial: 1s, 2s, 4s (max 3 intentos por op).
 * Deduplicación: múltiples UPDATEs del mismo record → solo el más reciente.
 * Escucha online/offline para pausar/reanudar automáticamente.
 * Notifica a SyncContext con EventTarget para que la UI reaccione.
 *
 * Dependencias: db.js, conflictResolver.js, supabase/client.js
 * NO depende de React ni de ningún hook.
 */

import { supabase }    from '../supabase/client'
import { db, updateSyncMeta, markSynced, clearPendingOps, getPendingCount, getFailedCount } from './db'
import { resolveConflict, cleanRecord } from './conflictResolver'

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────────────────────────

const SYNC_INTERVAL_MS   = 5_000   // Intentar sync cada 5s si hay pendingOps
const MAX_RETRIES        = 3
const BATCH_SIZE         = 20      // Máx operaciones por ciclo

const RETRY_DELAYS_MS = [1_000, 2_000, 4_000]

// ─────────────────────────────────────────────────────────────
// EVENT BUS (para notificar a SyncContext sin acoplamiento)
// ─────────────────────────────────────────────────────────────

export const syncEvents = new EventTarget()

function emitSyncStatus(status) {
  syncEvents.dispatchEvent(
    new CustomEvent('sync:status', { detail: status })
  )
}

// ─────────────────────────────────────────────────────────────
// ESTADO INTERNO
// ─────────────────────────────────────────────────────────────

let _isRunning     = false
let _isOnline      = navigator.onLine
let _intervalId    = null
let _tenantId      = null   // Se setea al iniciar
let _lastSyncAt    = null
let _processingNow = false  // Mutex para evitar runs concurrentes

// ─────────────────────────────────────────────────────────────
// API PÚBLICA
// ─────────────────────────────────────────────────────────────

/**
 * Inicia el sync engine.
 * @param {string} tenantId - ID del tenant autenticado
 */
export function startSyncEngine(tenantId) {
  if (_isRunning) return
  _tenantId  = tenantId
  _isRunning = true

  // Listeners de conectividad
  window.addEventListener('online',  handleOnline)
  window.addEventListener('offline', handleOffline)

  // Escuchar mensajes del Service Worker (background sync trigger)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', handleSWMessage)
  }

  // Escuchar Supabase Realtime en sync_queue para multi-tab sync
  setupRealtimeSync()

  // Pull inicial: traer datos de Supabase → IndexedDB si están vacíos
  initialPull(tenantId).catch(err =>
    console.error('[syncEngine] initialPull falló:', err)
  )

  // Primer intento inmediato
  scheduleSyncLoop()

  emitSyncStatus(buildStatus())
}

/**
 * Detiene el sync engine y limpia todos los listeners.
 */
export function stopSyncEngine() {
  if (!_isRunning) return
  _isRunning = false

  window.removeEventListener('online',  handleOnline)
  window.removeEventListener('offline', handleOffline)

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.removeEventListener('message', handleSWMessage)
  }

  if (_intervalId) {
    clearInterval(_intervalId)
    _intervalId = null
  }

  _realtimeChannel?.unsubscribe()
  _realtimeChannel = null
}

/**
 * Fuerza un ciclo de sync inmediato sin esperar el interval.
 */
export async function forceSync() {
  if (!_isOnline || !_tenantId) return
  await runSyncCycle()
}

/**
 * Retorna el estado actual del sync.
 */
export async function getSyncStatus() {
  const [pending, failed] = await Promise.all([
    getPendingCount(),
    getFailedCount(),
  ])
  return {
    pending,
    failed,
    lastSync:  _lastSyncAt,
    isOnline:  _isOnline,
    isRunning: _isRunning,
  }
}

// ─────────────────────────────────────────────────────────────
// INITIAL PULL: Supabase → IndexedDB (una sola vez por tabla)
// Si la tabla local está vacía, trae todos los registros del tenant.
// ─────────────────────────────────────────────────────────────

const PULL_TABLES = [
  'entities',
  'products',
  'transactions',
  'transaction_items',
  'schedules',
]

async function initialPull(tenantId) {
  if (!navigator.onLine) return

  for (const table of PULL_TABLES) {
    try {
      const localCount = await db[table]
        .where('tenant_id')
        .equals(tenantId)
        .count()

      // Solo hacer pull si la tabla local está vacía para este tenant
      if (localCount > 0) continue

      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('tenant_id', tenantId)
        .limit(5000)

      if (error) {
        console.warn(`[syncEngine] initialPull ${table} error:`, error.message)
        continue
      }

      if (data && data.length > 0) {
        const records = data.map(r => ({ ...r, _sync_status: 'synced' }))
        await db[table].bulkPut(records)
        console.log(`[syncEngine] initialPull: ${table} → ${records.length} registros`)
      }
    } catch (err) {
      console.warn(`[syncEngine] initialPull ${table} falló:`, err.message)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// LOOP PRINCIPAL
// ─────────────────────────────────────────────────────────────

function scheduleSyncLoop() {
  if (_intervalId) clearInterval(_intervalId)

  _intervalId = setInterval(async () => {
    if (!_isRunning || !_isOnline) return
    const pending = await getPendingCount()
    if (pending > 0) {
      await runSyncCycle()
    }
  }, SYNC_INTERVAL_MS)

  // Ejecutar inmediatamente también
  if (_isOnline) {
    runSyncCycle().catch(console.error)
  }
}

async function runSyncCycle() {
  if (_processingNow || !_tenantId) return
  _processingNow = true

  try {
    // Obtener operaciones pendientes en orden
    const ops = await db.pendingOps
      .where('status')
      .equals('pending')
      .sortBy('apply_order')
      .then(rows => rows
        .sort((a, b) => {
          if (a.apply_order !== b.apply_order) return a.apply_order - b.apply_order
          return new Date(a.created_at) - new Date(b.created_at)
        })
        .slice(0, BATCH_SIZE)
      )

    if (ops.length === 0) {
      _processingNow = false
      return
    }

    // Deduplicar: para el mismo table+record_id, conservar solo el más reciente UPDATE
    const deduped = deduplicateOps(ops)

    // Emitir estado "syncing"
    emitSyncStatus(await buildStatus({ syncing: true }))

    // Procesar cada operación
    for (const op of deduped) {
      await processOp(op)
    }

    _lastSyncAt = new Date()
    emitSyncStatus(await buildStatus())

  } catch (err) {
    console.error('[syncEngine] Error en runSyncCycle:', err)
  } finally {
    _processingNow = false
  }
}

// ─────────────────────────────────────────────────────────────
// PROCESAMIENTO DE UNA OPERACIÓN
// ─────────────────────────────────────────────────────────────

async function processOp(op) {
  // Marcar como 'processing' para evitar reprocesamiento concurrente
  await db.pendingOps.update(op._local_id, { status: 'processing' })

  try {
    await executeWithRetry(op)

    // Éxito: eliminar de la cola y marcar el record como synced
    await db.pendingOps.delete(op._local_id)
    await markSynced(op.table_name, op.record_id)

    // Actualizar syncMeta
    await updateSyncMeta(op.table_name, new Date().toISOString())

  } catch (err) {
    const newRetryCount = (op.retry_count ?? 0) + 1

    if (newRetryCount >= MAX_RETRIES) {
      // Marcar como fallido permanentemente
      await db.pendingOps.update(op._local_id, {
        status:       'failed',
        retry_count:  newRetryCount,
        _error:       err.message,
      })
      console.error(`[syncEngine] Op ${op.id} falló ${MAX_RETRIES} veces:`, err.message)

      // Notificar UI de fallo
      emitSyncStatus(await buildStatus({ hasFailed: true }))
    } else {
      // Volver a pending con contador incrementado
      const delay = RETRY_DELAYS_MS[newRetryCount - 1] ?? 4_000
      await new Promise(r => setTimeout(r, delay))
      await db.pendingOps.update(op._local_id, {
        status:      'pending',
        retry_count: newRetryCount,
      })
    }
  }
}

async function executeWithRetry(op) {
  const { table_name, operation, record_id, payload } = op

  switch (operation) {
    case 'INSERT':
      return executeInsert(table_name, payload)
    case 'UPDATE':
      return executeUpdate(table_name, record_id, payload)
    case 'DELETE':
      return executeDelete(table_name, record_id)
    default:
      throw new Error(`[syncEngine] Operación desconocida: ${operation}`)
  }
}

// ─────────────────────────────────────────────────────────────
// OPERACIONES SUPABASE
// ─────────────────────────────────────────────────────────────

async function executeInsert(tableName, payload) {
  const clean = cleanRecord(payload, tableName)

  // Para APPEND_ONLY: verificar si ya existe por client_id antes de insertar
  const clientId = payload._client_id
  if (clientId) {
    const { data: existing } = await supabase
      .from(tableName)
      .select('id')
      .eq('id', payload.id)
      .maybeSingle()

    if (existing) {
      // Ya existe → no es error, simplemente ignorar
      return
    }
  }

  const { error } = await supabase.from(tableName).insert(clean)
  if (error) {
    console.error(`[syncEngine] INSERT ${tableName} falló:`, error.message, error.details, error.hint, { payload: clean })
    throw new Error(error.message)
  }
}

async function executeUpdate(tableName, recordId, payload) {
  // Obtener versión actual del servidor para resolver conflictos
  const { data: serverRecord } = await supabase
    .from(tableName)
    .select('*')
    .eq('id', recordId)
    .maybeSingle()

  const resolved = resolveConflict(tableName, payload, serverRecord)

  // resolveConflict retorna null → APPEND_ONLY detectó duplicado → ignorar
  if (resolved === null) return

  // Si el servidor ganó el conflicto, actualizar IndexedDB con la versión del servidor
  if (serverRecord && resolved === serverRecord) {
    await db[tableName]?.put({ ...serverRecord, _sync_status: 'synced' })
    return
  }

  const clean = cleanRecord(resolved, tableName)
  const { error } = await supabase
    .from(tableName)
    .update(clean)
    .eq('id', recordId)

  if (error) {
    console.error(`[syncEngine] UPDATE ${tableName}/${recordId} falló:`, error.message, error.details, error.hint, { payload: clean })
    throw new Error(error.message)
  }

  // Actualizar IndexedDB con la versión resuelta
  await db[tableName]?.put({ ...resolved, _sync_status: 'synced' })
}

async function executeDelete(tableName, recordId) {
  const { error } = await supabase
    .from(tableName)
    .delete()
    .eq('id', recordId)

  if (error) throw new Error(error.message)

  // Eliminar de IndexedDB también
  await db[tableName]?.delete(recordId)
}

// ─────────────────────────────────────────────────────────────
// DEDUPLICACIÓN
// Para el mismo table_name + record_id, conservar solo el UPDATE más reciente.
// Los INSERTs y DELETEs no se deduplicán (siempre se aplican).
// ─────────────────────────────────────────────────────────────

function deduplicateOps(ops) {
  const updateMap = new Map() // key: `${table_name}:${record_id}` → op más reciente

  const result = []

  for (const op of ops) {
    if (op.operation !== 'UPDATE') {
      result.push(op)
      continue
    }

    const key = `${op.table_name}:${op.record_id}`
    const existing = updateMap.get(key)

    if (!existing) {
      updateMap.set(key, op)
    } else {
      // Conservar el más reciente
      const existingTime = new Date(existing.created_at).getTime()
      const currentTime  = new Date(op.created_at).getTime()

      if (currentTime > existingTime) {
        // Marcar el anterior como a-eliminar y conservar el actual
        result.push({ ...existing, _deduplicated: true })
        updateMap.set(key, op)
      } else {
        result.push({ ...op, _deduplicated: true })
      }
    }
  }

  // Agregar los UPDATEs finales del mapa
  for (const op of updateMap.values()) {
    result.push(op)
  }

  // Procesar eliminaciones de duplicados y ordenar
  return result
    .filter(op => !op._deduplicated || op.operation !== 'UPDATE')
    .sort((a, b) => {
      if (a.apply_order !== b.apply_order) return a.apply_order - b.apply_order
      return new Date(a.created_at) - new Date(b.created_at)
    })
}

// ─────────────────────────────────────────────────────────────
// CONNECTIVITY HANDLERS
// ─────────────────────────────────────────────────────────────

async function handleOnline() {
  _isOnline = true
  emitSyncStatus(await buildStatus())

  // Notificar al SW que hay sync pendiente
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SYNC_REQUESTED' })
  }

  // Forzar sync inmediato al volver la conexión
  await runSyncCycle()
}

async function handleOffline() {
  _isOnline = false
  emitSyncStatus(await buildStatus())
}

function handleSWMessage(event) {
  if (event.data?.type === 'REGISTRAL_SYNC_REQUESTED') {
    runSyncCycle().catch(console.error)
  }
}

// ─────────────────────────────────────────────────────────────
// REALTIME: Multi-tab sync via Supabase Realtime en sync_queue
// ─────────────────────────────────────────────────────────────

let _realtimeChannel = null

function setupRealtimeSync() {
  if (!_tenantId) return

  _realtimeChannel = supabase
    .channel(`sync-${_tenantId}`)
    .on('postgres_changes', {
      event:  'INSERT',
      schema: 'public',
      table:  'sync_queue',
      filter: `tenant_id=eq.${_tenantId}`,
    }, handleRemoteSyncOp)
    .subscribe()
}

/**
 * Cuando otro tab/dispositivo sincroniza, invalidar IndexedDB local
 * para los records afectados y hacer re-fetch selectivo.
 */
async function handleRemoteSyncOp(payload) {
  const { table_name, record_id, operation } = payload.new ?? {}
  if (!table_name || !record_id) return

  if (operation === 'DELETE') {
    await db[table_name]?.delete(record_id)
    return
  }

  // Para INSERT/UPDATE: re-fetch del record desde Supabase y actualizar IndexedDB
  const { data } = await supabase
    .from(table_name)
    .select('*')
    .eq('id', record_id)
    .maybeSingle()

  if (data && db[table_name]) {
    await db[table_name].put({ ...data, _sync_status: 'synced' })
  }
}

// ─────────────────────────────────────────────────────────────
// BUILD STATUS
// ─────────────────────────────────────────────────────────────

async function buildStatus(extra = {}) {
  const [pending, failed] = await Promise.all([
    getPendingCount(),
    getFailedCount(),
  ])
  return {
    pending,
    failed,
    isOnline:  _isOnline,
    isRunning: _isRunning,
    lastSync:  _lastSyncAt,
    syncing:   extra.syncing ?? false,
    hasFailed: (failed > 0) || (extra.hasFailed ?? false),
  }
}
