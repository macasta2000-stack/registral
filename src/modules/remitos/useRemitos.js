/**
 * REGISTRAL — useRemitos
 * src/modules/remitos/useRemitos.js
 *
 * Lógica de negocio completa para remitos:
 * - Creación con número correlativo (offline-safe)
 * - Confirmación con descuento de stock + carga en AR si es CC
 * - Entrega, cobro y cancelación con reversión de stock
 */

import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAutoSave, useBulkSave } from '../../core/engine/useAutoSave'
import { supabase }  from '../../core/supabase/client'
import { db }        from '../../core/offline/db'
import { useAuth }   from '../../core/auth/useAuth'
import { uuid4 }     from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// NÚMERO CORRELATIVO OFFLINE-SAFE
// ─────────────────────────────────────────────────────────────

async function getNextRemitoNumber(tenantId) {
  // Intentar Supabase RPC (requiere conexión)
  try {
    const { data, error } = await supabase.rpc('next_sequence', {
      p_tenant_id: tenantId,
      p_key:       'remito',
    })
    if (!error && data) return data
  } catch { /* offline */ }

  // Fallback offline: número temporal único por timestamp
  return `REM-TEMP-${Date.now()}`
}

// ─────────────────────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────────────────────

export function useRemitos(filters = {}) {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!tenantId) return []

      let arr = await db.transactions
        .where('[tenant_id+transaction_type]')
        .equals([tenantId, 'remito'])
        .toArray()

      if (filters.status && filters.status !== 'all') {
        arr = arr.filter(t => t.status === filters.status)
      }

      if (filters.search) {
        const q = filters.search.toLowerCase()
        // Buscar también por nombre de cliente (join en memoria)
        const entityIds = new Set()
        const entities  = await db.entities.where('tenant_id').equals(tenantId).toArray()
        entities.filter(e => e.name?.toLowerCase().includes(q)).forEach(e => entityIds.add(e.id))

        arr = arr.filter(t =>
          t.number?.toLowerCase().includes(q) ||
          entityIds.has(t.entity_id)
        )
      }

      // Ordenar por fecha desc
      return arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    },
    [tenantId, filters.status, filters.search],
    []
  )
}

export function useRemito(id) {
  const { tenantId } = useAuth()

  const remito = useLiveQuery(
    async () => (id ? db.transactions.get(id) : null),
    [id],
    null
  )

  const items = useLiveQuery(
    async () => {
      if (!id) return []
      return db.transaction_items.where('transaction_id').equals(id).toArray()
    },
    [id],
    []
  )

  const entity = useLiveQuery(
    async () => {
      if (!remito?.entity_id) return null
      return db.entities.get(remito.entity_id)
    },
    [remito?.entity_id],
    null
  )

  return { remito, items: items ?? [], entity }
}

// ─────────────────────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────────────────────

