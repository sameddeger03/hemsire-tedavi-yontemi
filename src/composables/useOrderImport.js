import { reactive } from 'vue'

const api = () => window.electronAPI

export function useOrderImport(deps = {}) {
  const { selectedPatientId, normalizeRoute, normDrugName } = deps

  const orderImport = reactive({ open: false, loading: false, error: '', orders: [], selected: [] })

  async function autoImport() {
    if (!api()) return
    orderImport.open = true
    orderImport.loading = true
    orderImport.error = ''
    orderImport.orders = []
    orderImport.selected = []
    const result = await api().clipboardParseOrders()
    if (result.error) {
      orderImport.error = result.error
      orderImport.loading = false
      return
    }
    if (result.orders.length === 0) {
      orderImport.error = 'Panoda ilaç bulunamadı'
      orderImport.loading = false
      return
    }
    orderImport.orders = result.orders
    orderImport.selected = result.orders.map((o, i) => i)
    orderImport.loading = false
  }

  function toggleOrderSel(i) {
    const idx = orderImport.selected.indexOf(i)
    if (idx > -1) orderImport.selected.splice(idx, 1)
    else orderImport.selected.push(i)
  }

  async function confirmOrderImport(medsRef) {
    const norm = normDrugName || ((s) => s)
    const normRoute = normalizeRoute || ((r) => r)
    const sid = selectedPatientId ? selectedPatientId.value : null
    const skipped = []
    for (const i of orderImport.selected) {
      const o = orderImport.orders[i]
      let label = ''
      let activeIng = ''
      if (api()) {
        const match = await api().dbLookupDrugByName(o.name)
        if (match) {
          label = norm(match.label)
          activeIng = norm(match.activeIngredient)
        } else {
          skipped.push(o.name)
          continue
        }
      } else {
        label = o.name
      }
      const id = await api().dbAddMed({
        patientId: sid,
        name: label,
        activeIngredient: activeIng,
        route: normRoute(o.route),
        dose: o.dose,
        times: o.times,
        condition: 'standard',
        conditionData: {},
        note: o.note,
        startDate: o.startDate || ''
      })
      if (medsRef && medsRef.push) {
        medsRef.push({
          id, patientId: sid,
          name: label, activeIngredient: activeIng,
          route: normRoute(o.route), dose: o.dose,
          times: o.times, condition: 'standard',
          conditionData: {}, note: o.note,
          startDate: o.startDate || ''
        })
      }
    }
    orderImport.open = false
    if (skipped.length) {
      console.warn('Aktarılmayan ilaçlar:', skipped.join(', '))
    }
  }

  return {
    orderImport,
    autoImport,
    toggleOrderSel,
    confirmOrderImport
  }
}
