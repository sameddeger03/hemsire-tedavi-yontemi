export function applyImportedPatient(form, patient) {
  for (const field of ['name', 'patientNo', 'gender', 'birthDate']) {
    if (patient[field]) form[field] = patient[field]
  }
}

export function importedPatientLabel(patient, index) {
  const identity = patient.name || (patient.patientNo ? `Hasta No: ${patient.patientNo}` : `Hasta ${index + 1}`)
  const details = [patient.gender, patient.birthDate].filter(Boolean).join(' · ')
  return details ? `${identity} · ${details}` : identity
}
