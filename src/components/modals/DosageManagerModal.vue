<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay"></div>
    <div v-if="open" class="modal">
      <div class="modal-header">
        <h3 v-if="step === 'list'">Dozaj Kuralları</h3>
        <h3 v-else class="editor-title">
          <button class="btn btn-ghost back-button" @click="showList"><ArrowLeft :size="16" /></button>
          <span>{{ form.id ? 'Kuralı Düzenle' : 'Yeni Kural' }}</span>
        </h3>
        <button class="btn-close" @click="closeModal">&times;</button>
      </div>

      <div v-if="step === 'list'" class="modal-body">
        <div class="list-tools"><input v-model="query" class="input" placeholder="Etken madde veya form ara"></div>
        <div class="dosage-rows scroll-panel">
          <div v-if="!filtered.length" class="empty">Kayıtlı dozaj kuralı yok.</div>
          <div v-for="rule in filtered" :key="rule.id" class="dosage-row" @click="edit(rule)">
            <div><b>{{ rule.active_ingredient }}</b><span>{{ rule.form || 'Tüm formlar' }} · {{ ageLabel(rule) }}</span></div>
            <div class="dose">{{ rule.dose_min }}–{{ rule.dose_max }} {{ rule.dose_unit }}/{{ rule.dose_period === 'day' ? 'gün' : 'doz' }}</div>
          </div>
        </div>
      </div>

      <form v-else class="modal-body dosage-editor" @submit.prevent="save" @click="closeIngredientDropdown">
        <label class="field-label">Etken madde</label>
        <div v-if="form.id" class="dosage-static-value">{{ form.active_ingredient }}</div>
        <div v-else class="drug-dropdown-wrap" @click.stop>
          <input readonly class="input drug-dropdown-input" :value="form.active_ingredient || 'Seçiniz...'" @click="openIngredientDropdown" @keydown.enter.prevent="openIngredientDropdown">
          <div v-if="ingredientDropdown.open" class="drug-dropdown">
            <input ref="ingredientSearchInput" v-model="ingredientDropdown.query" class="input drug-dropdown-search" placeholder="Etken madde ara..." @input="ingredientDropdown.focusIdx = 0" @keydown.escape="closeIngredientDropdown" @keydown.enter.prevent="selectFocusedIngredient" @keydown.down.prevent="moveIngredientFocus(1)" @keydown.up.prevent="moveIngredientFocus(-1)">
            <div class="drug-dropdown-list">
              <button v-for="(name, index) in ingredientResults" :key="name" type="button" class="drug-dropdown-item" :class="{ focused: ingredientDropdown.focusIdx === index }" @mousedown.prevent="selectIngredient(name)">
                <span class="dd-label">{{ name }}</span>
              </button>
              <div v-if="ingredientDropdown.query.length >= 2 && !ingredientResults.length" class="drug-dropdown-empty">Eşleşen etken madde bulunamadı</div>
              <div v-if="ingredientDropdown.query.length < 2" class="drug-dropdown-hint">En az 2 harf yazın</div>
            </div>
          </div>
        </div>
        <div v-if="!form.id && form.active_ingredient && !ingredientDropdown.open" class="drug-selected-badge">{{ form.active_ingredient }}</div>
        <label class="field-label">Uygulama formu</label>
        <select v-model="form.form" class="input">
          <option value="">Tüm formlar</option>
          <option v-for="route in routes" :key="route.val" :value="route.val">{{ route.label }}</option>
        </select>
        <div class="pair"><div><label class="field-label">Min. yaş</label><input v-model="form.age_min" class="input" type="number" min="0"></div><div><label class="field-label">Maks. yaş</label><input v-model="form.age_max" class="input" type="number" min="0"></div></div>
        <div class="pair"><div><label class="field-label">Min. doz</label><input v-model="form.dose_min" class="input" type="number" min="0" step="any" required></div><div><label class="field-label">Maks. doz</label><input v-model="form.dose_max" class="input" type="number" min="0" step="any" required></div></div>
        <div class="pair"><div><label class="field-label">Doz birimi</label><select v-model="form.dose_unit" class="input"><option value="kg">mg/kg</option><option value="m2">mg/m²</option></select></div><div><label class="field-label">Periyot</label><select v-model="form.dose_period" class="input"><option value="dose">Doz başına</option><option value="day">Günlük</option></select></div></div>
        <div class="pair"><div><label class="field-label">Günlük doz sayısı</label><input v-model="form.dose_count" class="input" type="number" min="1"></div><div><label class="field-label">Tolerans (%)</label><input v-model="form.tolerance_percent" class="input" type="number" min="0" step="any"></div></div>
        <label class="field-label">Maksimum doz (mg)</label><input v-model="form.max_dose" class="input" type="number" min="0" step="any" placeholder="İsteğe bağlı">
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <div class="modal-footer">
        <template v-if="step === 'list'"><button class="btn btn-primary" type="button" @click="startNew">Yeni Kural</button></template>
        <template v-else><button v-if="form.id" type="button" class="btn btn-danger dosage-delete" @click="requestRemove">Sil</button><button class="btn btn-primary" type="button" @click="save">Kaydet</button></template>
      </div>
    </div>

    <div v-if="warning.open" class="modal-overlay dosage-warning-overlay"></div>
    <div v-if="warning.open" class="modal modal-sm dosage-warning-modal">
      <div class="modal-header">
        <h3>Kaydedilemedi</h3>
        <button class="btn-close" @click="warning.open = false">&times;</button>
      </div>
      <div class="modal-body">
        <p class="warning-message">Bu etken maddenin bu formu için başka bir kayıt daha var ve bu iki kayıtın yaş aralıkları çakışıyor.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" @click="warning.open = false">Tamam</button>
      </div>
    </div>
  </Teleport>
