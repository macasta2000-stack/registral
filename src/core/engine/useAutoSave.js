/**
 * REGISTRAL — useAutoSave
 * src/core/engine/useAutoSave.js
 *
 * Hook de autoguardado atómico.
 *
 * Patrón exacto (definido en arquitectura):
 *   1. UI llama save(table, record, options)
 *   2. Estado local actualiza inmediatamente (optimistic)
 *   3. Escribe en IndexedDB (siempre funciona, offline o online)
 *   4. Agrega a pendingOps
 *   5. Intenta commit en Supabase (async)
 *      → OK:   marca synced, escribe event_log
 *      → FAIL: mantiene en pendingOps (syncEngine reintenta)
 *   6. Si options.critical = true y Supabase falla → rollback
 *
 * syncStatus: 'idle' | 'saving' | 'saved' | 'pending' | 'error'
 *
 * Dependencias: db.js, syncEngine.js (forceSync)
 * NO depende de conflictResolver (el syncEngine lo maneja al sincronizar).
 */

import { useCallback, useRef, useState } from 'react'
import { supabase } from '../supabase/client'
import { db, APPLY_ORDER, localUpsert, markSynced } from '../offline/db'
import { forceSync } from '../offline/syncEngine'
import { cleanRecord } from '../offline/conflictResolver'

// ─────────────────────────────────────────────────────────────
// UUID v4 mínimo (sin dependencia externa)
// Usado para client_id de deduplicación
// ─────────────────────────────────────────────────────────────

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// ─────────────────────────────────────────────────────────────
// HOOK
// ─────────────────────────────────────────────────────────────

/**
 * @returns {{
 *   save: (table: string, record: Object, options?: SaveOptions) => Promise<void>,
 *   saving: boolean,
 *   syncStatus: 'idle'|'saving'|'saved'|'pending'|'error',
 *   error: string|null,
 *   lastSaved: Date|null,
 * }}
 */
