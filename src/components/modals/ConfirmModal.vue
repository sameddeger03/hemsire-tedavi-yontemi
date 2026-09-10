<template>
  <Teleport to="body">
    <div v-if="confirm.open" class="modal-overlay confirm-overlay"/>
    <div v-if="confirm.open" class="modal modal-sm confirm-modal">
      <div class="modal-body">
        <p style="font-size:14px;line-height:1.6">{{ confirm.message }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('cancel')">İptal</button>
        <button class="btn btn-danger" @click="$emit('confirm')">Evet</button>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
defineProps({ confirm: Object })
defineEmits(['cancel', 'confirm'])
</script>
<style scoped>
.confirm-overlay { z-index: 4000; }
.confirm-modal { z-index: 5000; }
</style>
