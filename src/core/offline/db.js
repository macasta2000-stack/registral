/**
 * REGISTRAL — IndexedDB Schema
 * src/core/offline/db.js
 *
 * Singleton Dexie v4.
 * Replica las tablas críticas de Supabase para funcionamiento offline completo.
 * Schema fijo — no depende del preset (el preset vive sobre este schema).
 *
 * Stores de datos:          entities, products, transactions, transaction_items,
 *                           stock_movements, accounts_receivable, schedules, notifications
 * Stores de infraestructura: pendingOps, syncMeta
 *
 * Regla de índices:
 *   - Todos los stores tienen índice por [tenant_id] para filtrado multi-tenant.
 *   - Compound indexes usan corchetes: '[tenant_id+status]'
 *   - El campo `id` es la primary key en todos los stores de datos.
 */

import Dexie from 'dexie'

// ─────────────────────────────────────────────────────────────
// APPLY_ORDER por tabla
// Define la prioridad de sincronización.
// Las entidades padre deben sincronizarse antes que sus hijos.
// ─────────────────────────────────────────────────────────────

export const APPLY_ORDER = {
  tenants:              10,
  users:                15,
  products:             20,
  entities:             20,
  transactions:         30,
  transaction_items:    40,
  stock_movements:      50,
  accounts_receivable:  50,
  caja_sessions:        30,
  caja_movements:       40,
  schedules:            30,
  notifications:        60,
  event_log:            70,
}

// ─────────────────────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────────────────────

class RegistralDatabase extends Dexie {
  constructor() {
    super('registral_db')

    /**
     * Versión 1 — Schema inicial.
     *
     * Sintaxis Dexie:
     *   ++id         → autoincrement PK
     *   id           → PK única (UUID del servidor)
     *   &id          → PK única con unique constraint
     *   *tags        → multiEntry index
     *   [a+b]        → compound index
     */
    this.version(1).stores({

      // ── Entidades del negocio (cliente/paciente/expediente/mesa) ──
      entities: [
        'id',                    // PK: UUID de Supabase
        'tenant_id',
        '[tenant_id+entity_type]',
        '[tenant_id+is_active]',
        'name',
        'updated_at',
        '_sync_status',          // 'synced' | 'pending' | 'failed'
      ].join(', '),

      // ── Artículos / Productos / Servicios ──
      products: [
        'id',
        'tenant_id',
        '[tenant_id+category]',
        '[tenant_id+is_active]',
        'code',
        'name',
        'updated_at',
        '_sync_status',
      ].join(', '),

      // ── Transacciones (remito/venta/comanda/honorario) ──
      transactions: [
        'id',
        'tenant_id',
        '[tenant_id+status]',
        '[tenant_id+transaction_type]',
        '[tenant_id+transaction_type+created_at]',
        'entity_id',
        'created_at',
        'updated_at',
        '_sync_status',
      ].join(', '),

      // ── Líneas de cada transacción ──
      transaction_items: [
        'id',
        'tenant_id',
        'transaction_id',
        '[transaction_id+product_id]',
        '_sync_status',
      ].join(', '),

      // ── Movimientos de stock (append-only) ──
      stock_movements: [
        'id',
        'tenant_id',
        '[tenant_id+product_id]',
        'created_at',
        '_sync_status',
        '_client_id',            // UUID generado en cliente para deduplicación
      ].join(', '),

      // ── Cuenta corriente (append-only) ──
      accounts_receivable: [
        'id',
        'tenant_id',
        'entity_id',
        '[tenant_id+entity_id]',
        '[tenant_id+is_paid]',
        'created_at',
        '_sync_status',
        '_client_id',
      ].join(', '),

      // ── Agenda: turnos, entregas, vencimientos ──
      schedules: [
        'id',
        'tenant_id',
        '[tenant_id+schedule_type]',
        '[tenant_id+status]',
        'scheduled_at',
        'entity_id',
        '_sync_status',
      ].join(', '),

      // ── Notificaciones (alertas del motor determinista) ──
      notifications: [
        'id',
        'tenant_id',
        '[tenant_id+is_read]',
        'created_at',
        'expires_at',
      ].join(', '),

      // ── Cola de operaciones pendientes de sincronizar ──────────
      // Cada acción offline genera una fila acá.
      // syncEngine procesa en orden apply_order ASC, created_at ASC.
      pendingOps: [
        '++_local_id',           // PK local autoincrement
        'id',                    // UUID de la operación (= client_id para dedup)
        'table_name',
        'operation',             // 'INSERT' | 'UPDATE' | 'DELETE'
        'record_id',             // UUID del registro afectado
        '[table_name+record_id]',// Para deduplicar múltiples updates del mismo record
        'apply_order',
        'created_at',
        'status',                // 'pending' | 'processing' | 'failed'
        'retry_count',
      ].join(', '),

      // ── Metadatos de sync por tabla ────────────────────────────
      // Guarda el último timestamp de sync exitoso por tabla.
      // Permite hacer delta sync en lugar de full sync.
      syncMeta: [
        '&table_name',           // PK única: nombre de la tabla
        'last_synced_at',
        'last_server_sequence',
      ].join(', '),
    })

    /**
     * Versión 2 — Caja (sesiones y movimientos).
     * Solo agrega stores nuevos; los existentes se heredan de v1.
     */
    this.version(2).stores({
      // ── Sesiones de caja ──
      caja_sessions: [
        'id',
        'tenant_id',
        '[tenant_id+status]',
        'opened_at',
        'closed_at',
        '_sync_status',
      ].join(', '),

      // ── Movimientos de caja ──
      caja_movements: [
        'id',
        'tenant_id',
        'session_id',
        '[tenant_id+session_id]',
        '[tenant_id+movement_type]',
        'created_at',
        '_sync_status',
        '_client_id',
      ].join(', '),
    })
  }
}

