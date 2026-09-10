<template>
  <Teleport to="body">
    <div v-if="patients.length" class="modal-overlay patient-select-overlay" @click="$emit('close')"/>
    <div v-if="patients.length" class="modal modal-lg patient-select-modal" role="dialog" aria-modal="true" aria-labelledby="patient-select-title">
      <div class="modal-header">
        <div class="patient-select-heading">
          <ClipboardPaste :size="18" />
          <h3 id="patient-select-title">Panodan Hasta Seç</h3>
        </div>
        <button class="btn-close" aria-label="Kapat" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body patient-select-body">
        <p class="patient-select-help">Panoda birden fazla hasta bulundu. Forma aktarılacak hastayı seçin.</p>
        <button
          v-for="(patient, index) in patients"
          :key="`${patient.patientNo || patient.name || 'hasta'}-${index}`"
          type="button"
          class="patient-select-option"
          @click="$emit('select', patient)"
        >
          <span>{{ patient.displayLabel }}</span>
          <ChevronRight :size="17" />
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ChevronRight, ClipboardPaste } from '@lucide/vue'

defineProps({ patients: { type: Array, default: () => [] } })
defineEmits(['close', 'select'])
</script>

<style scoped>
.patient-select-overlay { z-index: 4000; }
.patient-select-modal { z-index: 5000; }
.patient-select-heading { display: flex; align-items: center; gap: 8px; color: #6A4DA8; }
.patient-select-heading h3 { color: #1B1B2F; }
.patient-select-body { display: grid; gap: 8px; max-height: 55vh; overflow-y: auto; }
.patient-select-help { margin: 0 0 4px; color: #5E5E7A; font-size: 12px; line-height: 1.5; }
.patient-select-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid #E2E0DA;
  border-radius: 8px;
  background: #FFFFFF;
  color: #1B1B2F;
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color .15s, background .15s, color .15s;
}
.patient-select-option:hover,
.patient-select-option:focus-visible {
  border-color: #7C5CBF;
  background: #EDEAF5;
  color: #4A3880;
  outline: none;
}
</style>
