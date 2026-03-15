/**
 * REGISTRAL — useCaja
 * src/modules/caja/useCaja.js
 *
 * Hooks para operaciones de caja (sesiones y movimientos).
 * Sin imports de Supabase — todo via useAutoSave/useBulkSave/useLiveQuery.
 */

import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAutoSave, useBulkSave } from '../../core/engine/useAutoSave'
import { db } from '../../core/offline/db'
import { useAuth } from '../../core/auth/useAuth'
import { uuid4 } from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// useCurrentSession
// Obtiene la sesión de caja actualmente abierta (status = 'open')
// ─────────────────────────────────────────────────────────────

export function useCurrentSession() {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!tenantId) return null
      const sessions = await db.caja_sessions
        .where('[tenant_id+status]')
        .equals([tenantId, 'open'])
        .toArray()
      // Solo debería haber una sesión abierta a la vez
      return sessions.length > 0 ? sessions[0] : null
    },
    [tenantId],
    undefined // undefined = loading, null = no session
  )
}

// ─────────────────────────────────────────────────────────────
// useCajaMovements
// Obtiene movimientos de una sesión específica
// ─────────────────────────────────────────────────────────────

export function useCajaMovements(sessionId) {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!sessionId || !tenantId) return []
      const movements = await db.caja_movements
        .where('[tenant_id+session_id]')
        .equals([tenantId, sessionId])
        .toArray()
      // Ordenar por fecha de creación descendente
      return movements.sort((a, b) =>
        (b.created_at ?? '').localeCompare(a.created_at ?? '')
      )
    },
    [tenantId, sessionId],
    []
  )
}

// ─────────────────────────────────────────────────────────────
// useCajaHistory
// Obtiene sesiones cerradas (historial)
// ─────────────────────────────────────────────────────────────

export function useCajaHistory(limit = 20) {
  const { tenantId } = useAuth()

  return useLiveQuery(
    async () => {
      if (!tenantId) return []
      const sessions = await db.caja_sessions
        .where('[tenant_id+status]')
        .equals([tenantId, 'closed'])
        .toArray()
      // Ordenar por fecha de cierre descendente
      return sessions
        .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''))
        .slice(0, limit)
    },
    [tenantId, limit],
    []
  )
}

// ─────────────────────────────────────────────────────────────
// HOOKS DE MUTACIÓN
// ─────────────────────────────────────────────────────────────

export function useCajaActions() {
  const { tenantId, user } = useAuth()
  const { save, syncStatus } = useAutoSave()
  const { bulkSave } = useBulkSave()

  /**
   * Abre una nueva sesión de caja.
   * @param {number} openingBalance - Saldo inicial
   */
  const openSession = useCallback(async (openingBalance) => {
    const sessionId = uuid4()
    const now = new Date().toISOString()

    const session = {
      id:              sessionId,
      tenant_id:       tenantId,
      status:          'open',
      opening_balance: Number(openingBalance) || 0,
      current_balance: Number(openingBalance) || 0,
      total_ingresos:  0,
      total_egresos:   0,
      closing_balance: null,
      actual_balance:  null,
      difference:      null,
      closing_notes:   null,
      opened_by:       user?.id ?? null,
      opened_by_name:  user?.email ?? user?.name ?? 'Usuario',
      closed_by:       null,
      closed_by_name:  null,
      opened_at:       now,
      closed_at:       null,
      created_at:      now,
      updated_at:      now,
    }

    return save('caja_sessions', session, { operation: 'INSERT', critical: false })
  }, [tenantId, user, save])

  /**
   * Cierra la sesión actual de caja.
   * @param {string} sessionId
   * @param {number} actualBalance - Saldo contado
   * @param {string} notes - Notas de cierre
   */
  const closeSession = useCallback(async (sessionId, actualBalance, notes) => {
    const session = await db.caja_sessions.get(sessionId)
    if (!session) throw new Error('Sesión no encontrada')

    const now = new Date().toISOString()
    const expectedBalance = session.current_balance
    const actual = Number(actualBalance) || 0
    const diff = actual - expectedBalance

    const updated = {
      ...session,
      status:          'closed',
      closing_balance: expectedBalance,
      actual_balance:  actual,
      difference:      diff,
      closing_notes:   notes || null,
      closed_by:       user?.id ?? null,
      closed_by_name:  user?.email ?? user?.name ?? 'Usuario',
      closed_at:       now,
      updated_at:      now,
    }

    return save('caja_sessions', updated, { operation: 'UPDATE', critical: false })
  }, [user, save])

  /**
   * Agrega un movimiento a la sesión actual y actualiza el saldo.
   * @param {string} sessionId
   * @param {Object} data - { movement_type, amount, category, description, payment_method }
   */
  const addMovement = useCallback(async (sessionId, data) => {
    const session = await db.caja_sessions.get(sessionId)
    if (!session) throw new Error('Sesión no encontrada')

    const now = new Date().toISOString()
    const amount = Math.abs(Number(data.amount) || 0)
    const isIngreso = data.movement_type === 'ingreso'

    const movement = {
      id:              uuid4(),
      tenant_id:       tenantId,
      session_id:      sessionId,
      movement_type:   data.movement_type, // 'ingreso' | 'egreso'
      amount:          amount,
      category:        data.category || null,
      description:     data.description || null,
      payment_method:  data.payment_method || 'efectivo',
      balance_before:  session.current_balance,
      balance_after:   isIngreso
        ? session.current_balance + amount
        : session.current_balance - amount,
      created_by:      user?.id ?? null,
      created_by_name: user?.email ?? user?.name ?? 'Usuario',
      created_at:      now,
      _client_id:      uuid4(),
    }

    const updatedSession = {
      ...session,
      current_balance: movement.balance_after,
      total_ingresos:  isIngreso
        ? (session.total_ingresos || 0) + amount
        : session.total_ingresos || 0,
      total_egresos:   !isIngreso
        ? (session.total_egresos || 0) + amount
        : session.total_egresos || 0,
      updated_at:      now,
    }

    return bulkSave([
      { table: 'caja_movements', record: movement,        operation: 'INSERT' },
      { table: 'caja_sessions',  record: updatedSession,  operation: 'UPDATE' },
    ], { critical: false })
  }, [tenantId, user, bulkSave])

  return { openSession, closeSession, addMovement, syncStatus }
}
