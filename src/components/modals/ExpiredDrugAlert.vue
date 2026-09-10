<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay priority-alert-overlay"/>
    <div v-if="open" class="modal priority-alert-modal" role="alertdialog" aria-modal="true" style="width:480px">
      <div class="modal-header">
        <h3>Son Kullanma Tarihi Geçmiş İlaçlar</h3>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body" style="white-space:pre-wrap;font-size:13px;line-height:1.6">
        {{ message }}
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" @click="$emit('close')">Tamam</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  open: Boolean,
  message: String
})

defineEmits(['close'])
</script>
