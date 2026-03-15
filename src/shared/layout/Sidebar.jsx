/**
 * REGISTRAL — Sidebar
 * src/shared/layout/Sidebar.jsx
 *
 * Navegación lateral filtrada por el preset del tenant.
 * Solo muestra módulos habilitados en el preset del rubro.
 * Labels dinámicos desde el vocabulary del preset.
 * Módulos del plan superior: visibles pero bloqueados (generan upgrade).
 * data-tour-id en cada ítem para el GuidedTour.
 */

import { NavLink } from 'react-router-dom'
import PropTypes from 'prop-types'
import { usePreset }  from '../../core/engine/PresetContext'
import { useAuth }    from '../../core/auth/useAuth'

// ─────────────────────────────────────────────────────────────
// DEFINICIÓN DE TODOS LOS MÓDULOS POSIBLES
// Orden fijo de aparición. Los módulos no habilitados en el rubro
// se filtran antes de renderizar.
// ─────────────────────────────────────────────────────────────

const ALL_MODULES = [
  {
    id:        'dashboard',
    path:      '/dashboard',
    icon:      '🏠',
    labelKey:  'dashboard_title',  // vocabulary key del preset
    labelFallback: 'Panel',
    alwaysShow: true,              // nunca se filtra
  },
  {
    id:       'stock',
    path:     '/stock',
    icon:     '📦',
    labelKey: 'products',
    labelFallback: 'Stock',
  },
  {
    id:       'remitos',
    path:     '/remitos',
    icon:     '📋',
    labelKey: 'transactions',
    labelFallback: 'Remitos',
  },
  {
    id:       'clientes',
    path:     '/clientes',
    icon:     '👥',
    labelKey: 'clients',
    labelFallback: 'Clientes',
  },
  {
    id:       'cuenta_corriente',
    path:     '/cuenta-corriente',
    icon:     '💸',
    labelKey: 'cuenta_corriente_label',
    labelFallback: 'Cuenta corriente',
  },
  {
    id:       'agenda_entregas',
    path:     '/agenda-entregas',
    icon:     '🚛',
    labelKey: 'schedules',
    labelFallback: 'Entregas',
  },
  {
    id:       'caja',
    path:     '/caja',
    icon:     '💰',
    labelKey: 'caja_label',
    labelFallback: 'Caja',
  },
  {
    id:       'reportes',
    path:     '/reportes',
    icon:     '📊',
    labelKey: 'reportes_label',
    labelFallback: 'Reportes',
  },
  // Módulos de otros rubros — aparecen aquí solo si el preset los habilita
  {
    id:       'mesas',
    path:     '/mesas',
    icon:     '🍽️',
    labelKey: 'mesas_label',
    labelFallback: 'Mesas',
  },
  {
    id:       'comandas',
    path:     '/comandas',
    icon:     '🍳',
    labelKey: 'comandas_label',
    labelFallback: 'Comandas',
  },
  {
    id:       'expedientes',
    path:     '/expedientes',
    icon:     '📂',
    labelKey: 'clients',
    labelFallback: 'Expedientes',
  },
  {
    id:       'honorarios',
    path:     '/honorarios',
    icon:     '⚖️',
    labelKey: 'transactions',
    labelFallback: 'Honorarios',
  },
  {
    id:       'agenda_vencimientos',
    path:     '/agenda-vencimientos',
    icon:     '📅',
    labelKey: 'schedules',
    labelFallback: 'Vencimientos',
  },
  {
    id:       'pacientes',
    path:     '/pacientes',
    icon:     '🏥',
    labelKey: 'entities',
    labelFallback: 'Pacientes',
  },
  {
    id:       'historia_clinica',
    path:     '/historia-clinica',
    icon:     '📑',
    labelKey: 'historia_clinica_label',
    labelFallback: 'Historia clínica',
  },
  {
    id:       'turnos',
    path:     '/turnos',
    icon:     '📅',
    labelKey: 'schedules',
    labelFallback: 'Turnos',
  },
  {
    id:       'presupuestos',
    path:     '/presupuestos',
    icon:     '📝',
    labelKey: 'presupuestos_label',
    labelFallback: 'Presupuestos',
  },
  {
    id:       'trabajos',
    path:     '/trabajos',
    icon:     '🔧',
    labelKey: 'transactions',
    labelFallback: 'Trabajos',
  },
  {
    id:       'cobros',
    path:     '/cobros',
    icon:     '💵',
    labelKey: 'transactions',
    labelFallback: 'Cobros',
  },
  {
    id:       'menu',
    path:     '/menu',
    icon:     '📖',
    labelKey: 'products',
    labelFallback: 'Menú',
  },
  {
    id:       'reservas',
    path:     '/reservas',
    icon:     '📅',
    labelKey: 'schedules',
    labelFallback: 'Reservas',
  },
  {
    id:       'consultas',
    path:     '/consultas',
    icon:     '🩺',
    labelKey: 'transactions',
    labelFallback: 'Consultas',
  },
]

// ─────────────────────────────────────────────────────────────
// PLAN ORDER para verificar si requiere upgrade
// ─────────────────────────────────────────────────────────────

const PLAN_ORDER = { basico: 0, pro: 1, agencia: 2 }

/**
 * Módulos que tienen página implementada en el router.
 * Los módulos de otros rubros que aún no tienen página
 * se muestran como "Próximamente" en vez de navegar a un 404.
 */
const IMPLEMENTED_MODULES = new Set([
  'dashboard', 'stock', 'remitos', 'clientes',
  'cuenta_corriente', 'agenda_entregas', 'caja', 'reportes',
])

