/**
 * REGISTRAL — CSV Export Utility
 * src/shared/ui/csvExport.js
 *
 * Exports data to CSV and triggers a browser download.
 *
 * Usage:
 *   import { exportToCSV } from '../shared/ui/csvExport'
 *
 *   exportToCSV(
 *     products,
 *     'productos-2026',
 *     { name: 'Nombre', price: 'Precio', stock_current: 'Stock' }
 *   )
 */

/**
 * Escapes a single CSV cell value according to RFC 4180.
 * Wraps in double-quotes if the value contains commas, quotes, or newlines.
 * @param {*} value
 * @returns {string}
 */
function escapeCSVCell(value) {
  if (value === null || value === undefined) return ''

  const str = String(value)

  // If the value contains a comma, double-quote, or newline, wrap it in quotes
  // and escape any existing double-quotes by doubling them.
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }

  return str
}

/**
 * Exports an array of objects to a CSV file and triggers a download.
 *
 * @param {Object[]} data - Array of objects to export
 * @param {string}   filename - Filename without extension
 * @param {Object}   columnMap - Maps object keys to display headers
 *   e.g. { name: 'Nombre', price: 'Precio', stock_current: 'Stock' }
 */
export function exportToCSV(data, filename, columnMap) {
  if (!data || data.length === 0) {
    console.warn('[csvExport] No data to export.')
    return
  }

  const keys = Object.keys(columnMap)
  const headers = keys.map(k => columnMap[k])

  // Build header row
  const headerRow = headers.map(escapeCSVCell).join(',')

  // Build data rows
  const rows = data.map(row =>
    keys.map(key => escapeCSVCell(row[key])).join(',')
  )

  // Join everything with CRLF (RFC 4180 standard line ending)
  const csvContent = [headerRow, ...rows].join('\r\n')

  // BOM (Byte Order Mark) for Excel UTF-8 compatibility
  const BOM = '\uFEFF'
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })

  // Trigger download
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `${filename}.csv`)
  document.body.appendChild(link)
  link.click()

  // Cleanup
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
