const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char])

export function buildTreatmentSheet({ patientName, date, title, hours, medications, routes }) {
  const groups = new Map()
  for (const medication of medications) {
    const route = medication.route || 'Diğer'
    if (!groups.has(route)) groups.set(route, [])
    groups.get(route).push(medication)
  }
  const colspan = 2 + hours.length
  const tables = [...groups].sort(([a], [b]) => a.localeCompare(b, 'tr-TR')).map(([route, items]) => {
    const label = routes.find(option => option.val === route)?.label || route
    const heading = label.replace(/\s*\([^)]*\)\s*$/, '').toLocaleUpperCase('tr-TR') + ' TEDAVİLER'
    const rows = items.map(item => {
      const schedule = item.asNeeded || !item.times.length
        ? `<td colspan="${hours.length}" class="schedule-note">${item.asNeeded ? 'Lüzum halinde' : 'Saat belirtilmemiş'}</td>`
        : hours.map(hour => {
          const times = item.times.filter(time => (Number(time.split(':')[0]) || 24) === hour)
          return `<td class="schedule-time">${times.map(escapeHtml).join('<br>')}</td>`
        }).join('')
      return `<tr><td class="treatment-name">${escapeHtml(item.name)}${item.note ? `<div class="treatment-note">${escapeHtml(item.note)}</div>` : ''}</td><td class="treatment-dose">${escapeHtml(item.dose)}</td>${schedule}</tr>`
    }).join('')
    return `<table class="route-table">
      <colgroup><col style="width:25%"><col style="width:13%"><col span="${hours.length}"></colgroup>
      <thead>
        <tr class="route-title"><th colspan="${colspan}" scope="colgroup">${escapeHtml(heading)}</th></tr>
        <tr><th scope="col">Tedavi</th><th scope="col">Dozu</th><th colspan="${hours.length}" scope="colgroup">Uygulama Saatleri</th></tr>
      </thead><tbody>${rows}</tbody>
    </table>`
  }).join('')

  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${escapeHtml(title)} - ${escapeHtml(patientName)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1B1B2F; margin: 0; }
  .sheet-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 16px; }
  .sheet-patient { font-size: 16px; font-weight: 700; overflow-wrap: anywhere; }
  .sheet-date { color: #666; font-size: 11px; margin-top: 4px; }
  h1 { margin: 0; font-size: 26px; letter-spacing: 2px; white-space: nowrap; }
  .route-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #666; padding: 6px 2px; text-align: center; font-size: 11px; }
  th { background: #F4F4F6; font-weight: 700; }
  .route-title th { background: #E9E7EF; text-align: left; font-size: 12px; padding: 7px 9px; }
  .treatment-name, .treatment-dose { text-align: left; padding: 6px 8px; overflow-wrap: anywhere; }
  .treatment-name { font-weight: 600; }
  .treatment-note { font-size: 10px; color: #555; font-weight: 400; margin-top: 3px; white-space: pre-wrap; }
  .schedule-time { font-size: 9px; font-variant-numeric: tabular-nums; white-space: nowrap; padding: 6px 0; }
  .schedule-note { text-align: left; padding-left: 8px; }
  .empty { padding: 20px; text-align: center; color: #666; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  @media screen { body { max-width: 277mm; margin: 20px auto; padding: 0 12px; } }
  @media print { th { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
</style></head><body>
  <header class="sheet-header"><div><div class="sheet-patient">${escapeHtml(patientName)}</div><div class="sheet-date">${escapeHtml(date)}</div></div><h1>${escapeHtml(title)}</h1></header>
  ${tables || '<p class="empty">Gösterilecek uygulama bulunmuyor.</p>'}
</body></html>`
}
