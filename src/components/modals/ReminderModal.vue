<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay"/>
    <div v-if="open" class="modal reminder-calendar-modal">
      <div class="modal-header reminder-calendar-header">
        <div>
          <h3><CalendarDays :size="18"/> Takvim</h3>
          <p>Bir gün seçin; not alın veya saatli bir hatırlatma oluşturun.</p>
        </div>
        <button class="btn-close" aria-label="Takvimi kapat" @click="$emit('close')">&times;</button>
      </div>

      <div class="reminder-calendar-layout">
        <section class="calendar-panel" aria-label="Aylık takvim">
          <div class="calendar-toolbar">
            <button class="calendar-nav" aria-label="Önceki ay" @click="changeMonth(-1)"><ChevronLeft :size="18"/></button>
            <strong>{{ monthTitle }}</strong>
            <button class="calendar-nav" aria-label="Sonraki ay" @click="changeMonth(1)"><ChevronRight :size="18"/></button>
          </div>

          <div class="calendar-weekdays" aria-hidden="true">
            <span v-for="day in weekdays" :key="day">{{ day }}</span>
          </div>
          <div class="calendar-grid">
            <button
              v-for="day in calendarDays"
              :key="day.dateKey"
              type="button"
              class="calendar-day"
              :class="{ muted: !day.inCurrentMonth, today: day.isToday, selected: day.dateKey === selectedDate }"
              :aria-label="dayAriaLabel(day)"
              @click="selectDate(day)"
            >
              <span>{{ day.day }}</span>
              <span
                v-if="noteCount(day.dateKey)"
                class="calendar-marker note-marker"
                :data-tooltip="`${noteCount(day.dateKey)} not`"
                v-tooltip
              ><StickyNote :size="10"/></span>
              <span
                v-if="reminderCount(day.dateKey)"
                class="calendar-marker reminder-marker"
                :data-tooltip="`${reminderCount(day.dateKey)} hatırlatma`"
                v-tooltip
              ><Bell :size="10"/></span>
            </button>
          </div>
        </section>

        <aside class="reminder-agenda">
          <div class="agenda-heading">
            <span>{{ selectedDateTitle }}</span>
            <strong>{{ selectedDayNotes.length }} not · {{ selectedDayReminders.length }} hatırlatma</strong>
          </div>

          <div class="agenda-tabs" role="tablist" aria-label="Takvim içeriği">
            <button type="button" role="tab" :aria-selected="activeTab === 'notes'" :class="{ active: activeTab === 'notes' }" @click="activeTab = 'notes'">
              <StickyNote :size="14"/> Notlar
            </button>
            <button type="button" role="tab" :aria-selected="activeTab === 'reminders'" :class="{ active: activeTab === 'reminders' }" @click="activeTab = 'reminders'">
              <Bell :size="14"/> Hatırlatmalar
            </button>
          </div>

          <template v-if="activeTab === 'notes'">
            <div v-if="selectedDayNotes.length" class="agenda-list">
              <div v-for="item in selectedDayNotes" :key="`${item.note.date}-${item.index}`" class="agenda-item note-item">
                <StickyNote :size="15" class="note-icon"/>
                <p>{{ item.note.text }}</p>
                <button type="button" class="agenda-delete" aria-label="Notu sil" @click="$emit('removeNote', item.index)"><Trash2 :size="15"/></button>
              </div>
            </div>
            <div v-else class="agenda-empty">
              <StickyNote :size="30" :stroke-width="1.4"/>
              <span>Bu güne ait not yok.</span>
            </div>

            <form class="reminder-composer" @submit.prevent="saveNote">
              <label class="field-label" for="calendar-note">Not</label>
              <textarea id="calendar-note" v-model="noteText" class="input reminder-textarea note-textarea" rows="5" placeholder="Bu tarih için bir not yazın..." required></textarea>
              <button class="btn btn-primary reminder-add" type="submit"><Plus :size="15"/> Not Ekle</button>
            </form>
          </template>

          <template v-else>
            <div v-if="selectedDayReminders.length" class="agenda-list">
              <div v-for="item in selectedDayReminders" :key="item.reminder.id || `${item.reminder.datetime}-${item.index}`" class="agenda-item" :class="{ delivered: item.reminder.deliveredAt }">
                <span class="agenda-time"><Clock3 :size="14"/>{{ displayReminderTime(item.reminder) }}</span>
                <p>
                  {{ item.reminder.text }}
                  <small v-if="item.reminder.deliveredAt" class="reminder-delivered"><CircleCheck :size="12"/> Hatırlatıldı</small>
                </p>
                <button type="button" class="agenda-delete" aria-label="Hatırlatmayı sil" @click="$emit('remove', item.index)"><Trash2 :size="15"/></button>
              </div>
            </div>
            <div v-else class="agenda-empty">
              <Bell :size="30" :stroke-width="1.4"/>
              <span>Bu güne ait hatırlatma yok.</span>
            </div>

            <form class="reminder-composer" @submit.prevent="saveReminder">
              <label class="field-label" for="reminder-time">Saat</label>
              <input id="reminder-time" v-model="reminderTime" type="time" class="input mono" required/>
              <label class="field-label" for="reminder-text">Hatırlatma</label>
              <textarea id="reminder-text" v-model="reminderText" class="input reminder-textarea" rows="3" placeholder="Ne hatırlatılacak?" required></textarea>
              <button class="btn btn-primary reminder-add" type="submit"><Plus :size="15"/> Hatırlatma Ekle</button>
            </form>
          </template>
        </aside>
      </div>
    </div>

    <div v-if="warningMessage" class="modal-overlay calendar-warning-overlay"/>
    <div v-if="warningMessage" class="modal modal-sm calendar-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="calendar-warning-title">
      <div class="modal-header">
        <div class="calendar-warning-title">
          <AlertTriangle :size="18"/>
          <h3 id="calendar-warning-title">İşlem Yapılamadı</h3>
        </div>
        <button class="btn-close" aria-label="Uyarıyı kapat" @click="warningMessage = ''">&times;</button>
      </div>
      <div class="modal-body">
        <p class="calendar-warning-message">{{ warningMessage }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" type="button" @click="warningMessage = ''">Tamam</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { AlertTriangle, Bell, CalendarDays, ChevronLeft, ChevronRight, CircleCheck, Clock3, Plus, StickyNote, Trash2 } from '@lucide/vue'
import { buildCalendarMonth, combineReminderDateTime, localDateKey } from '../../domain/reminderCalendar.js'

const props = defineProps({
  open: Boolean,
  reminders: { type: Array, default: () => [] },
  notes: { type: Array, default: () => [] }
})

const emit = defineEmits(['close', 'remove', 'save', 'removeNote', 'saveNote'])
const weekdays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz']
const viewDate = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
const selectedDate = ref(localDateKey())
const activeTab = ref('notes')
const noteText = ref('')
const reminderTime = ref('')
const reminderText = ref('')
const warningMessage = ref('')

const calendarDays = computed(() => buildCalendarMonth(viewDate.value.getFullYear(), viewDate.value.getMonth()))
const monthTitle = computed(() => new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(viewDate.value))
const selectedDateTitle = computed(() => new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(new Date(`${selectedDate.value}T12:00:00`)))
const selectedDayReminders = computed(() => props.reminders
  .map((reminder, index) => ({ reminder, index }))
  .filter(item => String(item.reminder.datetime || '').startsWith(`${selectedDate.value}T`))
  .sort((a, b) => String(a.reminder.datetime).localeCompare(String(b.reminder.datetime))))
const selectedDayNotes = computed(() => props.notes
  .map((note, index) => ({ note, index }))
  .filter(item => item.note.date === selectedDate.value))

watch(() => props.open, isOpen => {
  if (!isOpen) return
  const now = new Date()
  viewDate.value = new Date(now.getFullYear(), now.getMonth(), 1)
  selectedDate.value = localDateKey(now)
  activeTab.value = 'notes'
  const next = new Date(now.getTime() + 15 * 60 * 1000)
  next.setMinutes(Math.ceil(next.getMinutes() / 15) * 15, 0, 0)
  reminderTime.value = `${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`
  reminderText.value = ''
  noteText.value = ''
  warningMessage.value = ''
})

function changeMonth(offset) {
  viewDate.value = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth() + offset, 1)
}

