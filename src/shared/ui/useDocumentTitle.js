/**
 * REGISTRAL — useDocumentTitle
 * src/shared/ui/useDocumentTitle.js
 *
 * Sets the document title dynamically per page.
 * Usage: useDocumentTitle('Remitos')  → "Remitos — REGISTRAL"
 */

import { useEffect } from 'react'

const APP_NAME = 'REGISTRAL'

export function useDocumentTitle(title) {
  useEffect(() => {
    const prev = document.title
    document.title = title ? `${title} — ${APP_NAME}` : APP_NAME
    return () => { document.title = prev }
  }, [title])
}
