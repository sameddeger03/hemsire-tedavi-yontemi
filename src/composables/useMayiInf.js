// Mayi ve sürekli infüzyon yönetimi
import { ref, reactive } from 'vue'
import { nextTick } from 'vue'
import { buildLabelHome } from '../domain/zplLayout.js'

const api = () => window.electronAPI

export function useMayiInf(deps) {
  const patientMayi = ref(null)
  const patientInfList = ref([])
  const mayiModal = reactive({ open: false, fluid: '', rate: '', entries: [{ ml: '', unit: 'ML', content: '' }, { ml: '', unit: 'ML', content: '' }, { ml: '', unit: 'ML', content: '' }] })
  const infModal = reactive({ open: false, activeTab: 0, tabs: [], warning: '' })
  const infDrugDropdown = reactive({ open: false, tabIdx: -1, query: '', results: [], focusIdx: -1, refs: {} })
  const infPrintModal = reactive({ open: false, date: '', time: '', selected: [] })
  let _infSearchTimer = null

  function formatMayiContent(entry) {
    if (entry == null) return ''
    if (typeof entry === 'string') return entry.trim()
    if (typeof entry !== 'object') return String(entry)
    const content = String(entry.content || '').trim()
    if (!content) return ''
    const amount = [String(entry.ml || '').trim(), String(entry.unit || '').trim()].filter(Boolean).join(' ')
    return amount ? `${amount} ${content}` : content
  }

  async function loadMayi(patientId) {
    if (!api() || !patientId) { patientMayi.value = null; return }
    patientMayi.value = await api().dbGetPatientMayi(patientId)
  }

  async function loadInfList(patientId) {
    if (!api() || !patientId) { patientInfList.value = []; return }
    patientInfList.value = await api().dbGetPatientInfList(patientId)
  }

  function openMayiEdit() {
    const p = patientMayi.value
    mayiModal.open = true
    mayiModal.fluid = p?.mayiFluid || ''
    mayiModal.rate = p?.mayiRate || ''
    const contents = Array.isArray(p?.mayiContents) ? p.mayiContents : []
    const entries = []
    for (let i = 0; i < Math.max(3, contents.length); i++) {
      entries.push({ ml: contents[i]?.ml || '', unit: contents[i]?.unit || 'ML', content: contents[i]?.content || '' })
      if (i >= 2 && i < contents.length - 1) entries.push({ ml: '', unit: 'ML', content: '' })
    }
    mayiModal.entries = entries.length ? entries : [{ ml: '', unit: 'ML', content: '' }, { ml: '', unit: 'ML', content: '' }, { ml: '', unit: 'ML', content: '' }]
  }

  async function saveMayi() {
    const id = deps.getSelectedPatientId()
    if (!api() || !id) return
    const contents = mayiModal.entries.filter(e => e.content.trim()).map(e => ({ ml: e.ml, unit: e.unit, content: e.content.trim() }))
    await api().dbUpdatePatientMayi(id, mayiModal.fluid.trim(), contents, mayiModal.rate.trim())
    mayiModal.open = false
    await loadMayi(id)
  }

  function clearMayi() {
    deps.confirm.value = { open: true, message: 'Mayi bilgilerini silmek istediğinize emin misiniz?', onConfirm: async () => {
      deps.confirm.value = { open: false, message: '', onConfirm: null }
      const id = deps.getSelectedPatientId()
      await api().dbUpdatePatientMayi(id, '', '[]', '')
      await loadMayi(id)
      mayiModal.open = false
    }}
  }

  function printMayiLabel() {
    const p = patientMayi.value
    if (!p || !p.mayiFluid) return
    const isLarge = deps.getLabelSize() === 'buyuk'
    const pw = isLarge ? '450' : '380'
    const scr = (s) => deps.sanitize(s)
    const now = new Date()
    const dateText = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
    const timeText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const contents = (Array.isArray(p.mayiContents) ? p.mayiContents : []).map(formatMayiContent).filter(Boolean)
    const contentSlots = Math.max(3, contents.length)
    let parts = []
    if (isLarge) {
      // Büyük etikette daha temiz ve dengeli bir TrueType benzeri ZPL fontu
      // kullan; başlık, içerik ve hız arasında belirgin bir hiyerarşi bırak.
      parts.push(`^A0N,46,38^FO10,16^FD${scr(p.mayiFluid)}^FS`)
      if (p.mayiRate) parts.push(`^A0N,28,24^FO350,22^FD${scr(p.mayiRate)}^FS`)
      contents.forEach((c, i) => parts.push(`^A0N,30,26^FO10,${76 + i * 36}^FD${scr(c)}^FS`))
      // Alt bilgi satırı, içerik sayısından bağımsız olarak üç satırlık
      // etiketin tabanında sabit kalır.
      const footerY = 96 + contentSlots * 36
      parts.push(`^A0N,22,18^FO10,${footerY}^FD${dateText}^FS`)
      parts.push(`^A0N,22,18^FO360,${footerY}^FD${timeText}^FS`)
    } else {
      parts.push(`^ADN,32,15^FO30,10^FD${scr(p.mayiFluid)}^FS`)
      if (p.mayiRate) parts.push(`^ADN,20,10^FO250,12^FD${scr(p.mayiRate)}^FS`)
      contents.forEach((c, i) => parts.push(`^ADN,24,12^FO30,${55 + i * 28}^FD${scr(c)}^FS`))
      const footerY = contents.length > 3 ? 68 + contentSlots * 28 : 140
      parts.push(`^ADN,20,10^FO30,${footerY}^FD${dateText}^FS`)
      parts.push(`^ADN,20,10^FO250,${footerY}^FD${timeText}^FS`)
    }
    const ll = isLarge ? 126 + contentSlots * 36 : (contents.length > 3 ? 76 + contentSlots * 28 : 158)
    const zpl = `^XA\n^PW${pw}\n^LL${ll}\n${buildLabelHome(isLarge, deps.getSmallLabelOffsetX(), deps.getSmallLabelOffsetY(), deps.getLargeLabelOffsetX(), deps.getLargeLabelOffsetY())}\n^LS0\n^LT0\n${parts.join('\n')}\n^XZ`
    if (api()) api().printLabel(zpl)
  }

  function openInfEdit() {
    infModal.open = true
    infModal.activeTab = 0
    infModal.warning = ''
    const list = patientInfList.value || []
    infModal.tabs = list.length ? list.map(inf => ({ ...inf })) : []
  }

  function addInfTab() { infModal.tabs.push({ drug: '', dose: '', activeIngredient: '', fluid: 'SF', totalMl: '', rate: '' }); infModal.activeTab = infModal.tabs.length - 1 }
  function removeInfTab(idx) { infModal.tabs.splice(idx, 1); if (infModal.activeTab >= infModal.tabs.length) infModal.activeTab = Math.max(0, infModal.tabs.length - 1); document.querySelectorAll('.v-tooltip').forEach(el => el.remove()) }
  function switchInfTab(idx) { infModal.activeTab = idx }

  async function saveInf() {
    const id = deps.getSelectedPatientId()
    if (!api() || !id) return
    const tabs = infModal.tabs.filter(t => t.drug.trim())
    if (tabs.length && tabs.some(t => !String(t.fluid||'').trim() || !String(t.totalMl||'').trim() || !String(t.rate||'').trim())) { infModal.warning = 'Her infüzyon için mayi, toplam mL ve hız girin.'; return }
    await api().dbUpdatePatientInfList(id, JSON.parse(JSON.stringify(tabs)))
    infModal.open = false
    await loadInfList(id)
  }

  function openInfDrugDropdown(tabIdx) {
    infDrugDropdown.open = true
    infDrugDropdown.tabIdx = tabIdx
    infDrugDropdown.query = ''
    infDrugDropdown.results = []
    infDrugDropdown.focusIdx = -1
    nextTick(() => {
      try { deps.getInfSearchEl()?.focus(); deps.getInfSearchEl()?.select() } catch {}
    })
  }
  function closeInfDrugDropdown() { infDrugDropdown.open = false }

  async function onInfDrugSearch() {
    const q = infDrugDropdown.query
    if (q.length < 2) { infDrugDropdown.results = []; return }
    if (_infSearchTimer) clearTimeout(_infSearchTimer)
    _infSearchTimer = setTimeout(async () => {
      infDrugDropdown.results = await api().dbSearchDrugCatalog(q)
      infDrugDropdown.focusIdx = infDrugDropdown.results.length ? 0 : -1
      nextTick(() => { try { deps.getInfSearchEl()?.focus() } catch {} })
    }, 200)
  }

  function selectInfDrug(d) {
    if (infDrugDropdown.tabIdx >= 0 && infDrugDropdown.tabIdx < infModal.tabs.length) {
      infModal.tabs[infDrugDropdown.tabIdx].drug = deps.normDrugName(d.label)
      infModal.tabs[infDrugDropdown.tabIdx].activeIngredient = deps.normDrugName(d.active_ingredient)
    }
    closeInfDrugDropdown()
  }

  function selectFirstInfDrug() { if (infDrugDropdown.results.length) selectInfDrug(infDrugDropdown.results[0]) }
  function infDrugDropdownFocusNext() { const max = infDrugDropdown.results.length - 1; infDrugDropdown.focusIdx = Math.min(infDrugDropdown.focusIdx + 1, max); const el = infDrugDropdown.refs[infDrugDropdown.focusIdx]; if (el) el.scrollIntoView({ block: 'nearest' }) }
  function infDrugDropdownFocusPrev() { infDrugDropdown.focusIdx = Math.max(infDrugDropdown.focusIdx - 1, 0); const el = infDrugDropdown.refs[infDrugDropdown.focusIdx]; if (el) el.scrollIntoView({ block: 'nearest' }) }

  function infTip(inf) {
    const total = inf.totalMl ? `${String(inf.totalMl).trim()} mL` : ''
    const fluid = inf.fluid ? `${String(inf.fluid).trim().toLocaleLowerCase('tr-TR')} içinde` : ''
    const dose = String(inf.dose || '').trim()
    const drug = String(inf.drug || '').trim()
    const activeIngredient = String(inf.activeIngredient || '').trim()
    const name = drug
      ? `${dose ? `${dose} ` : ''}${drug}${activeIngredient ? ` (${activeIngredient})` : ''}`
      : dose
    return [total, fluid, name, String(inf.rate || '').trim()].filter(Boolean).join(' ')
  }

  function openInfPrintModal() {
    infPrintModal.open = true
    const d = new Date()
    infPrintModal.date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    infPrintModal.time = new Date().toTimeString().slice(0, 5)
    infPrintModal.selected = (patientInfList.value || []).map(() => true)
  }

  function printSelectedInfusions() {
    const isLarge = deps.getLabelSize() === 'buyuk'
    const pw = isLarge ? '450' : '380'
    const dateParts = String(infPrintModal.date || '').split('-')
    const dateText = dateParts.length === 3 ? `${dateParts[2]}.${dateParts[1]}.${dateParts[0]}` : String(infPrintModal.date || '')
    const timeText = String(infPrintModal.time || '')
    const list = patientInfList.value || []
    list.forEach((inf, idx) => {
      if (!infPrintModal.selected[idx]) return
      const scr = (s) => deps.sanitize(s)
      const fluidText = String(inf.fluid || '').trim().toLocaleLowerCase('tr-TR')
      const totalText = inf.totalMl ? `${String(inf.totalMl).trim()} ml ${fluidText} ile` : fluidText
      const doseText = [String(inf.dose || '').trim(), String(inf.activeIngredient || '').trim()].filter(Boolean).join(' ')
      const rateText = String(inf.rate || '').trim()
      const zpl = `^XA\n^PW${pw}\n^LL${isLarge ? 255 : 175}\n${buildLabelHome(isLarge, deps.getSmallLabelOffsetX(), deps.getSmallLabelOffsetY(), deps.getLargeLabelOffsetX(), deps.getLargeLabelOffsetY())}\n^LS0\n^LT0\n${isLarge
        ? `^ADN,32,18^FO10,18^FD${scr(inf.drug || '')}^FS\n^A0N,32,28^FO10,72^FD${scr(doseText)}^FS\n^A0N,32,28^FO10,112^FD${scr(totalText)}^FS${rateText ? `^A0N,40,32^FO10,158^FD${scr(rateText)}^FS` : ''}\n^ADN,20,11^FO10,218^FD${dateText}^FS^ADN,20,11^FO350,218^FD${timeText}^FS`
        : `^ADN,28,15^FO30,16^FD${scr(inf.drug || '')}^FS\n^ADN,24,12^FO30,52^FD${scr(doseText)}^FS\n^ADN,24,12^FO30,80^FD${scr(totalText)}^FS${rateText ? `^ADN,28,18^FO30,104^FD${scr(rateText)}^FS` : ''}\n^ADN,20,10^FO30,140^FD${dateText}^FS^ADN,20,10^FO250,140^FD${timeText}^FS`}\n^XZ`
      if (api()) api().printLabel(zpl)
    })
  }

  return {
    patientMayi, patientInfList, mayiModal, infModal, infDrugDropdown, infPrintModal, formatMayiContent,
    loadMayi, loadInfList, openMayiEdit, saveMayi, clearMayi, printMayiLabel,
    openInfEdit, addInfTab, removeInfTab, switchInfTab, saveInf,
    openInfDrugDropdown, closeInfDrugDropdown, onInfDrugSearch, selectInfDrug, selectFirstInfDrug,
    infDrugDropdownFocusNext, infDrugDropdownFocusPrev, infTip, openInfPrintModal, printSelectedInfusions
  }
}