export function useAutoSave() {
  const [saving, setSaving]         = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [error, setError]           = useState(null)
  const [lastSaved, setLastSaved]   = useState(null)

  // Timeout ref para resetear 'saved' → 'idle' después de 3s
  const savedTimerRef = useRef(null)

  const save = useCallback(async (tableName, record, options = {}) => {
    const {
      critical    = false,
      operation   = record.id ? 'UPDATE' : 'INSERT',
      onSuccess   = null,
      onError     = null,
      skipEventLog= false,
    } = options

    setSaving(true)
    setSyncStatus('saving')
    setError(null)

    // ── Generar IDs y metadata ────────────────────────────────
    const clientId   = uuid4()
    const now        = new Date().toISOString()
    const recordId   = record.id ?? uuid4()
    const recordFull = {
      ...record,
      id:           recordId,
      updated_at:   now,
      _sync_status: 'pending',
      _client_id:   clientId,
    }

    // ── PASO 2: Actualización optimista en el estado del componente ──
    // (el componente que llama ya actualizó su estado local antes de llamar
    // a save; este paso es para consistencia interna)

    // ── PASO 3: Escribir en IndexedDB (siempre, offline o online) ──
    try {
      await localUpsert(tableName, recordFull)
    } catch (idbErr) {
      // IndexedDB falló (caso muy raro: storage lleno, modo privado restrictivo)
      console.warn('[useAutoSave] IndexedDB write failed:', idbErr.message)
    }

    // ── PASO 4: Agregar a pendingOps ─────────────────────────────
    try {
      await db.pendingOps.add({
        id:          clientId,
        table_name:  tableName,
        operation,
        record_id:   recordId,
        payload:     recordFull,
        apply_order: APPLY_ORDER[tableName] ?? 50,
        retry_count: 0,
        status:      'pending',
        created_at:  now,
      })
    } catch (queueErr) {
      // Si no se puede encolar, continuar igual (el registro ya está en IndexedDB)
      console.warn('[useAutoSave] pendingOps.add failed:', queueErr.message)
    }

    setSaving(false)

    // ── PASO 5: Commit a Supabase ─────────────────────────────────
    const cleanPayload = cleanRecord(recordFull, tableName)

    try {
      let supabaseError

      if (operation === 'INSERT') {
        const { error: e } = await supabase.from(tableName).insert(cleanPayload)
        supabaseError = e
      } else if (operation === 'UPDATE') {
        const { error: e } = await supabase
          .from(tableName)
          .update(cleanPayload)
          .eq('id', recordId)
        supabaseError = e
      } else if (operation === 'DELETE') {
        const { error: e } = await supabase
          .from(tableName)
          .delete()
          .eq('id', recordId)
        supabaseError = e
      }

      if (supabaseError) {
        console.error(`[useAutoSave] ${operation} ${tableName} falló:`, supabaseError.message, supabaseError.details, supabaseError.hint)
        throw new Error(supabaseError.message)
      }

      // ── Supabase OK: limpiar pendingOps y marcar como synced ─────
      await markSynced(tableName, recordId)
      await db.pendingOps
        .where('id')
        .equals(clientId)
        .delete()

      // ── Escribir event_log ────────────────────────────────────────
      if (!skipEventLog) {
        writeEventLog({
          action:        operation.toLowerCase(),
          resource_type: tableName,
          resource_id:   recordId,
          new_data:      cleanPayload,
          client_id:     clientId,
        }).catch(() => {}) // Non-critical, fire and forget
      }

      // ── Éxito ──────────────────────────────────────────────────
      const savedAt = new Date()
      setLastSaved(savedAt)
      setSyncStatus('saved')

      // Resetear a 'idle' después de 3s
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setSyncStatus('idle'), 3_000)

      onSuccess?.({ record: recordFull, savedAt })

    } catch (err) {
      // ── Supabase FALLÓ ────────────────────────────────────────────
      // El registro está seguro en IndexedDB + pendingOps.
      // syncEngine reintentará automáticamente.

      if (critical) {
        // ── PASO 6: Rollback si es crítico ────────────────────────
        try {
          await db[tableName]?.delete(recordId)
          await db.pendingOps.where('id').equals(clientId).delete()
        } catch (rollbackErr) {
          console.warn('[useAutoSave] Rollback failed:', rollbackErr.message)
        }

        setError(err.message)
        setSyncStatus('error')
        onError?.(err)
        return
      }

      // No crítico → pendiente, syncEngine lo procesa
      setSyncStatus('pending')

      // Intentar que syncEngine procese ahora si hay conexión
      forceSync().catch(() => {})

      // Para operaciones no críticas, el onSuccess se llama igual
      // (el usuario ya tiene el dato en UI y en IndexedDB)
      const savedAt = new Date()
      setLastSaved(savedAt)
      onSuccess?.({ record: recordFull, savedAt, pending: true })
    }
  }, [])

  return { save, saving, syncStatus, error, lastSaved }
}

// ─────────────────────────────────────────────────────────────
// HELPER: Escribir en event_log
// Fire-and-forget. No bloquea el flujo principal.
// ─────────────────────────────────────────────────────────────

async function writeEventLog({ action, resource_type, resource_id, new_data, client_id }) {
  try {
    await supabase.from('event_log').insert({
      action,
      resource_type,
      resource_id,
      new_data,
      client_id,
      sync_status: 'synced',
      created_at:  new Date().toISOString(),
    })
  } catch (err) {
    // event_log es auditoría, no es crítico
    console.debug('[useAutoSave] event_log write skipped:', err.message)
  }
}

// ─────────────────────────────────────────────────────────────
// HOOK ESPECIALIZADO: useDeleteRecord
// Para operaciones de eliminación con confirmación
// ─────────────────────────────────────────────────────────────

