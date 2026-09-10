<template>
  <Teleport to="body">
    <div v-if="patientModal.open" class="modal-overlay"/>
    <div v-if="patientModal.open" class="modal">
      <div class="modal-header">
        <h3>{{ patientModal.edit ? 'Hasta Düzenle' : 'Yeni Hasta' }}</h3>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <div v-if="patientClipboard.error" class="patient-paste-error" role="alert">
          {{ patientClipboard.error }}
        </div>
        <label class="field-label">Hasta Adı</label>
        <input v-model="patientModal.name" class="input" :class="{ err: patientDuplicate }" @keyup.enter="$emit('save')" @input="$emit('resetDuplicate')"/>
        <div v-if="patientDuplicate" class="field-err">Bu isimde bir hasta zaten var</div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <div style="flex:1">
            <label class="field-label">Cinsiyet</label>
            <select v-model="patientModal.gender" class="input">
<option value="Erkek">Erkek</option>
              <option value="Kadın">Kadın</option>
            </select>
          </div>
          <div style="flex:1">
            <label class="field-label">Doğum Tarihi</label>
            <input v-model="patientModal.birthDate" class="input" type="date" placeholder="İsteğe bağlı"/>
          </div>
        </div>
        <label class="field-label" style="margin-top:12px">Hasta No</label>
        <input v-model="patientModal.patientNo" class="input" placeholder="İsteğe bağlı"/>
        <div style="display:flex;gap:8px;margin-top:12px">
          <div style="flex:1">
            <label class="field-label">Boy (cm)</label>
            <input v-model="patientModal.height" class="input" placeholder="İsteğe bağlı"/>
          </div>
          <div style="flex:1">
            <label class="field-label">Kilo (kg)</label>
            <input v-model="patientModal.weight" class="input" placeholder="İsteğe bağlı"/>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button
          v-if="!patientModal.edit"
          class="btn btn-info patient-paste-button"
          type="button"
          :disabled="patientClipboard.loading"
          @click="$emit('pastePatient')"
        >
          <ClipboardPaste :size="15" />
          {{ patientClipboard.loading ? 'Pano okunuyor...' : 'Panodan Al' }}
        </button>
        <button class="btn btn-primary" @click="$emit('save')">Kaydet</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ClipboardPaste } from '@lucide/vue'

defineProps({
  patientModal: Object,
  patientDuplicate: Boolean,
  patientClipboard: Object
})
defineEmits(['close', 'save', 'resetDuplicate', 'pastePatient'])
</script>

<style scoped>
.patient-paste-button {
  margin-right: auto;
}

.btn-info {
  border: 1px solid #CFC4E5;
  background: #EDEAF5;
  color: #6A4DA8;
}

.btn-info:hover:not(:disabled) {
  border-color: #7C5CBF;
  background: #DDD6EC;
  color: #4A3880;
}

.patient-paste-error {
  margin-bottom: 12px;
  padding: 9px 11px;
  border-radius: 7px;
  background: rgba(220, 38, 38, 0.1);
  color: #B33D3D;
  font-size: 12px;
}

</style>
