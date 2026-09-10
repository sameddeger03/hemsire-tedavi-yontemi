<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay"/>
    <div v-if="open" class="modal">
      <div class="modal-header">
        <h3>Özel Etiket</h3>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body">
        <label class="field-label">Etiket Metni</label>
        <textarea :value="text" @input="$emit('update:text', $event.target.value)" class="input ozel-textarea" rows="4" placeholder="Her satır ayrı bir satır olarak basılır"></textarea>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" @click="$emit('print')">Yazdır</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
defineProps({
  open: Boolean,
  text: String
})

defineEmits(['close', 'print', 'update:text'])
</script>
