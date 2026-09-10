<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay"/>
    <div v-if="open" class="modal modal-sm" :class="{ 'shift-settings-modal': section === 'shifts' }">
      <div class="modal-header">
        <h3>{{ section === 'printer' ? 'Yazıcı Ayarları' : section === 'api' ? 'API Ayarları' : 'Vardiya Ayarları' }}</h3>
        <button class="btn-close" @click="close">&times;</button>
      </div>
      <div class="modal-body">
        <template v-if="section === 'printer'">
          <label class="field-label">Terminal Yazıcı Adı</label>
          <select :value="printerName" @input="$emit('update:printerName', $event.target.value)" class="input">
            <option value="" disabled>Yazıcı seçiniz...</option>
            <option v-for="p in printerList" :key="p" :value="p">{{ p }}</option>
          </select>
          <div class="printer-offset-section">
            <h4>Küçük etiket</h4>
            <div class="printer-offset-grid">
              <div><label class="field-label">Yatay başlangıç</label><input :value="smallLabelOffsetX" @input="$emit('update:smallLabelOffsetX', $event.target.value)" class="input" type="number" min="-100" max="100" step="1"></div>
              <div><label class="field-label">Dikey başlangıç</label><input :value="smallLabelOffsetY" @input="$emit('update:smallLabelOffsetY', $event.target.value)" class="input" type="number" min="-100" max="100" step="1"></div>
            </div>
          </div>
          <div class="printer-offset-section">
            <h4>Büyük etiket</h4>
            <div class="printer-offset-grid">
              <div><label class="field-label">Yatay başlangıç</label><input :value="largeLabelOffsetX" @input="$emit('update:largeLabelOffsetX', $event.target.value)" class="input" type="number" min="-100" max="100" step="1"></div>
              <div><label class="field-label">Dikey başlangıç</label><input :value="largeLabelOffsetY" @input="$emit('update:largeLabelOffsetY', $event.target.value)" class="input" type="number" min="-100" max="100" step="1"></div>
            </div>
          </div>
          <small class="field-hint">Değerler yazıcı noktasıdır.</small>
        </template>
        <template v-else-if="section === 'api'">
          <label class="field-label">API Adresi</label>
          <input :value="apiUrl" @input="$emit('update:apiUrl', $event.target.value)" class="input" type="text"
            inputmode="url" autocomplete="url" placeholder="tedavi.dislek.com"
            pattern="[A-Za-z0-9.-]+(:[0-9]{1,5})?" title="Alan adını protokol veya yol olmadan girin">
          <label class="field-label">API Anahtarı</label>
          <input :value="apiKey" @input="$emit('update:apiKey', $event.target.value)" class="input"
            type="password" :placeholder="apiKeyConfigured ? 'Değiştirmek için yeni anahtarı girin' : 'API anahtarını girin'"
            autocomplete="new-password">
          <small class="field-hint">
            {{ apiKeyConfigured ? 'Bir API anahtarı güvenli olarak saklanıyor.' : 'API anahtarı henüz tanımlanmamış.' }}
          </small>
          <p class="api-connection-status">{{ connectionStatusText }}</p>
          <div v-if="apiError" class="field-err" role="alert">{{ apiError }}</div>
        </template>
        <template v-else>
          <p class="shift-settings-intro">Günün 24 saatini kapsayan vardiyalar tanımlayın. Aynı başlangıç ve bitiş 24 saatlik mesaiyi gösterir; vardiyalar çakışabilir.</p>
          <div class="shift-list">
            <div v-for="(shift, index) in shifts" :key="shift.id" class="shift-row">
              <div class="shift-index">{{ index + 1 }}</div>
              <div class="shift-name-field">
                <label class="field-label">Vardiya adı</label>
                <input class="input" :value="shift.name" maxlength="40" @input="updateShift(index, 'name', $event.target.value)" />
              </div>
              <div class="shift-time-field">
                <label class="field-label">Başlangıç</label>
                <input class="input shift-time-input" type="time" :value="shift.start" @input="updateShift(index, 'start', $event.target.value)" />
              </div>
              <div class="shift-time-arrow" aria-hidden="true">→</div>
              <div class="shift-time-field">
                <label class="field-label">Bitiş</label>
                <input class="input shift-time-input" type="time" :value="shift.end" @input="updateShift(index, 'end', $event.target.value)" />
              </div>
              <button class="shift-remove" type="button" :disabled="shifts.length <= 1" aria-label="Vardiyayı kaldır" @click="removeShift(index)">&times;</button>
            </div>
          </div>
          <div v-if="shiftError" class="field-err shift-error" role="alert">{{ shiftError }}</div>
          <div class="shift-settings-actions">
            <button class="btn btn-secondary" type="button" @click="addShift">Vardiya ekle</button>
            <button class="btn btn-ghost" type="button" @click="$emit('resetShifts')">Varsayılana dön</button>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" @click="$emit('save')">Kaydet</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  open: Boolean,
  section: { type: String, default: 'printer' },
  printerName: String,
  printerList: Array,
  smallLabelOffsetX: [Number, String],
  smallLabelOffsetY: [Number, String],
  largeLabelOffsetX: [Number, String],
  largeLabelOffsetY: [Number, String],
  apiUrl: String,
  apiKey: String,
  apiKeyConfigured: Boolean,
  apiError: String,
  connectionStatusText: String,
  shifts: { type: Array, default: () => [] },
  shiftError: String
})
const emit = defineEmits(['update:open', 'update:printerName', 'update:smallLabelOffsetX', 'update:smallLabelOffsetY', 'update:largeLabelOffsetX', 'update:largeLabelOffsetY', 'update:apiUrl', 'update:apiKey', 'update:shifts', 'resetShifts', 'save'])