export function useDeleteRecord() {
  const { save, saving, syncStatus, error } = useAutoSave()

  const deleteRecord = useCallback(async (tableName, recordId, options = {}) => {
    return save(
      tableName,
      { id: recordId },
      { ...options, operation: 'DELETE', critical: true }
    )
  }, [save])

  return { deleteRecord, deleting: saving, syncStatus, error }
}

// ─────────────────────────────────────────────────────────────
// HOOK ESPECIALIZADO: useBulkSave
// Para operaciones que guardan múltiples registros relacionados (ej: remito + items)
// ─────────────────────────────────────────────────────────────

export function useBulkSave() {
  const [saving, setSaving]         = useState(false)
  const [syncStatus, setSyncStatus] = useState('idle')
  const [error, setError]           = useState(null)

  const bulkSave = useCallback(async (operations, options = {}) => {
    /**
     * operations: [{ table, record, operation? }]
     * Se ejecutan en secuencia para respetar apply_order.
     * Si una falla con critical=true, se hace rollback de todas.
     */
    setSaving(true)
    setSyncStatus('saving')
    setError(null)

    const { critical = false, onSuccess, onError } = options
    const completed = []

    try {
      for (const op of operations) {
        const now        = new Date().toISOString()
        const clientId   = uuid4()
        const recordId   = op.record.id ?? uuid4()
        const recordFull = {
          ...op.record,
          id:           recordId,
          updated_at:   now,
          _sync_status: 'pending',
          _client_id:   clientId,
        }

        // Escribir en IndexedDB
        await localUpsert(op.table, recordFull)

        // Encolar
        await db.pendingOps.add({
          id:          clientId,
          table_name:  op.table,
          operation:   op.operation ?? (op.record.id ? 'UPDATE' : 'INSERT'),
          record_id:   recordId,
          payload:     recordFull,
          apply_order: APPLY_ORDER[op.table] ?? 50,
          retry_count: 0,
          status:      'pending',
          created_at:  now,
        })

        completed.push({ table: op.table, id: recordId, clientId })
      }

      // Commit a Supabase en batch usando RPC o múltiples inserts
      // Por simplicidad y trazabilidad: insert secuencial con Promise.all
      const results = await Promise.allSettled(
        operations.map((op, i) => {
          const clean = cleanRecord({ ...op.record, id: completed[i].id }, op.table)
          const opType = op.operation ?? (op.record.id ? 'UPDATE' : 'INSERT')

          if (opType === 'INSERT') return supabase.from(op.table).insert(clean)
          if (opType === 'UPDATE') return supabase.from(op.table).update(clean).eq('id', clean.id)
          if (opType === 'DELETE') return supabase.from(op.table).delete().eq('id', clean.id)
        })
      )

      // Procesar resultados
      let anyFailed = false
      for (let i = 0; i < results.length; i++) {
        const result = results[i]
        const { table, id, clientId } = completed[i]

        if (result.status === 'fulfilled' && !result.value.error) {
          await markSynced(table, id)
          await db.pendingOps.where('id').equals(clientId).delete()
        } else {
          anyFailed = true
          console.warn(`[useBulkSave] Failed: ${table}/${id}`, result.reason ?? result.value?.error)
        }
      }

      if (!anyFailed) {
        setSyncStatus('saved')
        setTimeout(() => setSyncStatus('idle'), 3_000)
        onSuccess?.(completed)
      } else {
        setSyncStatus('pending')
        forceSync().catch(() => {})
        onSuccess?.(completed, { partial: true })
      }

    } catch (err) {
      if (critical) {
        // Rollback de todo lo que se completó
        for (const { table, id, clientId } of completed) {
          await db[table]?.delete(id).catch(() => {})
          await db.pendingOps.where('id').equals(clientId).delete().catch(() => {})
        }
        setError(err.message)
        setSyncStatus('error')
        onError?.(err)
      } else {
        setSyncStatus('pending')
        onSuccess?.(completed, { pending: true })
      }
    } finally {
      setSaving(false)
    }
  }, [])

  return { bulkSave, saving, syncStatus, error }
}
