/**
 * REGISTRAL — ClientesPage
 * src/modules/clientes/ClientesPage.jsx
 */

import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useDocumentTitle } from '../../shared/ui/useDocumentTitle'
import { usePreset }   from '../../core/engine/PresetContext'
import { useClientes } from './useClientes'
import ClienteModal     from './ClienteModal'
import {
  EmptyState, PageHeader, PrimaryButton, formatARS,
} from '../../shared/ui/index'

export default function ClientesPage() {
  useDocumentTitle('Clientes')
  const { preset }     = usePreset()
  const location       = useLocation()
  const navigate       = useNavigate()
  const vocab          = preset?.vocabulary ?? {}
  const clienteLabel   = vocab.client  ?? 'Cliente'
  const clientesLabel  = vocab.clients ?? 'Clientes'

  const [search, setSearch]     = useState('')
  const [withDebt, setWithDebt] = useState(false)
  const [selected, setSelected] = useState(null)
  const [showModal, setShowModal] = useState(false)

  // Handle navigation state from dashboard
  useEffect(() => {
    if (location.state?.openNew) {
      setSelected(null)
      setShowModal(true)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state])

  const clientes = useClientes({ search, withDebt })

  function openNew()    { setSelected(null); setShowModal(true) }
  function openEdit(c)  { setSelected(c);    setShowModal(true) }
  function closeModal() { setShowModal(false); setSelected(null) }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={clientesLabel}
        subtitle={clientes ? `${clientes.length} ${clientesLabel.toLowerCase()}` : 'Cargando...'}
        action={<PrimaryButton onClick={openNew}>+ {clienteLabel}</PrimaryButton>}
      />

      {/* Filtros */}
      <div className="px-4 py-2 flex gap-2">
        <div className="relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Buscar ${clientesLabel.toLowerCase()}...`}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <button
          onClick={() => setWithDebt(s => !s)}
          className={`
            flex-shrink-0 text-sm px-3 py-2 rounded-xl border transition
            ${withDebt ? 'bg-red-50 border-red-300 text-red-700 font-semibold' : 'bg-white border-gray-200 text-gray-600'}
          `}
        >
          💸 Con deuda
        </button>
      </div>

      {/* Lista */}
      <div className="flex-1 px-4 pb-4">
        {!clientes ? (
          <SkeletonList />
        ) : clientes.length === 0 ? (
          <EmptyState
            icon="👥"
            title={`Sin ${clientesLabel.toLowerCase()}`}
            description={search || withDebt ? 'No hay resultados con esos filtros.' : `Agregá tu primer ${clienteLabel.toLowerCase()}.`}
            action={!search && !withDebt && (
              <PrimaryButton onClick={openNew}>+ Agregar {clienteLabel.toLowerCase()}</PrimaryButton>
            )}
          />
        ) : (
          <>
            {/* Desktop tabla */}
            <div className="hidden md:block bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-xs text-gray-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">Cód.</th>
                    <th className="text-left px-4 py-3 font-medium">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium">Teléfono</th>
                    <th className="text-left px-4 py-3 font-medium">Tipo</th>
                    <th className="text-right px-4 py-3 font-medium">Saldo CC</th>
                  </tr>
                </thead>
                <tbody>
                  {clientes.map((c, i) => {
                    const balance     = Number(c.balance)
                    const overLimit   = c.credit_limit > 0 && balance > c.credit_limit
                    return (
                      <tr key={c.id} onClick={() => openEdit(c)}
                        className={`cursor-pointer hover:bg-gray-50 transition ${i < clientes.length - 1 ? 'border-b border-gray-50' : ''}`}>
                        <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.code ?? '—'}</td>
                        <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                        <td className="px-4 py-3 text-gray-500">{c.data?.telefono || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{c.data?.tipo_cliente || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex flex-col items-end">
                            <span className={`font-semibold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatARS(balance)}
                            </span>
                            {overLimit && (
                              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                                Límite excedido
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {clientes.map(c => {
                const balance   = Number(c.balance)
                const overLimit = c.credit_limit > 0 && balance > c.credit_limit
                return (
                  <button key={c.id} onClick={() => openEdit(c)}
                    className="w-full text-left bg-white rounded-2xl border border-gray-100 px-4 py-3 active:scale-[0.98] transition">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.data?.tipo_cliente ?? ''}{c.data?.telefono ? ` · ${c.data.telefono}` : ''}
                        </p>
                      </div>
                      <div className="text-right ml-3">
                        <p className={`text-sm font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {balance > 0 ? formatARS(balance) : '✓ Sin deuda'}
                        </p>
                        {overLimit && (
                          <p className="text-[10px] text-red-600 font-semibold">Límite excedido</p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>

      {showModal && (
        <ClienteModal cliente={selected} onClose={closeModal} />
      )}
    </div>
  )
}

function SkeletonList() {
  return (
    <div className="space-y-2 mt-2">
      {[1,2,3,4].map(i => <div key={i} className="h-16 bg-gray-100 rounded-2xl animate-pulse" />)}
    </div>
  )
}
