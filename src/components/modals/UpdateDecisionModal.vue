<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay update-decision-overlay"/>
    <div v-if="open" class="modal modal-sm update-decision-modal" role="alertdialog" aria-modal="true" aria-labelledby="update-decision-title">
      <div class="modal-header update-decision-header">
        <span class="update-decision-icon"><RefreshCw :size="19"/></span>
        <div>
          <h3 id="update-decision-title">Uygulama güncellemesi</h3>
          <span v-if="version" class="update-version">Sürüm {{ version }}</span>
        </div>
      </div>
      <div class="modal-body update-decision-body">
        <p>Yeni sürüm hazır. Şimdi güncellensin mi?</p>
        <small>Güncelleme sırasında uygulama yeniden başlatılacak. Açık işleminizi tamamlamak için daha sonra güncellemeyi seçebilirsiniz.</small>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('later')">Sonra Güncelle</button>
        <button class="btn btn-primary" @click="$emit('install')">Şimdi Güncelle</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { RefreshCw } from '@lucide/vue'

defineProps({ open: Boolean, version: String })
defineEmits(['later', 'install'])
</script>

<style scoped>
.update-decision-overlay { z-index: 10000; }
.update-decision-modal { z-index: 10001; overflow: hidden; }
.update-decision-header { justify-content: flex-start; gap: 12px; }
.update-decision-header h3 { margin: 0; }
.update-decision-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  border-radius: 12px;
  color: #6f4bb8;
  background: #eee8f8;
}
.update-version {
  display: block;
  margin-top: 3px;
  color: #7b728c;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .02em;
}
.update-decision-body p { margin: 0 0 7px; font-size: 14px; font-weight: 600; color: #1b1b2f; }
.update-decision-body small { display: block; color: #6f6b7d; font-size: 12px; line-height: 1.55; }
</style>
