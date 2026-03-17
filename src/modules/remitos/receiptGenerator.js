/**
 * REGISTRAL — Receipt Generator
 * src/modules/remitos/receiptGenerator.js
 *
 * Genera HTML de recibo para impresion / guardar como PDF.
 * Se abre en nueva ventana con window.print().
 */

import {
  formatARS, formatNumber, formatDate, formatDateTime,
} from '../../shared/ui/index'

const STATUS_LABELS = {
  draft:     'Borrador',
  confirmed: 'Confirmado',
  delivered: 'Entregado',
  paid:      'Cobrado',
  cancelled: 'Anulado',
}

function esc(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * @param {{ remito, items, entity, businessName, vocab }} params
 * @returns {string} HTML completo listo para document.write()
 */
export function generateReceiptHTML({ remito, items, entity, businessName, vocab }) {
  const transLabel = vocab?.transaction ?? 'Remito'
  const dateStr    = formatDate(remito.created_at)
  const statusStr  = STATUS_LABELS[remito.status] ?? remito.status

  // --- Items rows ---
  const itemRows = (items ?? []).map(item => `
    <tr>
      <td>${esc(item.description)}</td>
      <td class="center">${formatNumber(item.quantity)}</td>
      <td class="center">${esc(item.unit_type ?? '')}</td>
      <td class="right">${formatARS(item.unit_price)}</td>
      <td class="right">${item.discount_pct > 0 ? item.discount_pct + '%' : '-'}</td>
      <td class="right">${formatARS(item.subtotal)}</td>
    </tr>
  `).join('')

  // --- Extra data rows ---
  const extraRows = []
  if (remito.data?.con_flete) {
    extraRows.push('<tr><td class="label">Flete</td><td>Si</td></tr>')
    if (remito.data?.direccion_entrega)
      extraRows.push(`<tr><td class="label">Direccion de entrega</td><td>${esc(remito.data.direccion_entrega)}</td></tr>`)
    if (remito.data?.chofer)
      extraRows.push(`<tr><td class="label">Chofer</td><td>${esc(remito.data.chofer)}</td></tr>`)
  }

  // --- Date rows ---
  const dateRows = []
  if (remito.confirmed_at)
    dateRows.push(`<tr><td class="label">Confirmado</td><td>${formatDateTime(remito.confirmed_at)}</td></tr>`)
  if (remito.delivered_at)
    dateRows.push(`<tr><td class="label">Entregado</td><td>${formatDateTime(remito.delivered_at)}</td></tr>`)
  if (remito.paid_at)
    dateRows.push(`<tr><td class="label">Cobrado</td><td>${formatDateTime(remito.paid_at)}</td></tr>`)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>${esc(transLabel)} ${esc(remito.number)}</title>
<style>
  @page {
    size: A4;
    margin: 18mm 15mm;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 12px;
    color: #111;
    line-height: 1.5;
    padding: 0;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #111;
    padding-bottom: 12px;
    margin-bottom: 16px;
  }
  .header h1 {
    font-size: 22px;
    font-weight: 700;
    letter-spacing: -0.5px;
  }
  .header .business {
    font-size: 14px;
    font-weight: 600;
    color: #333;
  }
  .header .right-col {
    text-align: right;
  }
  .header .number {
    font-size: 18px;
    font-weight: 700;
  }
  .meta-table {
    width: 100%;
    margin-bottom: 16px;
    border-collapse: collapse;
  }
  .meta-table td {
    padding: 3px 8px 3px 0;
    vertical-align: top;
  }
  .meta-table td.label {
    font-weight: 600;
    color: #555;
    white-space: nowrap;
    width: 160px;
  }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #555;
    margin: 16px 0 6px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 3px;
  }
  .items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
    page-break-inside: avoid;
  }
  .items-table th {
    background: #f5f5f5;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    padding: 6px 8px;
    border: 1px solid #ccc;
    text-align: left;
  }
  .items-table td {
    padding: 5px 8px;
    border: 1px solid #ddd;
    font-size: 11px;
  }
  .items-table .center { text-align: center; }
  .items-table .right  { text-align: right; }
  .totals {
    width: 280px;
    margin-left: auto;
    margin-bottom: 20px;
    border-collapse: collapse;
  }
  .totals td {
    padding: 4px 8px;
    font-size: 12px;
  }
  .totals .label-col {
    text-align: right;
    color: #555;
    padding-right: 16px;
  }
  .totals .value-col {
    text-align: right;
    font-weight: 600;
  }
  .totals .total-row td {
    font-size: 14px;
    font-weight: 700;
    border-top: 2px solid #111;
    padding-top: 6px;
  }
  .totals .discount td {
    color: #16a34a;
  }
  .totals .paid td {
    color: #16a34a;
  }
  .notes-box {
    background: #f9f9f9;
    border: 1px solid #ddd;
    border-radius: 4px;
    padding: 8px 12px;
    margin-bottom: 16px;
    font-size: 11px;
    color: #333;
  }
  .footer {
    margin-top: 40px;
    padding-top: 12px;
    border-top: 1px solid #ddd;
    text-align: center;
    font-size: 10px;
    color: #999;
  }
  .status-badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 10px;
    border-radius: 10px;
    border: 1px solid #aaa;
  }
  @media print {
    body { padding: 0; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<div class="header">
  <div>
    ${businessName ? `<div class="business">${esc(businessName)}</div>` : ''}
    <h1>${esc(transLabel)}</h1>
  </div>
  <div class="right-col">
    <div class="number">N.° ${esc(remito.number)}</div>
    <div>Fecha: ${dateStr}</div>
    <div><span class="status-badge">${esc(statusStr)}</span></div>
  </div>
</div>

<p class="section-title">Datos</p>
<table class="meta-table">
  <tr><td class="label">Cliente</td><td>${esc(entity?.name ?? '—')}</td></tr>
  ${entity?.phone ? `<tr><td class="label">Telefono</td><td>${esc(entity.phone)}</td></tr>` : ''}
  ${entity?.address ? `<tr><td class="label">Direccion</td><td>${esc(entity.address)}</td></tr>` : ''}
  ${remito.payment_method ? `<tr><td class="label">Forma de pago</td><td>${esc(remito.payment_method)}</td></tr>` : ''}
  ${dateRows.join('\n')}
  ${extraRows.join('\n')}
</table>

${items && items.length > 0 ? `
<p class="section-title">${esc(vocab?.products ?? 'Articulos')}</p>
<table class="items-table">
  <thead>
    <tr>
      <th>Descripcion</th>
      <th class="center">Cant.</th>
      <th class="center">Unidad</th>
      <th class="right">P. Unit.</th>
      <th class="right">Dto.</th>
      <th class="right">Subtotal</th>
    </tr>
  </thead>
  <tbody>
    ${itemRows}
  </tbody>
</table>

<table class="totals">
  <tr>
    <td class="label-col">Subtotal</td>
    <td class="value-col">${formatARS(remito.subtotal)}</td>
  </tr>
  ${remito.discount > 0 ? `
  <tr class="discount">
    <td class="label-col">Descuento</td>
    <td class="value-col">- ${formatARS(remito.discount)}</td>
  </tr>` : ''}
  <tr class="total-row">
    <td class="label-col">Total</td>
    <td class="value-col">${formatARS(remito.total)}</td>
  </tr>
  ${remito.paid_amount > 0 ? `
  <tr class="paid">
    <td class="label-col">Cobrado</td>
    <td class="value-col">${formatARS(remito.paid_amount)}</td>
  </tr>` : ''}
</table>
` : ''}

${remito.notes ? `
<p class="section-title">Notas</p>
<div class="notes-box">${esc(remito.notes)}</div>
` : ''}

<div class="footer">
  Documento generado por Registral
</div>

</body>
</html>`
}
