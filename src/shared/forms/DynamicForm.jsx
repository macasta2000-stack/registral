/**
 * REGISTRAL — DynamicForm + DynamicField + useFormSchema
 * src/shared/forms/DynamicForm.jsx
 *
 * Motor de formularios que renderiza el schema del preset.
 * El preset define qué campos existen, qué tipo son y qué es required/locked.
 * DynamicForm no sabe qué rubro está activo — todo viene del preset via hooks.
 *
 * Tipos de campo soportados:
 *   text, textarea, number, currency, email, tel, date, datetime,
 *   boolean, select, entity_search
 *
 * Modos:
 *   create → guarda al submit
 *   edit   → autoguarda onBlur con useAutoSave
 *
 * Exports:
 *   DynamicForm      → formulario completo
 *   DynamicField     → campo individual embebible
 *   useFormSchema    → hook que retorna el schema procesado del entityType
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import PropTypes from 'prop-types'
import { useLiveQuery } from 'dexie-react-hooks'
import { useFields, usePreset } from '../../core/engine/PresetContext'
import { useAutoSave } from '../../core/engine/useAutoSave'
import { db }          from '../../core/offline/db'
import { useAuth }     from '../../core/auth/useAuth'

// ─────────────────────────────────────────────────────────────
// HOOK: useFormSchema
// ─────────────────────────────────────────────────────────────

/**
 * Retorna el schema procesado para un entityType del preset actual.
 * Incluye el orden correcto (required primero, optional después).
 */
export function useFormSchema(entityType) {
  const { allFields, required, optional, locked, getField } = useFields(entityType)
  return { allFields, required, optional, locked, getField }
}

// ─────────────────────────────────────────────────────────────
// DYNAMIC FORM
// ─────────────────────────────────────────────────────────────

export default function DynamicForm({
  entityType,
  tableName,
  initialValues = {},
  onSubmit,
  onCancel,
  mode      = 'create',
  disabled  = false,
}) {
  const { allFields, required, locked } = useFormSchema(entityType)
  const { save, syncStatus } = useAutoSave()
  const { tenantId }         = useAuth()
  const recordRef            = useRef(initialValues)

  const [values, setValues]   = useState(() => buildInitialValues(allFields, initialValues))
  const [errors, setErrors]   = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Actualizar si cambian initialValues (ej: fetch remoto llega después)
  useEffect(() => {
    setValues(buildInitialValues(allFields, initialValues))
    recordRef.current = initialValues
  }, [initialValues?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cambio de campo ─────────────────────────────────────────

  const handleChange = useCallback((fieldKey, rawValue) => {
    setValues(prev => ({ ...prev, [fieldKey]: rawValue }))
    if (errors[fieldKey]) setErrors(prev => ({ ...prev, [fieldKey]: '' }))
  }, [errors])

  // ── Autoguardado en edit mode ────────────────────────────────

  const handleBlur = useCallback(async (fieldKey, value) => {
    if (mode !== 'edit' || disabled || !tableName || !initialValues?.id) return

    const updated = {
      ...recordRef.current,
      [fieldKey]: value,
      tenant_id:  tenantId,
    }
    recordRef.current = updated

    try {
      await save(tableName, updated, {
        critical:    false,
        operation:   'UPDATE',
        skipEventLog: false,
      })
    } catch (err) {
      console.warn('[DynamicForm] autoguardado falló:', err.message)
    }
  }, [mode, disabled, tableName, initialValues?.id, tenantId, save])

  // ── Validación ───────────────────────────────────────────────

  function validate(currentValues) {
    const errs = {}
    for (const fieldKey of required) {
      const val = currentValues[fieldKey]
      if (val === null || val === undefined || val === '') {
        const field = allFields.find(f => f.key === fieldKey)
        errs[fieldKey] = `${field?.label ?? fieldKey} es obligatorio.`
      }
    }
    return errs
  }

  // ── Submit ──────────────────────────────────────────────────

  async function handleSubmit(e) {
    e.preventDefault()
    if (disabled) return

    const errs = validate(values)
    if (Object.keys(errs).length > 0) { setErrors(errs); return }
    setErrors({})

    setSubmitting(true)
    try {
      // Limpiar valores currency (remover formato, guardar número)
      const cleanValues = cleanCurrencyValues(values, allFields)
      await onSubmit?.({ ...cleanValues, tenant_id: tenantId })
    } catch (err) {
      setErrors({ _global: err.message })
    } finally {
      setSubmitting(false)
    }
  }

  if (!allFields || allFields.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-400">
        No hay campos configurados para este formulario.
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {/* Error global */}
      {errors._global && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
          <p className="text-sm text-red-700">{errors._global}</p>
        </div>
      )}

      {/* Campos */}
      {allFields.map(field => (
        <DynamicField
          key={field.key}
          field={field}
          value={values[field.key] ?? ''}
          error={errors[field.key]}
          disabled={disabled || locked.includes(field.key)}
          tenantId={tenantId}
          onChange={(val) => handleChange(field.key, val)}
          onBlur={(val) => handleBlur(field.key, val)}
        />
      ))}

      {/* Acciones */}
      {!disabled && (
        <div className="flex gap-3 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={submitting}
              className="
                flex-1 py-3 rounded-xl border border-gray-200
                text-gray-600 text-sm font-medium
                hover:bg-gray-50 disabled:opacity-50 transition
              "
            >
              Cancelar
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="
              flex-1 py-3 rounded-xl bg-amber-500 text-white
              text-sm font-semibold shadow-sm
              hover:bg-amber-600 disabled:opacity-60 transition
              active:scale-[0.98]
            "
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Guardando...
              </span>
            ) : mode === 'create' ? 'Guardar' : 'Actualizar'}
          </button>
        </div>
      )}

      {/* Indicador de autoguardado en modo edit */}
      {mode === 'edit' && !disabled && (
        <SaveStatusIndicator status={syncStatus} />
      )}
    </form>
  )
}

