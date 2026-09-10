<template>
  <Teleport to="body">
    <div v-if="noteModal.open" class="modal-overlay"/>
    <div v-if="noteModal.open" class="modal modal-sm">
      <div class="modal-header">
        <h3>Not</h3>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <p style="font-size:14px;line-height:1.6;white-space:pre-wrap">{{ noteModal.text }}</p>
      </div>
    </div>
  </Teleport>
</template>
<script setup>
defineProps({ noteModal: Object })
defineEmits(['close'])
</script>