const close = () => emit('update:open', false)

const updateShift = (index, key, value) => {
  const next = props.shifts.map(shift => ({ ...shift }))
  next[index][key] = value
  emit('update:shifts', next)
}

const addShift = () => {
  emit('update:shifts', [
    ...props.shifts.map(shift => ({ ...shift })),
    { id: `vardiya-${Date.now()}`, name: `Vardiya ${props.shifts.length + 1}`, start: '00:00', end: '00:00' }
  ])
}

const removeShift = (index) => {
  if (props.shifts.length <= 1) return
  emit('update:shifts', props.shifts.filter((_, itemIndex) => itemIndex !== index).map(shift => ({ ...shift })))
}
</script>

<style scoped>
.shift-settings-modal { width: min(760px, calc(100vw - 40px)); }
.api-connection-status { margin: 12px 0 0; color: #5E5E7A; font-size: 12px; }
.printer-offset-section { margin-top: 14px; }
.printer-offset-section h4 { margin: 0 0 7px; color: #5B438F; font-size: 12px; font-weight: 700; }
.printer-offset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.shift-settings-intro { margin: 0 0 14px; color: #5E5E7A; font-size: 13px; line-height: 1.45; }
.shift-list { display: grid; gap: 8px; max-height: 430px; overflow-y: auto; padding-right: 4px; }
.shift-row {
  display: grid;
  grid-template-columns: 28px minmax(150px, 1fr) 116px 18px 116px 30px;
  gap: 8px;
  align-items: end;
  padding: 10px;
  border: 1px solid #DED8EA;
  border-radius: 8px;
  background: #F8F6FC;
}
.shift-index {
  align-self: center;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #E4DEF1;
  color: #5B438F;
  font-size: 12px;
  font-weight: 700;
}
.shift-row .field-label { margin-bottom: 4px; font-size: 11px; color: #6B6880; }
.shift-time-input { font-variant-numeric: tabular-nums; }
.shift-time-arrow { align-self: center; padding-bottom: 8px; color: #7C5CBF; font-weight: 700; }
.shift-remove {
  align-self: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #9C4660;
  font-size: 20px;
  cursor: pointer;
}
.shift-remove:hover:not(:disabled) { background: #F8E7EC; }
.shift-remove:disabled { opacity: .25; cursor: default; }
.shift-error { margin-top: 10px; }
.shift-settings-actions { display: flex; gap: 8px; margin-top: 12px; }
@media (max-width: 680px) {
  .shift-row { grid-template-columns: 28px 1fr 1fr 30px; }
  .shift-name-field { grid-column: 2 / 4; }
  .shift-time-arrow { display: none; }
}
</style>