DynamicForm.propTypes = {
  entityType:    PropTypes.string.isRequired,
  tableName:     PropTypes.string,
  initialValues: PropTypes.object,
  onSubmit:      PropTypes.func,
  onCancel:      PropTypes.func,
  mode:          PropTypes.oneOf(['create', 'edit']),
  disabled:      PropTypes.bool,
}

// ─────────────────────────────────────────────────────────────
// DYNAMIC FIELD
// Renderiza un campo individual según su tipo
// ─────────────────────────────────────────────────────────────

export function DynamicField({
  field,
  value,
  error,
  disabled = false,
  tenantId,
  onChange,
  onBlur,
}) {
  const inputBase = `
    w-full rounded-xl border px-4 py-3 text-base text-gray-900
    placeholder-gray-400 outline-none transition
    focus:ring-2 focus:ring-amber-400 focus:border-amber-400
    disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed
    ${error ? 'border-red-400 bg-red-50' : 'border-gray-200 bg-white'}
  `

  function handleBlur(e) {
    onBlur?.(e.target.value)
  }

  const label = (
    <div className="flex items-center justify-between mb-1">
      <label className="text-sm font-medium text-gray-700">
        {field.label ?? field.key}
        {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
        {disabled && field.isLocked && (
          <span className="ml-2 text-xs text-gray-400 font-normal">🔒</span>
        )}
      </label>
    </div>
  )

  const errorMsg = error && (
    <p className="mt-1 text-xs text-red-600">{error}</p>
  )

  const hint = field.note && !error && (
    <p className="mt-1 text-xs text-gray-400">{field.note}</p>
  )

  // ── Tipos de campo ─────────────────────────────────────────

  switch (field.type) {

    case 'textarea':
      return (
        <div>
          {label}
          <textarea
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={field.placeholder ?? ''}
            disabled={disabled}
            rows={3}
            className={`${inputBase} resize-none`}
          />
          {errorMsg}
          {hint}
        </div>
      )

    case 'number':
      return (
        <div>
          {label}
          <input
            type="number"
            value={value ?? ''}
            onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            onBlur={handleBlur}
            placeholder={field.placeholder ?? '0'}
            disabled={disabled}
            step="any"
            min={0}
            className={inputBase}
          />
          {errorMsg}
          {hint}
        </div>
      )

    case 'currency':
      return (
        <CurrencyField
          field={field}
          value={value}
          error={error}
          disabled={disabled}
          onChange={onChange}
          onBlur={onBlur}
          inputBase={inputBase}
        />
      )

    case 'boolean':
      return (
        <div>
          <div className="flex items-center justify-between py-1">
            <span className="text-sm font-medium text-gray-700">
              {field.label ?? field.key}
            </span>
            <ToggleSwitch
              checked={!!value}
              onChange={val => { onChange(val); onBlur?.(val) }}
              disabled={disabled}
            />
          </div>
          {errorMsg}
        </div>
      )

    case 'select':
      return (
        <div>
          {label}
          <select
            value={value ?? ''}
            onChange={e => { onChange(e.target.value); onBlur?.(e.target.value) }}
            disabled={disabled}
            className={inputBase}
          >
            <option value="">Seleccioná una opción</option>
            {(field.options ?? []).map(opt => {
              const val = typeof opt === 'string' ? opt : opt.value
              const lbl = typeof opt === 'string' ? opt : opt.label
              return <option key={val} value={val}>{lbl}</option>
            })}
          </select>
          {errorMsg}
          {hint}
        </div>
      )

    case 'entity_search':
      return (
        <EntitySearchField
          field={field}
          value={value}
          error={error}
          disabled={disabled}
          tenantId={tenantId}
          onChange={onChange}
          onBlur={onBlur}
          inputBase={inputBase}
        />
      )

    case 'date':
      return (
        <div>
          {label}
          <input
            type="date"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            onBlur={handleBlur}
            disabled={disabled}
            className={inputBase}
          />
          {errorMsg}
          {hint}
        </div>
      )

    case 'datetime':
      return (
        <div>
          {label}
          <input
            type="datetime-local"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            onBlur={handleBlur}
            disabled={disabled}
            className={inputBase}
          />
          {errorMsg}
          {hint}
        </div>
      )

    case 'email':
      return (
        <div>
          {label}
          <input
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={field.placeholder ?? ''}
            disabled={disabled}
            className={inputBase}
          />
          {errorMsg}
          {hint}
        </div>
      )

    case 'tel':
      return (
        <div>
          {label}
          <input
            type="tel"
            inputMode="tel"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={field.placeholder ?? ''}
            disabled={disabled}
            className={inputBase}
          />
          {errorMsg}
          {hint}
        </div>
      )

    // text — default
    default:
      return (
        <div>
          {label}
          <input
            type="text"
            value={value ?? ''}
            onChange={e => onChange(e.target.value)}
            onBlur={handleBlur}
            placeholder={field.placeholder ?? ''}
            disabled={disabled}
            maxLength={field.maxLength}
            className={inputBase}
          />
          {errorMsg}
          {hint}
        </div>
      )
  }
}

DynamicField.propTypes = {
  field:    PropTypes.object.isRequired,
  value:    PropTypes.any,
  error:    PropTypes.string,
  disabled: PropTypes.bool,
  tenantId: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  onBlur:   PropTypes.func,
}

// ─────────────────────────────────────────────────────────────
// CURRENCY FIELD
// Formatea con separador de miles al blur, guarda número puro
// ─────────────────────────────────────────────────────────────

function CurrencyField({ field, value, error, disabled, onChange, onBlur, inputBase }) {
  const [displayValue, setDisplayValue] = useState(formatCurrency(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setDisplayValue(formatCurrency(value))
  }, [value, focused])

  function handleFocus(e) {
    setFocused(true)
    // Al enfocar mostrar número limpio
    setDisplayValue(value != null && value !== '' ? String(value) : '')
    e.target.select()
  }

  function handleChange(e) {
    const raw = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')
    setDisplayValue(e.target.value)
    const num = parseFloat(raw)
    onChange(isNaN(num) ? '' : num)
  }

  function handleBlur(e) {
    setFocused(false)
    const num = parseFloat(String(e.target.value).replace(/[^0-9.]/g, ''))
    const clean = isNaN(num) ? '' : num
    onChange(clean)
    setDisplayValue(formatCurrency(clean))
    onBlur?.(clean)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      </div>
      <div className="relative">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium pointer-events-none">
          $
        </span>
        <input
          type="text"
          inputMode="decimal"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={field.placeholder ?? '0'}
          disabled={disabled}
          className={`${inputBase} pl-7`}
        />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {field.note && !error && <p className="mt-1 text-xs text-gray-400">{field.note}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ENTITY SEARCH FIELD
// Buscador fuzzy de entidades en IndexedDB (sin Supabase)
// Debounce 300ms en el campo, resultado en dropdown
// ─────────────────────────────────────────────────────────────

function EntitySearchField({ field, value, error, disabled, tenantId, onChange, onBlur, inputBase }) {
  const [query, setQuery]       = useState('')
  const [debouncedQ, setDebQ]   = useState('')
  const [open, setOpen]         = useState(false)
  const [selected, setSelected] = useState(null)
  const debounceRef = useRef(null)
  const containerRef = useRef(null)

  // Buscar en IndexedDB con debounce 300ms
  const results = useLiveQuery(
    async () => {
      if (!tenantId || debouncedQ.length < 1) return []
      const q = debouncedQ.toLowerCase()
      return db.entities
        .where('tenant_id')
        .equals(tenantId)
        .filter(e => e.is_active !== false && e.name?.toLowerCase().includes(q))
        .limit(8)
        .toArray()
    },
    [tenantId, debouncedQ],
    []
  )

  function handleInputChange(e) {
    const val = e.target.value
    setQuery(val)
    setOpen(true)
    // Debounce 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebQ(val), 300)
  }

  function handleSelect(entity) {
    setSelected(entity)
    setQuery(entity.name)
    setOpen(false)
    onChange(entity.id)
    onBlur?.(entity.id)
  }

  // Cerrar al click fuera
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-gray-700">
          {field.label}
          {field.isRequired && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      </div>
      <div className="relative" ref={containerRef}>
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          placeholder={field.placeholder ?? 'Buscar...'}
          disabled={disabled}
          autoComplete="off"
          className={inputBase}
        />

        {/* Resultados */}
        {open && results && results.length > 0 && (
          <ul className="
            absolute top-full left-0 right-0 z-20 mt-1
            bg-white rounded-xl border border-gray-200 shadow-lg
            max-h-48 overflow-y-auto
          ">
            {results.map(entity => (
              <li key={entity.id}>
                <button
                  type="button"
                  onMouseDown={() => handleSelect(entity)}
                  className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm transition"
                >
                  <span className="font-medium text-gray-900">{entity.name}</span>
                  {entity.data?.telefono && (
                    <span className="ml-2 text-gray-400 text-xs">{entity.data.telefono}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && debouncedQ.length > 0 && results?.length === 0 && (
          <div className="
            absolute top-full left-0 right-0 z-20 mt-1
            bg-white rounded-xl border border-gray-100 shadow-lg px-4 py-3
          ">
            <p className="text-sm text-gray-400">Sin resultados para "{debouncedQ}"</p>
          </div>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// TOGGLE SWITCH
// ─────────────────────────────────────────────────────────────

function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative w-11 h-6 rounded-full transition-colors duration-200
        focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-1
        disabled:opacity-50 disabled:cursor-not-allowed
        ${checked ? 'bg-amber-500' : 'bg-gray-200'}
      `}
    >
      <span className={`
        absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
        transition-transform duration-200
        ${checked ? 'translate-x-5' : 'translate-x-0'}
      `} />
    </button>
  )
}

// ─────────────────────────────────────────────────────────────
// SAVE STATUS INDICATOR (modo edit)
// ─────────────────────────────────────────────────────────────

function SaveStatusIndicator({ status }) {
  const config = {
    idle:    null,
    saving:  { dot: 'bg-yellow-400', text: 'Guardando...' },
    saved:   { dot: 'bg-green-400',  text: 'Guardado' },
    pending: { dot: 'bg-yellow-400', text: 'Pendiente de sync' },
    error:   { dot: 'bg-red-400',    text: 'Error al guardar' },
  }
  const c = config[status]
  if (!c) return null

  return (
    <div className="flex items-center justify-end gap-1.5 text-xs text-gray-400">
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.text}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SPINNER
// ─────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function formatCurrency(value) {
  if (value === null || value === undefined || value === '') return ''
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return ''
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num)
}

function buildInitialValues(allFields, initialValues) {
  const vals = {}
  for (const field of allFields) {
    const existing = initialValues?.[field.key]
    if (existing !== undefined) {
      vals[field.key] = existing
    } else if (field.default !== undefined) {
      vals[field.key] = field.default
    } else {
      vals[field.key] = field.type === 'boolean' ? false : ''
    }
  }
  return vals
}

function cleanCurrencyValues(values, allFields) {
  const clean = { ...values }
  for (const field of allFields) {
    if (field.type === 'currency' && typeof clean[field.key] === 'string') {
      clean[field.key] = parseFloat(clean[field.key].replace(/[^0-9.]/g, '')) || 0
    }
  }
  return clean
}
