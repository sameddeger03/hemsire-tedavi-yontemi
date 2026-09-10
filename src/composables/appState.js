// Paylaşılan reaktif state — birden çok composable'ın okuduğu/yazdığı veriler
import { ref, computed } from 'vue'
import { cloneDefaultShifts, shiftForTime } from '../domain/shiftSelection.js'

export function createAppState() {
  const patients = ref([])
  const meds = ref([])
  const selectedPatientId = ref(null)
  const drugProps = ref({})
  const drugPropsLoading = ref(false)
  const conflictIgnoreActives = ref([])
  const dosageRules = ref([])
  const drugFullNameMap = ref({})
  const serverOnline = ref(false)
  const catalogLastUpdatedAt = ref('')
  const confirm = ref({ open: false, message: '', onConfirm: null })
  const apiUrl = ref('https://tedavi.dislek.com')
  const labelSize = ref('buyuk')
  const smallLabelOffsetX = ref(45)
  const smallLabelOffsetY = ref(15)
  const largeLabelOffsetX = ref(0)
  const largeLabelOffsetY = ref(0)
  const shifts = ref(cloneDefaultShifts())
  const shift = ref(shiftForTime(new Date(), shifts.value))
  // Yerel saatle bugünün tarihi (UTC degil)
const today = new Date()
const referenceDate = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`)
  const isDev = ref(false)
  const statusbarNow = ref(Date.now())

  const activePatients = computed(() =>
    patients.value.filter(p => !p.archived).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  )
  const archivedPatients = computed(() =>
    patients.value.filter(p => p.archived).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
  )
  const selectedPatient = computed(() =>
    patients.value.find(p => p.id === selectedPatientId.value)
  )

  return {
    patients, meds, selectedPatientId, drugProps, drugPropsLoading,
    conflictIgnoreActives, dosageRules, drugFullNameMap,
    serverOnline, catalogLastUpdatedAt,
    confirm, statusbarNow, apiUrl, labelSize, smallLabelOffsetX, smallLabelOffsetY, largeLabelOffsetX, largeLabelOffsetY, shift, shifts, referenceDate, isDev,
    activePatients, archivedPatients, selectedPatient
  }
}
