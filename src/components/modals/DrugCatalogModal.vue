<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" />
    <section v-if="open" class="modal catalog-modal" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
      <header class="modal-header catalog-header">
        <div>
          <h3 id="catalog-title">İlaç Kataloğu</h3>
          <p>Ticari isim veya etken madde ile arayarak ilaç bilgilerine erişin.</p>
        </div>
        <button class="btn-close" aria-label="Kapat" @click="$emit('close')">&times;</button>
      </header>

      <div class="catalog-search">
        <Search :size="16" />
        <input ref="searchInput" v-model="query" type="search" placeholder="Ticari isim veya etken madde ara..." autocomplete="off">
      </div>

      <div class="catalog-body">
        <aside class="catalog-results">
          <div v-if="loading" class="catalog-state"><LoaderCircle :size="26" class="catalog-state-spinner" /><span>Katalog aranıyor...</span></div>
          <div v-else-if="!results.length" class="catalog-state"><SearchX :size="28" /><span>Eşleşen ilaç bulunamadı.</span></div>
          <button
            v-for="drug in results"
            v-else
            :key="drug.barcode || `${drug.full_name}|${drug.label}|${drug.form}`"
            type="button"
            class="catalog-result"
            :class="{ selected: sameDrug(drug, selected) }"
            @click="selectDrug(drug)"
            @contextmenu.prevent.stop="openContextMenu($event, drug)"
          >
            <strong>{{ drug.full_name || drug.label || drug.active_ingredient }}</strong>
            <span>{{ drug.active_ingredient }}</span>
            <small>{{ drug.barcode || [drug.form, drug.drug_type].filter(Boolean).join(' · ') || 'Barkod bilgisi yok' }}</small>
          </button>
        </aside>

        <main class="catalog-detail">
          <div v-if="!selected" class="catalog-empty-detail">
            <BookOpenText :size="42" :stroke-width="1.25" />
            <p>Bilgilerini görmek için listeden bir ilaç seçin.</p>
          </div>
          <template v-else>
            <div class="catalog-title-block">
              <div class="catalog-title-row">
                <div class="catalog-title-copy">
                  <h4>{{ selected.label || 'Belirtilmemiş' }} <span v-if="selected.karisimMi" class="catalog-compound">Majistral karışım</span></h4>
                  <p>{{ selected.active_ingredient || 'Etken madde belirtilmemiş' }}</p>
                </div>
                <div class="catalog-title-actions">
                  <button type="button" class="btn catalog-reference-btn" @click="$emit('reportDrug', selected)">
                    <MessageSquareWarning :size="14" />
                    Hata Bildir
                  </button>
                </div>
                <div class="catalog-sgk-statuses">
                  <span class="catalog-sgk-status" :class="sgkBadge.kind">
                    {{ sgkBadge.text }}
                  </span>
                  <span v-if="ilacDurumuBadge" class="catalog-sgk-status" :class="ilacDurumuBadge.kind">
                    {{ ilacDurumuBadge.text }}
                  </span>
                  <span v-if="firmaBadge" class="catalog-sgk-status" :class="firmaBadge.kind">{{ firmaBadge.text }}</span>
                  <span v-if="receteBadge" class="catalog-sgk-status" :class="receteBadge.kind">{{ receteBadge.text }}</span>
                </div>
                <div v-if="selected.full_name || selected.barcode" class="catalog-products">
                  <div class="catalog-product-row">
                    {{ selected.full_name }} <span v-if="selected.barcode" class="catalog-product-barcode">({{ selected.barcode }})</span>
                  </div>
                </div>
              </div>
              <div class="catalog-prospectus">
                <div class="catalog-prospectus-row">
                  <button class="btn btn-primary" :disabled="prospectusLoading || uptodateLoading || globalRphLoading || priceLoading" @click="openProspectus('KÜB')">
                    <ExternalLink :size="14" />
                    Kısa Ürün Bilgisi
                  </button>
                  <button class="btn btn-primary" :disabled="prospectusLoading || uptodateLoading || globalRphLoading || priceLoading" @click="openProspectus('KT')">
                    <ExternalLink :size="14" />
                    Kullanım Talimatları
                  </button>
                </div>
                <div class="catalog-prospectus-row">
                  <button v-if="selected.barcode" class="btn catalog-reference-btn" :disabled="prospectusLoading || uptodateLoading || globalRphLoading || priceLoading" @click="openPriceInfo">
                    <BadgeTurkishLira :size="14" />
                    Fiyat Bilgisi
                  </button>
                  <button v-if="uptodateAvailable" class="btn catalog-reference-btn" :disabled="prospectusLoading || uptodateLoading || globalRphLoading || priceLoading" @click="openUptodate">
                    <BookOpenText :size="14" />
                    UpToDate Bilgisi
                  </button>
                  <button class="btn catalog-reference-btn" :disabled="prospectusLoading || uptodateLoading || globalRphLoading || priceLoading" @click="openGlobalRph">
                    <ExternalLink :size="14" />
                    GlobalRPH
                  </button>
                </div>
              </div>
            </div>

            <dl class="catalog-facts">
              <div><dt>Uygulama formu</dt><dd>{{ routeFullName(selected.form) || 'Belirtilmemiş' }}</dd></div>
              <div><dt>İlaç türü</dt><dd>{{ selected.drug_type || 'Belirtilmemiş' }}</dd></div>
              <div v-if="ilacfiyatiInfo?.besinEtkilesimi" class="catalog-fact-wide">
                <dt>Besin Etkileşimi</dt>
                <dd class="catalog-fact-copy">{{ ilacfiyatiInfo.besinEtkilesimi }}</dd>
              </div>
            </dl>

            <section class="catalog-warning-section">
              <h5>Güvenlik ve uygulama bilgileri</h5>
              <div v-if="detailLoading" class="catalog-state inline">Bilgiler yükleniyor...</div>
              <template v-else>
                <section v-for="group in similarityGroups" :key="group.type" class="catalog-similar-section">
                  <div class="catalog-similar-heading">
                    <BookAlert :size="18" />
                    <div>
                      <h5>Dikkat: {{ group.title }}</h5>
                      <p>{{ group.description }}</p>
                    </div>
                  </div>
                  <div class="catalog-similar-list">
                    <span v-for="item in group.items" :key="item.similarLabel">{{ item.similarLabel }}</span>
                  </div>
                </section>
              <div v-if="propertyEntries.length" class="catalog-warnings">
                <article v-for="([key, value]) in propertyEntries" :key="key" class="catalog-warning">
                  <AlertTriangle :size="15" />
                  <div><strong>{{ propertyLabel(key, value) }}</strong><p v-if="propertyDetail(value)">{{ propertyDetail(value) }}</p></div>
                </article>
              </div>
                <div v-if="clinicalGroups.highRisk.length" class="catalog-warnings catalog-high-risk-details">
                  <article v-for="item in clinicalGroups.highRisk" :key="clinicalKey(item)" class="catalog-warning">
                    <AlertTriangle :size="15" />
                    <div>
                      <strong>{{ item.title }}</strong>
                      <p>{{ item.summary }}</p>
                      <p v-if="item.details?.monitoring">{{ item.details.monitoring }}</p>
                      <small>{{ sourceLabel(item) }}</small>
                    </div>
                  </article>
                </div>
                <p v-if="!propertyEntries.length && !similarities.length && !clinicalInfo.length" class="catalog-no-warning">Bu ilaç için tanımlanmış özel bir uyarı bulunmuyor.</p>
              </template>
            </section>

            <section v-if="clinicalGroups.administration.length" class="catalog-clinical-section">
              <h5>Hazırlama ve uygulama rehberi</h5>
              <article v-for="item in clinicalGroups.administration" :key="clinicalKey(item)" class="catalog-clinical-card">
                <div class="catalog-clinical-title"><Syringe :size="16" /><strong>{{ item.title }}</strong></div>
                <p v-if="item.summary">{{ item.summary }}</p>
                <dl v-if="clinicalDetailRows(item).length" class="catalog-clinical-details">
                  <div v-for="detail in clinicalDetailRows(item)" :key="detail.label"><dt>{{ detail.label }}</dt><dd>{{ detail.value }}</dd></div>
                </dl>
                <small>{{ sourceLabel(item) }}</small>
              </article>
            </section>

            <section v-if="clinicalGroups.incompatibility.length" class="catalog-clinical-section danger">
              <h5>İlaç geçimsizlikleri</h5>
              <article v-for="item in clinicalGroups.incompatibility" :key="clinicalKey(item)" class="catalog-clinical-card">
                <div class="catalog-clinical-title"><Unplug :size="16" /><strong>{{ item.title }}</strong></div>
                <p>{{ item.summary }}</p>
                <div v-if="item.details?.incompatibleWith?.length" class="catalog-relation-list">
                  <span v-for="name in item.details.incompatibleWith" :key="name">{{ name }}</span>
                </div>
                <p v-if="item.details?.action" class="catalog-action">{{ item.details.action }}</p>
                <small>{{ sourceLabel(item) }}</small>
              </article>
            </section>

            <section v-if="clinicalGroups.interactions.length" class="catalog-clinical-section warning">
              <h5>İlaç ve besin etkileşimleri</h5>
              <article v-for="item in clinicalGroups.interactions" :key="clinicalKey(item)" class="catalog-clinical-card">
                <div class="catalog-clinical-title"><Utensils :size="16" /><strong>{{ item.title }}</strong></div>
                <p>{{ item.summary }}</p>
                <p v-if="item.details?.food" class="catalog-action"><b>Besin:</b> {{ item.details.food }}</p>
                <div v-if="item.details?.interactsWith?.length" class="catalog-relation-list">
                  <span v-for="name in item.details.interactsWith" :key="name">{{ name }}</span>
                </div>
                <p v-if="item.details?.action" class="catalog-action">{{ item.details.action }}</p>
                <small>{{ sourceLabel(item) }}</small>
              </article>
            </section>

            <p v-if="prospectusError" class="catalog-error">{{ prospectusError }}</p>
          </template>
        </main>
      </div>
    </section>

    <div v-if="priceLoading" class="modal-overlay prospectus-loading-overlay" />
    <div v-if="priceLoading" class="modal modal-sm prospectus-loading-modal" role="alertdialog" aria-modal="true" aria-labelledby="price-loading-title">
      <div class="modal-header"><h3 id="price-loading-title">Fiyat bilgisi aranıyor</h3></div>
      <div class="modal-body prospectus-loading-body">
        <div class="prospectus-spinner"></div>
        <p>Barkod ile kaynaklar üzerinden fiyat bilgisi alınıyor...</p>
      </div>
    </div>

    <div v-if="priceInfoOpen" class="modal-overlay" @click="closePriceInfo" />
    <section v-if="priceInfoOpen" class="modal modal-sm price-info-modal" role="dialog" aria-modal="true" aria-labelledby="price-info-title">
      <header class="modal-header">
        <h3 id="price-info-title">Fiyat bilgisi</h3>
        <button class="btn-close" aria-label="Kapat" @click="closePriceInfo">&times;</button>
      </header>
      <div class="modal-body price-info-body">
        <div class="price-info-product">
          <div class="price-info-emblem"><BadgeTurkishLira :size="28" /></div>
          <div><strong>{{ priceInfo.name || selected?.label }}</strong><small>Barkod: {{ priceInfo.barcode }}</small></div>
        </div>
        <div class="price-source-list">
          <article v-for="source in priceInfo.sources" :key="source.source" class="price-source" :class="{ unavailable: !source.success }">
            <div><strong>{{ source.source }}</strong><small v-if="source.date">{{ source.date }}</small></div>
            <b v-if="source.success">{{ source.displayPrice }}</b>
            <span v-else>{{ source.error || 'Bilgi alınamadı' }}</span>
          </article>
        </div>
      </div>
      <footer class="modal-footer price-info-footer"><span>Fiyatlar kaynakların güncel kayıtlarından alınır.</span><button class="btn btn-primary" @click="closePriceInfo">Tamam</button></footer>
    </section>

    <div v-if="prospectusLoading" class="modal-overlay prospectus-loading-overlay" />
    <div
      v-if="prospectusLoading"
      class="modal modal-sm prospectus-loading-modal"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="catalog-prospectus-loading-title"
    >
      <div class="modal-header">
        <h3 id="catalog-prospectus-loading-title">
          {{ prospectusRequestedType === 'KÜB' ? 'Kısa Ürün Bilgisi aranıyor' : 'Kullanım Talimatları aranıyor' }}
        </h3>
      </div>
      <div class="modal-body prospectus-loading-body">
        <div class="prospectus-spinner"></div>
        <p>{{ prospectusRequestedType === 'KÜB' ? 'KÜB belgesi kaynaklarda aranıyor.' : 'KT belgesi kaynaklarda aranıyor.' }}</p>
        <small>Bu işlem internet bağlantısına göre birkaç saniye sürebilir.</small>
      </div>
    </div>

    <div v-if="uptodateLoading" class="modal-overlay prospectus-loading-overlay" />
    <div v-if="uptodateLoading" class="modal modal-sm prospectus-loading-modal" role="alertdialog" aria-modal="true" aria-labelledby="uptodate-loading-title">
      <div class="modal-header"><h3 id="uptodate-loading-title">UpToDate ilaç bilgileri aranıyor</h3></div>
      <div class="modal-body prospectus-loading-body">
        <div class="prospectus-spinner"></div>
        <p>Etken maddeye uygun güncel içerikler kontrol ediliyor...</p>
      </div>
    </div>

    <div v-if="globalRphLoading" class="modal-overlay prospectus-loading-overlay" />
    <div v-if="globalRphLoading" class="modal modal-sm prospectus-loading-modal" role="alertdialog" aria-modal="true" aria-labelledby="globalrph-loading-title">
      <div class="modal-header"><h3 id="globalrph-loading-title">GlobalRPH aranıyor</h3></div>
      <div class="modal-body prospectus-loading-body">
        <div class="prospectus-spinner"></div>
        <p>Etken maddeye uygun içerik kontrol ediliyor...</p>
      </div>
    </div>

    <div v-if="uptodateChoiceOpen" class="modal-overlay" @click="closeUptodateChoice" />
    <section v-if="uptodateChoiceOpen" class="modal modal-sm uptodate-choice-modal" role="dialog" aria-modal="true" aria-labelledby="uptodate-choice-title">
      <header class="modal-header">
        <div>
          <h3 id="uptodate-choice-title">Hangisini okumak istiyorsunuz?</h3>
          <p>Etken madde için birden fazla UpToDate içeriği bulundu.</p>
        </div>
        <button class="btn-close" aria-label="Kapat" @click="closeUptodateChoice">&times;</button>
      </header>
      <div class="modal-body uptodate-choice-list">
        <button v-for="option in uptodateOptions" :key="option.url" type="button" class="uptodate-choice" @click="openSelectedUptodate(option)">
          <BookOpenText :size="18" />
          <span>{{ option.title }}</span>
          <ExternalLink :size="14" />
        </button>
      </div>
    </section>

    <div v-if="globalRphChoiceOpen" class="modal-overlay" @click="closeGlobalRphChoice" />
    <section v-if="globalRphChoiceOpen" class="modal modal-sm globalrph-choice-modal" role="dialog" aria-modal="true" aria-labelledby="globalrph-choice-title">
      <header class="modal-header">
        <div>
          <h3 id="globalrph-choice-title">Hangi içeriği açmak istiyorsunuz?</h3>
          <p>GlobalRPH’de etken maddeyle ilişkili birden fazla içerik bulundu.</p>
        </div>
        <button class="btn-close" aria-label="Kapat" @click="closeGlobalRphChoice">&times;</button>
      </header>
      <div class="modal-body globalrph-choice-list">
        <button v-for="option in globalRphOptions" :key="option.url" type="button" class="globalrph-choice" @click="openSelectedGlobalRph(option)">
          <BookOpenText :size="18" />
          <span>{{ option.title }}</span>
          <ExternalLink :size="14" />
        </button>
      </div>
    </section>

    <div v-if="resourceWarning.open" class="modal-overlay resource-warning-overlay" @click="closeResourceWarning" />
    <section v-if="resourceWarning.open" class="modal modal-sm resource-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="resource-warning-title">
      <header class="modal-header">
        <h3 id="resource-warning-title">Bilgi bulunamadı</h3>
        <button class="btn-close" aria-label="Kapat" @click="closeResourceWarning">&times;</button>
      </header>
      <div class="modal-body resource-warning-body">
        <AlertTriangle :size="28" />
        <p>{{ resourceWarning.message }}</p>
      </div>
      <footer class="modal-footer"><button class="btn btn-primary" @click="closeResourceWarning">Tamam</button></footer>
    </section>
  </Teleport>
