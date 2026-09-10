import { ref, reactive, computed } from 'vue'
import { cloneDefaultShifts, filterTimesByShift } from '../domain/shiftSelection.js'

const api = () => window.electronAPI

const routes = [
  { val: 'IV', label: 'İntravenöz (IV)' },
  { val: 'IM', label: 'İntramüsküler (IM)' },
  { val: 'PO', label: 'Per Oral (PO)' },
  { val: 'SC', label: 'Subkütan (SC)' },
  { val: 'PR', label: 'Per Rektum (PR)' },
  { val: 'SL', label: 'Sublingual (SL)' },
  { val: 'INH', label: 'İnhalasyon (INH)' },
  { val: 'TOP', label: 'Topikal (TOP)' },
  { val: 'DGR', label: 'Diğer (DGR)' }
]

const conditions = [
  { val: 'standard', label: 'Standart Uygulama' },
  { val: 'weekdays', label: 'Haftanın Belli Günleri' },
  { val: 'dateRange', label: 'Belirli Tarih Aralığında' },
  { val: 'everyX', label: 'X Günde Bir' },
  { val: 'xGiveYWait', label: 'X Gün Verilir Y Gün Beklenir' }
]

const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']

export function useMeds(deps = {}) {
  const { selectedPatientId, patients, labelSize, shift, drugFullNameMap } = deps
  const shifts = deps.shifts || cloneDefaultShifts()
  const conflictIgnoreActives = deps.conflictIgnoreActives || ref([])

  const meds = reactive([])
  const medModal = reactive({
    open: false, edit: false, id: null, name: '', activeIngredient: '', route: 'IV',
    dose: '', times: '', timesList: [], condition: 'standard', conditionData: {},
    note: '', startDate: '', timeDoses: {}, customLabel: '', customLabelEnabled: false, errors: {}
  })
  const drugDropdown = reactive({ open: false, query: '', results: [], focusIdx: -1, refs: {} })
  let _drugSearchTimer = null

  const patientMeds = computed(() => {
    const sid = selectedPatientId ? selectedPatientId.value : null
    return meds.filter(m => m.patientId === sid).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  })

  const conflictingIVMeds = computed(() => {
    const ignoreSet = new Set((conflictIgnoreActives.value || []).map(a => a.toLowerCase().trim()))
    const ivMeds = patientMeds.value.filter(m =>
      m.route === 'IV' &&
      !m.luezym &&
      !ignoreSet.has((m.activeIngredient || '').toLowerCase().trim())
    )
    const conflictIds = new Set()
    for (let i = 0; i < ivMeds.length; i++) {
      const timesA = ivMeds[i].times.split(',').map(t => t.trim()).filter(Boolean)
      for (let j = i + 1; j < ivMeds.length; j++) {
        const timesB = ivMeds[j].times.split(',').map(t => t.trim()).filter(Boolean)
        const shared = timesA.some(t => timesB.includes(t))
        if (shared) {
          conflictIds.add(ivMeds[i].id)
          conflictIds.add(ivMeds[j].id)
        }
      }
    }
    return conflictIds
  })

  const expiredMeds = computed(() => {
    const now = new Date()
    const expired = new Set()
    for (const m of patientMeds.value) {
      if ((m.condition || 'standard') !== 'dateRange') continue
      const d = m.conditionData || {}
      if (!d.start || !d.end) continue
      const times = m.times.split(',').map(t => t.trim()).filter(Boolean)
      if (times.length === 0) continue
      const latestTime = times.reduce((a, b) => a > b ? a : b)
      const lastDose = new Date(d.end + 'T' + latestTime)
      if (lastDose < now) expired.add(m.id)
    }
    return expired
  })

  const nonMatchingMeds = computed(() => {
    const set = new Set()
    const today = new Date()
    for (const m of patientMeds.value) {
      const cond = m.condition || 'standard'
      if (cond === 'standard' || cond === 'dateRange') continue
      if (!matchesCondition(m, today)) set.add(m.id)
    }
    return set
  })

  function normTime(t) {
    return t === '24:00' ? '00:00' : t
  }

  function sortTimes(times) {
    const values = Array.isArray(times) ? times : String(times || '').split(',')
    return values.map(t => normTime(t.trim())).filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr-TR', { numeric: true }))
  }

  function normText(s) {
    return s.replace(/\s+/g, ' ').trim()
  }

  function normDrugName(s) {
    return s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  }

  function normalizeRoute(route) {
    if (!route) return 'DGR'
    const r = route.trim().toUpperCase()
    const known = routes.find(rr => rr.val === r)
    if (known) return known.val
    const routeMap = {
      'INTRAVENOZ': 'IV', 'INTRAVENÖZ': 'IV', 'IV': 'IV',
      'INTRAMUSKULER': 'IM', 'INTRAMÜSKÜLER': 'IM', 'IM': 'IM',
      'PER ORAL': 'PO', 'ORAL': 'PO', 'PO': 'PO',
      'SUBKUTAN': 'SC', 'SUBKÜTAN': 'SC', 'SC': 'SC',
      'PER REKTUM': 'PR', 'REKTAL': 'PR', 'PR': 'PR',
      'SUBLINGUAL': 'SL', 'SL': 'SL',
      'INHALASYON': 'INH', 'İNHALASYON': 'INH', 'INH': 'INH',
      'TOPIKAL': 'TOP', 'TOP': 'TOP'
    }
    return routeMap[r] || 'DGR'
  }

  function medDay(m) {
    if (!m.startDate) return ''
    const start = new Date(m.startDate.split('-').join('/'))
    const today = new Date()
    const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1
    if (diff < 0) return '0'
    return '' + diff
  }

  function effectiveDose(m, time) {
    if (time && m.timeDoses && m.timeDoses[time]) return m.timeDoses[time]
    return m.dose
  }

  function matchesCondition(med, dateOverride) {
    const cond = med.condition || 'standard'
    const data = med.conditionData || {}
    if (cond === 'standard') return true
    const refDate = dateOverride || (deps.referenceDate ? new Date(deps.referenceDate.value + 'T00:00:00') : new Date())
    if (cond === 'weekdays') {
      if (!data.days || data.days.length === 0) return false
      const uiDay = refDate.getDay()
      const jsToUi = [6, 0, 1, 2, 3, 4, 5]
      return data.days.includes(jsToUi[uiDay])
    }
    if (cond === 'dateRange') {
      if (!data.start || !data.end) return false
      const start = new Date(data.start + 'T00:00:00')
      const end = new Date(data.end + 'T00:00:00')
      end.setHours(23, 59, 59)
      return refDate >= start && refDate <= end
    }
    if (cond === 'everyX') {
      if (!data.x || !med.startDate) return false
      const start = new Date(med.startDate + 'T00:00:00')
      const diff = Math.floor((refDate - start) / (1000 * 60 * 60 * 24))
      return diff >= 0 && diff % data.x === 0
    }
    if (cond === 'xGiveYWait') {
      if (!data.give || !data.wait || !med.startDate) return false
      const start = new Date(med.startDate + 'T00:00:00')
      const diff = Math.floor((refDate - start) / (1000 * 60 * 60 * 24))
      if (diff < 0) return false
      const cycle = data.give + data.wait
      const pos = diff % cycle
      return pos < data.give
    }
    return true
  }

  function filterByShift(times, shift) {
    return filterTimesByShift(times, shift, shifts?.value || shifts)
  }

  function drugFullNameTooltip(m) {
    const ai = (m.activeIngredient || '').toLowerCase().trim()
    const route = (m.route || '').toLowerCase().trim()
    const map = drugFullNameMap ? drugFullNameMap.value : {}
    const all = map[ai + '|' + route]
    if (!all || !all.length) return 'Muadili yok'
    const muadil = all.filter(n => n.toLowerCase() !== (m.name || '').toLowerCase())
    if (!muadil.length) return 'Muadili yok'
    return 'Muadiller\n' + muadil.join('\n')
  }

  function sanitize(s) {
    const map = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' }
    return s.replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => map[ch])
  }

  function openMedModal(med) {
    drugDropdown.open = false
    if (med) {
      const normTD = {}
      if (med.timeDoses) Object.keys(med.timeDoses).forEach(k => { normTD[normTime(k)] = med.timeDoses[k] })
      medModal.open = true
      medModal.edit = true
      medModal.id = med.id
      medModal.name = med.name
      medModal.activeIngredient = med.activeIngredient || ''
      medModal.route = med.route
      medModal.dose = med.dose
      medModal.times = med.times
      medModal.timesList = sortTimes(med.times)
      medModal.condition = med.condition || 'standard'
      medModal.conditionData = med.conditionData ? JSON.parse(JSON.stringify(med.conditionData)) : {}
      medModal.note = med.note || ''
      medModal.startDate = med.startDate || ''
      medModal.timeDoses = normTD
      medModal.customLabel = med.customLabel || ''
      medModal.customLabelEnabled = !!med.customLabel
      medModal.errors = {}
    } else {
      medModal.open = true
      medModal.edit = false
      medModal.id = null
      medModal.name = ''
      medModal.activeIngredient = ''
      medModal.route = ''
      medModal.dose = ''
      medModal.times = ''
      medModal.timesList = []
      medModal.condition = 'standard'
      medModal.conditionData = {}
      medModal.note = ''
      medModal.startDate = ''
      medModal.timeDoses = {}
      medModal.customLabel = ''
      medModal.customLabelEnabled = false
      medModal.errors = {}
    }
  }

  async function saveMed(data) {
    const { name, route, dose, timesList, condition, conditionData, note, startDate, timeDoses, activeIngredient } = data || medModal
    const errs = {}
    if (!name.trim()) errs.name = true
    if (!dose.trim()) errs.dose = true
    if (timesList.length === 0) errs.times = true
    if (condition === 'weekdays' && (!conditionData.days || conditionData.days.length === 0)) errs.days = true
    if (condition === 'dateRange' && (!conditionData.start || !conditionData.end)) errs.dateRange = true
    if (condition === 'dateRange' && conditionData.start && conditionData.end) {
      const start = new Date(conditionData.start + 'T00:00:00')
      const end = new Date(conditionData.end + 'T00:00:00')
      if (end < start) errs.dateRangeEndBeforeStart = true
    }
    if (condition === 'everyX' && !conditionData.x) errs.everyX = true
    if (condition === 'xGiveYWait' && (!conditionData.give || !conditionData.wait)) errs.xGiveYWait = true
    medModal.errors = errs
    if (Object.keys(errs).length) return

    const normName = normDrugName(name)
    const normRoute = normText(route)
    const normDose = normText(dose)
    const normedTimes = sortTimes(timesList)
    const times = normedTimes.join(', ')
    const cleanupDoses = {}
    Object.keys(timeDoses).forEach(k => { cleanupDoses[normTime(k)] = timeDoses[k] })
    Object.keys(cleanupDoses).forEach(k => { if (!cleanupDoses[k]) delete cleanupDoses[k] })
    medModal.name = normName
    const payload = {
      name: normName,
      activeIngredient: (activeIngredient || '').toLowerCase().trim(),
      route: normRoute,
      dose: normDose,
      times,
      condition,
      conditionData: JSON.parse(JSON.stringify(conditionData)),
      note: normText(note || ''),
      startDate: startDate || '',
      timeDoses: cleanupDoses,
      customLabel: medModal.customLabelEnabled ? medModal.customLabel : ''
    }
    if (medModal.edit) {
      await api().dbUpdateMed(medModal.id, payload)
      const m = meds.find(m => m.id === medModal.id)
      if (m) Object.assign(m, payload)
    } else {
      const sid = selectedPatientId ? selectedPatientId.value : null
      const id = await api().dbAddMed({ ...payload, patientId: sid })
      meds.push({ id, patientId: sid, ...payload })
    }
    medModal.open = false
  }

  async function removeMed(id) {
    const med = meds.find(x => x.id === id)
    if (!med) return
    const p = patients ? (patients.value || patients).find(x => x.id === med.patientId) : null
    if (deps.confirm) {
      deps.confirm.open = true
      deps.confirm.message = `"${med.name}" isimli ilacı "${p?.name || 'bilinmeyen'}" isimli hastadan silmek istediğinize emin misiniz?`
      deps.confirm.onConfirm = async () => {
        if (deps.confirm) deps.confirm.open = false
        await api().dbDeleteMed(id)
        const idx = meds.findIndex(x => x.id === id)
        if (idx > -1) meds.splice(idx, 1)
      }
    }
  }

  function openDrugDropdown() {
    drugDropdown.open = true
    drugDropdown.query = ''
    drugDropdown.results = []
    drugDropdown.focusIdx = -1
    setTimeout(() => {
      const el = document.querySelector('.drug-dropdown-search')
      if (el) { el.focus(); el.select() }
    }, 50)
  }

  function closeDrugDropdown() {
    drugDropdown.open = false
  }

  async function onDrugSearch() {
    const q = drugDropdown.query
    if (q.length < 2) { drugDropdown.results = []; return }
    if (_drugSearchTimer) clearTimeout(_drugSearchTimer)
    _drugSearchTimer = setTimeout(async () => {
      drugDropdown.results = await api().dbSearchDrugCatalog(q)
      drugDropdown.focusIdx = drugDropdown.results.length ? 0 : -1
      setTimeout(() => {
        const el = document.querySelector('.drug-dropdown-search')
        if (el) el.focus()
      }, 50)
    }, 200)
  }

  function selectDrug(d) {
    medModal.name = normDrugName(d.label)
    medModal.activeIngredient = normDrugName(d.active_ingredient)
    if (d.form) {
      const found = routes.find(r => r.val === d.form.toUpperCase())
      if (found) medModal.route = found.val
    }
    closeDrugDropdown()
  }

  function selectFirstDrug() {
    if (drugDropdown.results.length) selectDrug(drugDropdown.results[0])
  }

  function drugDropdownFocusNext() {
    const max = drugDropdown.results.length - 1
    drugDropdown.focusIdx = Math.min(drugDropdown.focusIdx + 1, max)
    const el = drugDropdown.refs[drugDropdown.focusIdx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }

  function drugDropdownFocusPrev() {
    drugDropdown.focusIdx = Math.max(drugDropdown.focusIdx - 1, 0)
    const el = drugDropdown.refs[drugDropdown.focusIdx]
    if (el) el.scrollIntoView({ block: 'nearest' })
  }

  function addTime() {
    const t = normTime(medModal.newTime)
    if (t && !medModal.timesList.includes(t)) {
      medModal.timesList.push(t)
      medModal.timesList = sortTimes(medModal.timesList)
    }
    medModal.newTime = ''
  }

  function removeTime(idx) {
    const t = medModal.timesList[idx]
    delete medModal.timeDoses[t]
    medModal.timesList.splice(idx, 1)
  }

  function toggleDay(i) {
    if (!medModal.conditionData.days) medModal.conditionData.days = []
    const days = medModal.conditionData.days
    const idx = days.indexOf(i)
    if (idx > -1) days.splice(idx, 1)
    else days.push(i)
  }

  function setTimes(preset) {
    medModal.timesList = sortTimes(preset.map(h => `${h.toString().padStart(2, '0')}:00`))
  }

  function printLabel(med, patientName, labelSize, shift) {
    const isLarge = labelSize === 'buyuk'
    const pw = isLarge ? '450' : '380'
    const times = med.times.split(',').map(t => t.trim()).filter(Boolean)
    const shiftTimes = filterByShift(times, shift)
    const displayName = patientName || (patients ? (patients.find(p => p.id === med.patientId) || {}).name : '')

    shiftTimes.forEach(time => {
      const dose = effectiveDose(med, time)
      const [hour, minute] = time.split(':')
      const zpl = `^XA
 ^PW${pw}
 ^LL${isLarge ? 260 : 140}
 ^LH0,0
 ^LS0
 ^LT0
 ${isLarge
   ? `^ADN,40,20^FO0,20^FD${displayName}^FS`
   : `^ADN,32,15^FO30,10^FD${displayName}^FS`}
 ${isLarge
   ? `^ADN,40,20^FO0,70^FD${med.name.substring(0, 12)}^FS^ADN,40,20^FO0,120^FD${dose}^FS^ADN,40,20^FO0,170^FD${med.route}^FS^ADN,80,50^FO320,60^FD${hour}^FS^ADN,80,50^FO320,120^FD${minute}^FS`
   : `^ADN,32,15^FO30,60^FD${med.name.substring(0, 9)}^FS^ADN,28,15^FO270,60^FD${med.route}^FS^ADN,32,15^FO30,110^FD${dose}^FS^ADN,60,30^FO200,105^FD${hour}^FS^ADN,28,16^FO270,105^FD${minute}^FS`}
 ^XZ`
      if (api()) api().printLabel(sanitize(zpl))
    })
  }

  return {
    meds,
    medModal,
    drugDropdown,
    patientMeds,
    conflictingIVMeds,
    expiredMeds,
    nonMatchingMeds,
    routes,
    conditions,
    dayNames,
    openMedModal,
    saveMed,
    removeMed,
    openDrugDropdown,
    closeDrugDropdown,
    onDrugSearch,
    selectDrug,
    selectFirstDrug,
    drugDropdownFocusNext,
    drugDropdownFocusPrev,
    addTime,
    removeTime,
    toggleDay,
    setTimes,
    medDay,
    effectiveDose,
    matchesCondition,
    filterByShift,
    printLabel,
    drugFullNameTooltip,
    normDrugName,
    normalizeRoute,
    normTime,
    sanitize
  }
}
