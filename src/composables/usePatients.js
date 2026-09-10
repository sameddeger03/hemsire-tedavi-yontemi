import { ref, reactive, computed } from 'vue'

const api = () => window.electronAPI

export function usePatients(deps = {}) {
  const { loadMayi: _loadMayi, closeFloatingMenus: _closeFloating, meds: _medsRef } = deps

  const patients = reactive([])
  const selectedPatientId = ref(null)
  const patientModal = reactive({ open: false, edit: false, id: null, name: '', height: '', weight: '', patientNo: '' })
  const patientDuplicate = ref(false)
  const archiveOpen = ref(false)

  const activePatients = computed(() =>
    patients.filter(p => !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  )
  const archivedPatients = computed(() =>
    patients.filter(p => p.archived).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  )
  const selectedPatient = computed(() =>
    patients.find(p => p.id === selectedPatientId.value)
  )

  function normPatientName(s) {
    return s.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr')
  }

  function calcVya(p) {
    const h = parseFloat(p.height)
    const w = parseFloat(p.weight)
    if (h > 0 && w > 0) return Math.sqrt((h * w) / 3600).toFixed(2) + ' m²'
    return '|'
  }

  function patientTooltip(p) {
    const lines = []
    if (p.patient_no) lines.push('Hasta No: ' + p.patient_no)
    else lines.push('Hasta no girilmemiş')
    if (p.height) lines.push('Boy: ' + p.height + ' cm')
    else lines.push('Boy bilgisi yok')
    if (p.weight) lines.push('Kilo: ' + p.weight + ' kg')
    else lines.push('Kilo bilgisi yok')
    lines.push('VYA: ' + calcVya(p))
    return lines.join('\n')
  }

  function selectPatient(id) {
    selectedPatientId.value = id
    if (_loadMayi) _loadMayi(id)
  }

  async function loadMayiOverride(patientId) {
    if (_loadMayi) _loadMayi(patientId)
  }

  function openPatientModal(patient) {
    patientDuplicate.value = false
    if (patient) {
      patientModal.open = true
      patientModal.edit = true
      patientModal.id = patient.id
      patientModal.name = patient.name
      patientModal.height = patient.height || ''
      patientModal.weight = patient.weight || ''
      patientModal.patientNo = patient.patient_no || ''
    } else {
      patientModal.open = true
      patientModal.edit = false
      patientModal.id = null
      patientModal.name = ''
      patientModal.height = ''
      patientModal.weight = ''
      patientModal.patientNo = ''
    }
  }

  async function savePatient(name, height, weight, patientNo, editId) {
    const nm = normPatientName(name || patientModal.name)
    if (!nm) return
    const ht = (height || patientModal.height || '').trim()
    const wt = (weight || patientModal.weight || '').trim()
    const pn = (patientNo || patientModal.patientNo || '').trim()
    if (editId || patientModal.edit) {
      const id = editId || patientModal.id
      const ok = await api().dbUpdatePatient(id, nm, ht, wt, pn)
      if (!ok) { patientDuplicate.value = true; return }
      const newList = await api().dbGetPatients()
      patients.length = 0
      patients.push(...newList)
    } else {
      const id = await api().dbAddPatient(nm, ht, wt, pn)
      if (id === -1) { patientDuplicate.value = true; return }
      const newList = await api().dbGetPatients()
      patients.length = 0
      patients.push(...newList)
      selectedPatientId.value = id
    }
    patientModal.open = false
  }

  async function archivePatient(id) {
    await api().dbArchivePatient(id)
    const p = patients.find(p => p.id === id)
    if (p) p.archived = true
    if (_closeFloating) _closeFloating()
    if (selectedPatientId.value === id) {
      const active = patients.filter(x => !x.archived)
      selectedPatientId.value = active.length ? active[0].id : null
    }
  }

  async function restorePatient(id) {
    await api().dbRestorePatient(id)
    const p = patients.find(p => p.id === id)
    if (p) p.archived = false
    if (_closeFloating) _closeFloating()
  }

  async function removePatient(id, from = 'liste') {
    const p = patients.find(p => p.id === id)
    if (!p) return
    const yer = from === 'arsiv' ? 'arşivden' : 'listeden'
    if (deps.confirm) {
      deps.confirm.open = true
      deps.confirm.message = `"${p.name}" isimli hasta ${yer} kaldırılacak. Emin misiniz?`
      deps.confirm.onConfirm = async () => {
        if (deps.confirm) deps.confirm.open = false
        await api().dbDeletePatient(id)
        const idx = patients.findIndex(x => x.id === id)
        if (idx > -1) patients.splice(idx, 1)
        if (_medsRef) {
          const medIdx = _medsRef.findIndex(m => m.patientId === id)
          while (medIdx > -1) {
            _medsRef.splice(medIdx, 1)
          }
        }
        if (_closeFloating) _closeFloating()
        if (selectedPatientId.value === id) {
          const active = patients.filter(x => !x.archived)
          selectedPatientId.value = active.length ? active[0].id : null
        }
      }
    }
  }

  function editArchivedPatient(p) {
    if (_closeFloating) _closeFloating()
    patientDuplicate.value = false
    patientModal.open = true
    patientModal.edit = true
    patientModal.id = p.id
    patientModal.name = p.name
    patientModal.height = p.height || ''
    patientModal.weight = p.weight || ''
    patientModal.patientNo = p.patient_no || ''
  }

  return {
    patients,
    activePatients,
    archivedPatients,
    selectedPatientId,
    selectedPatient,
    patientModal,
    patientDuplicate,
    archiveOpen,
    selectPatient,
    loadMayi: loadMayiOverride,
    openPatientModal,
    savePatient,
    archivePatient,
    restorePatient,
    removePatient,
    editArchivedPatient,
    patientTooltip,
    calcVya,
    normPatientName
  }
}
