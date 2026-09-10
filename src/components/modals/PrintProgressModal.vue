<template>
  <Teleport to="body">
    <dialog ref="dialog" class="print-progress-modal" aria-labelledby="print-progress-title" aria-busy="true" tabindex="-1" @cancel.prevent @keydown.stop>
      <Printer :size="30" class="print-progress-printer" aria-hidden="true" />
      <h3 id="print-progress-title" class="print-progress-title">
        <LoaderCircle :size="18" class="print-progress-spinner" aria-hidden="true" />
        <span>Barkodlar yazdırılıyor.</span>
      </h3>
      <p class="print-progress-count" role="status" aria-live="polite">Bekleyen etiket: {{ pending }}</p>
    </dialog>
  </Teleport>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { LoaderCircle, Printer } from '@lucide/vue'

const dialog = ref(null)
const pending = ref(0)
let unsubscribe

onMounted(() => {
  unsubscribe = window.electronAPI?.onPrintProgress?.(count => {
    pending.value = count
    // Native modal blocks clicks and keyboard access immediately, including double-clicks.
    if (count > 0 && !dialog.value.open) dialog.value.showModal()
    if (count === 0 && dialog.value.open) dialog.value.close()
  })
})
onBeforeUnmount(() => {
  unsubscribe?.()
  dialog.value?.close()
})
</script>

<style scoped>
.print-progress-modal {
  width: min(380px, calc(100vw - 40px));
  margin: auto;
  padding: 28px 26px 22px;
  border: 1px solid #E3D9F0;
  border-radius: 14px;
  background: #FFF;
  color: #39364A;
  text-align: center;
  box-shadow: 0 16px 60px #1B1B2F33;
  outline: none;
}
.print-progress-modal::backdrop { background: #1B1B2F66; }
.print-progress-spinner { color: #7C5CBF; animation: print-progress-spin 1s linear infinite; }
.print-progress-printer { color: #7C5CBF; }
.print-progress-title { display: flex; align-items: center; justify-content: center; gap: 10px; }
.print-progress-title span { display: inline-flex; align-items: center; }
.print-progress-modal h3 { margin: 14px 0 8px; font-size: 17px; font-weight: 600; }
.print-progress-modal p { margin: 0; font-size: 13px; line-height: 1.6; }
.print-progress-modal .print-progress-count { margin-top: 16px; color: #7C5CBF; font-size: 12px; font-weight: 600; }
@keyframes print-progress-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .print-progress-spinner { animation: none; } }
</style>
