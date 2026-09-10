export default {
  methods: {
    formatExpiry(value) {
      if (!value) return ''
      const yearFirst = value.match(/^(\d{4})[.-](\d{2})$/)
      if (yearFirst) return `${yearFirst[2]}.${yearFirst[1]}`
      const monthFirst = value.match(/^(\d{2})[.-](\d{4})$/)
      if (monthFirst) return `${monthFirst[1]}.${monthFirst[2]}`
      return value
    },
    _parseExpiry(value) {
      if (!value) return null
      let match = value.match(/^(\d{2})[.-](\d{4})$/)
      if (match) return { month: parseInt(match[1]), year: parseInt(match[2]) }
      match = value.match(/^(\d{4})[.-](\d{2})$/)
      if (match) return { month: parseInt(match[2]), year: parseInt(match[1]) }
      return null
    },
    expiryClass(value) {
      const expiry = this._parseExpiry(value)
      if (!expiry) return ''
      const now = new Date()
      const expiryDate = new Date(expiry.year, expiry.month, 0)
      if (expiryDate < now) return 'expiry-danger'
      const monthsLeft = (expiryDate.getFullYear() * 12 + expiryDate.getMonth()) - (now.getFullYear() * 12 + now.getMonth())
      return monthsLeft <= 3 ? 'expiry-warning' : ''
    },
    expiryWarning(value) {
      const expiry = this._parseExpiry(value)
      if (!expiry) return ''
      const now = new Date()
      const expiryDate = new Date(expiry.year, expiry.month, 0)
      if (expiryDate < now) return 'Son Kullanma Tarihi Geçmiş!'
      const monthsLeft = (expiryDate.getFullYear() * 12 + expiryDate.getMonth()) - (now.getFullYear() * 12 + now.getMonth())
      return monthsLeft <= 3 ? `Miyadına son ${monthsLeft} ay` : ''
    },
    async loadCabinets() {
      try {
        this.stokModal.cabinets = await window.electronAPI.dbGetCabinets()
      } catch (_) {}
    },
    async addCabinet() {
      const name = this.stokNewCabinet.trim()
      if (!name) return
      const id = await window.electronAPI.dbAddCabinet(name)
      if (id === -1) return
      this.stokNewCabinet = ''
      this.loadCabinets()
    },
    async renameCabinet(id) {
      const name = this.stokEditCabinet.name.trim()
      if (!name || !id) { this.stokEditCabinet = { id: null, name: '' }; return }
      await window.electronAPI.dbRenameCabinet(id, name)
      this.stokEditCabinet = { id: null, name: '' }
      this.loadCabinets()
    },
    startRename(cabinet) {
      this.stokEditCabinet = { id: cabinet.id, name: cabinet.name }
      this.$nextTick(() => document.querySelector('.cabinet-rename-input')?.focus())
    },
    async deleteCabinet(id) {
      this.confirm = { open: true, message: 'Bu dolabı silmek istediğinize emin misiniz?', onConfirm: async () => {
        this.confirm.open = false
        await window.electronAPI.dbDeleteCabinet(id)
        this.loadCabinets()
      }}
    },
    async openCabinetDrugs(cabinet) {
      this.stokModal.selectedCabinet = cabinet
      this.stokModal.drugs = await window.electronAPI.dbGetCabinetDrugs(cabinet.id)
      this.stokEditDrug = { id: null }
      this.stokNewDrug = { name: '', form: 'IV', dose: '', quantity: '', unit: 'Adet', expiry: '' }
      this.stokDrugSearch = { query: '', results: [], open: false }
      this.stokModal.step = 'drugs'
    },
    async loadDrugs() {
      if (!this.stokModal.selectedCabinet) return
      this.stokModal.drugs = await window.electronAPI.dbGetCabinetDrugs(this.stokModal.selectedCabinet.id)
      this.stokEditDrug = { id: null }
    },
    async addDrug() {
      const drug = this.stokNewDrug
      if (!drug.name.trim()) return
      drug.name = this.normDrugName(drug.name)
      await window.electronAPI.dbAddCabinetDrug(this.stokModal.selectedCabinet.id, drug.name.trim(), drug.form.trim(), drug.dose.trim(), parseInt(drug.quantity) || 0, drug.unit || 'Adet', drug.expiry)
      this.stokNewDrug = { name: '', form: 'IV', dose: '', quantity: '', unit: 'Adet', expiry: '' }
      this.stokDrugSearch = { query: '', results: [], open: false }
      this.loadDrugs()
    },
    async saveDrugEdit() {
      const drug = this.stokEditDrug
      if (!drug.name.trim()) return
      drug.name = this.normDrugName(drug.name)
      await window.electronAPI.dbUpdateCabinetDrug(drug.id, drug.name.trim(), drug.form.trim(), drug.dose.trim(), parseInt(drug.quantity) || 0, drug.unit || 'Adet', drug.expiry)
      this.stokEditDrug = { id: null }
      this.loadDrugs()
    },
    async onStokDrugSearch() {
      const query = this.stokDrugSearch.query
      if (query.length < 2) { this.stokDrugSearch.results = []; return }
      const all = await window.electronAPI.dbSearchDrugCatalog(query)
      this.stokDrugSearch.results = all.slice(0, 4)
    },
    blurStokDrugSearch() {
      setTimeout(() => { this.stokDrugSearch.open = false }, 200)
    },
    selectStokDrug(drug) {
      this.stokNewDrug.name = drug.label
      this.stokNewDrug.form = drug.form || 'IV'
      this.stokDrugSearch.query = this.stokNewDrug.name
      this.stokDrugSearch.open = false
      this.stokDrugSearch.results = []
    },
    async deleteDrug(id) {
      this.confirm = { open: true, message: 'Bu ilacı silmek istediğinize emin misiniz?', onConfirm: async () => {
        this.confirm.open = false
        await window.electronAPI.dbDeleteCabinetDrug(id)
        this.loadDrugs()
      }}
    },
    async checkExpiredDrugs() {
      if (!window.electronAPI) return
      const expired = await window.electronAPI.dbGetAllExpiredDrugs()
      if (!expired?.length) return
      const groups = {}
      expired.forEach(drug => {
        if (!groups[drug.cabinet]) groups[drug.cabinet] = []
        groups[drug.cabinet].push(`${drug.dose} ${drug.name} ${drug.form}`)
      })
      this.expiredDrugAlert.message = Object.entries(groups).map(([cabinet, drugs]) =>
        `"${cabinet}" dolabında ${drugs.length} adet son kullanma tarihi geçmiş ilaç bulunuyor: ${drugs.join(', ')}`
      ).join('\n\n')
      this.expiredDrugAlert.open = true
    },
    closeStok() {
      this.stokModal.open = false
      this.stokModal.step = 'cabinet'
      this.stokModal.selectedCabinet = null
      this.stokModal.drugs = []
      this.stokEditCabinet = { id: null, name: '' }
      this.stokEditDrug = { id: null }
      this.stokNewCabinet = ''
      this.stokNewDrug = { name: '', form: 'IV', dose: '', quantity: '', unit: 'Adet', expiry: '' }
      this.stokDrugSearch = { query: '', results: [], open: false }
    }
  }
}