// ─────────────────────────────────────────────────────────────
// SINGLETON
// ─────────────────────────────────────────────────────────────

export const db = new RegistralDatabase()

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/**
 * Obtiene todos los registros de una tabla para un tenant específico.
 * Filtrado en IndexedDB — no va a Supabase.
 */
export async function getByTenant(tableName, tenantId, extra = {}) {
  const table = db[tableName]
  if (!table) throw new Error(`[db] Tabla desconocida: ${tableName}`)

  let collection = table.where('tenant_id').equals(tenantId)

  // Filtros opcionales
  if (extra.status) {
    collection = table
      .where('[tenant_id+status]')
      .equals([tenantId, extra.status])
  }

  return collection.toArray()
}

/**
 * Upsert: inserta o actualiza en IndexedDB y marca como pending.
 * No toca Supabase. El syncEngine se encarga del sync.
 */
export async function localUpsert(tableName, record) {
  const table = db[tableName]
  if (!table) throw new Error(`[db] Tabla desconocida: ${tableName}`)
  await table.put({ ...record, _sync_status: 'pending' })
}

/**
 * Marca un registro como synced después de confirmación de Supabase.
 */
export async function markSynced(tableName, recordId) {
  const table = db[tableName]
  if (!table) return
  await table.update(recordId, { _sync_status: 'synced' })
}

/**
 * Elimina operaciones de pendingOps por record_id y tabla.
 * Llamado después de sync exitoso.
 */
export async function clearPendingOps(tableName, recordId) {
  await db.pendingOps
    .where('[table_name+record_id]')
    .equals([tableName, recordId])
    .filter(op => op.status !== 'failed')
    .delete()
}

/**
 * Actualiza el timestamp de último sync para una tabla.
 */
export async function updateSyncMeta(tableName, lastSyncedAt) {
  await db.syncMeta.put({
    table_name:     tableName,
    last_synced_at: lastSyncedAt ?? new Date().toISOString(),
  })
}

/**
 * Obtiene el conteo de operaciones pendientes.
 */
export async function getPendingCount() {
  return db.pendingOps.where('status').equals('pending').count()
}

/**
 * Obtiene el conteo de operaciones fallidas.
 */
export async function getFailedCount() {
  return db.pendingOps.where('status').equals('failed').count()
}
