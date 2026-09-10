<template>
  <Teleport to="body">
    <div v-if="activeReminder" class="modal-overlay priority-alert-overlay"/>
    <div v-if="activeReminder" class="modal priority-alert-modal" role="alertdialog" aria-modal="true" style="width:380px">
      <div class="modal-header">
        <h3>Hatırlatma</h3>
      </div>
      <div class="modal-body" style="text-align:center;padding:24px">
        <Bell :size="48" :stroke-width="1" style="color:#7C5CBF;margin-bottom:12px"/>
        <p style="font-size:13px;color:#888;margin-bottom:8px">{{ formatReminderDate(activeReminder.datetime) }}</p>
        <p style="font-size:16px;font-weight:600">{{ activeReminder.text }}</p>
      </div>
      <div class="modal-footer" style="justify-content:center">
        <button class="btn btn-primary" @click="$emit('dismiss')">Tamam</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { Bell } from '@lucide/vue'

defineProps({
  activeReminder: Object,
  formatReminderDate: Function
})

defineEmits(['dismiss'])
</script>