</template>

<script>
import { ArrowLeft } from '@lucide/vue'
const blank = () => ({ id: null, active_ingredient: '', form: '', age_min: '', age_max: '', dose_min: '', dose_max: '', dose_unit: 'kg', dose_period: 'dose', dose_count: 1, tolerance_percent: 2, max_dose: '' })
export default {
  components: { ArrowLeft },
  props: { open: Boolean, rules: { type: Array, default: () => [] }, activeIngredients: { type: Array, default: () => [] }, routes: { type: Array, default: () => [] } },
  emits: ['close', 'changed', 'delete-request'],
  data: () => ({ step: 'list', query: '', form: blank(), error: '', warning: { open: false }, ingredientDropdown: { open: false, query: '', focusIdx: 0 } }),
  watch: { open(value) { if (value) this.showList() } },
  computed: {
    filtered() { const q = this.query.toLocaleLowerCase('tr').trim(); return q ? this.rules.filter(r => `${r.active_ingredient} ${r.form}`.toLocaleLowerCase('tr').includes(q)) : this.rules },
    ingredientResults() {
      const q = this.ingredientDropdown.query.toLocaleLowerCase('tr').trim()
      if (q.length < 2) return []
      return this.activeIngredients
        .filter(name => name.toLocaleLowerCase('tr').includes(q))
        .sort((a, b) => {
          const aStarts = a.toLocaleLowerCase('tr').startsWith(q) ? 0 : 1
          const bStarts = b.toLocaleLowerCase('tr').startsWith(q) ? 0 : 1
          return aStarts - bStarts || a.localeCompare(b, 'tr')
        })
        .slice(0, 50)
    }
  },
  methods: {
    closeModal() { this.showList(); this.$emit('close') },
    showList() { this.step = 'list'; this.form = blank(); this.error = ''; this.warning.open = false; this.closeIngredientDropdown() },
    startNew() { this.form = blank(); this.error = ''; this.step = 'editor' },
    edit(rule) { this.form = { ...blank(), ...rule }; this.error = ''; this.step = 'editor' },
    openIngredientDropdown() {
      this.ingredientDropdown = { open: true, query: '', focusIdx: 0 }
      this.$nextTick(() => this.$refs.ingredientSearchInput?.focus())
    },
    closeIngredientDropdown() { this.ingredientDropdown.open = false },
    selectIngredient(name) { this.form.active_ingredient = name; this.closeIngredientDropdown() },
    selectFocusedIngredient() {
      const name = this.ingredientResults[this.ingredientDropdown.focusIdx]
      if (name) this.selectIngredient(name)
    },
    moveIngredientFocus(direction) {
      if (!this.ingredientResults.length) return
      const max = this.ingredientResults.length - 1
      this.ingredientDropdown.focusIdx = Math.max(0, Math.min(max, this.ingredientDropdown.focusIdx + direction))
    },
    ageLabel(rule) {
      const min = rule.age_min
      const max = rule.age_max
      if (min == null && max == null) return 'Koşulsuz'
      if (min != null && max != null) return `${min}–${max} yaş`
      return min != null ? `${min} yaş ve üzeri` : `${max} yaş ve altı`
    },
    async save() {
      try {
        const rows = await window.electronAPI.dbSaveDosage({ ...this.form })
        this.$emit('changed', rows)
        this.showList()
      } catch (e) {
        const conflictMessage = 'Bu etken madde ve form için çakışan bir yaş aralığı var'
        if (String(e.message || '').includes(conflictMessage)) {
          this.error = ''
          this.warning.open = true
        } else {
          this.error = 'Kural kaydedilemedi.'
        }
      }
    },
    requestRemove() {
      const name = this.form.active_ingredient
      const form = this.form.form || 'tüm formlar'
      this.$emit('delete-request', {
        message: `"${name}" (${form}) dozaj kuralını silmek istediğinize emin misiniz?`,
        confirm: () => this.removeConfirmed()
      })
    },
    async removeConfirmed() { try { const rows = await window.electronAPI.dbDeleteDosage(this.form.id); this.$emit('changed', rows); this.showList() } catch (e) { this.error = e.message || 'Kural silinemedi.' } }
  }
}
</script>

<style scoped>
.editor-title{display:flex;align-items:center;gap:6px;flex:1}.back-button{padding:0 6px}.list-tools{margin-bottom:12px}.dosage-rows{max-height:360px;overflow-y:auto;min-height:220px}.dosage-row{display:flex;justify-content:space-between;gap:10px;padding:9px 10px;border:1px solid #E2E0DA;border-radius:6px;margin-bottom:6px;cursor:pointer;transition:all .12s}.dosage-row:hover{border-color:#7C5CBF;background:#F5F3EE}.dosage-row b{display:block;font-size:13px;text-transform:capitalize}.dosage-row span{display:block;font-size:11px;color:#9E9EB0;margin-top:2px}.dose{font-size:11px;color:#5E5E7A;text-align:right}.dosage-static-value{font-size:14px;font-weight:600;text-transform:capitalize;color:#1B1B2F;padding:4px 0 7px;border-bottom:1px solid #E2E0DA}.pair{display:grid;grid-template-columns:1fr 1fr;gap:10px}.error{color:#D45757;font-size:12px;margin-top:10px}.empty{text-align:center;color:#9E9EB0;font-size:12px;padding:35px}.dosage-delete{margin-right:auto}.dosage-warning-overlay{z-index:4000}.dosage-warning-modal{z-index:5000}.warning-message{font-size:14px;line-height:1.6;margin:0}
</style>