</template>

<script>
import { AlertTriangle, BadgeTurkishLira, BookAlert, BookOpenText, ExternalLink, LoaderCircle, MessageSquareWarning, Search, SearchX, Syringe, Unplug, Utensils } from '@lucide/vue'

const PROPERTY_LABELS = {
  coldChain: 'Soğuk zincir', hazardous: 'Tehlikeli ilaç', highRisk: 'Yüksek riskli ilaç',
  lightProtectionDrug: 'İlaç halinde ışıktan koruyun', lightProtectionInfusion: 'İnfüzyon sırasında ışıktan koruyun',
  narcotic: 'Narkotik ilaç', vesicant: 'Vezikan özellik', centralLine: 'Santral yol gereksinimi',
  criticalIvPush: 'Kritik IV puşe', filterRequired: 'Filtre gereksinimi', doNotCrush: 'Ezilmemeli',
  taperRequired: 'Kademeli azaltılmalı', anaphylaxisRisk: 'Anafilaksi riski',
  shortStability: 'Kısa stabilite süresi'
}

export default {
  components: { AlertTriangle, BadgeTurkishLira, BookAlert, BookOpenText, ExternalLink, LoaderCircle, MessageSquareWarning, Search, SearchX, Syringe, Unplug, Utensils },
  props: { open: Boolean, initialQuery: { type: String, default: '' } },
  emits: ['close', 'reportDrug', 'catalog-context-menu'],
  data: () => ({
    query: '', results: [], selected: null, properties: null, similarities: [], clinicalInfo: [],
    prospectusRequestedType: 'KÜB', prospectusError: '',
    loading: false, detailLoading: false, prospectusLoading: false,
    uptodateAvailable: false, uptodateLoading: false, uptodateOptions: [], uptodateChoiceOpen: false,
    globalRphLoading: false, globalRphOptions: [], globalRphChoiceOpen: false,
    priceLoading: false, priceInfoOpen: false, priceInfo: {},
    ilacfiyatiLoading: false, ilacfiyatiInfo: null,
    resourceWarning: { open: false, message: '' },
    searchTimer: null, searchSequence: 0
  }),
  computed: {
    propertyEntries() {
      return Object.entries(this.properties || {})
        .filter(([key, value]) => value?.flag === true && !['searched', 'found', 'lasa'].includes(key))
    },
    sgkBadge() {
      if (this.ilacfiyatiLoading) return { text: 'Bilgi toplanıyor...', kind: 'loading' }
      const durum = this.ilacfiyatiInfo?.cards?.['SGK Durumu']
      if (durum) {
        const normalized = this.normalizeText(durum)
        const paid = normalized.includes('odenir') && !normalized.includes('odenmez')
        return { text: `SGK: ${durum}`, kind: paid ? 'success' : 'danger' }
      }
      const paid = Boolean(this.selected?.sgk_odeme)
      return { text: `SGK Ödeme: ${paid ? 'Evet' : 'Hayır'}`, kind: paid ? 'success' : 'danger' }
    },
    ilacDurumuBadge() {
      if (this.ilacfiyatiLoading) return null
      const durum = this.ilacfiyatiInfo?.cards?.['İlaç Durumu']
      if (!durum) return null
      const aktif = this.normalizeText(durum).includes('aktif')
      return { text: `İlaç: ${durum}`, kind: aktif ? 'success' : 'danger' }
    },
    firmaBadge() {
      if (this.ilacfiyatiLoading || !this.ilacfiyatiInfo?.cards?.['Firma Adı']) return null
      return { text: `Firma: ${this.ilacfiyatiInfo.cards['Firma Adı']}`, kind: 'info' }
    },
    receteBadge() {
      if (this.ilacfiyatiLoading || !this.ilacfiyatiInfo?.cards?.['Reçete Bilgisi']) return null
      return { text: `Reçete: ${this.ilacfiyatiInfo.cards['Reçete Bilgisi']}`, kind: 'info' }
    },
    similarityGroups() {
      const definitions = {
        name: ['Benzer isimli ilaçlar', 'İsim benzerliği ilaç seçim hatasına yol açabilir. Uygulamadan önce ilacı dikkatle doğrulayın.'],
        appearance: ['Görünüşü benzer ilaçlar', 'Fiziksel görünüş benzerliği nedeniyle doğru ürünü seçtiğinizi ambalaj ve doz üzerinden doğrulayın.'],
        package: ['Ambalajı benzer ilaçlar', 'Ambalaj benzerliği nedeniyle ilaç adı, doz ve farmasötik formu birlikte kontrol edin.']
      }
      return Object.entries(definitions).map(([type, [title, description]]) => ({
        type, title, description, items: this.similarities.filter(item => item.similarityType === type)
      })).filter(group => group.items.length)
    },
    clinicalGroups() {
      return {
        highRisk: this.clinicalInfo.filter(item => item.category === 'high_risk'),
        administration: this.clinicalInfo.filter(item => ['administration', 'infusion_set'].includes(item.category)),
        incompatibility: this.clinicalInfo.filter(item => item.category === 'incompatibility'),
        interactions: this.clinicalInfo.filter(item => ['drug_interaction', 'food_interaction'].includes(item.category))
      }
    }
  },
  watch: {
    open(value) {
      if (!value) return
      const initialQuery = String(this.initialQuery || '').trim()
      this.query = initialQuery
      this.selected = null
      this.properties = null
      this.similarities = []
      this.clinicalInfo = []
      this.prospectusRequestedType = 'KÜB'
      this.uptodateOptions = []
      this.uptodateChoiceOpen = false
      this.globalRphOptions = []
      this.globalRphChoiceOpen = false
      this.resourceWarning = { open: false, message: '' }
      this.searchCatalog().then(() => {
        if (!initialQuery || !this.open || this.selected) return
        const normalized = initialQuery.toLocaleLowerCase('tr-TR')
        const exact = this.results.find(drug => String(drug.label || '').toLocaleLowerCase('tr-TR') === normalized)
        if (exact) this.selectDrug(exact)
      })
      this.checkUptodateAvailability()
      this.$nextTick(() => this.$refs.searchInput?.focus())
    },
    query() {
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(() => this.searchCatalog(), 180)
    }
  },
  beforeUnmount() { clearTimeout(this.searchTimer) },
  methods: {
    showResourceWarning(message) {
      this.resourceWarning = { open: true, message }
    },
    closeResourceWarning() {
      this.resourceWarning = { open: false, message: '' }
    },
    async checkUptodateAvailability() {
      try {
        const result = await window.electronAPI?.getUptodateAvailability()
        if (this.open) this.uptodateAvailable = Boolean(result?.available)
      } catch {
        if (this.open) this.uptodateAvailable = false
      }
    },
    sameDrug(a, b) {
      if (!a || !b) return false
      if (a.barcode && b.barcode) return a.barcode === b.barcode
      return a.full_name === b.full_name && a.label === b.label && a.active_ingredient === b.active_ingredient && a.form === b.form
    },
    openContextMenu(event, drug) {
      this.$emit('catalog-context-menu', { event, drug })
    },
    async searchCatalog() {
      const sequence = ++this.searchSequence
      const query = this.query.trim()
      if (!query) {
        this.results = []
        this.loading = false
        return
      }
      this.loading = true
      try {
        const rows = await window.electronAPI?.dbSearchDrugCatalog(query)
        if (sequence === this.searchSequence) this.results = rows || []
      } finally {
        if (sequence === this.searchSequence) this.loading = false
      }
    },
    async selectDrug(drug) {
      this.selected = drug
      this.properties = null
      this.similarities = []
      this.clinicalInfo = []
      this.prospectusError = ''
      this.detailLoading = true
      this.fetchIlacfiyati(drug)
      try {
        const [properties, similarities, clinicalInfo] = await Promise.all([
          window.electronAPI?.dbGetDrugPropertiesForMedication({ name: drug.label, activeIngredient: drug.active_ingredient, route: drug.form }),
          window.electronAPI?.dbGetDrugSimilarities(drug.label),
          window.electronAPI?.dbGetDrugClinicalInfo({ name: drug.label, activeIngredient: drug.active_ingredient })
        ])
        if (!this.sameDrug(drug, this.selected)) return
        this.properties = properties
        this.similarities = similarities || []
        this.clinicalInfo = clinicalInfo || []
      } finally {
        if (this.sameDrug(drug, this.selected)) this.detailLoading = false
      }
    },
    propertyLabel(key, value) {
      return value?.label || PROPERTY_LABELS[key] || key
    },
    propertyDetail(value) { return value?.note || value?.description || value?.detail || '' },
    normalizeText(value) {
      return String(value || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ı/g, 'i')
        .toLocaleLowerCase('tr-TR')
    },
    routeFullName(abbr) {
      if (!abbr) return ''
      const map = {
        PO: 'Oral', IV: 'İntravenöz', IM: 'İntramüsküler', SC: 'Subkütan',
        SL: 'Sublingual', PR: 'Rektal', INH: 'İnhalasyon', TOP: 'Topikal',
        IVINF: 'IV İnfüzyon', DGR: 'Diğer'
      }
      return map[abbr] || abbr
    },
    async fetchIlacfiyati(drug) {
      this.ilacfiyatiLoading = true
      this.ilacfiyatiInfo = null
      let barcode = String(drug?.barcode || '').trim()
      if (!barcode) {
        try {
          barcode = String(await window.electronAPI?.dbResolveDrugBarcode(drug?.label, drug?.active_ingredient, drug?.form) || '').trim()
        } catch {
          barcode = ''
        }
      }
      if (!barcode) {
        this.ilacfiyatiLoading = false
        return
      }
      try {
        const result = await window.electronAPI?.fetchIlacfiyatiInfo(barcode)
        if (!this.sameDrug(drug, this.selected)) return
        this.ilacfiyatiInfo = result?.success ? result : null
      } catch {
        if (this.sameDrug(drug, this.selected)) this.ilacfiyatiInfo = null
      } finally {
        if (this.sameDrug(drug, this.selected)) this.ilacfiyatiLoading = false
      }
    },
    clinicalKey(item) { return `${item.category}|${item.lookupName}|${item.sourceCode}|${item.summary}` },
    sourceLabel(item) {
      return ['Kaynak:', item.sourceCode, item.sourceRevision ? `Rev. ${item.sourceRevision}` : '', item.sourceDate].filter(Boolean).join(' ')
    },
    clinicalDetailRows(item) {
      const labels = {
        infusion: 'İnfüzyon', cautions: 'Dikkat', useDuration: 'Kullanım süresi', storage: 'Saklama',
        roomStability: 'Oda sıcaklığında', refrigeratedStability: 'Buzdolabında', monitoring: 'İzlem', verbalOrder: 'Sözel istem'
      }
      return Object.entries(item.details || {})
        .filter(([key, value]) => labels[key] && value && !Array.isArray(value))
        .map(([key, value]) => ({ label: labels[key], value }))
    },
    async openProspectus(documentType) {
      if (!this.selected || this.prospectusLoading) return
      const selected = this.selected
      this.prospectusRequestedType = documentType === 'KT' ? 'KT' : 'KÜB'
      this.prospectusLoading = true
      this.prospectusError = ''
      try {
        const result = await window.electronAPI?.openDrugProspectus(
          selected.label,
          selected.active_ingredient,
          selected.form,
          String(selected.full_name || ''),
          this.prospectusRequestedType
        )
        if (!this.sameDrug(selected, this.selected)) return
        if (!result?.success) this.showResourceWarning(result?.error || 'Prospektüs açılamadı.')
      } catch (_) {
        if (this.sameDrug(selected, this.selected)) {
          this.showResourceWarning('Prospektüs araması sırasında bir hata oluştu.')
        }
      } finally {
        this.prospectusLoading = false
      }
    },
    async openUptodate() {
      if (!this.selected || this.uptodateLoading) return
      const selected = this.selected
      this.uptodateLoading = true
      this.prospectusError = ''
      try {
        const result = await window.electronAPI?.findUptodateDrugOptions({
          active_ingredient: selected.active_ingredient,
          etken_detay: selected.etken_detay
        })
        if (!this.sameDrug(selected, this.selected)) return
        if (!result?.success) {
          const message = result?.error || 'UpToDate ilaç bilgisi bulunamadı.'
          if (message === 'Bu etken madde için UpToDate ilaç bilgisi bulunamadı.') this.showResourceWarning(message)
          else this.prospectusError = message
          return
        }
        this.uptodateOptions = result.options || []
        if (this.uptodateOptions.length === 1) await this.openSelectedUptodate(this.uptodateOptions[0])
        else this.uptodateChoiceOpen = this.uptodateOptions.length > 1
      } finally {
        this.uptodateLoading = false
      }
    },
    closeUptodateChoice() {
      this.uptodateChoiceOpen = false
    },
    async openSelectedUptodate(option) {
      this.uptodateChoiceOpen = false
      this.uptodateLoading = true
      this.prospectusError = ''
      try {
        const result = await window.electronAPI?.openUptodateDrugInformation({
          title: String(option?.title || ''),
          url: String(option?.url || '')
        })
        if (!result?.success) this.prospectusError = result?.error || 'UpToDate ilaç bilgisi açılamadı.'
      } finally {
        this.uptodateLoading = false
      }
    },
    async openGlobalRph() {
      if (!this.selected || this.globalRphLoading) return
      const selected = this.selected
      this.globalRphLoading = true
      this.prospectusError = ''
      try {
        const result = await window.electronAPI?.findGlobalRphDrugOptions({
          label: selected.label,
          active_ingredient: selected.active_ingredient,
          etken_detay: selected.etken_detay
        })
        if (!this.sameDrug(selected, this.selected)) return
        if (!result?.success) {
          const message = result?.error || 'GlobalRPH içeriği bulunamadı.'
          if (message === 'GlobalRPH’de bu etken madde için sonuç bulunamadı.') this.showResourceWarning(message)
          else this.prospectusError = message
          return
        }
        this.globalRphOptions = result.options || []
        if (this.globalRphOptions.length === 1) {
          await this.openSelectedGlobalRph(this.globalRphOptions[0])
        } else {
          this.globalRphChoiceOpen = this.globalRphOptions.length > 1
        }
      } finally {
        this.globalRphLoading = false
      }
    },
    closeGlobalRphChoice() {
      this.globalRphChoiceOpen = false
    },
    async openSelectedGlobalRph(option) {
      this.globalRphChoiceOpen = false
      this.globalRphLoading = true
      this.prospectusError = ''
      try {
        const result = await window.electronAPI?.openGlobalRphDrugInformation({
          title: String(option?.title || ''),
          url: String(option?.url || '')
        })
        if (!result?.success) this.prospectusError = result?.error || 'GlobalRPH içeriği açılamadı.'
      } finally {
        this.globalRphLoading = false
      }
    },
    async openPriceInfo() {
      if (!this.selected || this.priceLoading) return
      const barcode = String(this.selected.barcode || '').trim()
      if (!barcode) return
      await this.openSelectedPrice({ barcode, fullName: String(this.selected.full_name || this.selected.label || '') })
    },
    async openSelectedPrice(option) {
      if (!this.selected || this.priceLoading) return
      const selected = this.selected
      const barcode = String(option?.barcode || '')
      const fullName = String(option?.fullName || selected.label || '')
      this.priceLoading = true
      this.priceInfoOpen = false
      this.priceInfo = {}
      this.prospectusError = ''
      try {
        const result = await window.electronAPI?.getDrugPrices(barcode)
        if (!this.sameDrug(selected, this.selected)) return
        const sources = (result?.sources || []).map(source => ({
          success: Boolean(source?.success),
          source: String(source?.source || 'Bilinmeyen kaynak'),
          displayPrice: String(source?.displayPrice || ''),
          date: String(source?.date || ''),
          error: String(source?.error || '')
        }))
        const cards = this.ilacfiyatiInfo?.cards || {}
        const ilacFiyati = String(cards['İlaç Fiyatı'] || '')
        const ilacFiyatiValue = Number(ilacFiyati.match(/\d+(?:[.,]\d+)?/)?.[0]?.replace(',', '.') || 0)
        if (cards['Fiyat Geçerlilik Tarihi']) {
          const validPrice = ilacFiyatiValue > 0
          sources.push({
            success: validPrice,
            source: 'ilacfiyati.com',
            displayPrice: validPrice ? ilacFiyati : '',
            date: validPrice ? String(cards['Fiyat Geçerlilik Tarihi'] || '') : '',
            error: validPrice ? '' : 'Bu barkod için fiyat bilgisi bulunamadı.'
          })
        }
        if (!sources.some(source => source.success)) {
          const message = result?.error || 'Fiyat bilgisi bulunamadı.'
          if (message === 'Bu barkod için fiyat bilgisi bulunamadı.') this.showResourceWarning(message)
          else this.prospectusError = message
          return
        }
        this.priceInfo = { barcode, name: fullName, sources }
        this.priceInfoOpen = true
      } finally {
        this.priceLoading = false
      }
    },
    closePriceInfo() {
      this.priceInfoOpen = false
    }
  }
}
</script>

