/**
 * REGISTRAL — GuidedTour
 * src/onboarding/GuidedTour.jsx
 *
 * Paso 4 del onboarding.
 * 5 cards secuenciales mostrando los módulos del rubro.
 * Mobile: cards apiladas en bottom sheet con overlay.
 * Botón "Saltar" siempre visible.
 * Al terminar → llama onFinish() que marca onboarding_completed = true.
 */

import { useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'

// Tour steps dinámicos por rubro.
// Cada step referencia un module_id para resaltar en el sidebar
// via atributo data-tour-id="module-{moduleId}" en el AppShell.
const TOUR_STEPS_BY_RUBRO = {
  correlon: [
    {
      moduleId:    'stock',
      icon:        '📦',
      title:       'Stock de artículos',
      description: 'Cargá tus artículos con unidad de medida, precio y stock mínimo. Cuando baje del mínimo, te avisamos automáticamente.',
    },
    {
      moduleId:    'clientes',
      icon:        '👥',
      title:       'Clientes',
      description: 'Registrá tus clientes habituales. Podés asignarles un límite de crédito para cuenta corriente.',
    },
    {
      moduleId:    'remitos',
      icon:        '📋',
      title:       'Remitos',
      description: 'Creá remitos en segundos. El sistema descuenta el stock automáticamente cuando confirmás.',
    },
    {
      moduleId:    'cuenta_corriente',
      icon:        '💸',
      title:       'Cuenta corriente',
      description: 'Seguí el saldo de cada cliente. Registrá pagos y ve el historial completo de lo que te debe.',
    },
    {
      moduleId:    'agenda_entregas',
      icon:        '🚛',
      title:       'Agenda de entregas',
      description: 'Organizá las entregas del día con dirección, chofer y horario. Todo en un lugar.',
    },
  ],
  gastronomia: [
    {
      moduleId: 'mesas',
      icon: '🍽️',
      title: 'Mesas',
      description: 'Visualizá el estado de cada mesa: libre, ocupada o reservada.',
    },
    {
      moduleId: 'comandas',
      icon: '📋',
      title: 'Comandas',
      description: 'Tomá pedidos por mesa y envialos a cocina con un toque.',
    },
    {
      moduleId: 'menu',
      icon: '🍳',
      title: 'Menú',
      description: 'Administrá tu carta, precios y disponibilidad diaria.',
    },
    {
      moduleId: 'caja',
      icon: '💰',
      title: 'Caja',
      description: 'Abrí y cerrá caja con el resumen del día.',
    },
    {
      moduleId: 'reportes',
      icon: '📊',
      title: 'Reportes',
      description: 'Plato más pedido, hora pico y ticket promedio. Todo calculado automáticamente.',
    },
  ],
  abogacia: [
    {
      moduleId: 'expedientes',
      icon: '📂',
      title: 'Expedientes',
      description: 'Registrá carátula, fuero, juzgado y estado de cada causa.',
    },
    {
      moduleId: 'honorarios',
      icon: '💰',
      title: 'Honorarios',
      description: 'Facturá honorarios por expediente y controlá lo que te deben.',
    },
    {
      moduleId: 'agenda_vencimientos',
      icon: '📅',
      title: 'Vencimientos',
      description: 'Te alertamos 3 días antes de cada plazo procesal. Nunca más se te vence un plazo.',
    },
    {
      moduleId: 'reportes',
      icon: '📊',
      title: 'Reportes',
      description: 'Causas activas por fuero, honorarios cobrados y más.',
    },
    {
      moduleId: 'dashboard',
      icon: '🏠',
      title: 'Panel principal',
      description: 'Resumen de todo tu estudio en una sola pantalla.',
    },
  ],
}

// Fallback genérico para rubros sin tour personalizado
function getGenericSteps(modules) {
  return modules.slice(0, 5).map(moduleId => ({
    moduleId,
    icon: '✅',
    title: moduleId.charAt(0).toUpperCase() + moduleId.slice(1).replace(/_/g, ' '),
    description: `Accedé a todas las funciones de este módulo desde el menú lateral.`,
  }))
}

export default function GuidedTour({ rubro, enabledModules, onFinish }) {
  const steps = TOUR_STEPS_BY_RUBRO[rubro] ?? getGenericSteps(enabledModules)
  const [current, setCurrent] = useState(0)
  const [exiting, setExiting] = useState(false)
  const totalSteps = steps.length
  const step = steps[current]

  // Resaltar el módulo actual en el sidebar
  useEffect(() => {
    const el = document.querySelector(`[data-tour-id="module-${step?.moduleId}"]`)
    if (el) {
      el.classList.add('ring-2', 'ring-amber-400', 'ring-offset-2', 'rounded-xl', 'z-10', 'relative')
      return () => {
        el.classList.remove('ring-2', 'ring-amber-400', 'ring-offset-2', 'rounded-xl', 'z-10', 'relative')
      }
    }
  }, [current, step?.moduleId])

  function goNext() {
    if (current < totalSteps - 1) {
      setExiting(true)
      setTimeout(() => {
        setCurrent(c => c + 1)
        setExiting(false)
      }, 180)
    } else {
      handleFinish()
    }
  }

  function handleFinish() {
    onFinish()
  }

  return (
    <>
      {/* Overlay semitransparente */}
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={handleFinish}
        aria-label="Saltar tour"
      />

      {/* Botón Saltar — siempre visible encima del overlay */}
      <button
        onClick={handleFinish}
        className="
          fixed top-4 right-4 z-50
          bg-white/90 backdrop-blur-sm
          text-gray-600 text-sm font-medium
          px-4 py-2 rounded-full shadow-md
          hover:bg-white transition
        "
      >
        Saltar tour
      </button>

      {/* Bottom sheet del step actual */}
      <div
        className={`
          fixed bottom-0 left-0 right-0 z-50
          bg-white rounded-t-3xl shadow-2xl
          transition-all duration-200
          ${exiting ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}
        `}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-200 rounded-full" />
        </div>

        <div className="px-6 pt-4 pb-8">
          {/* Progreso */}
          <div className="flex items-center gap-1.5 mb-5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === current
                    ? 'bg-amber-500 flex-1'
                    : i < current
                    ? 'bg-amber-200 w-4'
                    : 'bg-gray-100 w-4'
                }`}
              />
            ))}
          </div>

          {/* Contenido del step */}
          <div className="flex items-start gap-4 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl">{step.icon}</span>
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
              <p className="mt-1 text-sm text-gray-500 leading-relaxed">{step.description}</p>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={goNext}
            className="
              w-full rounded-xl bg-amber-500 text-white font-semibold
              py-3.5 text-base transition active:scale-[0.98]
              hover:bg-amber-600 shadow-sm
            "
          >
            {current < totalSteps - 1 ? 'Siguiente' : '¡Listo, empezar!'}
          </button>

          {/* Contador */}
          <p className="mt-3 text-center text-xs text-gray-400">
            {current + 1} de {totalSteps}
          </p>
        </div>
      </div>
    </>
  )
}

GuidedTour.propTypes = {
  rubro:          PropTypes.string.isRequired,
  enabledModules: PropTypes.arrayOf(PropTypes.string),
  onFinish:       PropTypes.func.isRequired,
}

GuidedTour.defaultProps = {
  enabledModules: [],
}
