export async function importSelectedOrders({
  orders,
  selectedIndexes,
  patientId,
  api,
  normalizeDrugName = value => value,
  normalizeRoute = value => value
}) {
  const imported = []
  const skipped = []

  for (const index of selectedIndexes) {
    const order = orders[index]
    if (!order) continue

    const match = await api.dbLookupDrugByName(order.name)
    if (!match) {
      skipped.push(order.name)
      continue
    }

    const medication = {
      patientId,
      name: normalizeDrugName(match.label),
      activeIngredient: normalizeDrugName(match.activeIngredient),
      route: normalizeRoute(order.route),
      dose: order.dose,
      doseValue: order.doseValue,
      doseUnit: order.doseUnit,
      times: order.times,
      condition: 'standard',
      conditionData: {},
      note: order.note,
      startDate: ''
    }
    const id = await api.dbAddMed(medication)
    imported.push({ id, ...medication })
  }

  return { imported, skipped }
}
