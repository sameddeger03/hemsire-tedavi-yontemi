<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay"/>
    <div v-if="open" class="modal modal-sm">
      <div class="modal-header">
        <h3>{{ reportModal.drugSelected ? 'Hatalı İlaç Bilgisi Bildir' : 'Hata Bildir / Öneri' }}</h3>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <template v-if="!reportModal.drugSelected">
        <label class="field-label">Konu</label>
        <div class="topic-chips">
          <button v-for="t in reportTopics" :key="t.val" class="topic-chip" :class="{ active: reportModal.topic === t.val }" @click="setTopic(t.val)">{{ t.label }}</button>
        </div>
        </template>

        <template v-if="reportModal.topic === 'yanlış-ilaç-bilgisi'">
          <label class="field-label" style="margin-top:12px">Bildirilen İlaç</label>
          <div v-if="reportModal.drugSelected" class="report-drug-context">
            <strong>{{ reportModal.drugSelected.label }}</strong>
            <span>{{ [reportModal.drugSelected.active_ingredient, reportModal.drugSelected.form].filter(Boolean).join(' · ') }}</span>
          </div>
        </template>

        <label class="field-label" style="margin-top:12px">Hemşire Adı Soyadı</label>
        <input v-model="reportModal.nurseName" class="input" placeholder="Adınız ve soyadınız"/>

        <label class="field-label" style="margin-top:12px">Mesaj</label>
        <textarea v-model="reportModal.message" class="input textarea" :placeholder="reportPlaceholder" rows="4"></textarea>

        <div v-if="reportModal.sent" class="report-success">✓ Mesajınız gönderildi. Teşekkür ederiz.</div>
        <div v-if="reportCooldown > 0" class="field-err" style="margin-top:8px">Dakikada 1 mesaj gönderebilirsiniz. {{ reportCooldown }} saniye bekleyin.</div>
        <div v-else-if="reportError" class="field-err" style="margin-top:8px">{{ reportError }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" :disabled="reportModal.sending" @click="$emit('send')">{{ reportModal.sending ? 'Gönderiliyor...' : 'Gönder' }}</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
const props = defineProps({
  open: Boolean,
  reportTopics: Array,
  reportModal: Object,
  reportPlaceholder: String,
  reportCooldown: Number,
  reportError: String
})
defineEmits(['close', 'send'])

const setTopic = (val) => {
  props.reportModal.topic = val
  props.reportModal.sent = false
}

</script>
