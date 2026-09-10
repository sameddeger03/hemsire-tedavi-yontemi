<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay"/>
    <div v-if="open" class="modal modal-lg">
      <div class="modal-header">
        <h3>Arşiv</h3>
        <button class="btn-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="modal-body" style="padding:0">
        <table class="archive-table" v-if="archivedPatients.length">
          <thead>
            <tr>
              <th>Hasta No</th>
              <th>Hasta Adı</th>
              <th>Boy</th>
              <th>Kilo</th>
              <th>VYA</th>
              <th>Aksiyon</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in archivedPatients" :key="p.id">
              <td class="mono">{{ p.patient_no || '|' }}</td>
              <td>{{ p.name }}</td>
              <td>{{ p.height ? p.height + ' cm' : '|' }}</td>
              <td>{{ p.weight ? p.weight + ' kg' : '|' }}</td>
              <td>{{ calcVya(p) }}</td>
              <td class="action-cell">
                <button class="btn-icon" v-tooltip="'Düzenle'" @click="$emit('edit', p)"><Pencil :size="14"/></button>
                <button class="btn-icon" v-tooltip="'Listeye Al'" @click="$emit('restore', p.id)"><ArrowLeft :size="14"/></button>
                <button class="btn-icon btn-icon-danger" v-tooltip="'Sil'" @click="$emit('remove', p.id)"><Trash2 :size="14"/></button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!archivedPatients.length" class="empty" style="padding:20px">Arşiv boş</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { Pencil, ArrowLeft, Trash2 } from '@lucide/vue'

defineProps({
  open: Boolean,
  archivedPatients: Array,
  calcVya: Function
})

defineEmits(['close', 'edit', 'restore', 'remove'])
</script>
