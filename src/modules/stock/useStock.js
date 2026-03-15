/**
 * REGISTRAL — useStock
 * src/modules/stock/useStock.js
 *
 * Hooks para operaciones de stock.
 * Sin imports de Supabase — todo via useAutoSave/useBulkSave/useLiveQuery.
 */

import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAutoSave, useBulkSave, useDeleteRecord } from '../../core/engine/useAutoSave'
import { db } from '../../core/offline/db'
import { useAuth } from '../../core/auth/useAuth'
import { uuid4 } from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// useProducts
// ─────────────────────────────────────────────────────────────

/**
 * @param {Object} filters
 *   filters.search      → filtra por name o code
 *   filters.category    → filtra por category
 *   filters.lowStockOnly → solo productos bajo mínimo
 */
export function useProducts(filters = {}) {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!tenantId) return []

      let collection = db.products
        .where('tenant_id')
        .equals(tenantId)

      let arr = await collection.toArray()

      // Aplicar filtros en memoria (Dexie filter es síncrono sobre el resultado)
      if (filters.search) {
        const q = filters.search.toLowerCase()
        arr = arr.filter(p =>
          p.name?.toLowerCase().includes(q) ||
          p.code?.toLowerCase().includes(q)
        )
      }

      if (filters.category) {
        arr = arr.filter(p => p.category === filters.category)
      }

      if (filters.lowStockOnly) {
        arr = arr.filter(p =>
          Number(p.stock_current) <= Number(p.stock_minimum) && p.is_active !== false
        )
      }

      // Solo activos por defecto (a menos que se pida explícitamente inactivos)
      if (!filters.includeInactive) {
        arr = arr.filter(p => p.is_active !== false)
      }

      // Ordenar por nombre
      return arr.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'es-AR'))
    },
    [tenantId, filters.search, filters.category, filters.lowStockOnly, filters.includeInactive],
    []
  )
}

// ─────────────────────────────────────────────────────────────
// useLowStockProducts
// ─────────────────────────────────────────────────────────────

export function useLowStockProducts() {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!tenantId) return []
      const all = await db.products.where('tenant_id').equals(tenantId).toArray()
      return all.filter(p =>
        p.is_active !== false &&
        Number(p.stock_current) <= Number(p.stock_minimum)
      )
    },
    [tenantId],
    []
  )
}

// ─────────────────────────────────────────────────────────────
// useProduct (individual)
// ─────────────────────────────────────────────────────────────

export function useProduct(id) {
  return useLiveQuery(
    async () => {
      if (!id) return null
      return db.products.get(id)
    },
    [id],
    null
  )
}

// ─────────────────────────────────────────────────────────────
// useStockMovements (historial de movimientos de un producto)
// ─────────────────────────────────────────────────────────────

export function useStockMovements(productId, limit = 10) {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!productId || !tenantId) return []
      const all = await db.stock_movements
        .where('[tenant_id+product_id]')
        .equals([tenantId, productId])
        .reverse()
        .toArray()
      return all.slice(0, limit)
    },
    [tenantId, productId, limit],
    []
  )
}

// ─────────────────────────────────────────────────────────────
// HOOKS DE MUTACIÓN
// ─────────────────────────────────────────────────────────────

