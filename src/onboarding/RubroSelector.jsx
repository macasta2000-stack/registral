/**
 * REGISTRAL — RubroSelector
 * src/onboarding/RubroSelector.jsx
 *
 * Paso 1 del onboarding.
 * Grid 2 col mobile / 3 col desktop.
 * Cada card: icono + nombre + descripción + módulos + precio.
 * Botón "Continuar" se habilita solo con selección.
 */

import { useState } from 'react'
import PropTypes from 'prop-types'

// Definición fija de los 6 rubros disponibles.
// No viene del preset porque en este paso todavía NO hay preset cargado.
const RUBROS = [
  {
    id:          'correlon',
    icon:        '🧱',
    name:        'Corralón',
    description: 'Materiales de construcción, remitos y cuenta corriente',
    modules:     ['Stock por artículo', 'Remitos', 'Cuenta corriente', 'Entregas'],
    price:       '$35 USD/mes',
    color:       'amber',
    highlight:   true,
    badge:       'Nuevo',
  },
  {
    id:          'gastronomia',
    icon:        '🍽️',
    name:        'Gastronomía',
    description: 'Mesas, comandas y gestión de salón',
    modules:     ['Mesas', 'Comandas', 'Menú', 'Caja'],
    price:       '$40 USD/mes',
    color:       'red',
  },
  {
    id:          'retail',
    icon:        '🛒',
    name:        'Retail / Comercio',
    description: 'Ventas, stock y clientes para tu local',
    modules:     ['Ventas', 'Stock', 'Clientes', 'Caja'],
    price:       '$35 USD/mes',
    color:       'violet',
  },
  {
    id:          'abogacia',
    icon:        '⚖️',
    name:        'Abogacía',
    description: 'Expedientes, honorarios y vencimientos',
    modules:     ['Expedientes', 'Honorarios', 'Vencimientos'],
    price:       '$55 USD/mes',
    color:       'blue',
  },
  {
    id:          'medicina',
    icon:        '🏥',
    name:        'Medicina / Salud',
    description: 'Pacientes, turnos e historia clínica',
    modules:     ['Pacientes', 'Turnos', 'Historia clínica'],
    price:       '$60 USD/mes',
    color:       'teal',
  },
  {
    id:          'servicios_generales',
    icon:        '🔧',
    name:        'Servicios',
    description: 'Presupuestos, trabajos y cobros',
    modules:     ['Trabajos', 'Presupuestos', 'Agenda', 'Cobros'],
    price:       '$30 USD/mes',
    color:       'green',
  },
]

const COLOR_MAP = {
  amber:  { ring: 'ring-amber-400', bg: 'bg-amber-50',   badge: 'bg-amber-400', dot: 'bg-amber-400' },
  red:    { ring: 'ring-red-400',   bg: 'bg-red-50',     badge: 'bg-red-400',   dot: 'bg-red-400' },
  violet: { ring: 'ring-violet-400',bg: 'bg-violet-50',  badge: 'bg-violet-400',dot: 'bg-violet-400' },
  blue:   { ring: 'ring-blue-400',  bg: 'bg-blue-50',    badge: 'bg-blue-400',  dot: 'bg-blue-400' },
  teal:   { ring: 'ring-teal-400',  bg: 'bg-teal-50',    badge: 'bg-teal-400',  dot: 'bg-teal-400' },
  green:  { ring: 'ring-green-400', bg: 'bg-green-50',   badge: 'bg-green-400', dot: 'bg-green-400' },
}

export default function RubroSelector({ onSelect }) {
  const [selected, setSelected] = useState(null)

  function handleContinue() {
    if (!selected) return
    onSelect(selected)
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="flex-1 px-4 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">¿Qué tipo de negocio tenés?</h2>
          <p className="mt-1 text-sm text-gray-500">
            Elegí el rubro y el sistema se configura solo para vos.
          </p>
        </div>

        {/* Grid: 2 columnas mobile, 3 desktop */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {RUBROS.map((rubro) => (
            <RubroCard
              key={rubro.id}
              rubro={rubro}
              isSelected={selected === rubro.id}
              onSelect={() => setSelected(rubro.id)}
            />
          ))}
        </div>

        {/* Disclaimer */}
        <p className="mt-4 text-xs text-gray-400 text-center">
          Podés cambiar el rubro antes de terminar el período de prueba.
        </p>
      </div>

      {/* CTA fijo en la parte inferior */}
      <div className="sticky bottom-0 bg-white border-t border-gray-100 px-4 py-4">
        <button
          onClick={handleContinue}
          disabled={!selected}
          className="
            w-full rounded-xl bg-amber-500 text-white font-semibold
            py-3.5 text-base transition active:scale-[0.98]
            hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed
            shadow-sm
          "
        >
          Continuar
        </button>
      </div>
    </div>
  )
}

RubroSelector.propTypes = {
  onSelect: PropTypes.func.isRequired,
}

// ─────────────────────────────────────────────────────────────
// Card individual de rubro
// ─────────────────────────────────────────────────────────────

function RubroCard({ rubro, isSelected, onSelect }) {
  const colors = COLOR_MAP[rubro.color] ?? COLOR_MAP.amber

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`
        relative flex flex-col items-start text-left rounded-2xl border-2 p-3 transition
        bg-white active:scale-[0.97]
        ${isSelected
          ? `border-transparent ring-2 ${colors.ring} ${colors.bg}`
          : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
        }
      `}
    >
      {/* Badge "Nuevo" si aplica */}
      {rubro.badge && (
        <span className={`
          absolute top-2 right-2 text-white text-[10px] font-bold
          px-1.5 py-0.5 rounded-full ${colors.badge}
        `}>
          {rubro.badge}
        </span>
      )}

      {/* Check icon cuando seleccionado */}
      {isSelected && (
        <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-white border-2 border-current flex items-center justify-center">
          <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </span>
      )}

      {/* Icono */}
      <div className="text-3xl mb-2 leading-none">{rubro.icon}</div>

      {/* Nombre */}
      <span className="text-sm font-bold text-gray-900 leading-tight">{rubro.name}</span>

      {/* Descripción — oculta en mobile muy pequeño, visible desde sm */}
      <span className="hidden sm:block mt-1 text-xs text-gray-500 leading-snug">
        {rubro.description}
      </span>

      {/* Módulos */}
      <div className="mt-2 flex flex-col gap-0.5 w-full">
        {rubro.modules.slice(0, 3).map((mod) => (
          <span key={mod} className="flex items-center gap-1 text-xs text-gray-500">
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
            {mod}
          </span>
        ))}
        {rubro.modules.length > 3 && (
          <span className="text-xs text-gray-400 pl-2.5">
            +{rubro.modules.length - 3} más
          </span>
        )}
      </div>

      {/* Precio */}
      <span className="mt-2 text-xs font-semibold text-gray-700">{rubro.price}</span>
    </button>
  )
}

RubroCard.propTypes = {
  rubro:      PropTypes.object.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onSelect:   PropTypes.func.isRequired,
}
