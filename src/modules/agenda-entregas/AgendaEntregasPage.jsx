/**
 * REGISTRAL — AgendaEntregasPage
 * src/modules/agenda-entregas/AgendaEntregasPage.jsx
 *
 * Calendario semanal de entregas/turnos programados.
 * Vista semana en desktop, vista dia en mobile.
 * Status: pendiente, en_camino, entregado, cancelado.
 */

import { useState, useMemo, useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '../../core/auth/useAuth'
import { useAutoSave } from '../../core/engine/useAutoSave'
import { db } from '../../core/offline/db'
import { useDocumentTitle } from '../../shared/ui/useDocumentTitle'
import {
  PageHeader, PrimaryButton, ModalSheet, EmptyState,
  formatDate, formatDateTime, uuid4,
} from '../../shared/ui/index'

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pendiente:  { label: 'Pendiente',  bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '🕐' },
  en_camino:  { label: 'En camino',  bg: 'bg-blue-100',   text: 'text-blue-700',   icon: '🚚' },
  entregado:  { label: 'Entregado',  bg: 'bg-green-100',  text: 'text-green-700',  icon: '✅' },
  cancelado:  { label: 'Cancelado',  bg: 'bg-red-100',    text: 'text-red-600',    icon: '❌' },
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado']

// ─────────────────────────────────────────────────────────────
// DATE HELPERS
// ─────────────────────────────────────────────────────────────

function getWeekDates(baseDate) {
  const d = new Date(baseDate)
  const dayOfWeek = d.getDay()
  const monday = new Date(d)
  monday.setDate(d.getDate() - ((dayOfWeek + 6) % 7))
  monday.setHours(0, 0, 0, 0)

  const days = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday)
    day.setDate(monday.getDate() + i)
    days.push(day)
  }
  return days
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
}

