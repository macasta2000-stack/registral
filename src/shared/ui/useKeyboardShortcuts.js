/**
 * REGISTRAL — useKeyboardShortcuts
 * src/shared/ui/useKeyboardShortcuts.js
 *
 * Global keyboard shortcuts:
 *   Ctrl+K / Cmd+K → Open global search
 *   Ctrl+N / Cmd+N → New remito
 *   Escape         → Close active modal / search
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function useKeyboardShortcuts({ onToggleSearch }) {
  const navigate = useNavigate()

  useEffect(() => {
    function handler(e) {
      const mod = e.metaKey || e.ctrlKey

      // Ctrl+K → global search
      if (mod && e.key === 'k') {
        e.preventDefault()
        onToggleSearch?.()
        return
      }

      // Ctrl+N → nuevo remito
      if (mod && e.key === 'n') {
        e.preventDefault()
        navigate('/remitos', { state: { openNew: true } })
        return
      }

      // Escape → close search (handled by search component itself too)
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, onToggleSearch])
}