function selectDate(day) {
  selectedDate.value = day.dateKey
  if (!day.inCurrentMonth) {
    const date = new Date(`${day.dateKey}T12:00:00`)
    viewDate.value = new Date(date.getFullYear(), date.getMonth(), 1)
  }
}

function reminderCount(dateKey) {
  return props.reminders.filter(reminder => String(reminder.datetime || '').startsWith(`${dateKey}T`)).length
}

function noteCount(dateKey) {
  return props.notes.filter(note => note.date === dateKey).length
}

function displayReminderTime(reminder) {
  return String(reminder.datetime || '').split('T')[1] || '--:--'
}

function dayAriaLabel(day) {
  const date = new Date(`${day.dateKey}T12:00:00`)
  const label = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
  const notes = noteCount(day.dateKey)
  const reminders = reminderCount(day.dateKey)
  return [label, notes ? `${notes} not` : '', reminders ? `${reminders} hatırlatma` : ''].filter(Boolean).join(', ')
}

function saveNote() {
  const text = noteText.value.trim()
  if (!text) {
    warningMessage.value = 'Not metni zorunludur.'
    return
  }
  emit('saveNote', { date: selectedDate.value, text })
  noteText.value = ''
}

function saveReminder() {
  const text = reminderText.value.trim()
  const datetime = combineReminderDateTime(selectedDate.value, reminderTime.value)
  if (!datetime || !text) {
    warningMessage.value = 'Saat ve hatırlatma metni zorunludur.'
    return
  }
  if (new Date(datetime).getTime() <= Date.now()) {
    warningMessage.value = 'Hatırlatma zamanı geçmişte olamaz.'
    return
  }
  emit('save', { datetime, text })
  reminderText.value = ''
}
</script>

