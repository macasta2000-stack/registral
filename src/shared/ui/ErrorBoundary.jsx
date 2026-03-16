/**
 * REGISTRAL — ErrorBoundary
 * src/shared/ui/ErrorBoundary.jsx
 *
 * Captura errores de renderizado y muestra pantalla amigable.
 * Previene crash total de la aplicación.
 */

import { Component } from 'react'
import PropTypes from 'prop-types'

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo)

    // Auto-reload on stale chunk errors (after new deploy)
    const msg = error?.message || ''
    if (
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Importing a module script failed') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk')
    ) {
      const key = 'registral-chunk-reload'
      const last = sessionStorage.getItem(key)
      const now = Date.now()
      if (!last || now - Number(last) > 10_000) {
        sessionStorage.setItem(key, String(now))
        window.location.reload()
        return
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[50vh] flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">😵</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Algo salió mal
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              Ocurrió un error inesperado. Podés intentar recargar la página.
            </p>
            {this.state.error?.message && (
              <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-200">
                <p className="text-xs text-gray-500 font-mono break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => this.setState({ hasError: false, error: null })}
                className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reintentar
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-5 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
}