export function useRemitoActions() {
  const { tenantId, user }   = useAuth()
  const { save, syncStatus } = useAutoSave()
  const { bulkSave }         = useBulkSave()

  /**
   * Crea un remito en estado 'draft' con sus ítems.
   * No descuenta stock hasta confirmRemito().
   */
  const createRemito = useCallback(async (remitoData, items) => {
    const remitoId = uuid4()
    const number   = await getNextRemitoNumber(tenantId)
    const now      = new Date().toISOString()

    // Calcular totales (discount nunca puede exceder subtotal)
    const subtotal = items.reduce((sum, it) => sum + Number(it.subtotal ?? 0), 0)
    const discount = Math.min(Number(remitoData.discount ?? 0), subtotal)
    const tax      = 0
    const total    = Math.max(0, subtotal - discount + tax)

    const remito = {
      id:               remitoId,
      tenant_id:        tenantId,
      transaction_type: 'remito',
      number,
      entity_id:        remitoData.entity_id,
      status:           'draft',
      subtotal,
      discount,
      tax,
      total,
      paid_amount:      0,
      payment_method:   remitoData.payment_method ?? null,
      notes:            remitoData.notes          ?? null,
      data: {
        con_flete:          remitoData.con_flete          ?? false,
        direccion_entrega:  remitoData.direccion_entrega  ?? '',
        chofer:             remitoData.chofer             ?? '',
        remito_externo_nro: remitoData.remito_externo_nro ?? '',
      },
      created_by:   user?.id ?? null,
      confirmed_at: null,
      delivered_at: null,
      paid_at:      null,
      due_date:     null,
      created_at:   now,
      updated_at:   now,
    }

    const itemOps = items.map((item, idx) => ({
      table: 'transaction_items',
      operation: 'INSERT',
      record: {
        id:             uuid4(),
        tenant_id:      tenantId,
        transaction_id: remitoId,
        product_id:     item.product_id ?? null,
        description:    item.description,
        unit_type:      item.unit_type,
        quantity:       Number(item.quantity),
        unit_price:     Number(item.unit_price),
        discount_pct:   Number(item.discount_pct ?? 0),
        subtotal:       Number(item.subtotal),
        data:           {},
        created_at:     now,
        _order:         idx,
      },
    }))

    return bulkSave([
      { table: 'transactions', record: remito, operation: 'INSERT' },
      ...itemOps,
    ], { critical: false })
  }, [tenantId, user?.id, bulkSave])

  /**
   * Confirma un remito:
   * - Cambia status a 'confirmed'
   * - Genera stock_movements (salida por ítem)
   * - Si payment_method = 'Cuenta corriente' → genera ar_movement (cargo)
   */
  const confirmRemito = useCallback(async (id) => {
    const remito  = await db.transactions.get(id)
    const items   = await db.transaction_items.where('transaction_id').equals(id).toArray()
    if (!remito || items.length === 0) throw new Error('Remito no encontrado o sin ítems')
    if (remito.status !== 'draft') throw new Error(`No se puede confirmar un remito en estado "${remito.status}"`)

    const now  = new Date().toISOString()
    const ops  = []

    // 1. Actualizar el remito
    ops.push({
      table: 'transactions',
      operation: 'UPDATE',
      record: { ...remito, status: 'confirmed', confirmed_at: now, updated_at: now },
    })

    // 2. Stock movements: una salida por cada ítem con product_id
    for (const item of items) {
      if (!item.product_id) continue

      const product = await db.products.get(item.product_id)
      if (!product) continue

      const stockBefore = Number(product.stock_current ?? 0)
      const qty         = Number(item.quantity)
      const stockAfter  = stockBefore - qty  // Allow negative (backorder) — dashboard will alert

      ops.push({
        table: 'stock_movements',
        operation: 'INSERT',
        record: {
          id:            uuid4(),
          tenant_id:     tenantId,
          product_id:    item.product_id,
          movement_type: 'salida',
          quantity:      qty,
          stock_before:  stockBefore,
          stock_after:   stockAfter,
          transaction_id:id,
          reason:        `Remito ${remito.number}`,
          created_by:    user?.id ?? null,
          created_at:    now,
          _client_id:    uuid4(),
        },
      })

      // Actualizar stock del producto
      ops.push({
        table: 'products',
        operation: 'UPDATE',
        record: {
          ...product,
          stock_current:       stockAfter,
          updated_at:          now,
          _stock_at_disconnect: stockBefore,
        },
      })
    }

    // 3. Cuenta corriente: si el pago es CC → cargo en AR
    if (remito.payment_method === 'Cuenta corriente' && remito.entity_id) {
      const entity   = await db.entities.get(remito.entity_id)
      const newBalance = Number(entity?.balance ?? 0) + Number(remito.total)

      ops.push({
        table: 'accounts_receivable',
        operation: 'INSERT',
        record: {
          id:            uuid4(),
          tenant_id:     tenantId,
          entity_id:     remito.entity_id,
          transaction_id:id,
          movement_type: 'cargo',
          amount:        Number(remito.total),
          balance_after: newBalance,
          due_date:      null,
          is_paid:       false,
          paid_at:       null,
          notes:         `Remito ${remito.number}`,
          created_at:    now,
          _client_id:    uuid4(),
        },
      })

      if (entity) {
        ops.push({
          table: 'entities',
          operation: 'UPDATE',
          record: { ...entity, balance: newBalance, updated_at: now },
        })
      }
    }

    return bulkSave(ops, { critical: false })
  }, [tenantId, user?.id, bulkSave])

  /**
   * Marca el remito como entregado.
   */
  const deliverRemito = useCallback(async (id) => {
    const remito = await db.transactions.get(id)
    if (!remito) throw new Error('Remito no encontrado')

    return save('transactions', {
      ...remito,
      status:       'delivered',
      delivered_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }, { operation: 'UPDATE', critical: false })
  }, [save])

  /**
   * Registra el cobro del remito.
   * Si ya estaba en CC (cargo en AR ya existe), solo actualiza el remito.
   * Si no era CC, también crea el movimiento de AR.
   */
  const payRemito = useCallback(async (id, amount, method) => {
    const remito = await db.transactions.get(id)
    if (!remito) throw new Error('Remito no encontrado')

    const now = new Date().toISOString()
    const paidAmount = Math.min(Number(amount ?? remito.total), Number(remito.total))
    if (paidAmount <= 0) throw new Error('El monto de cobro debe ser mayor a 0')
    const ops = []

    const updatedRemito = {
      ...remito,
      status:         'paid',
      paid_amount:    paidAmount,
      payment_method: method ?? remito.payment_method,
      paid_at:        now,
      updated_at:     now,
    }
    ops.push({ table: 'transactions', operation: 'UPDATE', record: updatedRemito })

    // Si era CC → registrar el pago en AR y actualizar saldo del cliente
    if (remito.payment_method === 'Cuenta corriente' && remito.entity_id) {
      const entity     = await db.entities.get(remito.entity_id)
      const newBalance = Math.max(0, Number(entity?.balance ?? 0) - paidAmount)

      ops.push({
        table: 'accounts_receivable',
        operation: 'INSERT',
        record: {
          id:            uuid4(),
          tenant_id:     tenantId,
          entity_id:     remito.entity_id,
          transaction_id:id,
          movement_type: 'pago',
          amount:        -paidAmount,
          balance_after: newBalance,
          is_paid:       true,
          paid_at:       now,
          notes:         `Cobro remito ${remito.number} — ${method ?? remito.payment_method}`,
          created_at:    now,
          _client_id:    uuid4(),
        },
      })

      if (entity) {
        ops.push({
          table: 'entities',
          operation: 'UPDATE',
          record: { ...entity, balance: newBalance, updated_at: now },
        })
      }
    }

    return bulkSave(ops, { critical: false })
  }, [tenantId, bulkSave])

  /**
   * Cancela un remito y revierte el stock si estaba confirmado.
   */
  const cancelRemito = useCallback(async (id) => {
    const remito = await db.transactions.get(id)
    if (!remito) throw new Error('Remito no encontrado')
    if (remito.status === 'paid') throw new Error('No se puede anular un remito ya cobrado')

    const now = new Date().toISOString()
    const ops = []

    // Actualizar el remito
    ops.push({
      table: 'transactions',
      operation: 'UPDATE',
      record: { ...remito, status: 'cancelled', updated_at: now },
    })

    // Si estaba confirmado, revertir el stock
    if (remito.status === 'confirmed' || remito.status === 'delivered') {
      const items = await db.transaction_items.where('transaction_id').equals(id).toArray()

      for (const item of items) {
        if (!item.product_id) continue
        const product = await db.products.get(item.product_id)
        if (!product) continue

        const stockBefore = Number(product.stock_current)
        const qty         = Number(item.quantity)
        const stockAfter  = stockBefore + qty

        ops.push({
          table: 'stock_movements',
          operation: 'INSERT',
          record: {
            id:            uuid4(),
            tenant_id:     tenantId,
            product_id:    item.product_id,
            movement_type: 'devolucion',
            quantity:      qty,
            stock_before:  stockBefore,
            stock_after:   stockAfter,
            transaction_id:id,
            reason:        `Anulación remito ${remito.number}`,
            created_by:    user?.id ?? null,
            created_at:    now,
            _client_id:    uuid4(),
          },
        })

        ops.push({
          table: 'products',
          operation: 'UPDATE',
          record: {
            ...product,
            stock_current: stockAfter,
            updated_at:    now,
            _stock_at_disconnect: stockBefore,
          },
        })
      }

      // Si había cargo en CC, crear nota de crédito
      if (remito.payment_method === 'Cuenta corriente' && remito.entity_id) {
        const entity     = await db.entities.get(remito.entity_id)
        const newBalance = Number(entity?.balance ?? 0) - Number(remito.total)

        ops.push({
          table: 'accounts_receivable',
          operation: 'INSERT',
          record: {
            id:            uuid4(),
            tenant_id:     tenantId,
            entity_id:     remito.entity_id,
            transaction_id:id,
            movement_type: 'nota_credito',
            amount:        -Number(remito.total),
            balance_after: newBalance,
            is_paid:       true,
            paid_at:       now,
            notes:         `Anulación remito ${remito.number}`,
            created_at:    now,
            _client_id:    uuid4(),
          },
        })

        if (entity) {
          ops.push({
            table: 'entities',
            operation: 'UPDATE',
            record: { ...entity, balance: Math.max(0, newBalance), updated_at: now },
          })
        }
      }
    }

    return bulkSave(ops, { critical: false })
  }, [tenantId, user?.id, bulkSave])

  return {
    createRemito, confirmRemito, deliverRemito, payRemito, cancelRemito, syncStatus,
  }
}