<style scoped>
.reminder-calendar-modal { width: min(820px, calc(100vw - 48px)); max-width: 820px; }
.reminder-calendar-header { align-items: flex-start; }
.reminder-calendar-header h3 { display: flex; align-items: center; gap: 8px; margin: 0; }
.reminder-calendar-header p { margin: 5px 0 0; color: #777181; font-size: 12px; }
.reminder-calendar-layout { display: grid; grid-template-columns: minmax(420px, 1.35fr) minmax(280px, .9fr); min-height: 470px; }
.calendar-panel { padding: 20px; background: #FAF9F6; border-right: 1px solid #E2E0DA; }
.calendar-toolbar { display: grid; grid-template-columns: 34px 1fr 34px; align-items: center; margin-bottom: 16px; }
.calendar-toolbar strong { text-align: center; color: #34264B; font-size: 15px; text-transform: capitalize; }
.calendar-nav { display: grid; place-items: center; width: 32px; height: 32px; border: 0; border-radius: 8px; background: transparent; color: #6B4FA0; cursor: pointer; }
.calendar-nav:hover { background: #E9E3F1; }
.calendar-nav:focus-visible, .calendar-day:focus-visible, .agenda-delete:focus-visible { outline: 2px solid #7C5CBF; outline-offset: 2px; }
.calendar-weekdays, .calendar-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 5px; }
.calendar-weekdays { margin-bottom: 6px; }
.calendar-weekdays span { color: #8A838D; font-size: 10px; font-weight: 700; text-align: center; text-transform: uppercase; }
.calendar-day { position: relative; display: grid; place-items: center; aspect-ratio: 1; min-height: 46px; border: 1px solid transparent; border-radius: 11px; background: #FFF; color: #34264B; font: 600 13px inherit; cursor: pointer; transition: background .15s ease, border-color .15s ease, color .15s ease; }
.calendar-day:hover { border-color: #CFC1E6; background: #F4F0FA; }
.calendar-day.muted { background: transparent; color: #B8B2BA; }
.calendar-day.today { border-color: #9B7CCE; }
.calendar-day.selected { background: #6F4AA8; color: #FFF; border-color: #6F4AA8; box-shadow: 0 5px 14px rgba(91, 58, 139, .2); }
.calendar-marker { position: absolute; bottom: 4px; display: grid; place-items: center; width: 16px; height: 16px; border-radius: 8px; }
.note-marker { background: #F0E5B7; color: #6D5711; }
.calendar-marker.note-marker { left: 4px; }
.reminder-marker { right: 4px; background: #E9E3F1; color: #654395; }
.calendar-day.selected .calendar-marker { background: rgba(255,255,255,.22); color: #FFF; }
.reminder-agenda { display: flex; flex-direction: column; min-width: 0; padding: 20px; background: #FFF; }
.agenda-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding-bottom: 12px; border-bottom: 1px solid #ECE9E4; }
.agenda-heading span { color: #34264B; font-weight: 700; text-transform: capitalize; }
.agenda-heading strong { color: #7C5CBF; font-size: 10px; white-space: nowrap; }
.agenda-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 12px 0 2px; padding: 3px; border-radius: 9px; background: #F1EFF3; }
.agenda-tabs button { display: flex; align-items: center; justify-content: center; gap: 5px; height: 30px; border: 0; border-radius: 7px; background: transparent; color: #777181; font: 600 11px inherit; cursor: pointer; }
.agenda-tabs button.active { background: #FFF; color: #654395; box-shadow: 0 1px 4px rgba(52,38,75,.12); }
.agenda-tabs button:focus-visible { outline: 2px solid #7C5CBF; outline-offset: 1px; }
.agenda-list { max-height: 175px; overflow-y: auto; padding: 8px 0; }
.agenda-item { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; padding: 9px 2px; border-bottom: 1px solid #F0EEE8; }
.agenda-item p { min-width: 0; margin: 0; color: #39333C; font-size: 12px; line-height: 1.35; overflow-wrap: anywhere; }
.agenda-time { display: flex; align-items: center; gap: 4px; color: #6F4AA8; font: 700 11px 'Consolas', monospace; }
.agenda-item.delivered { opacity: .72; }
.reminder-delivered { display: flex; align-items: center; gap: 4px; margin-top: 3px; color: #6F6971; font-size: 10px; font-weight: 600; }
.note-item { grid-template-columns: auto 1fr auto; }
.note-icon { color: #9A7A1D; }
.agenda-delete { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 7px; background: transparent; color: #B84B5D; cursor: pointer; }
.agenda-delete:hover { background: #FBEAEC; }
.agenda-empty { display: grid; place-items: center; align-content: center; gap: 8px; min-height: 140px; color: #AAA3AC; font-size: 12px; }
.reminder-composer { margin-top: auto; padding-top: 16px; border-top: 1px solid #ECE9E4; }
.reminder-composer .field-label { display: block; margin: 0 0 5px; }
.reminder-composer .input { margin-bottom: 10px; }
.reminder-textarea { width: 100%; min-height: 68px; resize: vertical; font-family: inherit; }
.note-textarea { min-height: 116px; }
.reminder-add { width: 100%; justify-content: center; margin-top: 4px; }
.calendar-warning-overlay { z-index: 3100; background: rgba(27, 20, 39, .45); }
.calendar-warning-modal { z-index: 3200; }
.calendar-warning-title { display: flex; align-items: center; gap: 8px; color: #B56A22; }
.calendar-warning-title h3 { margin: 0; color: #34264B; }
.calendar-warning-message { margin: 0; color: #4B4650; font-size: 13px; line-height: 1.55; }
@media (max-width: 720px) {
  .reminder-calendar-layout { grid-template-columns: 1fr; max-height: 76vh; overflow-y: auto; }
  .calendar-panel { border-right: 0; border-bottom: 1px solid #E2E0DA; }
}
@media (prefers-reduced-motion: reduce) { .calendar-day { transition: none; } }
</style>
