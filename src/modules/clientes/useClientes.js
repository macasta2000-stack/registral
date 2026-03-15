/**
 * REGISTRAL — useClientes
 * src/modules/clientes/useClientes.js
 */

import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAutoSave, useBulkSave } from '../../core/engine/useAutoSave'
import { db } from '../../core/offline/db'
import { useAuth } from '../../core/auth/useAuth'
import { uuid4 } from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────

export function useClientes(filters = {}) {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!tenantId) return []
      const all = await db.entities
        .where('tenant_id')
        .equals(tenantId)
        .toArray()
      // Prefer entity_type='cliente', fallback to all active entities
      let arr = all.filter(e => e.entity_type === 'cliente')
      if (arr.length === 0) arr = [...all] // fallback if no entity_type set

      if (!filters.includeInactive) {
        arr = arr.filter(e => e.is_active !== false)
      }

      if (filters.search) {
        const q = filters.search.toLowerCase()
        arr = arr.filter(e =>
          e.name?.toLowerCase().includes(q) ||
          e.data?.cuit_dni?.toLowerCase().includes(q) ||
          e.code?.toLowerCase().includes(q)
        )
      }

      if (filters.withDebt) {
        arr = arr.filter(e => Number(e.balance) > 0)
      }

      return arr.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es-AR'))
    },
    [tenantId, filters.search, filters.withDebt, filters.includeInactive],
    []
  )
}

export function useCliente(id) {
  return useLiveQuery(
    async () => (id ? db.entities.get(id) : null),
    [id],
    null
  )
}

export function useClienteBalance(entityId) {
  const { tenantId } = useAuth()

  const movements = useLiveQuery(
    async () => {
      if (!entityId || !tenantId) return []
      const all = await db.accounts_receivable
        .where('[tenant_id+entity_id]')
        .equals([tenantId, entityId])
        .toArray()
      return all
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 10)
    },
    [tenantId, entityId],
    []
  )

  const entity = useCliente(entityId)

  return {
    balance:         entity?.balance ?? 0,
    creditLimit:     entity?.credit_limit ?? null,
    movements:       movements ?? [],
    isOverLimit:     entity?.credit_limit > 0 && (entity?.balance ?? 0) > entity?.credit_limit,
  }
}

// ─────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────

export function useClienteActions() {
  const { tenantId }         = useAuth()
  const { save, syncStatus } = useAutoSave()
  const { bulkSave }         = useBulkSave()

  const createCliente = useCallback(async (data) => {
    const now = new Date().toISOString()
    const entity = {
      id:          uuid4(),
      tenant_id:   tenantId,
      entity_type: 'cliente',
      code:        null, // se asigna número correlativo al sync
      name:        data.name,
      balance:     0,
      credit_limit:data.credit_limit ? Number(data.credit_limit) : null,
      tags:        [],
      is_active:   true,
      data: {
        cuit_dni:    data.cuit_dni     ?? '',
        telefono:    data.telefono     ?? '',
        email:       data.email        ?? '',
        direccion:   data.direccion    ?? '',
        tipo_cliente:data.tipo_cliente ?? 'Minorista',
        notas:       data.notas        ?? '',
      },
      created_at: now,
      updated_at: now,
    }

    return save('entities', entity, { operation: 'INSERT', critical: false })
  }, [tenantId, save])

  const updateCliente = useCallback(async (id, data) => {
    const current = await db.entities.get(id)
    if (!current) throw new Error('Cliente no encontrado')

    const updated = {
      ...current,
      name:         data.name ?? current.name,
      credit_limit: data.credit_limit !== undefined ? Number(data.credit_limit) : current.credit_limit,
      data: {
        ...current.data,
        ...data,
      },
      updated_at: new Date().toISOString(),
    }

    return save('entities', updated, { operation: 'UPDATE', critical: false })
  }, [save])

  const deleteCliente = useCallback(async (id) => {
    const current = await db.entities.get(id)
    if (!current) return
    return save('entities', { ...current, is_active: false, updated_at: new Date().toISOString() }, {
      operation: 'UPDATE', critical: false,
    })
  }, [save])

  /**
   * Registra un pago en cuenta corriente.
   * Crea un ar_movement + actualiza el balance en la entidad.
   */
  const registrarPago = useCallback(async (entityId, amount, notes = '') => {
    const entity = await db.entities.get(entityId)
    if (!entity) throw new Error('Cliente no encontrado')

    const payAmount  = Number(amount)
    const newBalance = Number(entity.balance) - payAmount
    const now        = new Date().toISOString()

    const arMovement = {
      id:           uuid4(),
      tenant_id:    tenantId,
      entity_id:    entityId,
      transaction_id: null,
      movement_type: 'pago',
      amount:       -payAmount,        // negativo = pago
      balance_after: newBalance,
      due_date:     null,
      is_paid:      true,
      paid_at:      now,
      notes:        notes || null,
      created_at:   now,
      _client_id:   uuid4(),
    }

    const updatedEntity = {
      ...entity,
      balance:    newBalance,
      updated_at: now,
    }

    return bulkSave([
      { table: 'accounts_receivable', record: arMovement,    operation: 'INSERT' },
      { table: 'entities',            record: updatedEntity, operation: 'UPDATE' },
    ], { critical: false })
  }, [tenantId, bulkSave])

  return { createCliente, updateCliente, deleteCliente, registrarPago, syncStatus }
}