// ─────────────────────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────────────────────

export default function Sidebar({ onNavigate }) {
  const { preset, tenantData } = usePreset()
  const { tenant }             = useAuth()

  const plan           = tenantData?.plan ?? tenant?.plan ?? 'basico'
  const rubro          = tenantData?.rubro ?? tenant?.rubro
  const vocab          = preset?.vocabulary ?? {}
  const enabledInPreset = preset?.modules_enabled ?? []
  const planLimits     = preset?.plan_limits ?? {}
  const planModules    = planLimits[plan]?.modules ?? []

  // Filtrar módulos que el preset del rubro tiene habilitados
  const visibleModules = ALL_MODULES.filter(mod =>
    mod.alwaysShow || enabledInPreset.includes(mod.id)
  )

  function getLabel(mod) {
    return vocab[mod.labelKey] ?? mod.labelFallback
  }

  function isInPlan(moduleId) {
    return planModules.includes('*') || planModules.includes(moduleId)
  }

  if (!preset) {
    // Skeleton mientras carga el preset
    return (
      <div className="flex-1 p-3 space-y-1 animate-pulse">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="h-10 bg-gray-100 rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <nav className="flex flex-col flex-1 overflow-y-auto">

      {/* ── Logo (solo desktop, mobile lo muestra AppShell) ── */}
      <div className="hidden md:flex items-center gap-2.5 px-4 py-4 border-b border-gray-50">
        <div className="w-8 h-8 rounded-xl bg-amber-500 flex items-center justify-center shadow-sm">
          <span className="text-white font-bold text-sm">R</span>
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">Registral</p>
        </div>
      </div>

      {/* ── Items de navegación ── */}
      <div className="flex-1 px-3 py-3 space-y-0.5">
        {visibleModules.map(mod => {
          const locked      = !mod.alwaysShow && !isInPlan(mod.id)
          const implemented = mod.alwaysShow || IMPLEMENTED_MODULES.has(mod.id)
          const label       = getLabel(mod)

          return (
            <NavItem
              key={mod.id}
              mod={mod}
              label={label}
              locked={locked}
              comingSoon={!implemented}
              onNavigate={locked || !implemented ? undefined : onNavigate}
            />
          )
        })}
      </div>

      {/* ── Footer del sidebar ── */}
      <SidebarFooter preset={preset} plan={plan} rubro={rubro} />
    </nav>
  )
}

Sidebar.propTypes = {
  onNavigate: PropTypes.func,
}

// ─────────────────────────────────────────────────────────────
// NAV ITEM
// ─────────────────────────────────────────────────────────────

function NavItem({ mod, label, locked, comingSoon, onNavigate }) {
  const baseClass = `
    group flex items-center gap-3 px-3 py-2.5 rounded-xl
    text-sm font-medium transition-all duration-150
    w-full text-left
  `

  const badge = locked ? (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 flex-shrink-0">Pro</span>
  ) : comingSoon ? (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 flex-shrink-0">Pronto</span>
  ) : null

  const content = (
    <>
      <span className={`text-lg flex-shrink-0 leading-none ${comingSoon ? 'opacity-50' : ''}`}>{mod.icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge}
    </>
  )

  if (locked || comingSoon) {
    return (
      <button
        className={`${baseClass} text-gray-400 ${comingSoon ? 'cursor-default opacity-75' : 'cursor-pointer hover:bg-gray-50'}`}
        data-tour-id={`module-${mod.id}`}
        title={comingSoon ? 'Próximamente' : 'Disponible en plan Pro'}
      >
        {content}
      </button>
    )
  }

  return (
    <NavLink
      to={mod.path}
      onClick={onNavigate}
      data-tour-id={`module-${mod.id}`}
      className={({ isActive }) => `
        ${baseClass}
        ${isActive
          ? 'bg-amber-50 text-amber-700'
          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
        }
      `}
    >
      {content}
    </NavLink>
  )
}

NavItem.propTypes = {
  mod:        PropTypes.object.isRequired,
  label:      PropTypes.string.isRequired,
  locked:     PropTypes.bool,
  comingSoon: PropTypes.bool,
  onNavigate: PropTypes.func,
}

// ─────────────────────────────────────────────────────────────
// SIDEBAR FOOTER
// ─────────────────────────────────────────────────────────────

const PLAN_LABELS = {
  basico:  'Plan Básico',
  pro:     'Plan Pro',
  agencia: 'Plan Agencia',
}

function SidebarFooter({ preset, plan, rubro }) {
  return (
    <div className="border-t border-gray-100 px-3 py-3">
      {/* Rubro + plan */}
      <div className="flex items-center gap-2.5 px-2 py-2">
        <span className="text-xl leading-none">{preset?.icon ?? '🏢'}</span>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-700 truncate">
            {preset?.display_name ?? rubro ?? 'Sin rubro'}
          </p>
          <p className="text-[11px] text-gray-400 truncate">
            {PLAN_LABELS[plan] ?? 'Básico'}
          </p>
        </div>
      </div>

      {/* Configuración */}
      <NavLink
        to="/configuracion"
        className="
          flex items-center gap-2.5 px-2 py-2 rounded-xl
          text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition
          mt-0.5
        "
      >
        <span className="text-base">⚙️</span>
        <span className="text-xs font-medium">Configuración</span>
      </NavLink>
    </div>
  )
}

SidebarFooter.propTypes = {
  preset: PropTypes.object,
  plan:   PropTypes.string,
  rubro:  PropTypes.string,
}