<style scoped>
.catalog-modal { width: 900px; height: min(680px, 84vh); }
.catalog-header { padding-bottom: 14px; border-bottom: 1px solid #ECE8F1; }
.catalog-header p { margin-top: 3px; color: #81798D; font-size: 12px; }
.catalog-search { display: flex; align-items: center; gap: 9px; margin: 14px 18px; padding: 0 12px; border: 1px solid #D9D2E5; border-radius: 9px; color: #7C5CBF; background: #FAF9FC; }
.catalog-search:focus-within { border-color: #7C5CBF; box-shadow: 0 0 0 3px rgba(124,92,191,.1); }
.catalog-search input { width: 100%; height: 38px; border: 0; outline: 0; background: transparent; color: #252033; font: inherit; }
.catalog-body { display: grid; grid-template-columns: 310px minmax(0,1fr); flex: 1; min-height: 0; border-top: 1px solid #F2EFF5; }
.catalog-results { overflow-y: auto; border-right: 1px solid #E5DFEB; background: #FAF9FC; }
.catalog-result { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: 11px 15px; border: 0; border-bottom: 1px solid #ECE8F1; background: transparent; color: #2E2937; text-align: left; cursor: pointer; }
.catalog-result:hover { background: #F1EDF6; }.catalog-result.selected { background: #E9E2F3; box-shadow: inset 3px 0 #7C5CBF; }
.catalog-result strong { font-size: 13px; }.catalog-result span { color: #665C73; font-size: 12px; }.catalog-result small { color: #958C9F; font-size: 10px; }
.catalog-detail { min-width: 0; overflow-y: auto; padding: 22px 24px; }
.catalog-empty-detail { display: grid; place-items: center; align-content: center; gap: 12px; height: 100%; color: #9B93A5; text-align: center; }
.catalog-title-block { padding-bottom: 18px; border-bottom: 1px solid #ECE8F1; }
.catalog-title-row { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px 16px; }
.catalog-title-copy { min-width: 0; flex: 1 1 220px; }
.catalog-title-actions { display: flex; flex: none; flex-wrap: wrap; justify-content: flex-end; gap: 7px; margin-left: auto; }
.catalog-title-actions .btn { display: inline-flex; align-items: center; gap: 6px; }
.catalog-title-block h4 { margin: 4px 0 3px; color: #34274D; font-size: 22px; line-height: 1.2; }.catalog-title-block p { color: #6A6175; font-size: 13px; }
.catalog-compound { display: inline-block; padding: 3px 7px; border-radius: 999px; background: #E9E2F3; color: #684A9E; font-size: 10px; vertical-align: 3px; }
.catalog-sgk-statuses { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 8px; }
.catalog-sgk-status { display: inline-flex; padding: 4px 8px; border: 1px solid currentColor; border-radius: 6px; font-size: 11px; font-weight: 700; line-height: 1; }
.catalog-sgk-status.success { background: #E8F5E9; color: #1B7B3D; }
.catalog-sgk-status.danger { background: #FDE8E8; color: #B23A3A; }
.catalog-sgk-status.loading { background: #F1EDF7; color: #684A9E; }
.catalog-sgk-status.info { background: #F4F2F7; color: #5B5268; }
.catalog-products { margin-top: 9px; }
.catalog-product-row { color: #42384D; font-size: 12px; line-height: 1.55; }
.catalog-product-barcode { color: #91889C; }
.catalog-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 16px 0; }.catalog-facts div { padding: 11px 12px; border: 1px solid #E8E2ED; border-radius: 8px; background: #FCFBFD; }
.catalog-facts dt { color: #91889C; font-size: 10px; text-transform: uppercase; }.catalog-facts dd { margin-top: 3px; color: #42384D; font-size: 13px; font-weight: 600; }
.catalog-facts .catalog-fact-wide { grid-column: 1 / -1; width: 100%; box-sizing: border-box; }
.catalog-facts .catalog-fact-copy { font-weight: 400; line-height: 1.5; white-space: pre-line; }
.catalog-similar-section { margin: 0 0 10px; padding: 12px 13px; border: 1px solid #E8B5AF; border-left: 4px solid #C4473D; border-radius: 9px; background: #FFF5F3; }
.catalog-similar-heading { display: flex; align-items: flex-start; gap: 9px; color: #A5362E; }.catalog-similar-heading > svg { flex: none; margin-top: 1px; }
.catalog-warning-section .catalog-similar-heading h5 { margin: 0; color: #8F2F28; font-size: 12px; }.catalog-similar-heading p { margin-top: 3px; color: #875B57; font-size: 11px; line-height: 1.4; }
.catalog-similar-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }.catalog-similar-list span { padding: 5px 8px; border: 1px solid #E3B0AA; border-radius: 6px; background: #FFF; color: #923B33; font-size: 11px; font-weight: 700; }
.catalog-warning-section h5 { margin: 18px 0 10px; color: #433653; font-size: 12px; }.catalog-warnings { display: grid; gap: 7px; }
.catalog-warning { display: flex; gap: 9px; padding: 10px 11px; border: 1px solid #ECDDC8; border-radius: 8px; background: #FFF9EF; color: #8A5B18; }.catalog-warning > svg { flex: none; margin-top: 1px; }
.catalog-warning strong { color: #684713; font-size: 12px; }.catalog-warning p { margin-top: 2px; color: #846B47; font-size: 11px; line-height: 1.4; }
.catalog-high-risk-details { margin-top: 7px; }.catalog-high-risk-details small { display: block; margin-top: 6px; color: #9A7B52; font-size: 9px; }
.catalog-clinical-section { margin-top: 18px; }.catalog-clinical-section > h5 { margin: 0 0 9px; color: #433653; font-size: 12px; }
.catalog-clinical-card { margin-bottom: 8px; padding: 12px 13px; border: 1px solid #DDD5E8; border-radius: 9px; background: #FBF9FD; }
.catalog-clinical-title { display: flex; align-items: center; gap: 7px; color: #684A9E; }.catalog-clinical-title strong { font-size: 12px; }
.catalog-clinical-card > p { margin-top: 7px; color: #5F5669; font-size: 11px; line-height: 1.5; }.catalog-clinical-card > small { display: block; margin-top: 9px; color: #958C9F; font-size: 9px; }
.catalog-clinical-details { display: grid; gap: 5px; margin-top: 9px; }.catalog-clinical-details div { display: grid; grid-template-columns: 110px 1fr; gap: 8px; padding-top: 5px; border-top: 1px solid #EAE4F0; }
.catalog-clinical-details dt { color: #8C8297; font-size: 10px; }.catalog-clinical-details dd { color: #4C4357; font-size: 10px; line-height: 1.4; }
.catalog-clinical-section.danger .catalog-clinical-card { border-color: #E8B5AF; background: #FFF7F5; }.catalog-clinical-section.danger .catalog-clinical-title { color: #A5362E; }
.catalog-clinical-section.warning .catalog-clinical-card { border-color: #ECDDC8; background: #FFF9EF; }.catalog-clinical-section.warning .catalog-clinical-title { color: #8A5B18; }
.catalog-relation-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 9px; }.catalog-relation-list span { padding: 4px 7px; border: 1px solid currentColor; border-radius: 5px; color: #9A443C; background: #FFF; font-size: 10px; font-weight: 650; }
.catalog-action { padding: 7px 8px; border-radius: 6px; background: rgba(124,92,191,.07); }.catalog-action b { color: #433653; }
.catalog-no-warning,.catalog-state { color: #958C9F; font-size: 12px; }.catalog-state { padding: 22px 15px; text-align: center; }.catalog-state.inline { padding: 8px 0; text-align: left; }
.catalog-results > .catalog-state { display: grid; place-items: center; align-content: center; gap: 9px; min-height: 100%; }
.catalog-state-spinner { animation: catalog-spin .8s linear infinite; }
@keyframes catalog-spin { to { transform: rotate(360deg); } }
.catalog-prospectus { display: grid; gap: 8px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #ECE8F1; }.catalog-prospectus-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }.catalog-prospectus .btn { display: flex; align-items: center; gap: 6px; flex: none; }
.catalog-reference-btn { border: 1px solid #8D6AC7; background: #F5F1FA; color: #684A9E; }.catalog-reference-btn:hover { background: #EAE2F4; }
.uptodate-choice-modal { width: min(560px, 92vw); }.uptodate-choice-modal .modal-header p { margin-top: 4px; color: #81798D; font-size: 12px; }
.uptodate-choice-list { display: grid; gap: 8px; max-height: 55vh; overflow-y: auto; }.uptodate-choice { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; width: 100%; padding: 13px 14px; border: 1px solid #DDD5E8; border-radius: 9px; background: #FBF9FD; color: #433653; text-align: left; cursor: pointer; }.uptodate-choice:hover { border-color: #8D6AC7; background: #F1EBF7; }.uptodate-choice > svg { color: #7655AD; }.uptodate-choice span { font-size: 13px; font-weight: 650; line-height: 1.4; }
.globalrph-choice-modal { width: min(560px, 92vw); }.globalrph-choice-modal .modal-header p { margin-top: 4px; color: #81798D; font-size: 12px; }
.globalrph-choice-list { display: grid; gap: 8px; max-height: 55vh; overflow-y: auto; }.globalrph-choice { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; width: 100%; padding: 13px 14px; border: 1px solid #DDD5E8; border-radius: 9px; background: #FBF9FD; color: #433653; text-align: left; cursor: pointer; }.globalrph-choice:hover { border-color: #8D6AC7; background: #F1EBF7; }.globalrph-choice > svg { color: #7655AD; }.globalrph-choice span { font-size: 13px; font-weight: 650; line-height: 1.4; }
.price-info-modal { width: min(520px, 92vw); }.price-info-body { display: grid; gap: 16px; padding: 22px 24px; }.price-info-product { display: flex; align-items: center; gap: 13px; }.price-info-product > div:last-child { display: grid; gap: 4px; }.price-info-product strong { color: #3D2A58; font-size: 13px; line-height: 1.4; }.price-info-product small { color: #8A8194; font-size: 10px; }.price-info-emblem { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 13px; background: #EEE7F7; color: #6F4BA7; }.price-source-list { display: grid; gap: 8px; }.price-source { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; padding: 13px 14px; border: 1px solid #DDD5E8; border-radius: 9px; background: #FBF9FD; }.price-source > div { display: grid; gap: 3px; }.price-source > div strong { color: #574267; font-size: 12px; }.price-source small { color: #91889C; font-size: 9px; }.price-source > b { color: #684A9E; font-size: 20px; letter-spacing: -.02em; }.price-source > span { max-width: 180px; color: #9A7D83; font-size: 10px; text-align: right; }.price-source.unavailable { border-style: dashed; background: #FAF8FA; }.price-info-footer { justify-content: space-between; }.price-info-footer span { color: #91889C; font-size: 9px; }
.price-choice-modal { width: min(600px, 92vw); }.price-choice-modal .modal-header p { margin-top: 4px; color: #81798D; font-size: 12px; }
.price-choice-list { display: grid; gap: 8px; max-height: 55vh; overflow-y: auto; }.price-choice { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; width: 100%; padding: 13px 14px; border: 1px solid #DDD5E8; border-radius: 9px; background: #FBF9FD; color: #433653; text-align: left; cursor: pointer; }.price-choice:hover { border-color: #8D6AC7; background: #F1EBF7; }.price-choice > svg { color: #7655AD; }.price-choice span { display: grid; gap: 3px; }.price-choice strong { font-size: 13px; line-height: 1.4; }.price-choice small { color: #91889C; font-size: 10px; }
.resource-warning-overlay { z-index: 8000; }.resource-warning-modal { z-index: 9000; }.resource-warning-body { display: flex; align-items: center; gap: 13px; color: #5F5669; line-height: 1.5; }.resource-warning-body > svg { flex: none; color: #B7791F; }
.catalog-error { margin-top: 9px; color: #B42318; font-size: 12px; }
@media (max-width: 720px) { .catalog-modal { width: 94vw; }.catalog-body { grid-template-columns: 42% 58%; }.catalog-detail { padding: 18px 16px; } }
</style>