export function useStockActions() {
  const { tenantId, user }    = useAuth()
  const { save, syncStatus }  = useAutoSave()
  const { bulkSave }          = useBulkSave()
  const { deleteRecord }      = useDeleteRecord()

  /**
   * Crea un producto nuevo + movimiento de stock inicial.
   */
  const createProduct = useCallback(async (data) => {
    const productId = uuid4()
    const now       = new Date().toISOString()

    const product = {
      id:            productId,
      tenant_id:     tenantId,
      code:          data.code || null,
      name:          data.name,
      description:   data.description || null,
      category:      data.category || null,
      unit_type:     data.unit_type || 'unidad',
      price:         Number(data.price) || 0,
      price_bulk:    data.price_bulk ? Number(data.price_bulk) : null,
      bulk_threshold:data.bulk_threshold ? Number(data.bulk_threshold) : null,
      cost:          data.cost ? Number(data.cost) : null,
      stock_current: Number(data.stock_current) || 0,
      stock_minimum: Number(data.stock_minimum) || 0,
      stock_location:data.stock_location || null,
      supplier:      data.supplier || null,
      data:          {},
      is_active:     true,
      created_at:    now,
      updated_at:    now,
    }

    const operations = [
      { table: 'products', record: product, operation: 'INSERT' },
    ]

    // Si tiene stock inicial > 0, crear movimiento de entrada
    if (product.stock_current > 0) {
      const movement = {
        id:            uuid4(),
        tenant_id:     tenantId,
        product_id:    productId,
        movement_type: 'entrada',
        quantity:      product.stock_current,
        stock_before:  0,
        stock_after:   product.stock_current,
        transaction_id:null,
        reason:        'Carga inicial',
        created_by:    user?.id ?? null,
        created_at:    now,
        _client_id:    uuid4(),
      }
      operations.push({ table: 'stock_movements', record: movement, operation: 'INSERT' })
    }

    return bulkSave(operations, { critical: false })
  }, [tenantId, user?.id, bulkSave])

  /**
   * Actualiza un producto existente.
   * NO modifica stock_current directamente — usar adjustStock.
   */
  const updateProduct = useCallback(async (id, data) => {
    const current = await db.products.get(id)
    if (!current) throw new Error('Producto no encontrado')

    const updated = {
      ...current,
      ...data,
      id,
      tenant_id:  tenantId,
      updated_at: new Date().toISOString(),
      // Proteger stock_current — solo se modifica via adjustStock
      stock_current: current.stock_current,
    }

    return save('products', updated, { operation: 'UPDATE', critical: false })
  }, [tenantId, save])

  /**
   * Registra un movimiento de stock y actualiza el producto.
   * @param {string} productId
   * @param {number} quantity  — cantidad positiva del movimiento
   * @param {'entrada'|'salida'|'ajuste'|'devolucion'} movementType
   * @param {string} reason
   */
  const adjustStock = useCallback(async (productId, quantity, movementType, reason) => {
    const product = await db.products.get(productId)
    if (!product) throw new Error('Producto no encontrado')

    const qty = Number(quantity)
    const stockBefore = Number(product.stock_current)

    // Calcular stock_after según tipo de movimiento
    let stockAfter
    if (movementType === 'entrada' || movementType === 'devolucion') {
      stockAfter = stockBefore + qty
    } else if (movementType === 'salida') {
      stockAfter = Math.max(0, stockBefore - qty)
    } else {
      // 'ajuste': quantity es el nuevo valor absoluto
      stockAfter = Math.max(0, qty)
    }

    const now = new Date().toISOString()
    const movId = uuid4()

    const movement = {
      id:            movId,
      tenant_id:     tenantId,
      product_id:    productId,
      movement_type: movementType,
      quantity:      qty,
      stock_before:  stockBefore,
      stock_after:   stockAfter,
      transaction_id:null,
      reason:        reason || null,
      created_by:    user?.id ?? null,
      created_at:    now,
      _client_id:    uuid4(),
    }

    const updatedProduct = {
      ...product,
      stock_current: stockAfter,
      updated_at:    now,
      // Guardar stock al momento de la operación para STOCK_SAFE en conflictos
      _stock_at_disconnect: stockBefore,
    }

    return bulkSave([
      { table: 'stock_movements', record: movement,        operation: 'INSERT' },
      { table: 'products',        record: updatedProduct,  operation: 'UPDATE' },
    ], { critical: false })
  }, [tenantId, user?.id, bulkSave])

  /**
   * Soft delete: is_active = false
   */
  const deleteProduct = useCallback(async (id) => {
    const current = await db.products.get(id)
    if (!current) return
    return save('products', { ...current, is_active: false, updated_at: new Date().toISOString() }, {
      operation: 'UPDATE',
      critical:  false,
    })
  }, [save])

  return { createProduct, updateProduct, adjustStock, deleteProduct, syncStatus }
}