function formatDayShort(date) {
  return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

// ─────────────────────────────────────────────────────────────
// DATA HOOK
// ─────────────────────────────────────────────────────────────

function useSchedules(weekDates) {
  const { tenantId } = useAuth()

  const schedules = useLiveQuery(
    async () => {
      if (!tenantId || !weekDates.length) return null
      const all = await db.schedules
        .where('tenant_id')
        .equals(tenantId)
        .toArray()
      return all
    },
    [tenantId, weekDates[0]?.toISOString()],
    null
  )

  // Also load entity names for display
  const entities = useLiveQuery(
    async () => {
      if (!tenantId) return {}
      const arr = await db.entities
        .where('[tenant_id+entity_type]')
        .equals([tenantId, 'cliente'])
        .toArray()
      const map = {}
      arr.forEach(e => { map[e.id] = e })
      return map
    },
    [tenantId],
    {}
  )

  return { schedules, entities }
}

// ─────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────

export default function AgendaEntregasPage() {
  useDocumentTitle('Agenda de Entregas')
  const { tenantId } = useAuth()
  const { save } = useAutoSave()

  const today = new Date()
  const [baseDate, setBaseDate] = useState(today)
  const [selectedDay, setSelectedDay] = useState(today)
  const [showModal, setShowModal] = useState(false)

  const weekDates = useMemo(() => getWeekDates(baseDate), [baseDate.toDateString()])
  const { schedules, entities } = useSchedules(weekDates)
  const loading = schedules === null

  // ── Group schedules by day ──
  const byDay = useMemo(() => {
    if (!schedules) return {}
    const map = {}
    weekDates.forEach(d => {
      const key = d.toDateString()
      map[key] = []
    })
    schedules.forEach(s => {
      if (!s.scheduled_at) return
      const d = new Date(s.scheduled_at)
      const key = d.toDateString()
      if (map[key]) {
        map[key].push(s)
      }
    })
    // Sort each day by time
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
    })
    return map
  }, [schedules, weekDates])

  // ── Stats ──
  const todaySchedules = byDay[today.toDateString()] ?? []
  const pendingToday = todaySchedules.filter(s => s.status === 'pendiente').length
  const totalWeek = schedules?.length ?? 0

  // ── Navigation ──
  const prevWeek = () => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() - 7)
    setBaseDate(d)
  }
  const nextWeek = () => {
    const d = new Date(baseDate)
    d.setDate(d.getDate() + 7)
    setBaseDate(d)
  }
  const goToday = () => {
    setBaseDate(new Date())
    setSelectedDay(new Date())
  }

  // ── Quick status change ──
  const changeStatus = useCallback(async (schedule, newStatus) => {
    const updated = {
      ...schedule,
      status: newStatus,
      updated_at: new Date().toISOString(),
    }
    if (newStatus === 'entregado') {
      updated.completed_at = new Date().toISOString()
    }
    await save('schedules', updated, { operation: 'UPDATE', critical: false })
  }, [save])

  // ── Create new schedule ──
  const createSchedule = useCallback(async (data) => {
    const now = new Date().toISOString()
    const record = {
      id: uuid4(),
      tenant_id: tenantId,
      schedule_type: 'entrega',
      entity_id: data.entity_id || null,
      status: 'pendiente',
      scheduled_at: data.scheduled_at,
      notes: data.notes || '',
      description: data.description || '',
      address: data.address || '',
      data: {},
      created_at: now,
      updated_at: now,
    }
    await save('schedules', record, { operation: 'INSERT', critical: false })
    setShowModal(false)
  }, [tenantId, save])

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Agenda de Entregas"
        subtitle={loading ? 'Cargando...' : `${pendingToday} pendientes hoy · ${totalWeek} esta semana`}
        action={<PrimaryButton onClick={() => setShowModal(true)}>+ Entrega</PrimaryButton>}
      />

      {/* ── Week Navigation ── */}
      <div className="px-4 py-2 flex items-center gap-2">
        <button onClick={prevWeek} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
          ←
        </button>
        <button onClick={goToday} className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-600 hover:bg-gray-50 transition font-medium">
          Hoy
        </button>
        <button onClick={nextWeek} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:bg-gray-50 transition">
          →
        </button>
        <span className="ml-2 text-sm text-gray-500 font-medium">
          {weekDates[0] && formatDayShort(weekDates[0])} — {weekDates[6] && formatDayShort(weekDates[6])}
        </span>
      </div>

      {/* ── Day selector (desktop & mobile) ── */}
      <div className="px-4 py-2 flex gap-1.5 overflow-x-auto">
        {weekDates.map((d, i) => {
          const isToday = isSameDay(d, today)
          const isSelected = isSameDay(d, selectedDay)
          const dayItems = byDay[d.toDateString()] ?? []
          const hasPending = dayItems.some(s => s.status === 'pendiente')
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(d)}
              className={`
                flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl border transition min-w-[56px]
                ${isSelected
                  ? 'bg-amber-500 border-amber-500 text-white shadow-sm'
                  : isToday
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}
              `}
            >
              <span className="text-[10px] font-medium uppercase">{DAYS[d.getDay()]}</span>
              <span className="text-lg font-bold leading-tight">{d.getDate()}</span>
              {dayItems.length > 0 && (
                <span className={`text-[10px] font-semibold ${isSelected ? 'text-white/80' : hasPending ? 'text-amber-600' : 'text-gray-400'}`}>
                  {dayItems.length}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 px-4 pb-4 mt-2">
        {loading ? (
          <SkeletonList />
        ) : (
          <>
            {/* ── Desktop: Week Grid ── */}
            <div className="hidden lg:grid grid-cols-7 gap-2">
              {weekDates.map((d, i) => {
                const isToday = isSameDay(d, today)
                const dayItems = byDay[d.toDateString()] ?? []
                return (
                  <div
                    key={i}
                    className={`
                      rounded-2xl border p-3 min-h-[200px]
                      ${isToday ? 'border-amber-300 bg-amber-50/50' : 'border-gray-100 bg-white'}
                    `}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-xs font-semibold ${isToday ? 'text-amber-700' : 'text-gray-400'}`}>
                        {DAYS[d.getDay()]} {d.getDate()}
                      </span>
                      {dayItems.length > 0 && (
                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full font-medium">
                          {dayItems.length}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      {dayItems.map(s => (
                        <ScheduleCard
                          key={s.id}
                          schedule={s}
                          entities={entities}
                          onChangeStatus={changeStatus}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── Mobile/Tablet: Selected Day ── */}
            <div className="lg:hidden">
              <h3 className="text-sm font-semibold text-gray-500 mb-2">
                {DAYS_FULL[selectedDay.getDay()]} {selectedDay.getDate()}/{selectedDay.getMonth() + 1}
              </h3>
              {(byDay[selectedDay.toDateString()] ?? []).length === 0 ? (
                <EmptyState
                  icon="📦"
                  title="Sin entregas"
                  description="No hay entregas programadas para este dia."
                  action={<PrimaryButton onClick={() => setShowModal(true)}>+ Agendar entrega</PrimaryButton>}
                />
              ) : (
                <div className="space-y-2">
                  {(byDay[selectedDay.toDateString()] ?? []).map(s => (
                    <ScheduleCard
                      key={s.id}
                      schedule={s}
                      entities={entities}
                      onChangeStatus={changeStatus}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── New Schedule Modal ── */}
      {showModal && (
        <NewScheduleModal
          entities={entities}
          selectedDate={selectedDay}
          onSave={createSchedule}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SCHEDULE CARD
// ─────────────────────────────────────────────────────────────

function ScheduleCard({ schedule, entities, onChangeStatus, compact = false }) {
  const s = schedule
  const st = STATUS_CONFIG[s.status] ?? STATUS_CONFIG.pendiente
  const entityName = s.entity_id ? (entities[s.entity_id]?.name ?? 'Cliente') : null
  const time = s.scheduled_at
    ? new Date(s.scheduled_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
    : null

  const nextStatuses = {
    pendiente: ['en_camino', 'cancelado'],
    en_camino: ['entregado', 'cancelado'],
    entregado: [],
    cancelado: [],
  }

  const actions = nextStatuses[s.status] ?? []

  if (compact) {
    return (
      <div className={`rounded-xl p-2 ${st.bg} ${st.text}`}>
        <div className="flex items-center gap-1">
          <span className="text-xs">{st.icon}</span>
          <span className="text-xs font-medium truncate">{entityName ?? s.description ?? 'Entrega'}</span>
        </div>
        {time && <p className="text-[10px] mt-0.5 opacity-75">{time}</p>}
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-base">{st.icon}</span>
            <p className="font-semibold text-gray-900 truncate">
              {entityName ?? s.description ?? 'Entrega'}
            </p>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${st.bg} ${st.text}`}>
              {st.label}
            </span>
          </div>
          {s.description && entityName && (
            <p className="text-sm text-gray-500 mt-0.5 truncate">{s.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            {time && <span>🕐 {time}</span>}
            {s.address && <span className="truncate">📍 {s.address}</span>}
          </div>
          {s.notes && (
            <p className="text-xs text-gray-400 mt-1 truncate">{s.notes}</p>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {actions.length > 0 && (
        <div className="flex gap-2 mt-3 pt-2 border-t border-gray-50">
          {actions.map(next => {
            const nst = STATUS_CONFIG[next]
            return (
              <button
                key={next}
                onClick={() => onChangeStatus(s, next)}
                className={`
                  flex-1 py-2 rounded-xl text-xs font-semibold transition active:scale-[0.98]
                  ${next === 'cancelado'
                    ? 'border border-red-200 text-red-600 hover:bg-red-50'
                    : `${nst.bg} ${nst.text} hover:opacity-80`}
                `}
              >
                {nst.icon} {nst.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// NEW SCHEDULE MODAL
// ─────────────────────────────────────────────────────────────

function NewScheduleModal({ entities, selectedDate, onSave, onClose }) {
  const defaultDate = new Date(selectedDate)
  defaultDate.setHours(9, 0, 0, 0)

  const [form, setForm] = useState({
    entity_id: '',
    description: '',
    address: '',
    notes: '',
    scheduled_at: toLocalDateTimeString(defaultDate),
  })

  const entityList = Object.values(entities).sort((a, b) =>
    (a.name ?? '').localeCompare(b.name ?? '', 'es-AR')
  )

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    if (!form.description && !form.entity_id) return
    onSave({
      ...form,
      scheduled_at: new Date(form.scheduled_at).toISOString(),
    })
  }

  return (
    <ModalSheet
      title="Nueva Entrega"
      onClose={onClose}
      footer={
        <PrimaryButton onClick={handleSave} className="w-full justify-center">
          Guardar entrega
        </PrimaryButton>
      }
    >
      <div className="space-y-4">
        <Field label="Cliente (opcional)">
          <select
            value={form.entity_id}
            onChange={e => update('entity_id', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">— Seleccionar —</option>
            {entityList.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </Field>

        <Field label="Descripcion">
          <input
            type="text"
            value={form.description}
            onChange={e => update('description', e.target.value)}
            placeholder="Ej: Entrega pedido #123"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </Field>

        <Field label="Fecha y hora">
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={e => update('scheduled_at', e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </Field>

        <Field label="Direccion (opcional)">
          <input
            type="text"
            value={form.address}
            onChange={e => update('address', e.target.value)}
            placeholder="Direccion de entrega"
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </Field>

        <Field label="Notas (opcional)">
          <textarea
            value={form.notes}
            onChange={e => update('notes', e.target.value)}
            rows={2}
            placeholder="Notas internas..."
            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
          />
        </Field>
      </div>
    </ModalSheet>
  )
}

// ─────────────────────────────────────────────────────────────
// SHARED SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 mb-1 block">{label}</span>
      {children}
    </label>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-2 mt-2">
      {[1, 2, 3, 4].map(i => (
        <div key={i} className="h-20 bg-gray-100 rounded-2xl animate-pulse" />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// UTILITY
// ─────────────────────────────────────────────────────────────

function toLocalDateTimeString(date) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
