<template>
  <div class="app">
    <PrintProgressModal />
    <div v-if="serverMessage.open" class="modal-overlay priority-alert-overlay" @click.self="closeServerMessage" />
    <section v-if="serverMessage.open" class="modal priority-alert-modal server-message-modal" role="alertdialog" aria-modal="true" aria-labelledby="server-message-title">
      <div class="modal-header"><h3 id="server-message-title">{{ serverMessage.title }}</h3><button class="modal-close" @click="closeServerMessage" aria-label="Kapat"><X :size="14" /></button></div>
      <div class="modal-body server-message-body">{{ serverMessage.body }}</div>
    </section>
    <div class="titlebar">
      <div class="titlebar-drag">
        <div class="titlebar-tools">
          <button class="tb-btn" @click="openReportModal()" v-tooltip="'Hata Bildir / Öneri'">
            <AlertCircle :size="13" />
          </button>
          <div class="settings-dropdown">
            <button class="tb-btn" @click="toggleSettingsMenu" v-tooltip="'Ayarlar'">
              <Settings :size="13" />
            </button>
            <div v-if="settingsMenuOpen" class="print-menu settings-menu">
              <button class="print-menu-item" @click="openDosageSettings">Dozaj Ayarları</button>
              <div class="print-menu-sep"></div>
              <button class="print-menu-item" @click="openSettings('shifts')">Vardiya Ayarları</button>
              <div class="print-menu-sep"></div>
              <button class="print-menu-item" @click="openSettings('printer')">Yazıcı Ayarları</button>
              <div class="print-menu-sep"></div>
              <button class="print-menu-item" @click="openSettings('api')">API Ayarları</button>
            </div>
          </div>
          <button class="tb-btn tb-refresh" @click="reloadPage" v-tooltip="'Yenile'">
            <RefreshCw :size="14" />
          </button>
        </div>
      </div>
      <span class="titlebar-text">Hemşire Tedavi Yönetimi by SD<span v-if="isDev"> [Geliştirme]</span></span>
      <div class="titlebar-actions">
        <button class="tb-btn" @click="windowMinimize" v-tooltip="'Simge Durumuna'">
          <Minus :size="12" />
        </button>
        <button class="tb-btn" @click="windowMaximize" :data-tooltip="isMaximized ? 'Pencere Haline' : 'Tam Ekran'" v-tooltip>
          <template v-if="isMaximized"><Minimize2 :size="12" /></template>
          <template v-else><Maximize2 :size="12" /></template>
        </button>
        <button class="tb-btn tb-close" @click="windowClose" v-tooltip="'Kapat'">
          <X :size="12" />
        </button>
      </div>
    </div>
    <div v-if="clinicalName" class="clinic-bar">{{ clinicalName }}</div>
    <header class="header">
      <button class="btn btn-ghost archive-btn" @click="archiveOpen = true">
        <Archive :size="16" />
        Arşivlenmiş Hastalar
      </button>
      <button class="btn btn-ghost" @click="closeStok(); stokModal.open = true; stokModal.step = 'cabinet'; loadCabinets()">
        <PackageSearch :size="16" />
        Stok Takip
      </button>
      <div class="header-center">
        <input type="date" v-model="referenceDate" class="date-input" style="width:140px"/>
        <select v-model="shift" class="shift-select">
          <option v-for="item in shifts" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
        <select v-model="labelSize" class="shift-select">
          <option value="kucuk">Küçük Etiket</option>
          <option value="buyuk">Büyük Etiket</option>
        </select>
        <div class="print-dropdown">
            <button class="btn btn-primary" @click="printOpen = !printOpen">
              <Printer :size="14" />
              Yazdırma Menüsü
            </button>
          <div v-if="printOpen" class="print-menu" style="left:auto;right:0">
            <template v-for="(group, groupIndex) in visibleLabelGroups" :key="groupIndex">
              <div v-if="groupIndex > 0" class="print-menu-sep"></div>
              <button v-for="lb in group" :key="lb.key" class="print-menu-item" :class="{ success: lb.success }" @click="printOpen = false; printLabelType(lb.key)">{{ lb.label }}</button>
            </template>
        </div>
        </div>
      </div>
    </header>

    <div class="panel">
      <aside class="panel-left">
        <div class="panel-header btn-header" @click="openPatientModal()">
          <Plus :size="14" :stroke-width="2.5" /> Yeni Hasta
        </div>
        <div class="patient-list" @contextmenu.prevent>
          <div
            v-for="p in activePatients"
            :key="p.id"
            class="patient-item"
            :class="{ active: selectedPatientId === p.id }"
            @click="selectPatient(p.id)"
            @contextmenu.prevent.stop="openCtx($event, 'patient', p)"
          >
            <span class="patient-name" :data-tooltip="patientTooltip(p)" v-tooltip>{{ p.name }}</span>
          </div>
          <div v-if="activePatients.length === 0" class="empty">
  <MoveUp :size="48" :stroke-width="1" class="empty-file-icon" />
  <p>Hiç hasta yok.</p>
<p>Eklemek için yukarıdaki butonu kullanın.</p>
</div>
        </div>
      </aside>

      <main class="panel-right">
        <div class="panel-header">
          <h2>{{ selectedPatient ? selectedPatient.name : 'Hasta seçilmedi' }}</h2>
          <div class="header-actions">
            <button class="btn btn-primary" :disabled="!selectedPatient" @click="openMedModal()">
              <Plus :size="14" :stroke-width="2.5" />
              Yeni İlaç
            </button>
            <button class="btn btn-secondary" :disabled="!selectedPatient" @click="autoImport">
              <ClipboardPaste :size="14" />
              Panodan Al
            </button>
            <button class="btn btn-secondary" :disabled="!selectedPatient" @click="openAutoSched">
              <Timer :size="14" />
              Otomatik Saatlendir
            </button>
          </div>
        </div>
        <div class="mayi-bar" v-if="selectedPatient">
          <template v-if="patientMayi && patientMayi.mayiFluid">
            <span class="mayi-text">
              Mayi: {{ patientMayi.mayiFluid }} içinde {{ (Array.isArray(patientMayi.mayiContents) ? patientMayi.mayiContents : []).map(formatMayiContent).filter(Boolean).join(', ') }}
              <template v-if="patientMayi.mayiRate"> · Hız: {{ patientMayi.mayiRate }}</template>
            </span>
            <button class="icon-btn with-label" @click="openMayiEdit">
              <FilePen :size="14"/>
              <span>Mayisini Düzenle</span>
            </button>
            <button class="icon-btn with-label" @click="printMayiLabel">
              <Printer :size="14"/>
              <span>Mayi Etiketi Yazdır</span>
            </button>
          </template>
          <template v-else>
            <span class="mayi-text" style="color:#999">Mayi almıyor ya da tanımlanmamış</span>
            <button class="icon-btn with-label" @click="openMayiEdit">
              <FilePen :size="14"/>
              <span>Mayisini Düzenle</span>
            </button>
          </template>
        </div>
        <div class="mayi-bar inf-bar" v-if="selectedPatient">
          <template v-if="patientInfList && patientInfList.length">
            <span class="mayi-text">
              Sürekli İnfüzyonlar:
              <span v-for="(inf, i) in patientInfList" :key="i" class="inf-badge" :data-tooltip="infTip(inf)" v-tooltip>{{ inf.drug }}</span>
            </span>
            <button class="icon-btn with-label" @click="openInfEdit">
              <FilePen :size="14"/>
              <span>İnfüzyonları Düzenle</span>
            </button>
            <button class="icon-btn with-label" @click="openInfPrintModal">
              <Printer :size="14"/>
              <span>İnfüzyon Etiketi</span>
            </button>
          </template>
          <template v-else>
            <span class="mayi-text" style="color:#999">Sürekli infüzyon almıyor ya da tanımlanmamış</span>
            <button class="icon-btn with-label" @click="openInfEdit">
              <FilePen :size="14"/>
              <span>İnfüzyonları Düzenle</span>
            </button>
          </template>
        </div>
        <div class="med-table-wrap" @contextmenu.prevent>
          <div v-if="drugPropsLoading" class="drug-props-loading">
            <RefreshCw :size="18" class="spin" />
            <span>İlaçlar kontrol ediliyor...</span>
          </div>
          <table class="med-table" v-if="selectedPatient && !drugPropsLoading">
            <thead>
              <tr>
                <th style="width:40%">İlaç</th><th style="width:7%">Yol</th><th style="width:8%">Doz</th><th style="width:5%" v-tooltip="'Lüzum Hali'">LH</th><th style="width:35%">Saatleri</th><th style="width:7%">Gün</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="m in patientMeds"
                :key="m.id"
                @contextmenu.prevent.stop="openCtx($event, 'med', m)"
                @dblclick="openMedModal(m)"
              >
                <td class="drug-cell">
                  <div class="drug-cell-text">
                    <div class="drug-name">
                      <span
                        v-if="drugFullNameTooltip(m) !== 'Muadili yok'"
                        class="drug-name-muadil"
                        :data-tooltip="drugFullNameTooltip(m)"
                        v-tooltip
                        aria-label="Muadilleri göster"
                      ><Pill :size="12" /></span>
                      <span class="drug-name-label">{{ m.customLabel || m.name }}</span>
                      <span v-if="m.catalogLabelDetail" class="icon-badge prop-note" v-tooltip="m.catalogLabelDetail" :aria-label="`Tanımlayıcı özellik: ${m.catalogLabelDetail}`"><IdCard :size="13" /></span>
                    </div>
                    <div class="drug-active-ing">{{ m.activeIngredient }}</div>
                    <div class="note-icons">
                      <span v-if="m.note" class="icon-badge prop-note" v-tooltip="m.note"><FileText :size="13" /></span>
                      <span v-if="nonMatchingMeds.has(m.id)" class="icon-badge icon-warn" v-tooltip="'Günü değil'"><CalendarOff :size="13" /></span>
                      <span v-if="expiredMeds.has(m.id)" class="icon-badge icon-expired" v-tooltip="'Tarih aralığı sona erdi.'"><Clock :size="13" /></span>
                      <span v-if="dosageWarnings[m.id]" class="icon-badge icon-overdose" v-tooltip="dosageWarnings[m.id]"><AlertOctagon :size="13" /></span>
                      <span v-if="drugProps[m.id]?.coldChain" class="icon-badge prop-cold" v-tooltip="'Soğuk Zincir'"><Thermometer :size="13" /></span>
                      <span v-if="drugProps[m.id]?.hazardous" class="icon-badge prop-haz" v-tooltip="drugProps[m.id].hazardous.label"><Biohazard :size="13" /></span>
                      <span v-if="drugProps[m.id]?.highRisk" class="icon-badge prop-risk" v-tooltip="drugProps[m.id].highRisk.label"><AlertTriangle :size="13" /></span>
                      <span v-if="drugProps[m.id]?.lightProtectionDrug" class="icon-badge prop-light-drug" v-tooltip="warningTooltip(drugProps[m.id].lightProtectionDrug)"><Sun :size="13" /></span>
                      <span v-if="drugProps[m.id]?.lightProtectionInfusion" class="icon-badge prop-light-infusion" v-tooltip="warningTooltip(drugProps[m.id].lightProtectionInfusion)"><Sun :size="13" /></span>
                      <span v-if="drugProps[m.id]?.narcotic" class="icon-badge prop-narcotic" v-tooltip="drugProps[m.id].narcotic.label"><ShieldAlert :size="13" /></span>
                      <span v-if="drugProps[m.id]?.vesicant" class="icon-badge prop-vesicant" v-tooltip="warningTooltip(drugProps[m.id].vesicant)"><Syringe :size="13" /></span>
                      <span v-if="drugProps[m.id]?.centralLine" class="icon-badge prop-central" v-tooltip="warningTooltip(drugProps[m.id].centralLine)"><GitBranch :size="13" /></span>
                      <span v-if="drugProps[m.id]?.criticalIvPush" class="icon-badge prop-iv-push" v-tooltip="warningTooltip(drugProps[m.id].criticalIvPush)"><Gauge :size="13" /></span>
                      <span v-if="drugProps[m.id]?.filterRequired" class="icon-badge prop-filter" v-tooltip="warningTooltip(drugProps[m.id].filterRequired)"><Filter :size="13" /></span>
                      <span v-if="drugProps[m.id]?.doNotCrush" class="icon-badge prop-crush" v-tooltip="warningTooltip(drugProps[m.id].doNotCrush)"><Pill :size="13" /></span>
                      <span v-if="drugProps[m.id]?.taperRequired" class="icon-badge prop-taper" v-tooltip="warningTooltip(drugProps[m.id].taperRequired)"><TrendingDown :size="13" /></span>
                      <span v-if="drugProps[m.id]?.anaphylaxisRisk" class="icon-badge prop-anaphylaxis" v-tooltip="warningTooltip(drugProps[m.id].anaphylaxisRisk)"><ShieldX :size="13" /></span>
                      <span v-if="drugProps[m.id]?.similarDrugNames?.length" class="icon-badge prop-similar-name" v-tooltip="`Benzer isimli ilaçlar: ${drugProps[m.id].similarDrugNames.join(', ')}`"><BookAlert :size="13" /></span>
                      <span v-if="drugProps[m.id]?.shortStability" class="icon-badge prop-stability" v-tooltip="warningTooltip(drugProps[m.id].shortStability)"><TimerReset :size="13" /></span>
                      <span v-if="duplicateAIMeds.has(m.id)" class="icon-badge icon-dup" v-tooltip="'Bu etken maddeye sahip başka bir tedavi var.'"><Layers :size="13" /></span>
                    </div>
                  </div>
                </td>
                <td><span class="badge" :data-tooltip="routeFullName(m.route)" v-tooltip>{{ m.route }}</span></td>
                <td>{{ m.dose }}</td>
                <td class="lh-cell"><input type="checkbox" :checked="!!m.luezym" @change="toggleLuezym(m, $event.target.checked)" @dblclick.stop></td>
                <td class="mono" :class="{ 'luzum-text': m.luezym }">
                  <span v-if="m.luezym">Lüzum hali verilecek.</span>
                  <div v-else class="time-badges">
                    <span
                      v-for="time in sortedMedTimes(m.times)"
                      :key="time"
                      class="badge"
                      :class="{ danger: isConflictingIVTime(m.id, time) }"
                      :data-tooltip="isConflictingIVTime(m.id, time) ? 'Başka IV ilaç ile saatleri çakışıyor.' : null"
                      v-tooltip
                    >{{ time }}</span>
                  </div>
                </td>
                <td>{{ medDay(m) }}</td>
              </tr>
              <tr v-if="patientMeds.length === 0">
                <td colspan="6" class="empty">Henüz ilaç eklenmedi</td>
              </tr>
            </tbody>
          </table>
          <div v-else-if="!drugPropsLoading" class="empty-state">
            <UserRoundArrowLeft :size="48" :stroke-width="1" class="empty-file-icon" />
            <p>Soldaki listeden bir hasta seçin</p>
          </div>
        </div>
      </main>
    </div>

    <footer class="statusbar">
      <button type="button" class="statusbar-catalog" :disabled="catalogConnectionChecking" @click="openCatalogModal"><BookOpenText :size="14" /><span>İlaç Kataloğu</span></button>
      <button
        type="button"
        class="statusbar-connection"
        aria-label="Kullanım Koşulları"
        @click="usageTermsOpen = true"
      >
        <Handshake :size="15" /><span>Kullanım Koşulları</span>
      </button>
      <button type="button" class="statusbar-clock" aria-label="Takvimi ve hatırlatmaları aç" @click="openReminderModal">
        <CalendarDays :size="14"/>
        <time>{{ formattedStatusbarDateTime }}</time>
      </button>
    </footer>

    <!-- Print Dropdown overlay -->
    <div v-if="printOpen" class="ctx-overlay" @click="printOpen = false" @contextmenu.prevent="printOpen = false"/>
    <div v-if="settingsMenuOpen" class="ctx-overlay" @click="settingsMenuOpen = false" @contextmenu.prevent="settingsMenuOpen = false"/>

    <!-- Mayi Etiketi Düzenleme Modal -->
    <Teleport to="body">
      <div v-if="mayiModal.open" class="modal-overlay"/>
      <div v-if="mayiModal.open" class="modal">
        <div class="modal-header">
          <h3>Mayi Düzenleme: {{ selectedPatient?.name || '?' }}</h3>
          <button class="btn-close" @click="mayiModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <label class="field-label">Mayi Türü</label>
          <select v-model="mayiModal.fluid" class="input" style="margin-bottom:12px">
            <option v-for="f in mayiFluids" :key="f" :value="f">{{ f }}</option>
          </select>
          <label class="field-label">Mayi Hızı</label>
          <input v-model.trim="mayiModal.rate" class="input" placeholder="Örn. 100 ml/saat" style="margin-bottom:12px"/>
          <label class="field-label">İçerikler</label>
            <div v-for="(entry, i) in mayiModal.entries" :key="i" class="mayi-entry-row">
              <input v-model="entry.ml" class="input mayi-ml" type="number" :placeholder="'Miktar ' + (i + 1)"/>
              <select v-model="entry.unit" class="input mayi-unit">
                <option v-for="unit in mayiUnits" :key="unit" :value="unit">{{ unit }}</option>
              </select>
              <input v-model="entry.content" class="input mayi-content" :placeholder="'İçerik ' + (i + 1)"/>
            </div>
          <div class="field-row" style="margin-top:8px;gap:8px">
            <button class="btn btn-danger" style="margin-right:auto" @click="clearMayi">Mayi Almıyor</button>
            <button class="btn btn-primary" @click="saveMayi">Kaydet</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Infüzyon Modal (tab-based) -->
    <Teleport to="body">
      <div v-if="infModal.open" class="modal-overlay"/>
      <div v-if="infModal.open" class="modal">
        <div class="modal-header">
          <h3>Sürekli İnfüzyonlar</h3>
          <button class="btn-close" @click="infModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="tab-bar">
            <button v-for="(tab, i) in infModal.tabs" :key="i" class="tab-btn" :class="{ active: infModal.activeTab === i }" @click="switchInfTab(i)">
              {{ tab.drug || 'İnfüzyon ' + (i + 1) }}
              <span class="tab-close" v-tooltip="'İnfüzyonu stopla'" @click.stop="removeInfTab(i)">&times;</span>
            </button>
            <button class="tab-btn tab-add" @click="addInfTab"><HeartPlus :size="14"/> Yeni İnfüzyon Başla</button>
          </div>
          <div v-if="infModal.tabs.length === 0" class="inf-empty-hero">
            Hastaya giden sürekli infüzyon yok.
          </div>
          <div v-for="(tab, i) in infModal.tabs" :key="i">
            <template v-if="infModal.activeTab === i">
              <label class="field-label">İlaç</label>
              <div class="drug-dropdown-wrap" style="position:relative">
                <input readonly class="input drug-dropdown-input" :value="tab.drug || 'Seçiniz...'" @click="openInfDrugDropdown(i)" @keydown.enter.prevent="openInfDrugDropdown(i)"/>
                <div v-if="infDrugDropdown.open && infDrugDropdown.tabIdx === i" class="drug-dropdown">
                  <input ref="infDrugSearchInput" v-model="infDrugDropdown.query" class="input drug-dropdown-search" placeholder="Ara..." @input="onInfDrugSearch" @keydown.escape="closeInfDrugDropdown" @keydown.enter="selectFirstInfDrug" @keydown.down.prevent="infDrugDropdownFocusNext" @keydown.up.prevent="infDrugDropdownFocusPrev"/>
                  <div class="drug-dropdown-list">
                    <button v-for="(d, idx) in infDrugDropdown.results" :key="d.label + idx" :ref="el => { if (el) infDrugDropdown.refs[idx] = el }" class="drug-dropdown-item" :class="{ focused: infDrugDropdown.focusIdx === idx }" @click="selectInfDrug(d)" type="button">
                      <span class="dd-label">{{ d.full_name || d.label }}</span>
                      <span class="dd-meta">{{ d.active_ingredient }} · {{ d.form }}</span>
                    </button>
                    <div v-if="!infDrugDropdown.results.length && infDrugDropdown.query.length >= 2" class="drug-dropdown-empty">Eşleşen ilaç bulunamadı</div>
                    <div v-if="!infDrugDropdown.query" class="drug-dropdown-hint">En az 2 harf yazın</div>
                  </div>
                </div>
              </div>
              <div v-if="tab.drug && !(infDrugDropdown.open && infDrugDropdown.tabIdx === i)" class="drug-selected-badge">{{ tab.drug }}</div>
              <label class="field-label">Doz</label>
              <input v-model="tab.dose" class="input" placeholder="Örn: 20mg">
              <label class="field-label">İçindeki Çözelti</label>
              <select v-model="tab.fluid" class="input">
                <option v-for="f in infFluids" :key="f" :value="f">{{ f }}</option>
              </select>
              <label class="field-label">Toplam Hacim (ml)</label>
              <input v-model="tab.totalMl" class="input" type="number" placeholder="Örn: 24">
              <label class="field-label">Hız</label>
              <input v-model="tab.rate" class="input" placeholder="Örn: 1ml/h">
            </template>
          </div>
          <div v-if="infModal.warning" class="field-row" style="margin-top:8px">
            <span style="color:#DC2626;font-size:13px">{{ infModal.warning }}</span>
          </div>
          <div class="field-row" style="justify-content:flex-end;margin-top:12px">
            <button class="btn btn-primary" @click="saveInf">Kaydet</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- İnfüzyon Etiketi Yazdır Modal -->
    <Teleport to="body">
      <div v-if="infPrintModal.open" class="modal-overlay"/>
      <div v-if="infPrintModal.open" class="modal">
        <div class="modal-header">
          <h3>İnfüzyon Etiketi Yazdır</h3>
          <button class="btn-close" @click="infPrintModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="field-row">
            <div>
              <label class="field-label">Tarih</label>
              <input type="date" v-model="infPrintModal.date" class="input"/>
            </div>
            <div>
              <label class="field-label">Saat</label>
              <input type="time" v-model="infPrintModal.time" class="input"/>
            </div>
          </div>
          <label class="field-label" style="margin-top:12px">İnfüzyonlar</label>
          <div v-for="(inf, i) in patientInfList" :key="i" class="print-check-row">
            <label>
              <input type="checkbox" v-model="infPrintModal.selected[i]" />
              {{ inf.dose }} {{ inf.drug }} | {{ inf.totalMl }}ml {{ inf.fluid }} | {{ inf.rate }}
            </label>
          </div>
          <div class="field-row" style="justify-content:flex-end;margin-top:12px">
            <button class="btn btn-primary" @click="printSelectedInfusions">Yazdır</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Context Menu -->
    <Teleport to="body">
      <div v-if="ctx.show" class="ctx-overlay" @click="ctx.show = false" @contextmenu.prevent="ctx.show = false"/>
      <div v-if="ctx.show" class="ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
        <div v-if="ctx.header" class="ctx-header">{{ ctx.header }}</div>
        <button v-for="item in ctx.items" :key="item.label" class="ctx-item" :class="{ danger: item.danger, success: item.success }" :disabled="item.disabled" @click="runContextAction(item)">
          {{ item.label }}
        </button>
      </div>
    </Teleport>

    <!-- Patient Modal -->
    <PatientModal
      :patientModal="patientModal"
      :patientDuplicate="patientDuplicate"
      :patientClipboard="patientClipboard"
      @close="patientModal.open = false"
      @save="savePatient"
      @resetDuplicate="patientDuplicate = false"
      @pastePatient="pastePatientFromClipboard"
    />
    <PatientClipboardSelectModal
      :patients="patientClipboard.patients"
      @close="patientClipboard.patients = []"
      @select="selectClipboardPatient"
    />

    <!-- Medication Modal -->
    <Teleport to="body">
      <div v-if="medModal.open" class="modal-overlay"/>
      <div v-if="medModal.open" class="modal">
        <div class="modal-header">
          <h3>{{ medModal.edit ? 'İlaç Düzenle' : 'Yeni İlaç' }}</h3>
          <button class="btn-close" @click="medModal.open = false">&times;</button>
        </div>
        <div class="modal-body" @click="closeDrugDropdown">
          <label class="field-label">İlaç Adı</label>
          <div class="drug-dropdown-wrap" @click.stop>
            <input readonly class="input drug-dropdown-input" :class="{ err: medModal.errors.name }" :value="medModal.name || 'Seçiniz...'" @click="openDrugDropdown" @keydown.enter.prevent="openDrugDropdown"/>
            <div v-if="drugDropdown.open" class="drug-dropdown">
              <input ref="drugSearchInput" v-model="drugDropdown.query" class="input drug-dropdown-search" placeholder="Ara..." @input="onDrugSearch" @keydown.escape="closeDrugDropdown" @keydown.enter="selectFirstDrug" @keydown.down.prevent="drugDropdownFocusNext" @keydown.up.prevent="drugDropdownFocusPrev"/>
              <div class="drug-dropdown-list">
                <button v-for="(d, i) in drugDropdown.results" :key="d.label + '|' + d.active_ingredient + '|' + d.form + '|' + d.drug_type" :ref="el => { if (el) drugDropdown.refs[i] = el }" class="drug-dropdown-item" :class="{ focused: drugDropdown.focusIdx === i }" @click="selectDrug(d)" type="button">
                  <span class="dd-label">{{ d.full_name || d.label }}</span>
                  <span class="dd-meta">{{ d.active_ingredient }} · {{ d.form }} {{ d.drug_type }}</span>
                </button>
                <div v-if="!drugDropdown.results.length && drugDropdown.query.length >= 2" class="drug-dropdown-empty">Eşleşen ilaç bulunamadı</div>
                <div v-if="!drugDropdown.query" class="drug-dropdown-hint">En az 2 harf yazın</div>
              </div>
            </div>
          </div>
          <div v-if="medModal.name && !drugDropdown.open" class="drug-selected-badge">{{ medModal.name }}</div>
          <div class="field-row label-options-row">
            <div>
              <label class="field-label">Özel Etiket</label>
              <label class="label-option-toggle" for="customLabelCheck">
                <input type="checkbox" v-model="medModal.customLabelEnabled" id="customLabelCheck"/>
                <span>Etikette farklı isim göster</span>
              </label>
              <input v-if="medModal.customLabelEnabled" v-model="medModal.customLabel" class="input label-option-input" placeholder="Etiket metni"/>
            </div>
            <div>
              <label class="label-option-toggle" for="catalogLabelDetailEnabled">
                <input
                  id="catalogLabelDetailEnabled"
                  v-model="medModal.catalogLabelDetailEnabled"
                  type="checkbox"
                  @change="medModal.catalogLabelDetailCustomized = true"
                />
                <span>Tanımlayıcı özellik göster</span>
              </label>
              <input
                v-if="medModal.catalogLabelDetailEnabled"
                id="catalogLabelDetail"
                v-model="medModal.catalogLabelDetail"
                class="input label-option-input"
                maxlength="20"
                placeholder="Örn. 2.0 FİBRE ÇİLEK"
                @input="medModal.catalogLabelDetailCustomized = true"
              />
              <div v-if="medModal.catalogLabelDetailEnabled" class="field-help" :class="{ customized: medModal.catalogLabelDetailCustomized }">
                Sadece büyük boy etikette gözükür.
              </div>
            </div>
          </div>
          <div class="field-row">
            <div>
              <label class="field-label">Yol</label>
              <select v-model="medModal.route" class="input">
                <option v-for="r in routes" :key="r.val" :value="r.val">{{ r.label }}</option>
              </select>
            </div>
            <div>
              <label class="field-label">Genel Doz</label>
              <div class="dose-input-group" :class="{ err: medModal.errors.dose }">
                <input v-model="medModal.doseValue" class="input" inputmode="decimal" placeholder="Örn: 500"/>
                <select v-model="medModal.doseUnit" class="input dose-unit-select">
                  <option v-for="unit in doseUnits" :key="unit.value" :value="unit.value">{{ unit.label }}</option>
                </select>
              </div>
            </div>
          </div>
          <label class="field-label">Saatler</label>
          <div class="time-list" :class="{ err: medModal.errors.times }" v-if="medModal.timesList.length">
            <div v-for="(t, i) in medModal.timesList" :key="i" class="time-chip">
              <span class="mono">{{ t }}</span>
              <div class="chip-dose-wrap">
                <input v-model="medModal.timeDoses[t]" class="chip-dose-input" inputmode="decimal" placeholder="Özel Doz"/>
                <span>{{ doseUnitLabel(medModal.doseUnit) }}</span>
              </div>
              <button class="chip-remove" @click="removeTime(i)">&times;</button>
            </div>
          </div>
          <div class="time-list" :class="{ err: medModal.errors.times }" v-else>
            <span class="time-empty">Henüz saat eklenmedi</span>
          </div>
          <div class="time-add">
            <input type="time" v-model="medModal.newTime" class="input mono" @keyup.enter="addTime" style="width:120px"/>
            <button class="btn btn-sm btn-secondary" @click="addTime" :disabled="!medModal.newTime">Ekle</button>
          </div>
          <div class="time-presets">
            <button v-for="(preset, i) in timePresets" :key="i" class="preset-btn" @click="setTimes(preset)">{{ preset.join(' ') }}</button>
          </div>

          <label class="field-label" style="margin-top:16px">Uygulama Koşulu</label>
          <div class="cond-radios">
            <label v-for="c in conditions" :key="c.val" class="cond-radio">
              <input type="radio" v-model="medModal.condition" :value="c.val"/>
              <span>{{ c.label }}</span>
            </label>
          </div>

          <template v-if="medModal.condition === 'weekdays'">
            <label class="field-label">Günler</label>
            <div class="day-chips" :class="{ err: medModal.errors.days }">
              <button v-for="(d, i) in dayNames" :key="i" class="day-chip" :class="{ active: medModal.conditionData.days?.includes(i) }" @click="toggleDay(i)">{{ d }}</button>
            </div>
          </template>
          <template v-if="medModal.condition === 'dateRange'">
            <div class="field-row">
              <div>
                <label class="field-label">Başlangıç</label>
                <input type="date" v-model="medModal.conditionData.start" class="input" :class="{ err: medModal.errors.dateRange || medModal.errors.dateRangeEndBeforeStart }"/>
              </div>
              <div>
                <label class="field-label">Bitiş</label>
                <input type="date" v-model="medModal.conditionData.end" class="input" :class="{ err: medModal.errors.dateRange || medModal.errors.dateRangeEndBeforeStart }"/>
              </div>
            </div>
            <div v-if="medModal.errors.dateRangeEndBeforeStart" class="field-err" style="margin-top:4px">Bitiş tarihi başlangıç tarihinden önce olamaz</div>
          </template>
          <template v-if="medModal.condition === 'everyX'">
            <label class="field-label">Her X Günde Bir</label>
            <input type="number" v-model.number="medModal.conditionData.x" class="input" :class="{ err: medModal.errors.everyX }" min="1" placeholder="Örneğin: 2"/>
          </template>
          <template v-if="medModal.condition === 'xGiveYWait'">
            <div class="field-row">
              <div>
                <label class="field-label">Verilen Gün</label>
                <input type="number" v-model.number="medModal.conditionData.give" class="input" :class="{ err: medModal.errors.xGiveYWait }" min="1" placeholder="Örneğin: 3"/>
              </div>
              <div>
                <label class="field-label">Beklenen Gün</label>
                <input type="number" v-model.number="medModal.conditionData.wait" class="input" :class="{ err: medModal.errors.xGiveYWait }" min="1" placeholder="Örneğin: 2"/>
              </div>
            </div>
          </template>
          <label class="field-label" style="margin-top:16px">
            Başlangıç Tarihi
            <template v-if="medModal.condition === 'everyX' || medModal.condition === 'xGiveYWait'"> *</template>
          </label>
          <input type="date" v-model="medModal.startDate" class="input" :class="{ err: medModal.errors.startDate }"/>
          <label class="field-label" style="margin-top:16px">Not</label>
          <textarea v-model="medModal.note" class="input textarea" placeholder="Örneğin: buzdolabında çekili 1ml 250mgr" rows="2"></textarea>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="saveMed">Kaydet</button>
        </div>
      </div>
    </Teleport>

    <!-- Auto Schedule Modal -->
    <Teleport to="body">
      <div v-if="autoSched.open" class="modal-overlay"/>
      <div v-if="autoSched.open" class="modal modal-lg">
        <div class="modal-header">
          <h3>{{ autoSched.step === 'select' ? 'Otomatik Saatlendirme' : autoSched.step === 'error' ? 'Saatlendirme Hatasi' : 'Önizleme' }}</h3>
          <div style="display:flex;align-items:center;gap:8px">
            <button v-if="autoSched.step === 'select' && ivMeds.length >= 2" class="btn btn-sm btn-ghost" @click="ignoredModal.open = true" style="font-size:11px">Yoksayılanlar</button>
            <button class="btn-close" @click="autoSched.open = false">&times;</button>
          </div>
        </div>
        <div class="modal-body">
          <template v-if="autoSched.step === 'select'">
            <label class="field-label" style="margin-bottom:8px">Hasta: {{ selectedPatient?.name }}</label>
            <div v-if="ivMeds.length < 2" class="empty">Saatlendirme için uygun IV ilaç bulunamadı</div>
            <table v-else class="med-table" style="font-size:12px">
              <thead>
                <tr>
                  <th style="width:5%">#</th>
                  <th style="width:25%">İlaç</th>
                  <th style="width:14%">Sabit Saatli</th>
                  <th style="width:28%">Min İnf Süresi (dk)</th>
                  <th style="width:28%">Min Doz Aralığı (sa)</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in autoSched.rows" :key="row.medId">
                  <td style="text-align:center">
                    <input type="checkbox" v-model="autoSched.selectedIds" :value="row.medId"/>
                  </td>
                  <td>
                    <span style="font-weight:600;font-size:13px">{{ row.name }}</span>
                    <div style="color:#888;font-size:11px">{{ row.dose }}</div>
                    <div class="mono" style="font-size:11px;color:#888">{{ row.fixedTimes.join(', ') }} ({{ row.doseCount }} doz)</div>
                  </td>
                  <td style="text-align:center">
                    <input type="checkbox" v-model="row.isFixed"/>
                  </td>
                  <td>
                    <input type="number" v-model.number="row.infusionMin" class="input mono" min="1" max="1440" style="width:80px;font-size:12px;padding:4px 6px"/>
                  </td>
                  <td>
                    <template v-if="row.doseCount <= 1">
                      <span style="font-size:11px;color:#9E9EB0">zaten tek doz</span>
                    </template>
                    <input v-else type="number" v-model.number="row.doseIntervalHours" class="input mono" min="0.5" max="24" step="0.5" style="width:80px;font-size:12px;padding:4px 6px"/>
                  </td>
                </tr>
              </tbody>
            </table>
          </template>

          <template v-if="autoSched.step === 'preview'">
            <div style="margin-bottom:8px;font-size:12px;color:#888">Aşağıdaki değişiklikleri onaylıyor musunuz?</div>
            <div style="max-height:50vh;overflow-y:auto">
              <div v-for="item in autoSched.preview" :key="item.medId" style="padding:6px 0;border-bottom:1px solid #E8E6E1">
                <span style="font-weight:600;font-size:13px">{{ item.name }}</span>
                <span style="color:#888;font-size:11px;margin-left:6px">{{ item.dose }}</span>
                <div style="display:flex;gap:16px;margin-top:2px;font-size:12px">
                  <span style="color:#888">Eski: <span class="mono">{{ item.oldTimes }}</span></span>
                  <span style="color:#2E7D32">Yeni: <span class="mono" style="font-weight:600">{{ item.newTimes }}</span></span>
                  <span v-if="item.oldTimes !== item.newTimes" style="color:#B85C00;font-size:11px">değişti</span>
                  <span v-else style="color:#888;font-size:11px">aynı</span>
                </div>
              </div>
            </div>
          </template>

          <template v-if="autoSched.step === 'error'">
            <div style="padding:16px;background:#FEF2F2;border-radius:6px;color:#991B1B;font-size:13px">
              {{ autoSched.error }}
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <template v-if="autoSched.step === 'select'">
            <button class="btn btn-primary" :disabled="autoSched.selectedIds.length === 0" @click="runAutoSchedule">Saatlendir</button>
          </template>
          <template v-if="autoSched.step === 'preview'">
            <button class="btn btn-ghost" @click="autoSched.step = 'select'">Geri</button>
            <button class="btn btn-primary" @click="confirmAutoSchedule">Kaydet</button>
          </template>
          <template v-if="autoSched.step === 'error'">
            <button class="btn btn-primary" @click="autoSched.step = 'select'">Geri Dön</button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Ignored Meds Modal -->
    <Teleport to="body">
      <div v-if="ignoredModal.open" class="modal-overlay"/>
      <div v-if="ignoredModal.open" class="modal modal-sm">
        <div class="modal-header">
          <h3>Yoksayılan Etken Maddeler</h3>
          <button class="btn-close" @click="ignoredModal.open = false">&times;</button>
        </div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto">
          <p style="font-size:12px;color:#888;margin-bottom:12px">Yoksayılan etken maddeler çakışma uyarısı vermez ve otomatik saatlendirmede gösterilmez.</p>
          <div v-if="ignoredActivesList.length === 0" class="empty" style="padding:12px 0">Henüz etken madde yok</div>
          <div v-for="item in ignoredActivesList" :key="item.activeIngredient" style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #F0EEE8">
            <div>
              <span style="font-weight:600;font-size:13px">{{ item.activeIngredient }}</span>
              <span style="color:#888;font-size:11px;margin-left:6px">({{ item.count }} ilaç)</span>
            </div>
            <button
              class="btn btn-sm"
              :class="isIgnored(item.activeIngredient) ? 'btn-danger' : 'btn-secondary'"
              @click="toggleConflictIgnore(item.activeIngredient)"
              style="font-size:11px"
            >
              {{ isIgnored(item.activeIngredient) ? 'Geri Al' : 'Yoksay' }}
            </button>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="ignoredModal.open = false">Kapat</button>
        </div>
      </div>
    </Teleport>

    <!-- Archive Modal -->
    <ArchiveModal
      :open="archiveOpen"
      :archivedPatients="archivedPatients"
      :calcVya="calcVya"
      @close="archiveOpen = false"
      @edit="editArchivedPatient"
      @restore="restorePatient"
      @remove="removePatient($event, 'arsiv')"
    />

    <!-- Settings Modal -->
    <SettingsModal
      v-model:open="settingsOpen"
      :section="settingsSection"
      v-model:printerName="printerName"
      v-model:smallLabelOffsetX="smallLabelOffsetX"
      v-model:smallLabelOffsetY="smallLabelOffsetY"
      v-model:largeLabelOffsetX="largeLabelOffsetX"
      v-model:largeLabelOffsetY="largeLabelOffsetY"
      v-model:apiUrl="apiUrl"
      v-model:apiKey="apiKeyInput"
      :printerList="printerList"
      :apiKeyConfigured="apiKeyConfigured"
      :apiError="apiSettingsError"
      :connectionStatusText="connectionTooltip"
      :shifts="shiftSettingsDraft"
      :shiftError="shiftSettingsError"
      @update:shifts="shiftSettingsDraft = $event; shiftSettingsError = ''"
      @resetShifts="resetShiftSettings"
      @save="saveSettings"
    />

    <Teleport to="body">
      <div v-if="usageTermsOpen" class="modal-overlay" @click.self="usageTermsOpen = false" />
      <section v-if="usageTermsOpen" class="modal usage-terms-modal" role="dialog" aria-modal="true" aria-labelledby="usage-terms-title">
        <div class="modal-header">
          <h3 id="usage-terms-title">Kullanım Koşulları</h3>
          <button class="btn-close" aria-label="Kapat" @click="usageTermsOpen = false">&times;</button>
        </div>
        <div v-if="usageTerms" class="modal-body usage-terms-text" v-html="usageTerms"></div>
        <div v-else class="modal-body usage-terms-text">Kullanım koşulları henüz sunucudan alınamadı.</div>
      </section>
    </Teleport>

    <!-- Report Modal -->
    <ReportModal
      :open="reportOpen"
      :reportTopics="reportTopics"
      :reportModal="reportModal"
      :reportPlaceholder="reportPlaceholder"
      :reportCooldown="reportCooldown"
      :reportError="reportError"
      @close="closeReportModal"
      @send="sendReport"
    />

    <Teleport to="body">
      <div v-if="enjModal.open" class="modal-overlay"/>
      <div v-if="enjModal.open" class="modal">
        <div class="modal-header">
          <h3>Enjektör Etiketi</h3>
          <button class="btn-close" @click="enjModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="field-row">
            <div>
              <label class="field-label">Tarih</label>
              <input type="date" v-model="enjModal.date" class="input"/>
            </div>
            <div>
              <label class="field-label">Saat</label>
              <input type="time" v-model="enjModal.time" class="input"/>
            </div>
          </div>
          <label class="field-label" style="margin-top:12px">Maddeleri seçin</label>
          <div class="enj-items grid-2">
            <label v-for="item in enjItems" :key="item.val" class="enj-item">
              <input type="checkbox" v-model="enjModal.selected" :value="item.val"/>
              <span>{{ item.label }}</span>
            </label>
          </div>
          <div v-if="enjModal.selected.includes('diger')">
            <input v-model="enjModal.digerText" class="input" placeholder="Diğer: belirtiniz" style="margin-top:6px"/>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="printEnjektor">Yazdır</button>
        </div>
      </div>
    </Teleport>

    <!-- Acilis Modal -->
    <Teleport to="body">
      <div v-if="acilisModal.open" class="modal-overlay"/>
      <div v-if="acilisModal.open" class="modal">
        <div class="modal-header">
          <h3>{{ acilisModal.setTarihiMode ? 'Set Tarihi' : 'Açılış Etiketi' }}</h3>
          <button class="btn-close" @click="acilisModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="field-group" v-if="!acilisModal.setTarihiMode">
            <label class="field-label">Açılan Ürün</label>
            <input v-model="acilisModal.urun" class="input"/>
          </div>
          <div class="field-group">
            <div class="field-row">
              <div>
                <label class="field-label">{{ acilisModal.setTarihiMode ? 'Tarih' : 'Açılma Tarihi' }}</label>
                <input type="date" v-model="acilisModal.date" class="input"/>
              </div>
              <div>
                <label class="field-label">{{ acilisModal.setTarihiMode ? 'Saat' : 'Açılma Saati' }}</label>
                <input type="time" v-model="acilisModal.time" class="input"/>
              </div>
            </div>
          </div>
          <div class="field-group" v-if="!acilisModal.setTarihiMode">
            <label class="field-label">Açan Hemşire</label>
            <input v-model="acilisModal.nurse" class="input"/>
          </div>
          <div class="field-group" v-if="!acilisModal.setTarihiMode">
            <label class="field-label">Not</label>
            <input v-model="acilisModal.note" class="input"/>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="printAcilis">Yazdır</button>
        </div>
      </div>
    </Teleport>

    <!-- Yatis Modal -->
    <Teleport to="body">
      <div v-if="yatisModal.open" class="modal-overlay"/>
      <div v-if="yatisModal.open" class="modal">
        <div class="modal-header">
          <h3>Yeni Yatış Etiketi</h3>
          <button class="btn-close" @click="yatisModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <label class="field-label">İçerik</label>
          <div class="enj-items">
            <label v-for="item in yatisItems" :key="item.val" class="enj-item">
              <input type="checkbox" v-model="yatisModal.selected" :value="item.val"/>
              <span>{{ item.label }}</span>
            </label>
          </div>
          <div v-if="yatisModal.selected.includes('diger')">
            <textarea v-model="yatisModal.digerText" class="input ozel-textarea" rows="4" placeholder="Diğer: belirtiniz" style="margin-top:6px"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="printYatis">Yazdır</button>
        </div>
      </div>
    </Teleport>

    <!-- Tedavi Modal -->
    <Teleport to="body">
      <div v-if="tedaviModal.open" class="modal-overlay"/>
      <div v-if="tedaviModal.open" class="modal">
        <div class="modal-header">
          <h3>Tedavi Etiketleri</h3>
          <button class="btn-close" @click="tedaviModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div class="field-label-row">
            <label class="field-label" style="margin:0">Etiketleri basılacak hastaları seçin:</label>
            <button class="btn btn-xs" @click="toggleAllTedavi">{{ tedaviAllSelected ? 'Tümünü Kaldır' : 'Tümünü Seç' }}</button>
          </div>
          <div v-if="activePatients.length === 0" class="empty">Aktif hasta yok</div>
          <div class="enj-items">
            <label v-for="p in activePatients" :key="p.id" class="enj-item">
              <input type="checkbox" v-model="tedaviModal.selectedPatients" :value="p.id"/>
              <span>{{ p.name }}</span>
            </label>
          </div>
          <div class="tedavi-output-options">
            <label class="field-label" for="tedavi-output-order">Çıktı Sırası</label>
            <select id="tedavi-output-order" v-model="tedaviModal.sortBy" class="input">
              <option value="name">İlaç adına göre</option>
              <option value="time">İlaç saatine göre</option>
            </select>
            <div class="tedavi-option-list">
              <label class="tedavi-option-check">
                <input type="checkbox" v-model="tedaviModal.mixPatients"/>
                <span>Hastalar karıştırılabilir</span>
              </label>
              <label class="tedavi-option-check">
                <input type="checkbox" v-model="tedaviModal.groupByRoute"/>
                <span>Uygulama yoluna göre grupla</span>
              </label>
            </div>
            <small v-if="!tedaviModal.mixPatients" class="tedavi-option-help">Her hastanın etiketleri kendi grubu içinde tutulur.</small>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="printTedavi">Yazdır</button>
        </div>
      </div>
    </Teleport>

    <!-- Hemsire Tedavi Semasi Modal -->
    <Teleport to="body">
      <div v-if="semaModal.open" class="modal-overlay"/>
      <div v-if="semaModal.open" class="modal modal-lg">
        <div class="modal-header">
          <h3>{{ activeShiftName }} için tedavi şeması</h3>
          <button class="btn-close" @click="semaModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <label class="field-label">Hastalar</label>
          <div v-if="activePatients.length === 0" class="empty">Aktif hasta yok</div>
          <div class="enj-items">
            <label v-for="p in activePatients" :key="p.id" class="enj-item">
              <input type="checkbox" v-model="semaModal.selectedPatients" :value="p.id"/>
              <span>{{ p.name }}</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="printSema">Yazdır</button>
        </div>
      </div>
    </Teleport>

    <!-- Karteks Modal -->
    <Teleport to="body">
      <div v-if="karteksModal.open" class="modal-overlay"/>
      <div v-if="karteksModal.open" class="modal">
        <div class="modal-header">
          <h3>Karteks</h3>
          <button class="btn-close" @click="karteksModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <label class="field-label">Hastalar</label>
          <div v-if="activePatients.length === 0" class="empty">Aktif hasta yok</div>
          <div class="enj-items">
            <label v-for="p in activePatients" :key="p.id" class="enj-item">
              <input type="checkbox" v-model="karteksModal.selectedPatients" :value="p.id"/>
              <span>{{ p.name }}</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="printKarteksSelected">Yazdır</button>
        </div>
      </div>
    </Teleport>

    <!-- Taburcu Ilac Plani Modal -->
    <Teleport to="body">
      <div v-if="taburcuModal.open" class="modal-overlay"/>
      <div v-if="taburcuModal.open" class="modal modal-lg">
        <div class="modal-header">
          <h3>Taburcu İlaç Planı</h3>
          <button class="btn-close" @click="taburcuModal.open = false">&times;</button>
        </div>
        <div class="modal-body" style="max-height:60vh;overflow-y:auto">
          <label class="field-label" style="margin-bottom:8px">Hasta: {{ selectedPatient?.name }}</label>
          <div v-if="patientMeds.length === 0" class="empty">İlaç bulunamadı</div>
          <template v-else>
            <div v-for="m in patientMeds" :key="m.id" style="padding:8px 0;border-bottom:1px solid #F0EEE8">
              <div style="display:flex;align-items:center;gap:8px">
                <input type="checkbox" :value="m.id" @change="toggleTaburcuMed(m.id)" style="margin:0"/>
                <span style="font-weight:600;font-size:13px;flex:1">{{ m.name }}</span>
                <span style="color:#888;font-size:11px">{{ m.dose }}</span>
                <span class="mono" style="color:#888;font-size:11px">{{ m.times }}</span>
              </div>
              <div v-if="taburcuModal.selectedMeds.includes(m.id)" style="margin-top:8px">
                <div style="font-size:12px;color:#7C5CBF;margin-bottom:4px">
                  {{ getDoseInstruction(m.dose, m.times, m.route) }}
                </div>
                <div v-if="getMuadilList(m.activeIngredient, m.route).length" style="font-size:11px;color:#888;margin-bottom:6px">
                  Muadiller: {{ getMuadilList(m.activeIngredient, m.route).join(', ') }}
                </div>
                <label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:6px;cursor:pointer">
                  <input type="checkbox" :checked="taburcuModal.skipMuadil[m.id]" @change="taburcuModal.skipMuadil = { ...taburcuModal.skipMuadil, [m.id]: !taburcuModal.skipMuadil[m.id] }" style="margin:0"/>
                  Muadil Önerme
                </label>
                <label class="field-label" style="font-size:11px;margin-bottom:2px">Kullanım Notu</label>
                <input v-model="taburcuModal.doseNotes[m.id]" class="input" style="font-size:12px" placeholder="Kullanım talimatına eklenecek not..."/>
                <label class="field-label" style="font-size:11px;margin-bottom:2px;margin-top:6px">Taburcu Notu</label>
                <textarea v-model="taburcuModal.notes[m.id]" class="input" style="font-size:12px" placeholder="İlaçla ilgili hasta/hasta yakınına özel açıklama..." rows="2"></textarea>
              </div>
            </div>
          </template>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" :disabled="taburcuModal.selectedMeds.length === 0" @click="printTaburcu">Yazdır</button>
        </div>
      </div>
    </Teleport>

    <!-- Active Reminder Alert -->
    <ActiveReminderAlert
      :activeReminder="activeReminder"
      :formatReminderDate="formatReminderDate"
      @dismiss="dismissReminder"
    />

    <!-- Reminder Modal -->
    <ReminderModal
      :open="reminderModal.open"
      :reminders="reminders"
      :notes="calendarNotes"
      @close="reminderModal.open = false"
      @remove="removeReminder"
      @save="saveReminder"
      @removeNote="removeCalendarNote"
      @saveNote="saveCalendarNote"
    />

    <!-- Expired Drug Alert -->
    <ExpiredDrugAlert
      :open="expiredDrugAlert.open"
      :message="expiredDrugAlert.message"
      @close="expiredDrugAlert.open = false"
    />

    <!-- Ilaç Stokları -->
    <Teleport to="body">
      <div v-if="stokModal.open" class="modal-overlay"/>
      <div v-if="stokModal.open" class="modal">
        <div class="modal-header">
          <h3 v-if="stokModal.step === 'cabinet'">İlaç Stokları</h3>
          <h3 v-else style="display:flex;align-items:center;gap:6px;flex:1">
            <button class="btn btn-ghost" style="padding:0 6px" @click="stokModal.step='cabinet'; loadCabinets()"><ArrowLeft :size="16"/></button>
            <span style="flex:1;min-width:0">{{ stokModal.selectedCabinet?.name }}</span>
            <button class="btn btn-ghost" style="padding:0 6px" @click="printCabinetList" v-tooltip="'Dolap listesini yazdır'"><Printer :size="16"/></button>
          </h3>
          <button class="btn-close" @click="closeStok">&times;</button>
        </div>

        <!-- Cabinet List -->
        <div v-if="stokModal.step === 'cabinet'" class="modal-body">
          <div v-if="stokModal.cabinets.length" class="scroll-panel" style="max-height:300px">
            <div v-for="c in stokModal.cabinets" :key="c.id" class="cabinet-row">
              <input v-if="stokEditCabinet.id === c.id" v-model="stokEditCabinet.name" class="input mono cabinet-rename-input" style="flex:1;font-size:13px" @keyup.enter="renameCabinet(c.id)" @blur="renameCabinet(c.id)"/>
              <span v-else class="cabinet-name" @click="openCabinetDrugs(c)" @dblclick="startRename(c)">{{ c.name }}</span>
              <button v-if="stokEditCabinet.id !== c.id" class="btn btn-sm" @click="startRename(c)"><Pencil :size="13"/></button>
              <button class="btn btn-sm btn-danger" @click="deleteCabinet(c.id)"><Trash2 :size="13"/></button>
            </div>
          </div>
          <div v-else class="empty">Henüz dolap yok</div>
        </div>

        <!-- Drug List -->
        <div v-if="stokModal.step === 'drugs'" class="modal-body">
          <div v-if="stokModal.drugs.length" class="scroll-panel" style="max-height:250px">
            <div v-for="d in stokModal.drugs" :key="d.id" class="drug-row">
              <template v-if="stokEditDrug.id !== d.id">
                <span class="drug-qty">{{ d.quantity }} {{ d.unit }}</span>
                <span class="drug-dose">{{ d.dose }}</span>
                <span class="drug-name">{{ d.name }}</span>
                <span class="drug-route">{{ d.form }}</span>
                <span class="drug-expiry" :class="expiryClass(d.expiry)" v-tooltip="expiryWarning(d.expiry)">{{ formatExpiry(d.expiry) }}</span>
                <button class="btn btn-sm" @click="stokEditDrug = { ...d }"><Pencil :size="13"/></button>
                <button class="btn btn-sm btn-danger" @click="deleteDrug(d.id)"><Trash2 :size="13"/></button>
              </template>
              <template v-else>
                <div style="display:flex;flex-direction:column;gap:2px;width:100%">
                  <div style="display:flex;gap:4px">
                    <input v-model="stokEditDrug.name" class="input mono drug-form-input" style="font-size:12px" placeholder="ad"/>
                    <select v-model="stokEditDrug.form" class="input mono drug-form-sm" style="font-size:12px;padding:3px 4px;background:#FAF9F6">
                      <option v-for="r in routes" :key="r.val" :value="r.val">{{ r.label }}</option>
                    </select>
                    <input v-model="stokEditDrug.dose" class="input mono drug-form-xs" style="font-size:12px" placeholder="doz"/>
                  </div>
                  <div style="display:flex;gap:4px">
                    <input v-model="stokEditDrug.quantity" class="input mono drug-form-xs" style="font-size:12px" placeholder="adet" type="number"/>
                    <select v-model="stokEditDrug.unit" class="input mono drug-form-sm" style="font-size:12px;padding:3px 4px;background:#FAF9F6">
                      <option v-for="u in drugUnits" :key="u" :value="u">{{ u }}</option>
                    </select>
                    <input v-model="stokEditDrug.expiry" class="input mono drug-form-date" style="font-size:12px" placeholder="AA.YYYY" type="text" v-tooltip="'Son Kullanma Tarihi'"/>
                    <button class="btn btn-sm btn-primary" @click="saveDrugEdit">Kaydet</button>
                    <button class="btn btn-sm" @click="stokEditDrug = { id: null }">İptal</button>
                  </div>
            </div>
          </template>

        </div>
          </div>
          <div v-else class="empty">Bu dolapta ilaç yok</div>
        </div>

        <div class="modal-footer">
          <template v-if="stokModal.step === 'cabinet'">
            <div style="display:flex;gap:6px;flex:1">
              <input v-model="stokNewCabinet" class="input mono" placeholder="Yeni dolap adı" style="flex:1" @keyup.enter="addCabinet"/>
              <button class="btn btn-primary" @click="addCabinet">Ekle</button>
            </div>
          </template>
          <template v-else>
              <div style="display:flex;flex-direction:column;gap:4px;flex:1">
              <div style="display:flex;gap:4px;position:relative">
                <input v-model="stokDrugSearch.query" class="input mono drug-form-input" placeholder="İlaç ara..." style="font-size:12px" @input="onStokDrugSearch" @focus="stokDrugSearch.open = true" @blur="blurStokDrugSearch"/>
                <div v-if="stokDrugSearch.open && stokDrugSearch.results.length" class="stok-drug-dropdown">
                  <button v-for="d in stokDrugSearch.results" :key="d.label + '_' + d.active_ingredient + '_' + d.form" class="stok-drug-item" @mousedown.prevent="selectStokDrug(d)"><span class="dd-label">{{ d.full_name || d.label }}</span><span class="dd-meta">{{ d.active_ingredient }} · {{ d.form }}</span></button>
                </div>
                <select v-model="stokNewDrug.form" class="input mono drug-form-sm" style="font-size:12px;padding:4px 6px;background:#FAF9F6">
                  <option v-for="r in routes" :key="r.val" :value="r.val">{{ r.label }}</option>
                </select>
                <input v-model="stokNewDrug.dose" class="input mono drug-form-xs" placeholder="doz" style="font-size:12px"/>
              </div>
              <div style="display:flex;gap:4px">
                <input v-model="stokNewDrug.quantity" class="input mono drug-form-xs" placeholder="adet" type="number" style="font-size:12px"/>
                <select v-model="stokNewDrug.unit" class="input mono drug-form-sm" style="font-size:12px;padding:4px 6px;background:#FAF9F6">
                  <option v-for="u in drugUnits" :key="u" :value="u">{{ u }}</option>
                </select>
                <input v-model="stokNewDrug.expiry" class="input mono drug-form-date" placeholder="AA.YYYY" type="text" style="font-size:12px" v-tooltip="'Son Kullanma Tarihi'"/>
                <button class="btn btn-primary" @click="addDrug">Ekle</button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- Ozel Etiket Modal -->
    <OzelEtiketModal
      :open="ozelModal.open"
      :text="ozelModal.text"
      @close="ozelModal.open = false"
      @print="printOzel"
      @update:text="ozelModal.text = $event"
    />

    <!-- Order Import Warning -->
    <Teleport to="body">
      <div v-if="orderImportWarning.open" class="modal-overlay order-import-warning-overlay"/>
      <div v-if="orderImportWarning.open" class="modal modal-sm order-import-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="order-import-warning-title">
        <div class="modal-header">
          <div class="warning-modal-title">
            <AlertTriangle :size="18" />
            <h3 id="order-import-warning-title">Panodan İlaç Alınamadı</h3>
          </div>
          <button class="btn-close" aria-label="Kapat" @click="orderImportWarning.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="warning-modal-message">Panoda uygun ilaç yok. Doğru kopyalama yaptığınızdan emin misiniz?</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="orderImportWarning.open = false">Tamam</button>
        </div>
      </div>
    </Teleport>

    <!-- Order Import Modal -->
    <Teleport to="body">
      <div v-if="orderImport.open" class="modal-overlay"/>
      <div v-if="orderImport.open" class="modal">
        <div class="modal-header">
          <h3 orderImport>Panodan İlaçları Al</h3>
          <button class="btn-close" @click="orderImport.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <div v-if="orderImport.loading" class="empty">Çözümleniyor...</div>
          <div v-else-if="orderImport.error" class="empty">{{ orderImport.error }}</div>
          <div v-else-if="orderImport.completed" class="order-import-result">
            <p v-if="orderImport.importedCount > 0" class="order-import-success">
              {{ orderImport.importedCount }} ilaç başarıyla aktarıldı.
            </p>
            <p v-else class="empty">Seçilen ilaçlardan hiçbiri aktarılamadı.</p>
            <div v-if="orderImport.skipped.length" class="order-import-skipped">
              <h4>Aktarılamayan İlaçlar</h4>
              <ul>
                <li v-for="(name, index) in orderImport.skipped" :key="`${index}-${name}`">{{ name }}</li>
              </ul>
            </div>
          </div>
          <div v-else>
            <p style="font-size:13px;color:#666;margin-bottom:12px">Aşağıdaki ilaçlar bulundu. İçe aktarmak istediklerinizi seçin.</p>
            <table class="med-table">
              <thead>
                <tr>
                  <th style="width:32px"></th>
                  <th style="width:28%">İlaç</th><th style="width:12%">Doz</th><th style="width:8%">Yol</th><th>Saatler</th><th>Not</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(o, i) in orderImport.orders" :key="i">
                  <td><input type="checkbox" :checked="orderImport.selected.includes(i)" @change="toggleOrderSel(i)"/></td>
                  <td>{{ o.name }}</td>
                  <td>{{ o.dose }}</td>
                  <td>{{ o.route }}</td>
                  <td>{{ o.times }}</td>
                  <td>{{ o.note }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer" v-if="!orderImport.loading && !orderImport.error">
          <button v-if="orderImport.completed" class="btn btn-primary" @click="orderImport.open = false">Kapat</button>
          <button v-if="!orderImport.completed" class="btn btn-primary" @click="confirmOrderImport" :disabled="orderImport.selected.length === 0">
            Seçilenleri Aktar ({{ orderImport.selected.length }})
          </button>
        </div>
      </div>
    </Teleport>

    <!-- Prospektus Search Loading -->
    <Teleport to="body">
      <div v-if="prospectusLoading" class="modal-overlay prospectus-loading-overlay"/>
      <div v-if="prospectusLoading" class="modal modal-sm prospectus-loading-modal">
        <div class="modal-header">
          <h3>En güncel prospektüs aranıyor</h3>
        </div>
        <div class="modal-body prospectus-loading-body">
          <div class="prospectus-spinner"></div>
          <p>KÜB belgesi aranıyor. Bulunamazsa KT kontrol edilecek...</p>
          <small>Bu işlem internet bağlantısına göre birkaç saniye sürebilir.</small>
        </div>
      </div>
    </Teleport>

    <!-- Prospectus Product Choice -->
    <Teleport to="body">
      <div v-if="prospectusChoice.open" class="modal-overlay prospectus-choice-overlay"/>
      <div v-if="prospectusChoice.open" class="modal prospectus-choice-modal">
        <div class="modal-header">
          <h3>Prospektüs Seçimi</h3>
          <button class="btn-close" @click="closeProspectusChoice">&times;</button>
        </div>
        <div class="modal-body">
          <p class="prospectus-choice-intro">Aynı isim ve uygulama formunda birden fazla ürün bulundu. Hangisinin prospektüsünü açmak istiyorsunuz?</p>
          <div class="prospectus-choice-list scroll-panel">
            <label v-for="option in prospectusChoice.options" :key="option" class="prospectus-choice-row" :class="{ selected: prospectusChoice.selected === option }">
              <input v-model="prospectusChoice.selected" type="radio" :value="option">
              <span>{{ option }}</span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" :disabled="!prospectusChoice.selected" @click="confirmProspectusChoice">Prospektüsü Aç</button>
        </div>
      </div>
    </Teleport>

    <!-- Prospectus Warning -->
    <Teleport to="body">
      <div v-if="prospectusWarning.open" class="modal-overlay prospectus-warning-overlay"/>
      <div v-if="prospectusWarning.open" class="modal modal-sm prospectus-warning-modal">
        <div class="modal-header">
          <h3>Prospektüs Bulunamadı</h3>
          <button class="btn-close" @click="prospectusWarning.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <p class="prospectus-warning-message">{{ prospectusWarning.message }}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-primary" @click="prospectusWarning.open = false">Tamam</button>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Modal -->
    <ConfirmModal
      :confirm="confirm"
      @cancel="confirm.open = false"
      @confirm="confirm.onConfirm && confirm.onConfirm()"
    />

    <UpdateDecisionModal
      :open="updateDecision.open"
      :version="updateDecision.version"
      @later="respondRuntimeUpdate(false)"
      @install="respondRuntimeUpdate(true)"
    />

    <!-- Reset Confirm Modal -->
    <Teleport to="body">
      <div v-if="resetModal.open" class="modal-overlay"/>
      <div v-if="resetModal.open" class="modal modal-sm">
        <div class="modal-header">
          <h3>Tedavileri Sıfırla</h3>
          <button class="btn-close" @click="resetModal.open = false">&times;</button>
        </div>
        <div class="modal-body">
          <p style="font-size:14px;line-height:1.6">"<b>{{ resetModal.patientName }}</b>" hastasının <b>tüm ilaçları</b> tablodan silinecek.</p>
          <p style="font-size:13px;color:#666;margin-top:8px">Devam etmek için aşağıdaki kodu girin:</p>
          <div class="reset-code">{{ resetModal.code }}</div>
          <input v-model="resetModal.input" class="reset-input" placeholder="Kodu buraya yazın..." maxlength="6" autocomplete="off" @keyup.enter="confirmReset">
        </div>
        <div class="modal-footer">
          <button class="btn btn-danger" :disabled="resetModal.input !== resetModal.code" @click="confirmReset">Onaylıyorum</button>
        </div>
      </div>
    </Teleport>

    <DosageManagerModal :open="dosageManagerOpen" :rules="dosageRules" :active-ingredients="drugCatalogList" :routes="routes" @close="dosageManagerOpen = false" @changed="dosageRules = $event" @delete-request="confirmDosageDelete" />
    <Teleport to="body">
      <div v-if="catalogConnectionWarning.open" class="modal-overlay catalog-connection-warning-overlay" @click="closeCatalogConnectionWarning" />
      <section v-if="catalogConnectionWarning.open" class="modal modal-sm catalog-connection-warning-modal" role="alertdialog" aria-modal="true" aria-labelledby="catalog-connection-warning-title">
        <header class="modal-header">
          <div class="warning-modal-title">
            <AlertTriangle :size="18" />
            <h3 id="catalog-connection-warning-title">İlaç Kataloğu Açılamadı</h3>
          </div>
          <button class="btn-close" aria-label="Uyarıyı kapat" @click="closeCatalogConnectionWarning">&times;</button>
        </header>
        <div class="modal-body">
          <p class="warning-modal-message">{{ catalogConnectionWarning.message }}</p>
        </div>
        <footer class="modal-footer">
          <button class="btn btn-primary" type="button" @click="closeCatalogConnectionWarning">Tamam</button>
        </footer>
      </section>
    </Teleport>
    <DrugCatalogModal
      :open="catalogModalOpen"
      :initial-query="catalogInitialQuery"
      @close="catalogModalOpen = false; catalogInitialQuery = ''"
      @reportDrug="openCatalogDrugReport"
      @catalog-context-menu="openCatalogContextMenu"
    />

  </div>
</template>

    <script>
import { RefreshCw, Minus, Maximize2, Minimize2, X, Plus, Printer, Archive, ClipboardPaste, UserRoundArrowLeft, FilePen, Bell as BellIcon, PackageSearch, ChevronRight, ArrowLeft, Pencil, Trash2, Timer, Settings as SettingsIcon, AlertCircle, AlertTriangle, CalendarOff, CalendarDays, Clock, AlertOctagon, Thermometer, Biohazard, Sun, ShieldAlert, FileText, Layers, HeartPlus, MoveUp, Syringe, GitBranch, Gauge, Filter, Pill, TrendingDown, ShieldX, BookAlert, TimerReset, Handshake, BookOpenText, IdCard } from '@lucide/vue'
import SettingsModal from './components/modals/SettingsModal.vue'
import PrintProgressModal from './components/modals/PrintProgressModal.vue'
import ReportModal from './components/modals/ReportModal.vue'
import ArchiveModal from './components/modals/ArchiveModal.vue'
import ConfirmModal from './components/modals/ConfirmModal.vue'
import UpdateDecisionModal from './components/modals/UpdateDecisionModal.vue'
import PatientModal from './components/modals/PatientModal.vue'
import PatientClipboardSelectModal from './components/modals/PatientClipboardSelectModal.vue'
import ActiveReminderAlert from './components/modals/ActiveReminderAlert.vue'
import ReminderModal from './components/modals/ReminderModal.vue'
import ExpiredDrugAlert from './components/modals/ExpiredDrugAlert.vue'
import OzelEtiketModal from './components/modals/OzelEtiketModal.vue'
import DosageManagerModal from './components/modals/DosageManagerModal.vue'
import DrugCatalogModal from './components/modals/DrugCatalogModal.vue'
import stockManagement from './mixins/stockManagement.js'
import {
  findConflictingIvMedTimes,
  findDuplicateActiveIngredientMedIds,
  findExpiredMedIds,
  findNonMatchingMedIds
} from './domain/medicationAnalysis.js'
import { buildDosageRuleIndex, findDosageRuleCandidates } from './domain/dosageRuleIndex.js'
import { calculateAcceptedDoseRange, doseAmountsForPeriod } from './domain/dosageBounds.js'
import { importSelectedOrders } from './domain/orderImport.js'
import { applyImportedPatient, importedPatientLabel } from './domain/patientImport.js'
import { cloneDefaultShifts, filterTimesByShift, normalizeShifts, shiftForTime, shiftHourColumns, validateShifts } from './domain/shiftSelection.js'
import { sortTreatmentLabelJobs } from './domain/treatmentLabelOrder.js'
import { buildTreatmentSheet } from './domain/treatmentSheet.js'
import { buildSmallTreatmentLabelName, buildTreatmentLabelDetailField } from './domain/treatmentLabelDetail.js'
import { useReports } from './composables/useReports.js'
import { createAppState } from './composables/appState.js'
import { useDrugCatalog } from './composables/useDrugCatalog.js'
import { useMayiInf } from './composables/useMayiInf.js'
import { buildLabelHome, buildMultilineZplFields, normalizeLabelOffset } from './domain/zplLayout.js'
import '../shared/doseUnits.js'

const { DOSE_UNITS, convertDoseValue, doseToMilligrams, formatDose, normalizeMedicationDose, parseDose, parseDoseAmount } = globalThis.__TEDAVI_DOSE_UNITS__
const drugPropsCache = new Map()
let drugPropsLoadToken = 0

function drugPropsCacheKey(med) {
  return [med?.name, med?.catalogBarcode, med?.route, med?.activeIngredient]
    .map(value => String(value || '').trim().toLocaleLowerCase('tr-TR'))
    .join('|')
}

function persistDrugPropsCache() {
  if (!window.electronAPI?.configSet) return
  window.electronAPI.configSet('drugPropsCache', Object.fromEntries(drugPropsCache)).catch(() => {})
}

function apiAddressForDisplay(value) {
  return String(value || '').trim().replace(/^https?:\/\//i, '')
}

export default {
  mixins: [stockManagement],
  components: { PrintProgressModal, RefreshCw, Minus, Maximize2, Minimize2, X, Plus, Printer, Archive, ClipboardPaste, UserRoundArrowLeft, FilePen, Bell: BellIcon, PackageSearch, ChevronRight, ArrowLeft, Pencil, Trash2, Timer, Settings: SettingsIcon, AlertCircle, AlertTriangle, CalendarOff, CalendarDays, Clock, AlertOctagon, Thermometer, Biohazard, Sun, ShieldAlert, FileText, Layers, HeartPlus, MoveUp, Syringe, GitBranch, Gauge, Filter, Pill, TrendingDown, ShieldX, BookAlert, TimerReset, Handshake, BookOpenText, IdCard, SettingsModal, ReportModal, ArchiveModal, ConfirmModal, UpdateDecisionModal, PatientModal, PatientClipboardSelectModal, ActiveReminderAlert, ReminderModal, ExpiredDrugAlert, OzelEtiketModal, DosageManagerModal, DrugCatalogModal },
  watch: {
    meds: {
      handler() { if (this.selectedPatientId) this.loadDrugProps(this.selectedPatientId) },
      deep: false
    },
    'medModal.condition'(val) {
      if (val === 'weekdays' && !this.medModal.conditionData.days) {
        this.medModal.conditionData = { days: [] }
      } else if (val === 'dateRange' && !this.medModal.conditionData.start) {
        this.medModal.conditionData = { start: '', end: '' }
      } else if (val === 'everyX') {
        if (!this.medModal.conditionData.x) this.medModal.conditionData.x = 2
      } else if (val === 'xGiveYWait') {
        if (!this.medModal.conditionData.give) this.medModal.conditionData = { give: 3, wait: 2 }
      }
    }
  },
  setup() {
    const state = createAppState()
    const sanitize = (s) => {
      const str = String(s ?? '')
      const map = { 'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U' }
      return str.replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => map[ch])
    }
    const normDrugName = (s) => {
      return s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    }
    const loadDrugProps = async (patientId) => {
      state.drugProps.value = {}
      if (!window.electronAPI || !patientId) return
      const loadToken = ++drugPropsLoadToken
      const pMeds = state.meds.value.filter(m => m.patientId === patientId)
      if (!pMeds.some(med => !drugPropsCache.has(drugPropsCacheKey(med)))) {
        pMeds.forEach(med => {
          const result = drugPropsCache.get(drugPropsCacheKey(med))
          if (result?.props || result?.similarDrugNames?.length) state.drugProps.value[med.id] = { ...(result.props || {}), similarDrugNames: result.similarDrugNames || [] }
        })
        return
      }
      state.drugPropsLoading.value = true
      try {
        const results = await Promise.all(pMeds.map(async med => {
          const key = drugPropsCacheKey(med)
          if (drugPropsCache.has(key)) return { med, result: drugPropsCache.get(key) }
          const [props, similarDrugNames] = await Promise.all([
            window.electronAPI.dbGetDrugPropertiesForMedication({ name: med.name || '', route: med.route || '', activeIngredient: med.activeIngredient || '', catalogBarcode: med.catalogBarcode || '' }),
            window.electronAPI.dbGetSimilarDrugNames({ name: med.name || '', catalogBarcode: med.catalogBarcode || '' })
          ])
          const result = { props, similarDrugNames }
          drugPropsCache.set(key, result)
          persistDrugPropsCache()
          return { med, result }
        }))
        if (loadToken !== drugPropsLoadToken) return
        results.forEach(({ med, result }) => {
          if (result.props || result.similarDrugNames.length) state.drugProps.value[med.id] = { ...(result.props || {}), similarDrugNames: result.similarDrugNames }
        })
      } finally {
        if (loadToken === drugPropsLoadToken) state.drugPropsLoading.value = false
      }
    }

    const catalog = useDrugCatalog({
      apiUrl: state.apiUrl,
      serverOnline: state.serverOnline,
      catalogLastUpdatedAt: state.catalogLastUpdatedAt,
      selectedPatientId: state.selectedPatientId,
      loadDrugProps,
      clearDrugPropsCache: () => { drugPropsCache.clear(); persistDrugPropsCache() },
      drugFullNameMap: state.drugFullNameMap
    })

    const mayiInf = useMayiInf({
      getSelectedPatientId: () => state.selectedPatientId.value,
      getLabelSize: () => state.labelSize.value,
      getSmallLabelOffsetX: () => state.smallLabelOffsetX.value,
      getSmallLabelOffsetY: () => state.smallLabelOffsetY.value,
      getLargeLabelOffsetX: () => state.largeLabelOffsetX.value,
      getLargeLabelOffsetY: () => state.largeLabelOffsetY.value,
      confirm: state.confirm,
      sanitize,
      normDrugName,
      getInfSearchEl: () => this.$refs?.infDrugSearchInput?.[0]
    })

    return { ...useReports(), ...state, ...catalog, ...mayiInf, loadDrugProps, sanitize, normDrugName }
  },
  data() {
    return {
      catalogModalOpen: false,
      catalogConnectionChecking: false,
      catalogConnectionWarning: { open: false, message: '' },
      catalogInitialQuery: '',
      serverMessage: { open: false, title: '', body: '' },
      timePresets: [[6,12,18,24],[6,14,22],[10,18,24],[10,22],[12,24]],
      ctx: { show: false, x: 0, y: 0, items: [] },
      patientModal: { open: false, edit: false, id: null, name: '', height: '', weight: '', patientNo: '', gender: 'Erkek', birthDate: '' },
      patientDuplicate: false,
      patientClipboard: { loading: false, error: '', patients: [] },
      routes: [
        { val: 'IV', label: 'İntravenöz (IV)' },
        { val: 'IM', label: 'İntramüsküler (IM)' },
        { val: 'PO', label: 'Per Oral (PO)' },
        { val: 'SC', label: 'Subkütan (SC)' },
        { val: 'PR', label: 'Per Rektum (PR)' },
        { val: 'SL', label: 'Sublingual (SL)' },
        { val: 'INH', label: 'İnhalasyon (INH)' },
        { val: 'TOP', label: 'Topikal (TOP)' },
        { val: 'DGR', label: 'Diğer (DGR)' }
      ],
      drugUnits: ['Adet', 'Kutu', 'Tablet', 'Flakon', 'Ampul', 'Tüp', 'Şişe', 'Paket', 'ml', 'gr'],

      conditions: [
        { val: 'standard', label: 'Standart Uygulama' },
        { val: 'weekdays', label: 'Haftanın Belli Günleri' },
        { val: 'dateRange', label: 'Belirli Tarih Aralığında' },
        { val: 'everyX', label: 'X Günde Bir' },
        { val: 'xGiveYWait', label: 'X Gün Verilir Y Gün Beklenir' }
      ],
      dayNames: ['Pzt','Sal','Çar','Per','Cum','Cmt','Paz'],
      shiftSettingsDraft: cloneDefaultShifts(),
      shiftSettingsError: '',
      printOpen: false,
      labelButtons: [
        { key: 'tedavi', label: 'Tedavi Etiketleri', success: true },
        { key: 'enjektor', label: 'Enjektör Etiketi' },
        { key: 'acilis', label: 'Açılış Etiketi' },
        { key: 'setTarih', label: 'Set Tarihi Etiketi' },
        { key: 'yatis', label: 'Yeni Yatış Etiketleri' },
        { key: 'agizBakim', label: 'Ağız Bakım Suyu Etiketi' },
        { key: 'ozel', label: 'Özel Etiket' },
        { key: '---', label: '---' },
        { key: 'karteks', label: 'Karteks' },
        { key: 'sema', label: 'Tedavi Şeması' },
        { key: 'taburcu', label: 'Taburcu İlaç Planı' }
      ],
      visiblePrintMenus: null,
      restrictedPrintMenus: null,
      clinicalName: '',
      doseUnits: DOSE_UNITS,
      medModal: { open: false, edit: false, id: null, name: '', activeIngredient: '', catalogBarcode: '', catalogLabelDetail: '', catalogLabelDetailCustomized: false, catalogLabelDetailEnabled: false, route: 'IV', doseValue: '', doseUnit: 'mg', times: '', timesList: [], condition: 'standard', conditionData: {}, note: '', startDate: '', timeDoses: {}, customLabel: '', customLabelEnabled: false, luezym: false, errors: {} },
      mayiUnits: ['ML', 'Adet', 'Flakon', 'Ampul'],
      mayiFluids: [
        '1/2', '1/3', '1/4', 'SF', '%5 Dex',
        'OLİCLİNOMEL N4', 'OLİCLİNOMEL N7', 'OLİCLİNOMEL N8',
        'KABİVEN', 'KABİVEN PERİFERAL',
        'SMOFKABİVEN', 'SMOFKABİVEN PERİFERAL'
      ],
      infFluids: ['SF', '%5 Dex', '%10 Dex', 'Ringer Laktat', 'Plasmalyte'],

      archiveOpen: false,
      enjItems: [
        { val: 'hipertonik', label: '%3 Hipertonik' },
        { val: 'sodyumBikarbonat', label: 'Sodyum Bikarbonat' },
        { val: 'potasyumKlorur', label: 'Potasyum Klorür' },
        { val: 'magnezyumSulfat', label: 'Magnezyum Sülfat' },
        { val: 'potasyumFosfat', label: 'Potasyum Fosfat' },
        { val: 'mayiBosaltma', label: 'Mayi Boşaltma' },
        { val: 'parolBosaltma', label: 'Parol Boşaltma' },
        { val: 'ilacBosaltma', label: 'İlaç Boşaltma' },
        { val: 'diger', label: 'Diğer' }
      ],
      enjModal: { open: false, date: '', time: '', selected: [], digerText: '' },
      acilisModal: { open: false, setTarihiMode: false, date: '', time: '', urun: '', nurse: '', note: '' },
      yatisItems: [
        { val: 'gozlem', label: 'Gözlem Formları' },
        { val: 'order', label: 'Orderlar' },
        { val: 'kan', label: 'Kan Formları' },
        { val: 'yatisBelge', label: 'Yatış Belgeleri' },
        { val: 'diger', label: 'Diğer' }
      ],
      yatisModal: { open: false, selected: [], digerText: '' },
      tedaviModal: { open: false, selectedPatients: [], sortBy: 'name', mixPatients: false, groupByRoute: false },
      semaModal: { open: false, selectedPatients: [], text: '' },
      karteksModal: { open: false, selectedPatients: [] },
      ignoredModal: { open: false },
      reminders: [],
      calendarNotes: [],
      reminderModal: { open: false },
      expiredDrugAlert: { open: false, message: '' },
      activeReminder: null,
      updateDecision: { open: false, version: '' },
      resetModal: { open: false, code: '', input: '', patientId: null, patientName: '' },
      orderImport: { open: false, loading: false, error: '', orders: [], selected: [], skipped: [], completed: false, importedCount: 0 },
      orderImportWarning: { open: false },
      autoSched: { open: false, step: 'select', selectedIds: [], rows: [], preview: [], error: '' },
      dosageManagerOpen: false,
      prospectusLoading: false,
      prospectusWarning: { open: false, message: '' },
      prospectusChoice: { open: false, med: null, options: [], selected: '' },
      settingsOpen: false,
      settingsMenuOpen: false,
      settingsSection: 'printer',
      printerName: '',
      printerList: [],
      apiKeyInput: '',
      apiKeyConfigured: false,
      apiSettingsError: '',
      usageTerms: '',
      usageTermsOpen: false,
      isMaximized: false,
      drugDropdown: { open: false, query: '', results: [], focusIdx: -1, refs: {} },
      _drugSearchTimer: null,
      ozelModal: { open: false, text: '' },
      stokModal: { open: false, step: 'cabinet', cabinets: [], drugs: [], selectedCabinet: null },
      stokNewCabinet: '',
      stokEditCabinet: { id: null, name: '' },
      stokNewDrug: { name: '', form: 'IV', dose: '', quantity: '', unit: 'Adet', expiry: '' },
      stokEditDrug: { id: null, name: '', form: 'IV', dose: '', quantity: '', unit: 'Adet', expiry: '' },
      stokDrugSearch: { query: '', results: [], open: false },
      taburcuModal: { open: false, selectedMeds: [], notes: {}, doseNotes: {}, skipMuadil: {} },
    }
  },
  computed: {
    activeShiftName() {
      return this.shifts.find(shift => shift.id === this.shift)?.name || ''
    },
    visibleLabelButtons() {
      const restricted = Array.isArray(this.restrictedPrintMenus)
        ? this.restrictedPrintMenus
        : ['enjektor', 'yatis', 'agizBakim']
      const visible = Array.isArray(this.visiblePrintMenus) ? this.visiblePrintMenus : []
      return this.labelButtons.filter(item => item.key === '---' || !restricted.includes(item.key) || visible.includes(item.key))
    },
    visibleLabelGroups() {
      const items = this.visibleLabelButtons.filter(item => item.key !== '---')
      const special = new Set(['enjektor', 'yatis', 'agizBakim'])
      return [
        items.filter(item => !special.has(item.key) && ['tedavi', 'acilis', 'setTarih', 'ozel'].includes(item.key)),
        items.filter(item => special.has(item.key)),
        items.filter(item => ['karteks', 'sema', 'taburcu'].includes(item.key))
      ].filter(group => group.length)
    },
    formattedCatalogLastUpdated() {
      if (!this.catalogLastUpdatedAt) return 'Henüz güncellenmedi'
      const date = new Date(this.catalogLastUpdatedAt)
      if (Number.isNaN(date.getTime())) return 'Bilinmiyor'
      return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
    },
    connectionTooltip() {
      return this.serverOnline
        ? 'Güncelleme sunucusuna bağlı'
        : `Son katalog güncellemesi: ${this.formattedCatalogLastUpdated}`
    },
    formattedStatusbarDateTime() {
      return new Intl.DateTimeFormat('tr-TR', {
        day: 'numeric', month: 'long', year: 'numeric', weekday: 'long'
      }).format(new Date(this.statusbarNow))
    },
    patientMeds() {
      return this.meds.filter(m => m.patientId === this.selectedPatientId).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    },
    dosageRulesByIngredient() {
      return buildDosageRuleIndex(this.dosageRules)
    },
    conflictingIVMedTimes() {
      return findConflictingIvMedTimes(this.patientMeds, this.conflictIgnoreActives)
    },
    expiredMeds() {
      return findExpiredMedIds(this.patientMeds)
    },
    nonMatchingMeds() {
      return findNonMatchingMedIds(this.patientMeds, (med, date) => this.matchesCondition(med, date))
    },
    duplicateAIMeds() {
      return findDuplicateActiveIngredientMedIds(this.patientMeds)
    },
    dosageWarnings() {
      const warnings = {}
      const p = this.selectedPatient
      if (!p || !this.dosageRules.length) return warnings

      const pWeight = parseFloat(p.weight) || 0
      const pHeight = parseFloat(p.height) || 0
      const pBsa = pWeight && pHeight ? Math.sqrt(pWeight * pHeight / 3600) : 0
      let pAgeYears = null
      if (p.birthDate) {
        const now = new Date()
        const bd = new Date(p.birthDate)
        if (!isNaN(bd)) {
          pAgeYears = now.getFullYear() - bd.getFullYear()
          const m = now.getMonth() - bd.getMonth()
          if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) pAgeYears--
        }
      }

      for (const med of this.patientMeds) {
        const ai = (med.activeIngredient || '').toLowerCase().trim()
        if (!ai) continue

        const candidates = findDosageRuleCandidates(this.dosageRulesByIngredient, ai, med.route)
        if (!candidates.length) continue

        let rule = null
        if (pAgeYears != null) {
          rule = candidates.find(c =>
            (c.age_min == null || pAgeYears >= Number(c.age_min)) &&
            (c.age_max == null || pAgeYears <= Number(c.age_max)) &&
            (c.age_min != null || c.age_max != null)
          )
        }
        if (!rule) rule = candidates.find(c => c.age_min == null && c.age_max == null)
        if (!rule) continue

        const factor = rule.dose_unit === 'kg' ? pWeight : pBsa
        if (!factor || factor <= 0) continue

        const rawMin = Number(rule.dose_min) || 0
        const rawMax = Number(rule.dose_max) || 0
        if (rawMin < 0 || rawMax < rawMin) continue

        const expectedMin = rawMin * factor
        const expectedMax = rawMax * factor
        const doseCap = rule.max_dose != null && rule.max_dose > 0 ? rule.max_dose : null

        let comparisonMin = expectedMin
        let comparisonMax = expectedMax

        if (doseCap !== null) {
          if (comparisonMax > doseCap) comparisonMax = doseCap
          if (comparisonMin > doseCap) comparisonMin = doseCap
        }

        const dosesMg = this.extractMedDosesMg(med)
        if (!dosesMg.length) continue
        const comparisonDoses = doseAmountsForPeriod(dosesMg, rule.dose_period)

        const acceptedRange = calculateAcceptedDoseRange(comparisonMin, comparisonMax, rule.tolerance_percent, doseCap)
        const acceptedMin = acceptedRange.min
        const acceptedMax = acceptedRange.max
        const isFixedDose = rawMin === rawMax
        for (const actual of comparisonDoses) {
          if (isFixedDose && (actual < acceptedMin || actual > acceptedMax)) {
            warnings[med.id] = `Beklenen doz: ${this.formatDosageRule(rule)}`
            break
          }
          if (!isFixedDose && actual < acceptedMin) {
            warnings[med.id] = `Eksik doz: En az ${this.fmtDoseMg(acceptedMin)}`
            break
          }
          if (!isFixedDose && actual > acceptedMax) {
            warnings[med.id] = `Doz aşımı: En fazla ${this.fmtDoseMg(acceptedMax)}`
            break
          }
        }
      }
      return warnings
    },
    tedaviAllSelected() {
      return this.activePatients.length > 0 && this.tedaviModal.selectedPatients.length === this.activePatients.length
    },
    addableMeds() {
      const ignoreSet = new Set(this.conflictIgnoreActives.map(a => a.toLowerCase().trim()))
      const unique = new Map()
      this.meds.forEach(m => {
        const key = (m.activeIngredient || '').toLowerCase().trim()
        if (key && !ignoreSet.has(key)) {
          if (!unique.has(key)) {
            unique.set(key, { activeIngredient: m.activeIngredient, count: 0 })
          }
          unique.get(key).count++
        }
      })
      return Array.from(unique.values()).sort((a, b) => a.activeIngredient.localeCompare(b.activeIngredient, 'tr'))
    },
    ivMeds() {
      const ignoreSet = new Set(this.conflictIgnoreActives.map(a => a.toLowerCase().trim()))
      return this.patientMeds.filter(m => m.route === 'IV' && !ignoreSet.has((m.activeIngredient || '').toLowerCase().trim()))
    },
    ignoredActivesList() {
      const unique = new Map()
      this.meds.forEach(m => {
        const key = (m.activeIngredient || '').trim()
        if (key && m.route === 'IV') {
          if (!unique.has(key)) unique.set(key, { activeIngredient: key, count: 0 })
          unique.get(key).count++
        }
      })
      return Array.from(unique.values()).sort((a, b) => a.activeIngredient.localeCompare(b.activeIngredient, 'tr'))
    },

  },
  async mounted() {
    document.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('blur', this.closeFloatingMenus)
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.closeFloatingMenus() })
    this._statusbarClockTimer = setInterval(() => { this.statusbarNow = Date.now() }, 60 * 1000)
    this.initReport()
    if (window.electronAPI) window.electronAPI.onMaximizedChange(v => this.isMaximized = v)
    if (window.electronAPI?.onRuntimeUpdateDecisionRequired) {
      this._runtimeUpdateListener = window.electronAPI.onRuntimeUpdateDecisionRequired(info => this.handleRuntimeUpdateDecision(info))
    }
    if (window.electronAPI?.onServerConnectionChanged) {
      this._serverConnectionListener = window.electronAPI.onServerConnectionChanged(online => {
        this.serverOnline = online
        if (online) this.loadClientMenuVisibility(true)
      })
    }
    if (window.electronAPI?.onClientMenuVisibilityUpdated) {
      this._clientMenuVisibilityListener = window.electronAPI.onClientMenuVisibilityUpdated(menus => {
        this.visiblePrintMenus = Array.isArray(menus?.visiblePrintMenus) ? menus.visiblePrintMenus : null
        this.restrictedPrintMenus = Array.isArray(menus?.restrictedPrintMenus) ? menus.restrictedPrintMenus : null
        this.clinicalName = typeof menus?.clinicalName === 'string' ? menus.clinicalName : ''
        this.usageTerms = typeof menus?.usageTerms === 'string' ? menus.usageTerms : ''
      })
    }
    if (window.electronAPI?.onClientMessage) {
      this._clientMessageListener = window.electronAPI.onClientMessage(message => {
        if (message?.title && message?.body) this.serverMessage = { open: true, title: message.title, body: message.body }
      })
    }
    if (window.electronAPI?.onReminderDue) {
      this._reminderDueListener = window.electronAPI.onReminderDue(reminder => this.activateReminder(reminder))
    }
    if (window.electronAPI?.onRemindersChanged) {
      this._remindersChangedListener = window.electronAPI.onRemindersChanged(reminders => { this.reminders = reminders })
    }
    if (window.electronAPI) {
      const appInfo = await window.electronAPI.getAppVersion?.() || {}
      this.isDev = Boolean(appInfo.isDev)
      this.patients = await window.electronAPI.dbGetPatients()
      this.meds = await window.electronAPI.dbGetMeds()
      // Fix legacy "24:00" times in DB
      try {
        const needsFix = this.meds.filter(m => m.times && m.times.includes('24:00'))
        for (const m of needsFix) {
          const fixed = m.times.split(',').map(t => this.normTime(t.trim())).join(', ')
          m.times = fixed
          const td = {}
          if (m.timeDoses) Object.keys(m.timeDoses).forEach(k => { td[this.normTime(k)] = m.timeDoses[k] })
          const clean = JSON.parse(JSON.stringify({
            name: m.name, route: m.route, dose: m.dose, times: fixed,
            condition: m.condition || 'standard',
            conditionData: m.conditionData || {},
            note: m.note || '', startDate: m.startDate || '',
            timeDoses: td
          }))
          await window.electronAPI.dbUpdateMed(m.id, clean)
        }
      } catch (e) {
        console.warn('24:00 migration skipped:', e.message)
      }
      // Load persisted config data
      const cfg = await window.electronAPI.configGetAll()
      if (cfg.drugPropsCache && typeof cfg.drugPropsCache === 'object') {
        Object.entries(cfg.drugPropsCache).forEach(([key, value]) => {
          if (value && typeof value === 'object' && Array.isArray(value.similarDrugNames)) drugPropsCache.set(key, value)
        })
      }
      this.apiUrl = cfg.apiUrl || this.apiUrl
      if (cfg.labelSize === 'kucuk' || cfg.labelSize === 'buyuk') this.labelSize = cfg.labelSize
      this.smallLabelOffsetX = normalizeLabelOffset(cfg.smallLabelOffsetX, 45)
      this.smallLabelOffsetY = normalizeLabelOffset(cfg.smallLabelOffsetY, 15)
      this.largeLabelOffsetX = normalizeLabelOffset(cfg.largeLabelOffsetX, 0)
      this.largeLabelOffsetY = normalizeLabelOffset(cfg.largeLabelOffsetY, 0)
      this.loadClientMenuVisibility(true)
      this.catalogLastUpdatedAt = cfg.drugCatalogLastSyncedAt || ''
      this.conflictIgnoreActives = cfg.conflictIgnoreActives || []
      const reminderState = await window.electronAPI.getReminderState?.()
      this.reminders = reminderState?.reminders || cfg.reminders || []
      if (reminderState?.activeReminder) this.activateReminder(reminderState.activeReminder)
      this.calendarNotes = cfg.calendarNotes || []
      this.shifts = normalizeShifts(cfg.shifts)
      this.shift = shiftForTime(new Date(), this.shifts)
      if (this.activePatients.length && !this.selectedPatientId) {
        this.selectedPatientId = this.activePatients[0].id
      }
      if (this.selectedPatientId) this.loadMayi(this.selectedPatientId)
      if (this.selectedPatientId) this.loadInfList(this.selectedPatientId)
      if (this.selectedPatientId) await this.loadDrugProps(this.selectedPatientId)
      if (this.selectedPatientId) this.reportPatientDrugBarcodes(this.selectedPatientId)
      await this.checkExpiredDrugs()
      // Catalog is synchronized by the final startup gate. Runtime checks only
      // ask the lightweight /check endpoint and open that gate when needed.
      this._catalogCheckTimer = setInterval(() => this.checkCatalogUpdate(), 30 * 60 * 1000)
      // Load active ingredients for F7 dropdowns
      await this.loadDrugCatalog()
      // Load full name map for tooltips
      await this.loadDrugFullNameMap()
      this.dosageRules = await window.electronAPI.dbGetMatchingDosages('', '') || []
      this.$nextTick(() => document.activeElement?.blur())
    }
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.onKeyDown)
    clearInterval(this._statusbarClockTimer)
    if (this._catalogCheckTimer) clearInterval(this._catalogCheckTimer)
    this.disposeReport()
    if (this._runtimeUpdateListener) this._runtimeUpdateListener()
    if (this._serverConnectionListener) this._serverConnectionListener()
    if (this._clientMessageListener) this._clientMessageListener()
    if (this._clientMenuVisibilityListener) this._clientMenuVisibilityListener()
    if (this._serverCatalogListener) this._serverCatalogListener()
    if (this._reminderDueListener) this._reminderDueListener()
    if (this._remindersChangedListener) this._remindersChangedListener()
  },
  watch: {
    labelSize(value) {
      if (value === 'kucuk' || value === 'buyuk') window.electronAPI?.configSet('labelSize', value)
    }
  },
  methods: {
    labelHome(isLarge, smallXOffset = 0, smallYOffset = 0) {
      return buildLabelHome(isLarge, this.smallLabelOffsetX, this.smallLabelOffsetY, this.largeLabelOffsetX, this.largeLabelOffsetY, smallXOffset, smallYOffset)
    },
    closeServerMessage() { this.serverMessage.open = false },
    async checkCatalogUpdate() {
      if (!window.electronAPI?.dbCheckDrugCatalog) return
      // A visible modal means the nurse is in the middle of an operation.
      // Keep the saved server timestamp unchanged so the next interval retries.
      if (document.querySelector('.modal, .modal-overlay')) return
      try {
        const check = await window.electronAPI.dbCheckDrugCatalog(this.apiUrl)
        if (!check?.ok || !check.updatedAt) return
        const local = await window.electronAPI.configGet('drugCatalogServerUpdatedAt')
        if (local === check.updatedAt) return
        const result = await window.electronAPI.runDataUpdateGate?.()
        if (!result?.ok) return
        this.catalogLastUpdatedAt = new Date().toISOString()
        await this.loadClientMenuVisibility()
        this.clearDrugPropsCache?.()
        await this.loadDrugCatalog()
        await this.loadDrugFullNameMap()
        if (this.selectedPatientId) await this.loadDrugProps(this.selectedPatientId)
      } catch (error) {
        console.warn('Katalog güncelleme kontrolü başarısız:', error?.message || error)
      }
    },
    async loadClientMenuVisibility(refresh = false) {
      if (!window.electronAPI?.configGetAll) return
      const applyMenus = (menus) => {
        this.visiblePrintMenus = Array.isArray(menus?.visiblePrintMenus) ? menus.visiblePrintMenus : null
        this.restrictedPrintMenus = Array.isArray(menus?.restrictedPrintMenus) ? menus.restrictedPrintMenus : null
        this.clinicalName = typeof menus?.clinicalName === 'string' ? menus.clinicalName : ''
        this.usageTerms = typeof menus?.usageTerms === 'string' ? menus.usageTerms : ''
      }

      const cfg = await window.electronAPI.configGetAll().catch(() => ({}))
      const cached = cfg.clientMenuVisibilityCache
      if (cached && typeof cached === 'object') applyMenus(cached)

      if (!refresh || !window.electronAPI?.getClientMenuVisibility) return
      try {
        const menus = await window.electronAPI.getClientMenuVisibility()
        if (!menus || typeof menus !== 'object') return
        applyMenus(menus)
        await window.electronAPI.configSet('clientMenuVisibilityCache', {
          visiblePrintMenus: this.visiblePrintMenus,
          restrictedPrintMenus: this.restrictedPrintMenus,
          clinicalName: this.clinicalName,
          usageTerms: this.usageTerms
        })
      } catch {}
    },
    handleRuntimeUpdateDecision(info) {
      if (!document.querySelector('.modal')) {
        window.electronAPI?.respondRuntimeUpdate(true)
        return
      }
      this.updateDecision = { open: true, version: info?.version || '' }
    },
    async respondRuntimeUpdate(installNow) {
      this.updateDecision.open = false
      await window.electronAPI?.respondRuntimeUpdate(Boolean(installNow))
    },
    isConflictingIVTime(medId, time) {
      return this.conflictingIVMedTimes.get(medId)?.has(time) || false
    },
    confirmDosageDelete(request) {
      this.confirm = {
        open: true,
        message: request.message,
        onConfirm: async () => {
          this.confirm.open = false
          await request.confirm()
        }
      }
    },
    sanitize(s) {
      const map = { 'ç':'c','Ç':'C','ğ':'g','Ğ':'G','ı':'i','İ':'I','ö':'o','Ö':'O','ş':'s','Ş':'S','ü':'u','Ü':'U' }
      return s.replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => map[ch])
    },
    normPatientName(s) {
      return s.replace(/\s+/g, ' ').trim().toLocaleUpperCase('tr')
    },
    normDrugName(s) {
      return s.replace(/\s+/g, ' ').trim().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    },
    normalizeRoute(route) {
      if (!route) return 'DGR'
      const r = route.trim().toUpperCase()
      const known = this.routes.find(rr => rr.val === r)
      if (known) return known.val
      const routeMap = {
        'INTRAVENOZ': 'IV', 'INTRAVENÖZ': 'IV', 'IV': 'IV',
        'INTRAMUSKULER': 'IM', 'INTRAMÜSKÜLER': 'IM', 'IM': 'IM',
        'PER ORAL': 'PO', 'ORAL': 'PO', 'PO': 'PO',
        'SUBKUTAN': 'SC', 'SUBKÜTAN': 'SC', 'SC': 'SC',
        'PER REKTUM': 'PR', 'REKTAL': 'PR', 'PR': 'PR',
        'SUBLINGUAL': 'SL', 'SL': 'SL',
        'INHALASYON': 'INH', 'İNHALASYON': 'INH', 'INH': 'INH',
        'TOPIKAL': 'TOP', 'TOP': 'TOP'
      }
      return routeMap[r] || 'DGR'
    },
    normText(s) {
      return s.replace(/\s+/g, ' ').trim()
    },
    normTime(t) {
      return t === '24:00' ? '00:00' : t
    },
    sortedMedTimes(times) {
      const values = Array.isArray(times) ? times : String(times || '').split(',')
      return values
        .map(time => this.normTime(time.trim()))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'tr-TR', { numeric: true }))
    },
    selectPatient(id) {
      this.selectedPatientId = id
      this.loadMayi(id)
      this.loadInfList(id)
      this.loadDrugProps(id)
      this.reportPatientDrugBarcodes(id)
    },
    reportPatientDrugBarcodes(patientId) {
      if (window.electronAPI && patientId) window.electronAPI.reportPatientDrugBarcodes(patientId).catch(() => {})
    },
    async loadDrugProps(patientId) {
      this.drugProps = {}
      if (!window.electronAPI || !patientId) return
      const loadToken = ++drugPropsLoadToken
      const pMeds = this.meds.filter(m => m.patientId === patientId)
      if (!pMeds.some(med => !drugPropsCache.has(drugPropsCacheKey(med)))) {
        pMeds.forEach(med => {
          const result = drugPropsCache.get(drugPropsCacheKey(med))
          if (result?.props || result?.similarDrugNames?.length) this.drugProps[med.id] = { ...(result.props || {}), similarDrugNames: result.similarDrugNames || [] }
        })
        return
      }
      this.drugPropsLoading = true
      try {
        const results = await Promise.all(pMeds.map(async med => {
          const key = drugPropsCacheKey(med)
          if (drugPropsCache.has(key)) return { med, result: drugPropsCache.get(key) }
          const [props, similarDrugNames] = await Promise.all([
            window.electronAPI.dbGetDrugPropertiesForMedication({ name: med.name || '', route: med.route || '', activeIngredient: med.activeIngredient || '', catalogBarcode: med.catalogBarcode || '' }),
            window.electronAPI.dbGetSimilarDrugNames({ name: med.name || '', catalogBarcode: med.catalogBarcode || '' })
          ])
          const result = { props, similarDrugNames }
          drugPropsCache.set(key, result)
          persistDrugPropsCache()
          return { med, result }
        }))
        if (loadToken !== drugPropsLoadToken) return
        results.forEach(({ med, result }) => {
          if (result.props || result.similarDrugNames.length) this.drugProps[med.id] = { ...(result.props || {}), similarDrugNames: result.similarDrugNames }
        })
      } finally {
        if (loadToken === drugPropsLoadToken) this.drugPropsLoading = false
      }
    },
    warningTooltip(warning) {
      if (!warning) return ''
      const details = Array.isArray(warning.details) ? warning.details : []
      return [warning.label || 'İlaç uyarısı', ...details].join('\n')
    },
    medDay(m) {
      if (!m.startDate) return ''
      const start = new Date(m.startDate.split('-').join('/'))
      const today = new Date()
      const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1
      if (diff < 0) return '0'
      return '' + diff
    },
    effectiveDose(m, time) {
      if (time && m.timeDoses && m.timeDoses[time]) return m.timeDoses[time]
      return m.dose
    },
    openPatientModal(patient) {
      this.patientDuplicate = false
      this.patientClipboard = { loading: false, error: '', patients: [] }
      if (patient) {
        this.patientModal = { open: true, edit: true, id: patient.id, name: patient.name, height: patient.height || '', weight: patient.weight || '', patientNo: patient.patient_no || '', gender: patient.gender || '', birthDate: patient.birthDate || '' }
      } else {
        this.patientModal = { open: true, edit: false, id: null, name: '', height: '', weight: '', patientNo: '', gender: '', birthDate: '' }
      }
    },
    async pastePatientFromClipboard() {
      this.patientClipboard = { loading: true, error: '', patients: [] }
      let result
      try {
        result = await window.electronAPI.clipboardParsePatients()
      } catch {
        this.patientClipboard = { loading: false, error: 'Pano okunamadı.', patients: [] }
        return
      }
      if (result.error) {
        this.patientClipboard = { loading: false, error: result.error, patients: [] }
        return
      }
      if (result.patients.length === 1) {
        applyImportedPatient(this.patientModal, result.patients[0])
        this.patientClipboard = { loading: false, error: '', patients: [] }
        this.patientDuplicate = false
        return
      }
      this.patientClipboard = {
        loading: false,
        error: '',
        patients: result.patients.map((patient, index) => ({
          ...patient,
          displayLabel: importedPatientLabel(patient, index)
        }))
      }
    },
    selectClipboardPatient(patient) {
      applyImportedPatient(this.patientModal, patient)
      this.patientClipboard = { loading: false, error: '', patients: [] }
      this.patientDuplicate = false
    },
    async savePatient() {
      const name = this.normPatientName(this.patientModal.name)
      if (!name) return
      const height = this.patientModal.height.trim()
      const weight = this.patientModal.weight.trim()
      const patientNo = this.patientModal.patientNo.trim()
      const gender = this.patientModal.gender || ''
      const birthDate = this.patientModal.birthDate || ''
      if (this.patientModal.edit) {
        const ok = await window.electronAPI.dbUpdatePatient(this.patientModal.id, name, height, weight, patientNo, gender, birthDate)
        if (!ok) { this.patientDuplicate = true; return }
        this.patients = await window.electronAPI.dbGetPatients()
      } else {
        const id = await window.electronAPI.dbAddPatient(name, height, weight, patientNo, gender, birthDate)
        if (id === -1) { this.patientDuplicate = true; return }
        this.patients = await window.electronAPI.dbGetPatients()
        this.selectPatient(id)
      }
      this.patientModal.open = false
    },
    async archivePatient(id) {
      await window.electronAPI.dbArchivePatient(id)
      const p = this.patients.find(p => p.id === id)
      if (p) p.archived = true
      this.closeFloatingMenus()
      if (this.selectedPatientId === id) {
        const active = this.patients.filter(x => !x.archived)
        this.selectedPatientId = active.length ? active[0].id : null
      }
    },
    editArchivedPatient(p) {
      this.closeFloatingMenus()
      this.archiveOpen = false
      this.patientModal = { open: true, edit: true, id: p.id, name: p.name, height: p.height || '', weight: p.weight || '', patientNo: p.patient_no || '', gender: p.gender || '', birthDate: p.birthDate || '' }
    },
    async restorePatient(id) {
      await window.electronAPI.dbRestorePatient(id)
      const p = this.patients.find(p => p.id === id)
      if (p) p.archived = false
      this.closeFloatingMenus()
    },
    async removePatient(id, from = 'liste') {
      const p = this.patients.find(p => p.id === id)
      if (!p) return
      const yer = from === 'arsiv' ? 'arşivden' : 'listeden'
      this.confirm = { open: true, message: `"${p.name}" isimli hasta ${yer} kaldırılacak. Emin misiniz?`, onConfirm: async () => {
        this.confirm.open = false
        await window.electronAPI.dbDeletePatient(id)
        const idx = this.patients.findIndex(p => p.id === id)
        if (idx > -1) this.patients.splice(idx, 1)
        this.meds = this.meds.filter(m => m.patientId !== id)
        this.closeFloatingMenus()
        if (this.selectedPatientId === id) {
          // Silinen hasta yerine otomatik olarak başka hastayı seçme.
          // Kullanıcı yeni hastayı kendisi seçsin; böylece ilaç uyarıları
          // eski seçimin asenkron verileriyle karışmaz.
          this.selectedPatientId = null
        }
      }}
    },
    openMedModal(med) {
      this.drugDropdown.open = false
      if (med) {
        const normalizedDose = normalizeMedicationDose(med)
        const normTD = {}
        if (med.timeDoses) Object.keys(med.timeDoses).forEach(k => {
          const parsed = parseDose(med.timeDoses[k], normalizedDose.unit, normalizedDose.unit)
          const converted = convertDoseValue(parsed.value, parsed.unit, normalizedDose.unit)
          normTD[this.normTime(k)] = converted ?? parsed.value ?? ''
        })
        this.medModal = {
          open: true, edit: true, id: med.id,
          name: med.name, activeIngredient: med.activeIngredient || '', catalogBarcode: med.catalogBarcode || '', catalogLabelDetail: med.catalogLabelDetail || '', catalogLabelDetailCustomized: !!med.catalogLabelDetailCustomized, catalogLabelDetailEnabled: !!med.catalogLabelDetailEnabled, route: med.route, doseValue: String(normalizedDose.value), doseUnit: normalizedDose.unit, times: med.times,
          timesList: this.sortedMedTimes(med.times),
          condition: med.condition || 'standard',
          conditionData: med.conditionData ? JSON.parse(JSON.stringify(med.conditionData)) : {},
          note: med.note || '', startDate: med.startDate || '',
          timeDoses: normTD, customLabel: med.customLabel || '', customLabelEnabled: !!med.customLabel, luezym: !!med.luezym,
          errors: {}
        }
      } else {
        this.medModal = { open: true, edit: false, id: null, name: '', activeIngredient: '', catalogBarcode: '', catalogLabelDetail: '', catalogLabelDetailCustomized: false, catalogLabelDetailEnabled: false, route: '', doseValue: '', doseUnit: 'mg', times: '', timesList: [], condition: 'standard', conditionData: {}, note: '', startDate: '', timeDoses: {}, customLabel: '', customLabelEnabled: false, luezym: false, errors: {} }
      }
    },
    drugFullNameTooltip(m) {
      const ai = (m.activeIngredient || '').toLowerCase().trim()
      const route = (m.route || '').toLowerCase().trim()
      const all = this.drugFullNameMap[ai + '|' + route]
      if (!all || !all.length) return 'Muadili yok'
      const muadil = all.filter(n => n.toLowerCase() !== (m.name || '').toLowerCase())
      if (!muadil.length) return 'Muadili yok'
      return 'Muadiller\n' + muadil.join('\n')
    },
    medDisplayName(med) {
      const custom = String(med?.customLabel || '').trim()
      return custom || String(med?.name || '')
    },
    patientTooltip(p) {
      const lines = []
      if (p.patient_no) lines.push('Hasta No: ' + p.patient_no)
      else lines.push('Hasta no girilmemiş')
      if (p.birthDate) {
        const now = new Date()
        const bd = new Date(p.birthDate.split('-').join('/'))
        let years = now.getFullYear() - bd.getFullYear()
        let months = now.getMonth() - bd.getMonth()
        if (months < 0) { years--; months += 12 }
        lines.push('Yaş: ' + years + ' yıl ' + months + ' ay')
      }
      if (p.height) lines.push('Boy: ' + p.height + ' cm')
      else lines.push('Boy bilgisi yok')
      if (p.weight) lines.push('Kilo: ' + p.weight + ' kg')
      else lines.push('Kilo bilgisi yok')
      lines.push('VYA: ' + this.calcVya(p))
      return lines.join('\n')
    },
    routeFullName(abbr) {
      const map = { PO: 'Oral', IV: 'İntravenöz', IM: 'İntramüsküler', SC: 'Subkutan', SL: 'Sublingual', PR: 'Rektal', INH: 'İnhalasyon', TOP: 'Topikal', IVINF: 'IV İnfüzyon', DGR: 'Diğer' }
      return map[abbr] || abbr
    },
    calcVya(p) {
      const h = parseFloat(p.height)
      const w = parseFloat(p.weight)
      if (h > 0 && w > 0) return Math.sqrt((h * w) / 3600).toFixed(2) + ' m²'
      return '|'
    },
    parseDoseMg(value, unit = '') {
      const parsed = parseDose(value, unit, unit || 'adet')
      return doseToMilligrams(parsed.value, parsed.unit) || 0
    },
    doseUnitLabel(unit) {
      return this.doseUnits.find(item => item.value === unit)?.label || unit
    },
    extractMedDosesMg(med) {
      const result = []
      const times = (med.times || '').split(',').map(t => t.trim()).filter(Boolean)
      const td = med.timeDoses || {}
      for (const t of times) {
        const hasTimeDose = td && td[t]
        const doseValue = hasTimeDose ? td[t] : (med.doseValue ?? med.dose ?? '')
        const doseUnit = hasTimeDose ? '' : med.doseUnit
        const mg = this.parseDoseMg(doseValue, doseUnit)
        if (mg > 0) result.push(mg)
      }
      return result
    },
    fmtDoseMg(mg) {
      const format = value => Number(value.toFixed(2)).toString().replace('.', ',')
      if (mg >= 1000) return format(mg / 1000) + ' g'
      return format(mg) + ' mg'
    },
    formatDosageRule(rule) {
      const min = Number(rule.dose_min)
      const max = Number(rule.dose_max)
      const format = value => Number(value.toFixed(2)).toString().replace('.', ',')
      const dose = min === max ? format(min) : `${format(min)}-${format(max)}`
      const unit = rule.dose_unit === 'm2' ? 'mg/m²' : 'mg/kg'
      const period = rule.dose_period === 'day' ? 'gün' : 'doz'
      return `${dose} ${unit}/${period}`
    },
    async saveMed() {
      const { name, route, doseValue, doseUnit, timesList, condition, conditionData, note, startDate, timeDoses, activeIngredient, catalogBarcode, catalogLabelDetail, catalogLabelDetailCustomized, catalogLabelDetailEnabled } = this.medModal
      const errs = {}
      if (!name.trim()) errs.name = true
      const parsedDoseValue = parseDoseAmount(doseValue)
      if (parsedDoseValue == null || parsedDoseValue <= 0 || !doseUnit) errs.dose = true
      if (timesList.length === 0) errs.times = true
      if (condition === 'weekdays' && (!conditionData.days || conditionData.days.length === 0)) errs.days = true
      if (condition === 'dateRange' && (!conditionData.start || !conditionData.end)) errs.dateRange = true
      if (condition === 'dateRange' && conditionData.start && conditionData.end) {
        const start = new Date(conditionData.start + 'T00:00:00')
        const end = new Date(conditionData.end + 'T00:00:00')
        if (end < start) errs.dateRangeEndBeforeStart = true
      }
      if (condition === 'everyX' && !conditionData.x) errs.everyX = true
      if (condition === 'xGiveYWait' && (!conditionData.give || !conditionData.wait)) errs.xGiveYWait = true
      if ((condition === 'everyX' || condition === 'xGiveYWait') && !startDate) errs.startDate = true
      this.medModal.errors = errs
      if (Object.keys(errs).length) return

      const normName = this.normDrugName(name)
      const normRoute = this.normText(route)
      const normDose = formatDose(parsedDoseValue, doseUnit)
      const normedTimes = this.sortedMedTimes(timesList)
      const times = normedTimes.join(', ')
      const cleanupDoses = {}
      Object.keys(timeDoses).forEach(k => {
        const amount = parseDoseAmount(timeDoses[k])
        if (amount != null && amount > 0) cleanupDoses[this.normTime(k)] = formatDose(amount, doseUnit)
      })
      Object.keys(cleanupDoses).forEach(k => { if (!cleanupDoses[k]) delete cleanupDoses[k] })
      this.medModal.name = normName
      const data = { name: normName, activeIngredient: (activeIngredient || '').toLowerCase().trim(), catalogBarcode: catalogBarcode || '', catalogLabelDetail: String(catalogLabelDetail || '').trim().substring(0, 20), catalogLabelDetailCustomized: !!catalogLabelDetailCustomized, catalogLabelDetailEnabled: !!catalogLabelDetailEnabled, route: normRoute, dose: normDose, doseValue: parsedDoseValue, doseUnit, times, condition, conditionData: JSON.parse(JSON.stringify(conditionData)), note: this.normText(note || ''), startDate: startDate || '', timeDoses: cleanupDoses, customLabel: this.medModal.customLabelEnabled ? this.medModal.customLabel : '', luezym: this.medModal.luezym ? 1 : 0 }
      if (this.medModal.edit) {
        await window.electronAPI.dbUpdateMed(this.medModal.id, data)
        const idx = this.meds.findIndex(m => m.id === this.medModal.id)
        if (idx > -1) this.meds.splice(idx, 1, { ...this.meds[idx], ...data })
      } else {
        const id = await window.electronAPI.dbAddMed({ ...data, patientId: this.selectedPatientId })
        this.meds.push({ id, patientId: this.selectedPatientId, ...data })
      }
      this.medModal.open = false
      await this.loadDrugProps(this.selectedPatientId)
      this.reportPatientDrugBarcodes(this.selectedPatientId)
    },
    openDrugDropdown() {
      this.drugDropdown.open = true
      this.drugDropdown.query = ''
      this.drugDropdown.results = []
      this.drugDropdown.focusIdx = -1
      this.$nextTick(() => {
        const el = this.$refs.drugSearchInput
        if (el) { el.focus(); el.select() }
      })
    },
    closeDrugDropdown() {
      this.drugDropdown.open = false
    },
    closeFloatingMenus() {
      this.printOpen = false
      this.settingsMenuOpen = false
      this.ctx.show = false
      this.drugDropdown.open = false
      if (this.infDrugDropdown) this.infDrugDropdown.open = false
      document.querySelectorAll('.v-tooltip').forEach(el => el.remove())
    },
    onDrugSearch() {
      const q = this.drugDropdown.query
      if (q.length < 2) { this.drugDropdown.results = []; return }
      if (this._drugSearchTimer) clearTimeout(this._drugSearchTimer)
      this._drugSearchTimer = setTimeout(async () => {
        this.drugDropdown.results = await window.electronAPI.dbSearchDrugCatalog(q)
        this.drugDropdown.focusIdx = this.drugDropdown.results.length ? 0 : -1
        this.$nextTick(() => {
          const el = this.$refs.drugSearchInput
          if (el) el.focus()
        })
      }, 200)
    },
    selectDrug(d) {
      this.medModal.name = this.normDrugName(d.label)
      this.medModal.activeIngredient = this.normDrugName(d.active_ingredient)
      this.medModal.catalogBarcode = String(d.barcode || '')
      this.medModal.catalogLabelDetail = String(d.label_detail || '').trim().substring(0, 20)
      this.medModal.catalogLabelDetailCustomized = false
      this.medModal.catalogLabelDetailEnabled = !!this.medModal.catalogLabelDetail
      if (d.form) {
        const found = this.routes.find(r => r.val === d.form.toUpperCase())
        if (found) this.medModal.route = found.val
      }
      this.closeDrugDropdown()
    },
    selectFirstDrug() {
      if (this.drugDropdown.results.length) this.selectDrug(this.drugDropdown.results[0])
    },
    drugDropdownFocusNext() {
      const max = this.drugDropdown.results.length - 1
      this.drugDropdown.focusIdx = Math.min(this.drugDropdown.focusIdx + 1, max)
      const el = this.drugDropdown.refs[this.drugDropdown.focusIdx]
      if (el) el.scrollIntoView({ block: 'nearest' })
    },
    drugDropdownFocusPrev() {
      this.drugDropdown.focusIdx = Math.max(this.drugDropdown.focusIdx - 1, 0)
      const el = this.drugDropdown.refs[this.drugDropdown.focusIdx]
      if (el) el.scrollIntoView({ block: 'nearest' })
    },
    addTime() {
      const t = this.normTime(this.medModal.newTime)
      if (t && !this.medModal.timesList.includes(t)) {
        this.medModal.timesList.push(t)
        this.medModal.timesList = this.sortedMedTimes(this.medModal.timesList)
      }
      this.medModal.newTime = ''
    },
    removeTime(idx) {
      const t = this.medModal.timesList[idx]
      delete this.medModal.timeDoses[t]
      this.medModal.timesList.splice(idx, 1)
    },
    toggleDay(i) {
      if (!this.medModal.conditionData.days) this.medModal.conditionData.days = []
      const days = this.medModal.conditionData.days
      const idx = days.indexOf(i)
      if (idx > -1) days.splice(idx, 1)
      else days.push(i)
    },
    setTimes(preset) {
      this.medModal.timesList = this.sortedMedTimes(preset.map(h => `${h.toString().padStart(2, '0')}:00`))
    },
    async removeMed(id) {
      const med = this.meds.find(x => x.id === id)
      if (!med) return
      const p = this.patients.find(x => x.id === med.patientId)
      this.confirm = { open: true, message: `"${med.name}" isimli ilacı "${p?.name || 'bilinmeyen'}" isimli hastadan silmek istediğinize emin misiniz?`, onConfirm: async () => {
        this.confirm.open = false
        await window.electronAPI.dbDeleteMed(id)
        const idx = this.meds.findIndex(x => x.id === id)
        if (idx > -1) this.meds.splice(idx, 1)
      }}
    },
    openResetModal(patient) {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
      let code = ''
      for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
      this.resetModal = { open: true, code, input: '', patientId: patient.id, patientName: patient.name }
    },
    async confirmReset() {
      if (this.resetModal.input !== this.resetModal.code) return
      const { patientId } = this.resetModal
      this.resetModal.open = false
      await window.electronAPI.dbDeletePatientMeds(patientId)
      this.meds = this.meds.filter(m => m.patientId !== patientId)
    },
    async toggleLuezym(med, checked) {
      const newVal = checked ? 1 : 0
      const data = JSON.parse(JSON.stringify({ ...med, luezym: newVal }))
      await window.electronAPI.dbUpdateMed(med.id, data)
      const idx = this.meds.findIndex(m => m.id === med.id)
      if (idx > -1) {
        this.meds[idx].luezym = newVal
      }
    },
    async autoImport() {
      if (!window.electronAPI) return
      this.orderImport = { open: false, loading: true, error: '', orders: [], selected: [], skipped: [], completed: false, importedCount: 0 }
      let result
      try {
        result = await window.electronAPI.clipboardParseOrders()
      } catch {
        result = null
      }
      if (!result || result.error || result.orders.length === 0) {
        this.orderImport.loading = false
        this.orderImportWarning.open = true
        return
      }
      this.orderImport.open = true
      this.orderImport.orders = result.orders
      this.orderImport.selected = result.orders.map((o, i) => i)
      this.orderImport.loading = false
    },
    toggleOrderSel(i) {
      const idx = this.orderImport.selected.indexOf(i)
      if (idx > -1) this.orderImport.selected.splice(idx, 1)
      else this.orderImport.selected.push(i)
    },
    async confirmOrderImport() {
      this.orderImport.loading = true
      const { imported, skipped } = await importSelectedOrders({
        orders: this.orderImport.orders,
        selectedIndexes: this.orderImport.selected,
        patientId: this.selectedPatientId,
        api: window.electronAPI,
        normalizeDrugName: value => this.normDrugName(value),
        normalizeRoute: value => this.normalizeRoute(value)
      })
      this.meds.push(...imported)
      if (this.selectedPatientId) this.loadDrugProps(this.selectedPatientId)
      this.orderImport.skipped = skipped
      this.orderImport.importedCount = imported.length
      this.orderImport.completed = true
      this.orderImport.selected = []
      this.orderImport.loading = false
    },
    parseDoseCount(med) {
      const existingTimes = med.times ? med.times.split(',').map(t => t.trim()).filter(Boolean) : []
      return existingTimes.length || 1
    },
    defaultDoseInterval(doseCount) {
      if (doseCount <= 1) return 0
      const map = { 2: 10, 3: 7, 4: 5, 5: 4, 6: 3 }
      return map[doseCount] || 1
    },
    openAutoSched() {
      const rows = this.ivMeds.map(m => {
        const existingTimes = m.times ? m.times.split(',').map(t => t.trim()).filter(Boolean) : []
        const dc = this.parseDoseCount(m)
        return {
          medId: m.id,
          name: m.name,
          dose: m.dose || '',
          doseCount: dc,
          isFixed: false,
          fixedTimes: existingTimes.slice(),
          infusionMin: 60,
          doseIntervalHours: this.defaultDoseInterval(dc)
        }
      })
      const defaultSelected = this.ivMeds.map(m => m.id)
      this.autoSched = { open: true, step: 'select', selectedIds: [...defaultSelected], rows, preview: [], error: '' }
    },
    runAutoSchedule() {
      const s = this.autoSched
      const DAY = 24 * 60

      function parseTime(t) {
        if (!t) return 0
        if (t === '24:00') return 0
        const [h, m] = t.split(':').map(Number)
        return (h % 24) * 60 + m
      }
      function fmtTime(min) {
        const h = String(Math.floor(min / 60) % 24).padStart(2, '0')
        const m = String(min % 60).padStart(2, '0')
        return h + ':' + m
      }
      function isSlotFree(start, end, occupied) {
        for (const b of occupied) {
          if (start < b.end && end > b.start) return false
        }
        return true
      }

      const selectedRows = s.rows.filter(r => s.selectedIds.includes(r.medId))
      if (!selectedRows.length) { s.error = 'Secili ilac yok'; s.step = 'error'; return }

      // Early validation: total infusion minutes must fit in 24 hours
      const totalInfusionMin = selectedRows.reduce((sum, r) => {
        const doseCount = r.isFixed ? r.fixedTimes.length : r.doseCount
        return sum + r.infusionMin * doseCount
      }, 0)
      if (totalInfusionMin > DAY) {
        s.error = `Infuzyon surelerini tekrar degerlendirin, bu sartlar altinda butun ilaclari bir gunde vermek mumkun degil.\n\nToplam infuzyon suresi ${totalInfusionMin} dakika, bir gun ise sadece ${DAY} dakika.`
        s.step = 'error'
        return
      }

      const occupied = []
      const result = {}

      // Phase 1: Place fixed-time drugs
      selectedRows.forEach(row => {
        if (!row.isFixed || !row.fixedTimes.length) return
        const times = []
        for (const t of row.fixedTimes) {
          const start = parseTime(t)
          const end = start + row.infusionMin
          if (end > DAY) continue
          times.push(t)
          occupied.push({ start, end, medId: row.medId })
        }
        result[row.medId] = times
      })

      // Phase 2: Schedule flexible drugs (longest total time first)
      const flexible = selectedRows
        .filter(r => !r.isFixed || !r.fixedTimes.length)
        .sort((a, b) => (b.infusionMin * b.doseCount) - (a.infusionMin * a.doseCount))

      const nextDay = new Set() // track doses placed next-day

      for (const row of flexible) {
        const intervalMin = row.doseIntervalHours * 60
        const times = []
        let allPlaced = true

        for (let d = 0; d < row.doseCount; d++) {
          let idealStart = d * intervalMin
          if (times.length > 0) {
            const lastStart = parseTime(times[times.length - 1])
            idealStart = lastStart + intervalMin
          }

          let placed = false
          for (let start = idealStart; start + row.infusionMin < DAY; start++) {
            if (!isSlotFree(start, start + row.infusionMin, occupied)) continue
            if (times.length > 0) {
              const lastStart = parseTime(times[times.length - 1])
              if (start < lastStart + intervalMin) continue
            }
            placed = true
            const ft = fmtTime(start)
            times.push(ft)
            occupied.push({ start, end: start + row.infusionMin, medId: row.medId })
            break
          }
          if (!placed) {
            for (let start = 0; start < idealStart; start++) {
              if (!isSlotFree(start, start + row.infusionMin, occupied)) continue
              if (times.length > 0) {
                const lastStart = parseTime(times[times.length - 1])
                const dist = (start + DAY - lastStart) % DAY
                if (dist < intervalMin) continue
              }
              placed = true
              const ft = fmtTime(start)
              times.push(ft)
              nextDay.add(`${row.medId}:${ft}`)
              occupied.push({ start, end: start + row.infusionMin, medId: row.medId })
              break
            }
          }
          if (!placed) { allPlaced = false; break }
        }

        result[row.medId] = allPlaced ? times : []
      }

      // Check if any flexible drug failed
      const failures = flexible.filter(r => !result[r.medId] || result[r.medId].length < r.doseCount)
      if (failures.length) {
        const names = failures.map(f => f.name).join(', ')
        s.error = `Infuzyon surelerini tekrar degerlendirin, bu sartlar altinda butun ilaclari bir gunde vermek mumkun degil.\n\nEksik kalan ilaclar: ${names}`
        s.step = 'error'
        return
      }

      // Build preview
      s.preview = selectedRows.map(row => {
        const assigned = result[row.medId] || []
        const med = this.meds.find(m => m.id === row.medId)
        const oldTimes = med ? med.times : ''
        const sorted = assigned.slice().sort((a, b) => parseTime(a) - parseTime(b))
        const newTimes = sorted.map(t => nextDay.has(`${row.medId}:${t}`) ? t + '+1' : t).join(', ')
        return { medId: row.medId, name: row.name, dose: med ? med.dose : '', oldTimes, newTimes }
      })
      s.step = 'preview'
    },
    confirmAutoSchedule() {
      const s = this.autoSched
      s.preview.forEach(item => {
        if (!item.newTimes) return
        const med = this.meds.find(m => m.id === item.medId)
        if (!med) return
        med.times = item.newTimes.replace(/\+1/g, '')
        if (window.electronAPI) window.electronAPI.dbUpdateMed(item.medId, JSON.parse(JSON.stringify({
          name: med.name, route: med.route, dose: med.dose, times: med.times,
          condition: med.condition || 'standard',
          conditionData: med.conditionData || {},
          note: med.note || '', startDate: med.startDate || '',
          timeDoses: med.timeDoses || {},
          activeIngredient: med.activeIngredient || ''
        })))
      })
      s.open = false
    },

    printLabel(med) {
      const patient = this.patients.find(p => p.id === med.patientId)
      if (!patient) return
      const isLarge = this.labelSize === 'buyuk'
      const pw = isLarge ? '450' : '380'
      const times = med.times.split(',').map(t => t.trim()).filter(Boolean)
      const shiftTimes = this.filterByShift(times, this.shift)
      if (!this.matchesCondition(med)) return

      shiftTimes.forEach(time => {
        const dose = this.effectiveDose(med, time)
        const [hour, minute] = time.split(':')
        const smallLabelName = buildSmallTreatmentLabelName(this.medDisplayName(med))
        const zpl = `^XA
^PW${pw}
^LL${isLarge ? 260 : 140}
${this.labelHome(isLarge, 10, 10)}
^LS0
^LT0
${isLarge
  ? `^ADN,40,20^FO0,20^FD${patient.name}^FS`
  : `^ADN,29,16^FO0,0^FD${patient.name}^FS`}
${isLarge
  ? `^ADN,40,20^FO0,70^FD${this.medDisplayName(med).substring(0, 12)}^FS^ADN,40,20^FO0,120^FD${dose}^FS^ADN,40,20^FO0,170^FD${med.route}^FS^ADN,80,50^FO320,60^FD${hour}^FS^ADN,80,50^FO320,120^FD${minute}^FS`
  : `^ADN,29,16^FO0,41^FD${smallLabelName}^FS^ADN,29,16^FO0,82^FD${dose}^FS^ADN,50,30^FO200,87^FD${hour}^FS^ADN,27,16^FO270,86^FD${minute}^FS^ADN,18,10^FO270,121^FB60,1,0,L,0^FD${med.route}^FS`}
${buildTreatmentLabelDetailField(med.catalogLabelDetail, isLarge, !!med.catalogLabelDetailEnabled)}
^XZ`
        if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
      })
    },
    printLabelType(key) {
      const zplMap = {
        tedavi: null,
        enjektor: null,
        acilis: null,
        setTarih: null,
        yatis: null,
        agizBakim: null
      }
      if (key === 'enjektor') {
        const today = new Date()
        const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
        this.enjModal = { open: true, date: dateStr, time: '06:00', selected: [], digerText: '' }
        return
      }
      if (key === 'acilis') {
        const today = new Date()
        const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
        this.acilisModal = { open: true, date: dateStr, time: '06:00', urun: '', nurse: '', note: '' }
        return
      }
      if (key === 'agizBakim') {
        const isLarge = this.labelSize === 'buyuk'
        const pw = isLarge ? '450' : '380'
        const today = new Date()
        const dateStr = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric', year: 'numeric' })
      const zpl = `^XA
^PW${pw}
^LL${isLarge ? 200 : 130}
${this.labelHome(isLarge)}
^LS0
^LT0
${isLarge ? `^CF0,50^FO0,15^FDSodyum Bikarbonatli^FS` : `^CFS,25^FO25,10^FDSodyum Bikarbonatli^FS`}
${isLarge ? `^CF0,50^FO0,75^FDAgiz Bakim Suyu^FS` : `^CFT^FO25,55^FDAgiz Bakim Suyu^FS`}
${isLarge ? `^CF0,50^FO0,135^FD${dateStr}^FS` : `^CFS^FO25,110^FD${dateStr}^FS`}
^XZ`
        if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
        return
      }
      if (key === 'setTarih') {
        const today = new Date()
        const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0')
        this.acilisModal = { open: true, setTarihiMode: true, date: dateStr, time: '06:00', urun: '', nurse: '', note: '' }
        return
      }
      if (key === 'yatis') {
        this.yatisModal = { open: true, selected: [], digerText: '' }
        return
      }
      if (key === 'tedavi') {
        this.tedaviModal = {
          open: true,
          selectedPatients: this.selectedPatientId ? [this.selectedPatientId] : [],
          sortBy: 'name',
          mixPatients: false,
          groupByRoute: false
        }
        return
      }
      if (key === 'karteks') {
        this.karteksModal = { open: true, selectedPatients: [this.selectedPatientId] }
        return
      }
      if (key === 'sema') {
        this.semaModal = { open: true, selectedPatients: [this.selectedPatientId], text: '' }
        return
      }
      if (key === 'ozel') {
        this.ozelModal = { open: true, text: '' }
        return
      }
      if (key === 'taburcu') {
        this.taburcuModal = { open: true, selectedMeds: [], notes: {}, doseNotes: {}, skipMuadil: {} }
        return
      }
      const zpl = zplMap[key]
      if (zpl && window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
    },
    printEnjektor() {
      const d = this.enjModal
      const isLarge = this.labelSize === 'buyuk'
      const pw = isLarge ? '450' : '380'
      const dateRaw = d.date ? new Date(d.date + 'T00:00:00') : null
      const dateStr = dateRaw ? dateRaw.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''
      const timeStr = d.time || ''

      const itemLabels = d.selected.map(val => {
        if (val === 'diger') return d.digerText ? d.digerText.trim() : null
        const item = this.enjItems.find(i => i.val === val)
        return item ? item.label : null
      }).filter(Boolean)

      itemLabels.forEach(label => {
        const zpl = `^XA
^PW${pw}
^LL${isLarge ? 250 : 150}
${this.labelHome(isLarge)}
^LS0
^LT0
${isLarge ? `^CFU^FO10,40^FD${label}^FS` : `^CFT^FO25,10^FD${label}^FS`}
${isLarge ? `^CFU^FO10,100^FDEnjektörü^FS` : `^CFT^FO25,55^FDEnjektörü^FS`}
${isLarge ? `^CFE^FO340,210^FD${timeStr}^FS` : `^CFS^FO205,115^FD${timeStr}^FS`}
${isLarge ? `^CFE^FO100,210^FD${dateStr}^FS` : `^CFS^FO25,115^FD${dateStr}^FS`}
^XZ`
        if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
      })
    },
    printAcilis() {
      const d = this.acilisModal
      const isLarge = this.labelSize === 'buyuk'
      const pw = isLarge ? '450' : '380'
      const dateRaw = d.date ? new Date(d.date + 'T00:00:00') : null
      const dateStr = dateRaw ? dateRaw.toLocaleDateString('tr-TR', { day: 'numeric', month: 'numeric', year: 'numeric' }) : ''
      const timeStr = d.time || ''
      const urunStr = d.urun || ''
      const nurseStr = d.nurse || ''
      const noteStr = d.note || ''

      let zpl
      if (d.setTarihiMode) {
        zpl = `^XA
^PW${pw}
^LL${isLarge ? 230 : 160}
${this.labelHome(isLarge)}
^LS0
^LT0
${isLarge ? `^CF0,40^FO10,20^FDSet Tarihi:^FS` : `^CFT^FO25,10^FDSet Tarihi:^FS`}
${isLarge ? `^CF0,50^FO10,80^FD${dateStr}^FS` : `^CFT^FO25,60^FD${dateStr}^FS`}
${isLarge ? `^CF0,40^FO10,140^FD${timeStr}^FS` : `^CFT^FO25,110^FD${timeStr}^FS`}
^XZ`
      } else {
        zpl = `^XA
^PW${pw}
^LL${isLarge ? 250 : 170}
${this.labelHome(isLarge)}
^LS0
^LT0
${isLarge ? `^CFU^FO10,10^FD${urunStr}^FS` : `^CFT^FO25,10^FD${urunStr}^FS`}
${isLarge ? `^CF0,30^FO10,90^FDAcilma Tarihi:^FS` : ''}
${isLarge ? `^CF0,40^FO10,120^FD${dateStr}^FS` : `^CFS,28^FO25,60^FD${dateStr}^FS`}
${isLarge ? `^CF0,30^FO260,90^FDAcilma Saati:^FS` : ''}
${isLarge ? `^CF0,40^FO260,120^FD${timeStr}^FS` : `^CFS,28^FO205,60^FD${timeStr}^FS`}
${isLarge ? `^CF0,20^FO10,160^FDHemsire: ${nurseStr}^FS` : `^A0N,18,14^FO35,108^FDAçan kişi: ${nurseStr}^FS`}
${isLarge ? `^CF0,30^FO10,200^FD${noteStr}^FS` : `^A0N,20,16^FO35,130^FD${noteStr}^FS`}
^XZ`
      }
      if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
    },
    printYatis() {
      const d = this.yatisModal
      const isLarge = this.labelSize === 'buyuk'
      const pw = isLarge ? '450' : '380'

      const twoLineMap = {
        gozlem: { line1: 'GOZLEM', line2: 'FORMLARI' },
        order: { line1: 'ORDER', line2: 'FORMLARI' },
        kan: { line1: 'KAN', line2: 'FORMLARI' },
        yatisBelge: { line1: 'YATIS', line2: 'BELGELERI' }
      }

      d.selected.forEach(val => {
        if (val === 'diger') {
          const text = d.digerText ? d.digerText.trim() : ''
          if (!text) return
          const fields = buildMultilineZplFields(text, isLarge
            ? { maxLines: 4, x: 10, y: 10, lineHeight: 48, font: '^CF0,48' }
            : { maxLines: 4, x: 20, y: 30, lineHeight: 60, font: '^CFV' })
          const zpl = `^XA
^PW${pw}
^LL${isLarge ? 200 : 130}
${this.labelHome(isLarge, 0, -10)}
^LS0
^LT0
${fields}
^XZ`
          if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
          return
        }
        const lines = twoLineMap[val]
        if (!lines) return
        const zpl = `^XA
^PW${pw}
^LL${isLarge ? 200 : 130}
${this.labelHome(isLarge, 0, -10)}
^LS0
^LT0
${isLarge ? `^CF0,80^FO10,20^FD${lines.line1}^FS` : `^CFV^FO20,30^FD${lines.line1}^FS`}
${isLarge ? `^CF0,70^FO10,110^FD${lines.line2}^FS` : `^CFV^FO20,90^FD${lines.line2}^FS`}
^XZ`
        if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
      })
    },
    filterByShift(times, shift) {
      return filterTimesByShift(times, shift, this.shifts)
    },
    matchesCondition(med, dateOverride) {
      const cond = med.condition || 'standard'
      const data = med.conditionData || {}
      if (cond === 'standard') return true
      const ref = dateOverride || (this.referenceDate ? new Date(this.referenceDate + 'T00:00:00') : new Date())
      if (cond === 'weekdays') {
        if (!data.days || data.days.length === 0) return false
        const uiDay = ref.getDay()
        const jsToUi = [6, 0, 1, 2, 3, 4, 5]
        return data.days.includes(jsToUi[uiDay])
      }
      if (cond === 'dateRange') {
        if (!data.start || !data.end) return false
        const start = new Date(data.start + 'T00:00:00')
        const end = new Date(data.end + 'T00:00:00')
        end.setHours(23, 59, 59)
        return ref >= start && ref <= end
      }
      if (cond === 'everyX') {
        if (!data.x || !med.startDate) return false
        const start = new Date(med.startDate + 'T00:00:00')
        const diff = Math.floor((ref - start) / (1000 * 60 * 60 * 24))
        return diff >= 0 && diff % data.x === 0
      }
      if (cond === 'xGiveYWait') {
        if (!data.give || !data.wait || !med.startDate) return false
        const start = new Date(med.startDate + 'T00:00:00')
        const diff = Math.floor((ref - start) / (1000 * 60 * 60 * 24))
        if (diff < 0) return false
        const cycle = data.give + data.wait
        const pos = diff % cycle
        return pos < data.give
      }
      return false
    },
    toggleAllTedavi() {
      this.tedaviModal.selectedPatients = this.tedaviAllSelected ? [] : this.activePatients.map(p => p.id)
    },
    printTedavi() {
      const { selectedPatients, sortBy, mixPatients, groupByRoute } = this.tedaviModal
      const isLarge = this.labelSize === 'buyuk'
      const pw = isLarge ? '450' : '380'
      const jobs = []

      selectedPatients.forEach((patientId, patientOrder) => {
        const patient = this.patients.find(p => p.id === patientId)
        if (!patient) return
        const patientMeds = this.meds.filter(m => m.patientId === patientId)

        patientMeds.forEach(med => {
          if (med.luezym || !this.matchesCondition(med)) return
          const times = med.times.split(',').map(t => t.trim()).filter(Boolean)
          const shiftTimes = this.filterByShift(times, this.shift)

          shiftTimes.forEach(time => {
            jobs.push({
              patient,
              patientName: patient.name,
              patientOrder,
              med,
              displayName: this.medDisplayName(med),
              route: med.route || 'DGR',
              time
            })
          })
        })
      })

      const activeShift = this.shifts.find(shift => shift.id === this.shift)
      const sortedJobs = sortTreatmentLabelJobs(jobs, {
        sortBy,
        mixPatients,
        groupByRoute,
        shiftStart: activeShift?.start || '00:00',
        routeOrder: this.routes.map(route => route.val)
      })

      sortedJobs.forEach(({ patient, med, time, displayName }) => {
        const [hour, minute] = time.split(':')
        const smallLabelName = buildSmallTreatmentLabelName(displayName)
        const zpl = `^XA
^PW${pw}
^LL${isLarge ? 260 : 140}
${this.labelHome(isLarge, 10, 10)}
^LS0
^LT0
${isLarge
  ? `^ADN,40,20^FO0,20^FD${patient.name}^FS`
  : `^ADN,29,16^FO0,0^FD${patient.name}^FS`}
${isLarge
  ? `^ADN,40,20^FO0,70^FD${displayName.substring(0, 12)}^FS^ADN,40,20^FO0,120^FD${med.dose}^FS^ADN,40,20^FO0,170^FD${med.route}^FS^ADN,80,50^FO320,60^FD${hour}^FS^ADN,80,50^FO320,120^FD${minute}^FS`
  : `^ADN,29,16^FO0,41^FD${smallLabelName}^FS^ADN,29,16^FO0,82^FD${med.dose}^FS^ADN,50,30^FO200,87^FD${hour}^FS^ADN,27,16^FO270,86^FD${minute}^FS^ADN,18,10^FO270,121^FB60,1,0,L,0^FD${med.route}^FS`}
${buildTreatmentLabelDetailField(med.catalogLabelDetail, isLarge, !!med.catalogLabelDetailEnabled)}
^XZ`
        if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
      })

      this.tedaviModal.open = false
    },
    printOzel() {
      const text = this.ozelModal.text.trim()
      if (!text) return
      const lines = text.split('\n').filter(Boolean)
      const isLarge = this.labelSize === 'buyuk'
      const pw = isLarge ? '450' : '380'
      const marginX = isLarge ? 20 : 30
      const startY = 20
      const topFont = isLarge ? 50 : 36
      const rowH = isLarge ? 48 : 34
      const ll = isLarge ? 60 + lines.length * rowH : 40 + lines.length * rowH
      let zpl = `^XA\n^PW${pw}\n^LL${ll}\n${this.labelHome(isLarge)}\n^LS0\n^LT0\n`
      lines.forEach((line, i) => {
        zpl += `^CF0,${topFont}^FO${marginX},${startY + i * rowH}^FD${this.sanitize(line)}^FS\n`
      })
      zpl += `^XZ`
      if (window.electronAPI) window.electronAPI.printLabel(this.sanitize(zpl))
      this.ozelModal.open = false
    },
    generateSema(patientId, allApplications = false) {
      const patient = this.patients.find(p => p.id === patientId)
      if (!patient) return ''
      const hours = allApplications ? Array.from({ length: 24 }, (_, index) => index + 1) : shiftHourColumns(this.shift, this.shifts)
      if (!hours.length) return ''
      const ref = this.referenceDate ? new Date(this.referenceDate + 'T00:00:00') : new Date()
      const medications = []
      this.meds.filter(med => med.patientId === patientId).forEach(med => {
        if (!allApplications && (med.luezym || !this.matchesCondition(med))) return
        const allTimes = String(med.times || '').split(',').map(time => time.trim()).filter(Boolean)
        const times = allApplications ? allTimes : this.filterByShift(allTimes, this.shift)
        if (!allApplications && !times.length) return
        const treatmentDay = allApplications && med.startDate ? Number(this.medDay(med)) : 0
        medications.push({
          name: this.medDisplayName(med), dose: med.dose || '', route: med.route,
          times, asNeeded: Boolean(med.luezym),
          note: allApplications ? [med.note || '', treatmentDay > 0 ? `(${treatmentDay}.gün)` : ''].filter(Boolean).join(' ') : ''
        })
      })
      return buildTreatmentSheet({
        patientName: patient.patient_no ? `${patient.name} (${patient.patient_no})` : patient.name,
        date: ref.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }),
        title: allApplications ? 'KARTEKS' : `[${this.activeShiftName}] TEDAVİ ŞEMASI`,
        hours, medications, routes: this.routes
      })
    },
    printSema() {
      const { selectedPatients } = this.semaModal
      if (!selectedPatients.length) { this.semaModal.open = false; return }
      const parts = []
      selectedPatients.forEach(pid => {
        const html = this.generateSema(pid)
        if (html) parts.push(html)
      })
      if (window.electronAPI) {
        parts.forEach(html => window.electronAPI.printHtml(html, { landscape: true }))
      }
      this.semaModal.open = false
    },
    printKarteks(patient) {
      const html = this.generateSema(patient.id, true)
      if (html && window.electronAPI) window.electronAPI.printHtml(html, { landscape: true })
    },
    printKarteksSelected() {
      const { selectedPatients } = this.karteksModal
      selectedPatients.forEach(pid => {
        const p = this.patients.find(x => x.id === pid)
        if (p) this.printKarteks(p)
      })
      this.karteksModal.open = false
    },
    toggleTaburcuMed(medId) {
      const idx = this.taburcuModal.selectedMeds.indexOf(medId)
      if (idx > -1) {
        this.taburcuModal.selectedMeds.splice(idx, 1)
        const n = { ...this.taburcuModal.notes }; delete n[medId]; this.taburcuModal.notes = n
        const d = { ...this.taburcuModal.doseNotes }; delete d[medId]; this.taburcuModal.doseNotes = d
        const s = { ...this.taburcuModal.skipMuadil }; delete s[medId]; this.taburcuModal.skipMuadil = s
      } else {
        this.taburcuModal.selectedMeds.push(medId)
        this.taburcuModal.notes = { ...this.taburcuModal.notes, [medId]: '' }
        this.taburcuModal.doseNotes = { ...this.taburcuModal.doseNotes, [medId]: '' }
      }
    },
    getDoseInstruction(dose, times, route) {
      const timesArr = (times || '').split(',').map(t => t.trim()).filter(Boolean)
      const count = timesArr.length || 1
      const routeMap = { PO: 'içiriniz', IV: 'uygulayınız', IM: 'uygulayınız', SC: 'uygulayınız', TOP: 'uygulayınız', SL: 'eritiniz', PR: 'uygulayınız', INH: 'uygulayınız' }
      const verb = routeMap[route] || 'kullanınız'
      return `${dose} dozunda günde ${count} kez ${verb}.`
    },
    getMuadilList(activeIngredient, route) {
      const key = (activeIngredient || '').toLowerCase().trim() + '|' + (route || '').toLowerCase().trim()
      const all = this.drugFullNameMap[key]
      if (!all || !all.length) return []
      return all.slice(0, 5)
    },
    printTaburcu() {
      const patient = this.selectedPatient
      if (!patient) return
      const selectedMeds = this.patientMeds.filter(m => this.taburcuModal.selectedMeds.includes(m.id))
      if (!selectedMeds.length) return

      const today = new Date()
      const dateStr = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

      let rows = ''
      selectedMeds.forEach((m, idx) => {
        const muadiller = this.taburcuModal.skipMuadil[m.id] ? [] : this.getMuadilList(m.activeIngredient, m.route)
        const note = this.taburcuModal.notes[m.id] || ''
        const doseNote = this.taburcuModal.doseNotes[m.id] || ''
        const instruction = this.getDoseInstruction(m.dose, m.times, m.route) +
          (doseNote ? '<br>' + esc(doseNote) : '')
        rows += `<tr>
          <td>${idx + 1}</td>
          <td>
            <div style="font-weight:600">${esc(this.medDisplayName(m))}</div>
            <div style="font-size:11px;color:#666">${esc(m.activeIngredient || '')} · ${esc(m.dose || '')}</div>
          </td>
          <td>${instruction}</td>
          <td class="mono" style="font-size:12px">${esc(m.times)}</td>
          <td style="font-size:11px">${muadiller.length ? muadiller.map(esc).join(', ') : '|'}</td>
          <td>${esc(note)}</td>
        </tr>`
      })

      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Taburcu Ilac Plani - ${esc(patient.name)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; margin: 20px; color: #1B1B2F; }
  .taburcu-header { display: flex; justify-content: space-between; align-items: stretch; margin-bottom: 16px; }
  .taburcu-patient { display: flex; flex-direction: column; justify-content: center; }
  .taburcu-name { font-size: 16px; font-weight: 700; }
  .taburcu-date { color: #888; font-size: 11px; }
  .taburcu-title { display: flex; align-items: center; font-size: 28px; font-weight: 900; color: #1B1B2F; letter-spacing: 3px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #555; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #1B1B2F; color: #fff; font-size: 12px; font-weight: 600; }
  td { font-size: 12px; }
  .mono { font-family: 'Consolas', monospace; }
  @page { size: landscape; }
  @media print { body { margin: 15px; } }
</style></head>
<body>
  <div class="taburcu-header">
    <div class="taburcu-patient">
      <div class="taburcu-name">${esc(patient.patient_no ? `${patient.name} (${patient.patient_no})` : patient.name)}</div>
      <div class="taburcu-date">${dateStr}</div>
    </div>
    <div class="taburcu-title">TABURCU İLAÇ PLANI</div>
  </div>
  <table>
    <thead><tr><th style="width:4%">#</th><th style="width:16%">İlaç</th><th style="width:26%">Kullanım Talimatı</th><th style="width:8%">Klinik Saatleri</th><th style="width:14%">Muadiller</th><th style="width:32%">Not</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`
      if (window.electronAPI) window.electronAPI.printHtml(html)
      this.taburcuModal.open = false
    },
    toggleConflictIgnore(activeIng) {
      const existing = this.conflictIgnoreActives.find(a => a.toLowerCase().trim() === activeIng.toLowerCase().trim())
      if (existing) {
        const idx = this.conflictIgnoreActives.indexOf(existing)
        this.conflictIgnoreActives.splice(idx, 1)
      } else {
        this.conflictIgnoreActives.push(activeIng)
      }
      if (window.electronAPI) window.electronAPI.configSet('conflictIgnoreActives', JSON.parse(JSON.stringify(this.conflictIgnoreActives)))
      if (this.autoSched.open && this.autoSched.step === 'select') this.refreshAutoSchedRows()
    },
    refreshAutoSchedRows() {
      const oldRows = new Map(this.autoSched.rows.map(r => [r.medId, r]))
      const rows = this.ivMeds.map(m => {
        const old = oldRows.get(m.id)
        const existingTimes = m.times ? m.times.split(',').map(t => t.trim()).filter(Boolean) : []
        const dc = this.parseDoseCount(m)
        return {
          medId: m.id,
          name: m.name,
          dose: m.dose || '',
          doseCount: dc,
          isFixed: old ? old.isFixed : false,
          fixedTimes: existingTimes.slice(),
          infusionMin: old ? old.infusionMin : 60,
          doseIntervalHours: old ? old.doseIntervalHours : this.defaultDoseInterval(dc)
        }
      })
      const rowIds = new Set(rows.map(r => r.medId))
      this.autoSched.rows = rows
      this.autoSched.selectedIds = this.autoSched.selectedIds.filter(id => rowIds.has(id))
    },
    isIgnored(activeIng) {
      return this.conflictIgnoreActives.some(a => a.toLowerCase().trim() === activeIng.toLowerCase().trim())
    },
    printCabinetList() {
      const drugs = this.stokModal.drugs
      if (!drugs || !drugs.length) return
      const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      const today = new Date()
      const dateStr = today.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
      let rows = ''
      drugs.forEach(d => {
        const p = this._parseExpiry(d.expiry)
        const now = new Date()
        const exp = p ? new Date(p.year, p.month, 0) : null
        const expired = exp && exp < now
        const monthsLeft = exp ? (exp.getFullYear() * 12 + exp.getMonth()) - (now.getFullYear() * 12 + now.getMonth()) : 99
        let warning = ''
        if (expired) warning = '! SKT GEÇMİŞ! '
        else if (monthsLeft <= 3) warning = `! Miyadına son ${monthsLeft} ay! `
        rows += `<tr${expired || monthsLeft <= 3 ? ' class="warn"' : ''}>
          <td>${esc(d.quantity)} ${esc(d.unit)}</td>
          <td>${esc(d.dose)}</td>
          <td>${esc(d.name)}</td>
          <td>${esc(d.form)}</td>
          <td class="mono">${warning}${this.formatExpiry(d.expiry)}</td>
        </tr>`
      })
      const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${esc(this.stokModal.selectedCabinet.name)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; margin: 20px; color: #1B1B2F; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .date { color: #888; font-size: 11px; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #333; padding: 5px 8px; text-align: left; }
  th { background: #1B1B2F; color: #fff; font-size: 11px; }
  td { font-size: 12px; }
  .mono { font-family: 'Consolas', monospace; font-size: 11px; }
  .warn { background: #E8E8E8; }
  @media print { body { margin: 10px; } }
</style></head>
<body>
  <h1>${esc(this.stokModal.selectedCabinet.name)}</h1>
  <div class="date">${dateStr}</div>
  <table>
    <thead><tr><th>Adet</th><th>Doz</th><th>İlaç Adı</th><th>Yol</th><th>SKT</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body></html>`
      if (window.electronAPI) window.electronAPI.printHtml(html)
    },
    windowMinimize() { window.electronAPI?.minimize() },
    windowMaximize() { window.electronAPI?.maximize() },
    windowClose() { window.electronAPI?.close() },
    reloadPage() {
      if (window.electronAPI) window.electronAPI.reloadApp()
      else location.reload()
    },
    toggleSettingsMenu() {
      this.settingsMenuOpen = !this.settingsMenuOpen
      this.printOpen = false
    },
    openDosageSettings() {
      this.settingsMenuOpen = false
      this.dosageManagerOpen = true
    },
    async openSettings(section) {
      this.settingsMenuOpen = false
      this.settingsSection = section
      this.apiSettingsError = ''
      this.shiftSettingsError = ''
      if (section === 'shifts') this.shiftSettingsDraft = this.shifts.map(shift => ({ ...shift }))
      this.settingsOpen = true
      if (window.electronAPI) {
        if (section === 'printer') {
          this.printerName = await window.electronAPI.getPrinterName()
          this.printerList = await window.electronAPI.getPrinters()
        } else if (section === 'api') {
          const cfg = await window.electronAPI.configGetAll()
          this.apiUrl = apiAddressForDisplay(cfg.apiUrl || 'https://tedavi.dislek.com')
          this.apiKeyConfigured = Boolean(cfg.apiKeyConfigured)
          this.apiKeyInput = ''
        }
      }
    },
    openCatalogDrugReport(drug) {
      if (!drug) return
      this.catalogModalOpen = false
      this.catalogInitialQuery = ''
      this.openReportModal(drug)
    },
    async saveSettings() {
      if (this.settingsSection === 'shifts') {
        const validation = validateShifts(this.shiftSettingsDraft)
        if (!validation.valid) {
          this.shiftSettingsError = validation.error
          return
        }
        const shifts = normalizeShifts(this.shiftSettingsDraft)
        if (window.electronAPI) await window.electronAPI.configSet('shifts', JSON.parse(JSON.stringify(shifts)))
        this.shifts = shifts
        this.shift = shiftForTime(new Date(), shifts)
        this.settingsOpen = false
        return
      }
      if (window.electronAPI) {
        if (this.settingsSection === 'printer') {
          await window.electronAPI.setPrinterName(this.printerName.trim() || 'USBBARKOD')
          this.smallLabelOffsetX = normalizeLabelOffset(this.smallLabelOffsetX, 45)
          this.smallLabelOffsetY = normalizeLabelOffset(this.smallLabelOffsetY, 15)
          this.largeLabelOffsetX = normalizeLabelOffset(this.largeLabelOffsetX, 0)
          this.largeLabelOffsetY = normalizeLabelOffset(this.largeLabelOffsetY, 0)
          await Promise.all([
            window.electronAPI.configSet('smallLabelOffsetX', this.smallLabelOffsetX),
            window.electronAPI.configSet('smallLabelOffsetY', this.smallLabelOffsetY),
            window.electronAPI.configSet('largeLabelOffsetX', this.largeLabelOffsetX),
            window.electronAPI.configSet('largeLabelOffsetY', this.largeLabelOffsetY)
          ])
        } else if (this.settingsSection === 'api') {
          const previousUrl = (await window.electronAPI.configGetAll()).apiUrl
          const result = await window.electronAPI.changeApiUrl(this.apiUrl)
          if (!result?.success) {
            this.apiUrl = apiAddressForDisplay(previousUrl)
            this.apiSettingsError = result?.error || 'API adresi doğrulanamadı.'
            return
          } else if (this.apiKeyInput.trim()) {
            try {
              await window.electronAPI.configSet('apiKey', this.apiKeyInput.trim())
              this.apiKeyConfigured = true
              this.apiKeyInput = ''
            } catch (error) {
              this.apiSettingsError = error.message || 'API anahtarı doğrulanamadı.'
              return
            }
          }
          await this.loadClientMenuVisibility(true)
        }
      }
      this.settingsOpen = false
    },
    resetShiftSettings() {
      this.shiftSettingsDraft = cloneDefaultShifts()
      this.shiftSettingsError = ''
    },
    async openCatalogModal() {
      if (this.catalogConnectionChecking || this.catalogModalOpen) return
      this.catalogConnectionChecking = true
      this.catalogConnectionWarning = { open: false, message: '' }
      try {
        const online = await window.electronAPI?.checkInternetConnection?.()
        if (!online) {
          this.catalogConnectionWarning = {
            open: true,
            message: 'İlaç Kataloğu için internet bağlantısı gerekiyor. Bağlantınızı kontrol edip tekrar deneyin.'
          }
          return
        }
        this.catalogModalOpen = true
      } catch (_) {
        this.catalogConnectionWarning = {
          open: true,
          message: 'İnternet bağlantısı kontrol edilemedi. Bağlantınızı kontrol edip tekrar deneyin.'
        }
      } finally {
        this.catalogConnectionChecking = false
      }
    },
    closeCatalogConnectionWarning() {
      this.catalogConnectionWarning = { open: false, message: '' }
    },
    openCatalogContextMenu({ event, drug } = {}) {
      if (!event || !drug) return
      this.openCtx(event, 'catalog', drug)
    },
    openCtx(e, type, item) {
      const maxX = window.innerWidth - 160
      const maxY = window.innerHeight - 120
      this.ctx = {
        show: true,
        x: Math.min(e.clientX, maxX),
        y: Math.min(e.clientY, maxY),
        header: type === 'catalog' ? (item.full_name || item.label || item.active_ingredient) : item.name,
        items: type === 'patient' ? [
          { label: 'Bilgileri Düzenle', action: () => this.openPatientModal(item), success: true },
          { label: 'Arşive Gönder', action: () => this.archivePatient(item.id) },
          { label: 'Tedavileri Sıfırla', action: () => this.openResetModal(item), danger: true },
          { label: 'Hastayı Kaldır', action: () => this.removePatient(item.id), danger: true }
        ] : type === 'catalog' ? this.catalogContextItems(item) : [
          { label: 'Etiket Bas', action: () => this.printLabel(item) },
          { label: 'Katalogda Bul', action: () => this.openDrugInCatalog(item), success: true },
          { label: 'Sil', action: () => this.removeMed(item.id), danger: true }
        ]
      }
    },
    catalogContextItems(drug) {
      const productName = String(drug?.full_name || drug?.label || '').trim()
      const activeIngredient = String(drug?.active_ingredient || '').trim()
      const barcode = String(drug?.barcode || '').trim()
      return [
        { label: 'Ürün adını kopyala', action: () => this.copyText(productName), disabled: !productName },
        { label: 'Etken maddeyi kopyala', action: () => this.copyText(activeIngredient), disabled: !activeIngredient },
        { label: 'Barkodu kopyala', action: () => this.copyText(barcode), disabled: !barcode }
      ]
    },
    runContextAction(item) {
      if (item?.disabled) return
      item?.action?.()
      this.ctx.show = false
    },
    async copyText(value) {
      const text = String(value || '').trim()
      if (!text) return
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text)
          return
        }
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        textarea.remove()
      } catch (_) {
        // Clipboard erişimi engellenirse menü sessizce kapanır.
      }
    },
    openDrugInCatalog(med) {
      this.catalogInitialQuery = String(med?.name || med?.activeIngredient || '').trim()
      this.openCatalogModal()
    },
    async openDrugProspectus(med) {
      if (!window.electronAPI || !med || this.prospectusLoading) return
      this.prospectusWarning = { open: false, message: '' }
      this.prospectusLoading = true
      try {
        const options = await window.electronAPI.dbGetDrugProspectusOptions(med.name, med.route || '')
        if (options.length > 1) {
          this.prospectusLoading = false
          this.prospectusChoice = { open: true, med, options, selected: '' }
          return
        }
        await this.searchDrugProspectus(med, options[0] || '')
      } catch (error) {
        this.prospectusWarning = { open: true, message: 'İlaç seçenekleri kontrol edilirken bir hata oluştu.' }
      } finally {
        if (!this.prospectusChoice.open) this.prospectusLoading = false
      }
    },
    closeProspectusChoice() {
      this.prospectusChoice = { open: false, med: null, options: [], selected: '' }
    },
    async confirmProspectusChoice() {
      const med = this.prospectusChoice.med
      const fullName = this.prospectusChoice.selected
      if (!med || !fullName) return
      this.closeProspectusChoice()
      await this.searchDrugProspectus(med, fullName)
    },
    async searchDrugProspectus(med, fullName = '') {
      this.prospectusLoading = true
      try {
        const result = await window.electronAPI.openDrugProspectus(med.name, med.activeIngredient || '', med.route || '', fullName)
        if (!result?.success) {
          this.prospectusWarning = { open: true, message: result?.error || 'Prospektüs araması tamamlanamadı.' }
        }
      } catch (error) {
        this.prospectusWarning = { open: true, message: 'Prospektüs araması sırasında bir hata oluştu.' }
      } finally {
        this.prospectusLoading = false
      }
    },
    onKeyDown(e) {
      if (e.key === 'Tab') { e.preventDefault(); return }
      if (e.key === 'F11') {
        e.preventDefault()
        window.electronAPI?.toggleDevTools()
      }
    },

    openReminderModal() {
      this.reminderModal.open = true
    },
    async saveReminders() {
      if (!window.electronAPI) return
      const saved = await window.electronAPI.saveReminders(JSON.parse(JSON.stringify(this.reminders)))
      if (Array.isArray(saved)) this.reminders = saved
    },
    saveCalendarNotes() {
      if (window.electronAPI) window.electronAPI.configSet('calendarNotes', JSON.parse(JSON.stringify(this.calendarNotes)))
    },
    saveCalendarNote(note) {
      const date = String(note?.date || '')
      const text = String(note?.text || '').trim()
      if (!date || !text) return
      this.calendarNotes.push({ date, text })
      this.calendarNotes.sort((a, b) => String(a.date).localeCompare(String(b.date)))
      this.saveCalendarNotes()
    },
    removeCalendarNote(idx) {
      this.calendarNotes.splice(idx, 1)
      this.saveCalendarNotes()
    },
    saveReminder(reminder) {
      const dt = String(reminder?.datetime || '')
      const txt = String(reminder?.text || '').trim()
      if (!dt || !txt) return
      this.reminders.push({ datetime: dt, text: txt })
      this.reminders.sort((a, b) => String(a.datetime).localeCompare(String(b.datetime)))
      this.saveReminders()
    },
    removeReminder(idx) {
      this.reminders.splice(idx, 1)
      this.saveReminders()
    },
    activateReminder(reminder) {
      if (!reminder || this.activeReminder?.id === reminder.id) return
      this.activeReminder = reminder
      this.beep()
    },
    async dismissReminder() {
      const reminderId = this.activeReminder?.id
      this.activeReminder = null
      if (this._alarm) {
        this._alarm.pause()
        this._alarm = null
      }
      if (reminderId && window.electronAPI?.acknowledgeReminder) {
        const saved = await window.electronAPI.acknowledgeReminder(reminderId)
        if (Array.isArray(saved)) this.reminders = saved
      }
    },
    formatReminderDate(iso) {
      if (!iso) return ''
      const date = new Date(iso)
      if (Number.isNaN(date.getTime())) return iso
      return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
    },
    beep() {
      try {
        this._alarm = new Audio('/alarm.wav')
        this._alarm.loop = true
        this._alarm.volume = 0.7
        this._alarm.play()
      } catch (_) {}
    },
  }
}
</script>

<style>
@import '../electron/main.css';
* { margin: 0; padding: 0; box-sizing: border-box; user-select: none; }


body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  background: #F5F3EE;
  color: #1B1B2F;
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  overflow: hidden; 
}
.mono { font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace; letter-spacing: .01em; }
.note-icons { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; margin-top: 2px; }
.empty-file-icon { opacity: .3; }

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  border: 3px solid #412f66;
}

/* ---- Titlebar ---- */
.titlebar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  background: #1B1B2F;
  color: #C8C8D8;
  flex-shrink: 0;
  
}
.titlebar-drag {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}
.titlebar-text { font-size: 12px; font-weight: 500; letter-spacing: .01em; }
.titlebar-tools {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}
.titlebar-text {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
  white-space: nowrap;
}
.titlebar-actions { display: flex; height: 100%; -webkit-app-region: no-drag; }
.clinic-bar { height: 20px; display: flex; align-items: center; justify-content: center; padding: 0 12px; background: #f4f0f8; border-bottom: 1px solid #ddd2e8; color: #6b587c; font-size: 10px; font-weight: 600; letter-spacing: .02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.settings-dropdown {
  position: relative;
  height: 100%;
  -webkit-app-region: no-drag;
}
.settings-menu {
  top: 100%;
  right: 0;
  left: auto;
  margin-top: 4px;
}
.tb-refresh { -webkit-app-region: no-drag; }
.tb-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 100%;
  border: none;
  background: transparent;
  color: #C8C8D8;
  cursor: pointer;
  transition: background .12s;
}
.tb-btn:hover { background: rgba(255,255,255,.1); }
.tb-close:hover { background: #D45757; color: #fff; }

/* ---- Header ---- */
.header {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E2E0DA;
  flex-shrink: 0;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header h1 {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: -.01em;
}
.shift-select {
  padding: 5px 28px 5px 12px; border: 1px solid #E2E0DA; border-radius: 6px;
  font-size: 13px; font-weight: 500; font-family: inherit; color: #1B1B2F;
  background: #FAF9F6 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235E5E7A'/%3E%3C/svg%3E") no-repeat right 10px center;
  appearance: none; cursor: pointer; transition: border-color .15s;
}
.shift-select:focus { outline: none; border-color: #7C5CBF; }
.date-input {
  padding: 5px 12px; border: 1px solid #E2E0DA; border-radius: 6px;
  font-size: 13px; font-weight: 500; font-family: inherit; color: #1B1B2F;
  background: #FAF9F6; cursor: pointer; transition: border-color .15s;
}
.date-input:focus { outline: none; border-color: #7C5CBF; }
.header-center { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.print-dropdown { position: relative; }
.print-menu {
  position: absolute; top: 100%; left: 0; margin-top: 4px;
  background: #fff; border: 1px solid #E2E0DA; border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.1); padding: 4px; min-width: 180px; z-index: 10000;
}
.print-menu-item {
  display: block; width: 100%; padding: 7px 12px; border: none; background: none;
  text-align: left; font-size: 12px; cursor: pointer !important; border-radius: 4px;
  font-family: inherit; color: #1B1B2F; white-space: nowrap; transition: background .1s;
}
.print-menu-item:hover { background: #EDEAF5 !important; color: #7C5CBF; }
.print-menu-item.success { color: #1B7B3D; }
.print-menu-item.success:hover { background: #E8F5E9 !important; color: #1B7B3D; }
.print-menu-sep { height: 1px; background: #E2E0DA; margin: 4px 8px; }
.icon-badge { display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; border-radius: 3px; flex-shrink: 0; }
.icon-warn { background: #E8A523; color: #fff; }
.icon-dup { background: #E8A523; color: #fff; }
.icon-expired { background: #BF7A1A; color: #fff; }
.icon-overdose { background: #E74C3C; color: #fff; }
.prop-cold { background: #E8F4FD; color: #2196F3; }
.prop-haz { background: #FDEDE8; color: #E74C3C; }
.prop-risk { background: #FFF8E1; color: #F57F17; }
.prop-light-drug { background: #6B7280; color: #FFFFFF; }
.prop-light-infusion { background: #FFF8D6; color: #E5A500; }
.prop-narcotic { background: #F4E8EC; color: #7A1733; }
.prop-vesicant { background: #FCE8E6; color: #B42318; }
.prop-central { background: #E8F0FE; color: #2457A7; }
.prop-iv-push { background: #FFF0E1; color: #B54708; }
.prop-filter { background: #E5F6F4; color: #087F75; }
.prop-crush { background: #F3E8FF; color: #7E22CE; }
.prop-taper { background: #EAF4E2; color: #397A22; }
.prop-anaphylaxis { background: #FDECEC; color: #C1152F; }
.prop-similar-name { background: #FFF4CC; color: #8A5B00; }
.prop-stability { background: #E8EEF8; color: #315A91; }
.prop-note { background: #F0ECF8; color: #7C5CBF; }

/* ---- Panel ---- */
.panel {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.statusbar {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 28px;
  padding: 0 12px;
  border-top: 1px solid #D9D2E5;
  background: #F4F1F8;
  color: #6C6478;
  font-size: 11px;
  flex-shrink: 0;
}
.statusbar-catalog {
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #4F3B72;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.statusbar-catalog:hover {
  background: #E9E3F1;
}
.statusbar-catalog:disabled {
  cursor: wait;
  opacity: .65;
}
.statusbar-catalog:focus-visible {
  outline: 2px solid #7C5CBF;
}
.statusbar-clock {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #4F3B72;
  font: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  cursor: pointer;
}
.statusbar-clock:hover {
  background: #E9E3F1;
}
.statusbar-clock:focus-visible {
  outline: 2px solid #7C5CBF;
}
.statusbar-connection {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
  padding: 3px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #4F3B72;
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: color .18s ease, background .18s ease;
}
.statusbar-connection:hover {
  background: #E9E3F1;
}
.statusbar-connection:focus-visible {
  outline: 2px solid #7C5CBF;
  outline-offset: -2px;
}
.panel-left {
  width: 200px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #E2E0DA;
  background: #FAF9F6;
}
.panel-right {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
}
.panel-right * {
 user-select: text !important;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 60px;
  padding: 12px 16px;
  border-bottom: 1px solid #E2E0DA;
  background: #FFFFFF;
  flex-shrink: 0;
}
.panel-header h2 {
  font-size: 13px;
  font-weight: 600;
  color: #1B7B3D;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.panel-left .panel-header.btn-header {
  background: #7C5CBF;
  color: #fff;
  justify-content: center;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  font-weight: 500;
  gap: 6px;
}
.panel-left .panel-header.btn-header:hover { background: #6A4DA8; }
.panel-right .panel-header h2 {
  font-size: 17px;
}
.header-actions {
  display: flex;
  gap: 6px;
}

/* ---- Buttons ---- */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background .15s, opacity .15s;
  font-family: inherit;
}
.btn:disabled { opacity: .4; cursor: default; }
.btn-primary { background: #7C5CBF; color: #fff; }
.btn-primary:hover:not(:disabled) { background: #6A4DA8; }
.btn-danger { background: #D45757; color: #fff; }
.btn-danger:hover:not(:disabled) { background: #B33D3D; }
.btn-secondary { background: #E8E4DE; color: #1B1B2F; }
.btn-secondary:hover:not(:disabled) { background: #DCD7CE; }
.btn-ghost { background: transparent; color: #5E5E7A; }
.btn-ghost:hover { background: #E8E4DE; }
.selected-radio { background: #E8F0FE !important; outline: 2px solid #1A56DB; }
.btn-sm { padding: 4px 10px; font-size: 12px; }
.btn-xs { padding: 2px 8px; font-size: 11px; background: transparent; color: #7C5CBF; border: 1px solid #7C5CBF; border-radius: 4px; }
.btn-xs:hover { background: #7C5CBF; color: #fff; }

/* ---- Patient List ---- */
.patient-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}
.patient-item {
  padding: 10px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background .12s;
}
.patient-item:hover { background: #E8E4DE; }
.patient-item.active {
  background: #7C5CBF;
  color: #fff;
}
.empty, .empty-state {
  padding: 24px;
  text-align: center;
  color: #7C5CBF;
  font-size: 13px;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  justify-content: center;
  height: 100%;
  padding: 60px 20px;
}

/* ---- Table ---- */
.mayi-bar {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 12px; margin: 0 0 4px 0;
  background: #E8F5E9; border-radius: 6px;
  font-size: 13px; color: #2E7D32;
}
.inf-bar {
  background: #F0ECF8; color: #4A3880;
}
.mayi-text { flex: 1; }
.icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 4px;
  background: transparent; cursor: pointer; color: #555;
}
.icon-btn:hover { background: rgba(0,0,0,0.08); }
.icon-btn.with-label { width: auto; gap: 4px; padding: 0 6px; font-size: 12px; }
.med-table-wrap {
  flex: 1;
  overflow: auto;
  position: relative;
}
.drug-props-loading {
  min-height: 150px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #7561A8;
  font-size: 13px;
  font-weight: 600;
  cursor: default !important;
}
.drug-props-loading .spin {
  animation: prospectus-spin .9s linear infinite;
}
.med-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  table-layout: fixed;
}
.med-table th {
  text-align: left;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #5E5E7A;
  background: #FAF9F6;
  border-bottom: 1px solid #E2E0DA;
  position: sticky;
  top: 0;
}
.med-table td {
  padding: 10px 14px;
  border-bottom: 1px solid #F0EEE8;
  user-select: none;
}
.med-table td.trunc {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drug-cell {
  overflow: hidden;
}
.drug-cell-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.drug-name {
  font-weight: 600;
  font-size: 13px;
  color: #1B1B2F;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drug-name-muadil {
  display: inline-flex;
  flex: 0 0 auto;
  color: #7561A8;
  cursor: help;
}
.drug-name-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drug-active-ing {
  font-size: 11px;
  color: #9E9EB0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}
.med-table tbody tr:hover { background: #F8F6F0; }
.badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 4px;
  background: #EDEAF5;
  color: #7C5CBF;
  font-size: 11px;
  font-weight: 600;
}
.badge.danger { background: #D45757; color: #FFFFFF; }
.time-badges { display: flex; flex-wrap: wrap; gap: 4px; }

/* ---- Tabs ---- */
.tabs { display: flex; border-bottom: 1px solid #E2E0DA; }
.tab-btn {
  flex: 1; padding: 10px 12px; border: none; background: none; cursor: pointer;
  font-size: 12px; font-family: inherit; color: #888; border-bottom: 2px solid transparent;
  transition: color .15s, border-color .15s; font-weight: 500;
}
.tab-btn:hover { color: #1B1B2F; }
.tab-btn.active { color: #7C5CBF; border-bottom-color: #7C5CBF; font-weight: 600; }

/* ---- Context Menu ---- */
.ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
}
.ctx-menu {
  position: fixed;
  z-index: 10000;
  background: #FFFFFF;
  border: 1px solid #E2E0DA;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0,0,0,.1);
  padding: 4px;
  min-width: 150px;
}
.ctx-header {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 700;
  color: #7C5CBF;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid #EDEAF5;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 180px;
}
.ctx-item {
  display: block;
  width: 100%;
  padding: 7px 12px;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  cursor: pointer;
  border-radius: 4px;
  font-family: inherit;
  color: #1B1B2F;
}
.ctx-item:hover { background: #F0EEE8; }
.ctx-item:disabled { color: #B8B5AE; cursor: not-allowed; }
.ctx-item:disabled:hover { background: none; }
.ctx-item.danger { color: #D45757; }
.ctx-item.danger:hover { background: #FDE8E8; }
.ctx-item.success { color: #1B7B3D; }
.ctx-item.success:hover { background: #E8F5E9; }

/* ---- Modal ---- */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.3);
  z-index: 2000;
}
.priority-alert-overlay,
.modal-overlay[class*="warning-overlay"] { z-index: 20000 !important; }
.priority-alert-modal,
.modal[class*="warning-modal"] { z-index: 20001 !important; }
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0,0,0,.15);
  width: 640px;
  max-width: 90vw;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  z-index: 3000;
}
.modal-lg { width: 640px; }
.modal-sm { width: 400px; }
.drug-dropdown-wrap { position: relative; }
.drug-dropdown-input { cursor: pointer; }
.drug-dropdown-input::placeholder { color: #9E9EB0; }
.drug-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 110;
  background: #fff; border: 1px solid #E2E0DA; border-radius: 6px;
  margin-top: 2px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  overflow: hidden;
}
.drug-dropdown-search {
  border: none !important; border-bottom: 1px solid #E2E0DA !important;
  border-radius: 0 !important; padding: 10px 12px !important;
  font-size: 13px !important;
}
.drug-dropdown-list { max-height: 220px; overflow-y: auto; }
.drug-dropdown-item {
  display: flex; flex-direction: column; gap: 1px;
  width: 100%; padding: 8px 12px; border: none;
  background: none; text-align: left; cursor: pointer;
  font-size: 13px; color: #1B1B2F; border-bottom: 1px solid #F0EFEA;
}
.drug-dropdown-item:last-child { border-bottom: none; }
.drug-dropdown-item:hover,
.drug-dropdown-item.focused { background: #F5F3EE; }
.dd-label { font-weight: 500; }
.dd-meta { font-size: 11px; color: #9E9EB0; }
.drug-dropdown-empty,
.drug-dropdown-hint { padding: 12px; text-align: center; color: #9E9EB0; font-size: 12px; }
.drug-selected-badge {
  margin-top: 4px; font-size: 11px; color: #7C5CBF;
}
.topic-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.topic-chip {
  padding: 5px 12px; border-radius: 14px; border: 1px solid #D0CEC7;
  background: #fff; font-size: 12px; cursor: pointer; color: #5E5E7A; transition: all .12s;
}
.topic-chip.active { background: #7C5CBF; color: #fff; border-color: #7C5CBF; }
.topic-chip:hover:not(.active) { background: #F5F3EE; }
.report-drug-context { padding: 11px 12px; border: 1px solid #D8CCE9; border-radius: 8px; background: #F7F3FB; color: #302541; }
.report-drug-context strong { display: block; font-size: 13px; }
.report-drug-context span { display: block; margin-top: 3px; color: #755E91; font-size: 11px; }
.report-success { margin-top: 12px; padding: 8px 12px; background: #E8F5E9; color: #2E7D32; border-radius: 6px; font-size: 13px; }
.rules-ac-wrap { position: relative; }
.rules-ac-dropdown {
  position: absolute; top: 100%; left: 0; right: 0; z-index: 120;
  background: #fff; border: 1px solid #E2E0DA; border-radius: 6px;
  margin-top: 2px; box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  overflow: hidden;
}
.rules-ac-search {
  border: none !important; border-bottom: 1px solid #E2E0DA !important;
  border-radius: 0 !important; padding: 10px 12px !important;
  font-size: 13px !important;
}
.rules-ac-list { max-height: 220px; overflow-y: auto; }
.rules-ac-item {
  display: block; width: 100%; padding: 8px 12px; border: none;
  background: none; text-align: left; cursor: pointer;
  font-size: 13px; color: #1B1B2F; border-bottom: 1px solid #F0EFEA;
}
.rules-ac-item:last-child { border-bottom: none; }
.rules-ac-item:hover,
.rules-ac-item.focused { background: #F5F3EE; }
.rules-ac-empty,
.rules-ac-hint { padding: 12px; text-align: center; color: #9E9EB0; font-size: 12px; }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 0;
  flex-shrink: 0;
  border-radius: 12px 12px 0 0;
  overflow: hidden;
}
.modal-header h3 { font-size: 15px; font-weight: 600; }
.modal-close { margin-left: auto; border: 0; background: transparent; color: #777; cursor: pointer; padding: 4px; }
.server-message-modal { z-index: 20001; width: min(520px, 90vw); }
.server-message-body { white-space: pre-wrap; line-height: 1.7; font-size: 14px; }
.btn-close {
  background: none;
  border: none;
  font-size: 22px;
  cursor: pointer;
  color: #9E9EB0;
  line-height: 1;
  padding: 0 4px;
}
.btn-close:hover { color: #1B1B2F; }
.modal-body {
  padding: 16px 20px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.usage-terms-modal {
  width: min(780px, 92vw);
  max-height: 90vh;
}
.usage-terms-text {
  padding: 18px 28px 28px;
  color: #39364A;
  font-size: 14px;
  line-height: 1.72;
  white-space: normal;
}
.usage-terms-text h2 {
  margin: 24px 0 10px;
  padding-bottom: 7px;
  border-bottom: 1px solid #E3D9F0;
  color: #6A4DA8;
  font-size: 16px;
  font-weight: 700;
}
.usage-terms-text h2:first-child { margin-top: 2px; }
.usage-terms-text p { margin: 0 0 12px; }
.usage-terms-text ul,
.usage-terms-text ol {
  margin: 12px 0 18px;
  padding: 10px 18px 10px 38px;
  border: 1px solid #E3D9F0;
  border-radius: 10px;
  background: #F8F5FC;
}
.usage-terms-text li {
  margin: 0;
  padding: 7px 4px;
}
.usage-terms-text li + li { border-top: 1px solid #EAE3F2; }
.usage-terms-text li::marker {
  color: #7C5CBF;
  font-weight: 700;
}
.usage-terms-text a { color: #6547A5; }
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid #E2E0DA;
  flex-shrink: 0;
  border-radius: 0 0 12px 12px;
}
.reset-code {
  display: block;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 6px;
  text-align: center;
  color: #D45757;
  background: #FDF0F0;
  border: 2px dashed #D45757;
  border-radius: 8px;
  padding: 10px 16px;
  margin: 12px 0;
}
.reset-input {
  display: block;
  width: 100%;
  font-family: 'JetBrains Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 18px;
  letter-spacing: 4px;
  text-align: center;
  padding: 10px;
  border: 2px solid #E2E0DA;
  border-radius: 8px;
  outline: none;
  transition: border-color .15s;
}
.reset-input:focus { border-color: #D45757; }
.lh-cell { text-align: center; }
.lh-cell input[type="checkbox"] { width: 15px; height: 15px; cursor: pointer; accent-color: #7C5CBF; }
.luzum-text { color: #7C5CBF; font-style: italic; font-weight: 500; }

/* ---- Form ---- */
.field-label {
  display: block;
  font-size: 14px;
  font-weight: 600;
  color: #5E5E7A;
  text-transform: uppercase;
  letter-spacing: .04em;
  margin-bottom: 4px;
  margin-top: 12px;
}
.field-label:first-child { margin-top: 0; }
.field-err {
  font-size: 13px;
  color: #D45757;
  margin-top: 4px;
}
.field-help { margin-top: 4px; color: #8A8A9E; font-size: 11px; line-height: 1.35; }
.field-help.customized { color: #6B4EA0; }
.field-row.label-options-row { display: block; }
.label-options-row > div + div { margin-top: 12px; }
.label-option-toggle { display: flex; align-items: center; gap: 7px; min-height: 20px; color: #4E4E66; font-size: 13px; cursor: pointer; }
.label-option-toggle input { margin: 0; accent-color: #7C5CBF; }
.label-option-input { margin-top: 6px; }
.input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #E2E0DA;
  border-radius: 6px;
  font-size: 13px; outline: none; background: #fff;
  color: #1B1B2F; transition: border-color .15s;
}
.input:focus { border-color: #7C5CBF; }


.input.err { border-color: #D45757; background: #FDF0F0; }
.input.err:focus { border-color: #B33D3D; }
select.input { cursor: pointer; }
textarea.input { resize: vertical; min-height: 50px; }
.err { border-color: #D45757; }
.time-list.err, .day-chips.err { border-color: #D45757; background: #FDF0F0; padding: 8px; border-radius: 6px; border-style: solid; border-width: 1px; }
.time-empty { color: #9E9EB0; font-size: 12px; font-style: italic; }
.field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}
.field-label-row:first-child { margin-top: 0; }
.field-group { margin-top: 12px; }
.field-group:first-child { margin-top: 0; }
.field-row {
  display: flex;
  gap: 10px;
}
.field-row > div { flex: 1; }
.dose-input-group {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 8px;
  border: 1px solid transparent;
  border-radius: 7px;
}
.dose-input-group.err { border-color: #D45757; background: #FDF0F0; padding: 3px; }
.dose-unit-select { min-width: 0; }

/* ---- Time List ---- */
.time-list { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.time-chip {
  display: flex; align-items: center; gap: 4px;
  padding: 3px 6px 3px 10px;
  background: #EDEAF5; color: #7C5CBF;
  border-radius: 6px; font-size: 13px; font-weight: 500;
}
.chip-dose-input {
  width: 60px; padding: 0 4px; margin: 0 2px;
  border: 1px solid #ccc; border-radius: 4px;
  font-size: 12px; height: 22px; outline: none;
  background: white; color: #333;
}
.chip-dose-input:focus { border-color: #7C5CBF; }
.chip-dose-wrap { display: inline-flex; align-items: center; gap: 2px; }
.chip-dose-wrap > span { font-size: 11px; color: #5E5E7A; }
.chip-remove {
  background: none; border: none; cursor: pointer;
  font-size: 16px; line-height: 1; color: #9A7FD0; padding: 0 2px;
}
.chip-remove:hover { color: #D45757; }
.time-add { display: flex; gap: 6px; align-items: center; }
.time-add input[type="time"] { width: auto; flex: 1; }
.time-presets { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.preset-btn {
  padding: 4px 8px; border: 1px solid #E2E0DA; border-radius: 5px;
  background: #FAF9F6; color: #5E5E7A; font-size: 11px; font-family: 'JetBrains Mono', monospace;
  cursor: pointer; transition: background .12s, border-color .12s;
}
.preset-btn:hover { background: #EDEAF5; border-color: #7C5CBF; color: #7C5CBF; }

/* ---- Conditions ---- */
.cond-radios { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.cond-radio {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 6px; cursor: pointer; font-size: 13px; transition: background .12s;
}
.cond-radio:hover { background: #F0EEE8; }
.cond-radio input[type="radio"] { accent-color: #7C5CBF; margin: 0; }
.day-chips { display: flex; gap: 4px; margin-top: 6px; }
.day-chip {
  width: 38px; height: 38px; border-radius: 50%; border: 1px solid #E2E0DA;
  background: #FAF9F6; font-size: 11px; font-weight: 500; cursor: pointer;
  transition: all .12s; font-family: inherit; color: #5E5E7A;
}
.day-chip.active { background: #7C5CBF; color: #fff; border-color: #7C5CBF; }
.day-chip:hover:not(.active) { border-color: #7C5CBF; color: #7C5CBF; }

/* ---- Archive ---- */
.archive-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.archive-table th {
  text-align: left;
  padding: 10px 14px;
  font-weight: 600;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #5E5E7A;
  background: #FAF9F6;
  border-bottom: 1px solid #E2E0DA;
  position: sticky;
  top: 0;
}
.archive-table td {
  padding: 8px 14px;
  border-bottom: 1px solid #F0EEE8;
}
.archive-table tbody tr:hover { background: #F8F6F0; }
.archive-table tbody tr:last-child td { padding-bottom: 12px; }
.archive-table .action-cell { white-space: nowrap; }
.btn-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border: none; border-radius: 5px;
  background: transparent; cursor: pointer; color: #5E5E7A;
  transition: all .12s;
}
.btn-icon:hover { background: #F0EEE8; color: #1B1B2F; }
.btn-icon-danger:hover { background: #FEE2E2; color: #DC2626; }

/* ---- Enjektor ---- */
.enj-items { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.enj-items.grid-2 { display: grid; grid-template-columns: 1fr 1fr; }
.enj-item {
  display: flex; align-items: center; gap: 8px; padding: 5px 8px;
  border-radius: 5px; cursor: pointer; font-size: 13px; transition: background .12s;
}
.enj-item:hover { background: #F0EEE8; }
.enj-item input[type="checkbox"] { accent-color: #7C5CBF; margin: 0; }
.tedavi-output-options { margin-top: 16px; padding-top: 14px; border-top: 1px solid #E2E0DA; }
.tedavi-output-options .field-label { margin-top: 0; }
.tedavi-option-list { display: grid; gap: 5px; margin-top: 10px; }
.tedavi-option-check {
  display: flex; align-items: center; gap: 8px; padding: 6px 8px;
  border-radius: 5px; cursor: pointer; font-size: 13px; color: #1B1B2F;
}
.tedavi-option-check:hover { background: #F0EEE8; }
.tedavi-option-check input { margin: 0; accent-color: #7C5CBF; }
.tedavi-option-help { display: block; margin: 6px 8px 0; color: #7B7890; font-size: 11px; }
.v-tooltip {
  position: fixed; z-index: 9999;
  background: #1B1B2F; color: #fff;
  font-size: 12px; padding: 4px 10px;
  border-radius: 4px; pointer-events: none;
  white-space: pre-line;
  max-width: 320px;
}
.mayi-entry-row { display: flex; gap: 8px; margin-bottom: 8px; }
.mayi-ml { width: 70px; flex-shrink: 0; }
.mayi-unit { width: 90px; flex-shrink: 0; }
.mayi-content { flex: 1; }
.dh-row { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.dh-name { flex: 1; }
.dh-route { width: 120px; }
.dh-count { width: 32px; text-align: center; color: #888; font-size: 12px; }
.dh-add-row { display: flex; gap: 8px; align-items: center; margin-top: 12px; padding-top: 12px; border-top: 1px solid #E2E0DA; }
.ozel-textarea { width: 100%; resize: vertical; min-height: 100px; font-family: inherit; }
.reminder-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #F0EEE8; }
.reminder-time { font-family: 'Consolas', monospace; font-size: 12px; color: #7C5CBF; font-weight: 600; width: 140px; flex-shrink: 0; }
.reminder-text { flex: 1; font-size: 13px; }
.reminder-input-row { display: flex; gap: 8px; margin-bottom: 8px; }
.cabinet-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #F0EEE8; }
.cabinet-name { flex: 1; font-weight: 600; cursor: pointer; }
.cabinet-name:hover { color: #7C5CBF; }
.drug-row { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid #F0EEE8; font-size: 13px; width: 100%; }
.drug-qty { width: 60px; text-align: center; font-weight: 600; flex-shrink: 0; }
.drug-dose { color: #888; width: 70px; text-align: center; flex-shrink: 0; }
.drug-name { font-weight: 600; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.drug-route { color: #888; width: 80px; text-align: center; flex-shrink: 0; }
.drug-expiry { width: 75px; color: #888; font-size: 11px; text-align: center; flex-shrink: 0; padding: 2px 4px; border-radius: 4px; }
.drug-expiry.expiry-warning { background: #FFF3CD; color: #856404; font-weight: 600; }
.drug-expiry.expiry-danger { background: #F8D7DA; color: #721C24; font-weight: 700; }
.drug-form-input { font-size: 12px; flex: 1; min-width: 0; }
.drug-form-sm { flex: 0.5; }
.drug-form-xs { flex: 0.35; }
.drug-form-date { flex: 0.9; }
.dose-template-item { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-bottom: 1px solid #F0EEE8; font-size: 13px; }
.dose-template-list { max-height: 180px; overflow-y: auto; }
.stok-drug-dropdown {
  position: absolute; bottom: 100%; left: 0; right: 0; z-index: 100; margin-bottom: 2px;
  background: #fff; border: 1px solid #E2E0DA; border-radius: 6px; max-height: 200px; overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0,0,0,.08);
}
.stok-drug-item {
  display: block; width: 100%; padding: 6px 10px; border: none; background: none;
  text-align: left; font-size: 12px; cursor: pointer; border-bottom: 1px solid #F0EEE8;
}
.stok-drug-item:last-child { border-bottom: none; }
.stok-drug-item:hover { background: #F5F3EE; color: #7C5CBF; }
.stok-drug-item .dd-label { font-size: 12px; font-weight: 500; color: #1B1B2F; }
.stok-drug-item .dd-meta { font-size: 11px; color: #9E9EB0; margin-left: 4px; }

/* ---- Inf tab bar ---- */
.tab-bar { display: flex; gap: 2px; margin-bottom: 12px; flex-wrap: wrap; }
.tab-btn {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 6px 14px; border: 1px solid #E2E0DA; border-radius: 6px 6px 0 0;
  background: #FAF9F6; font-size: 13px; cursor: pointer; color: #5E5E7A;
  transition: all .12s; font-family: inherit;
}
.tab-btn.active { background: #fff; border-bottom-color: #fff; color: #7C5CBF; font-weight: 600; }
.tab-btn:hover:not(.active) { background: #F0EEE8; }
.tab-add { border-style: dashed; color: #7C5CBF; font-weight: 700; font-size: 16px; padding: 6px 10px; }
.tab-close { margin-left: auto; font-size: 16px; line-height: 1; color: #DC2626; font-weight: 700; padding: 0 4px; opacity: 0.7; border-radius: 3px; }
.tab-close:hover { opacity: 1; background: #FEE2E2; }
.inf-empty-hero { text-align: center; padding: 40px 20px; color: #999; font-size: 15px; }
.print-check-row { padding: 6px 0; border-bottom: 1px solid #F0EEE8; }
.print-check-row label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.print-check-row input[type="checkbox"] { accent-color: #7C5CBF; margin: 0; }
.inf-badge {
  display: inline-flex; align-items: center; padding: 2px 8px; margin: 1px 2px;
  background: #DAD2EA; border-radius: 10px; font-size: 12px; font-weight: 500;
  color: #4A3880; cursor: default; white-space: nowrap;
}
.prospectus-loading-overlay { z-index: 6000; }
.prospectus-loading-modal { z-index: 7000; }
.prospectus-loading-body { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 28px 24px 32px; }
.prospectus-loading-body p { margin: 14px 0 5px; font-size: 14px; color: #1B1B2F; }
.prospectus-loading-body small { color: #9E9EB0; font-size: 12px; }
.prospectus-spinner { width: 34px; height: 34px; border: 3px solid #E2E0DA; border-top-color: #7C5CBF; border-radius: 50%; animation: prospectus-spin .75s linear infinite; }
@keyframes prospectus-spin { to { transform: rotate(360deg); } }
.prospectus-warning-overlay { z-index: 8000; }
.prospectus-warning-modal { z-index: 9000; }
.prospectus-warning-message { margin: 0; font-size: 14px; line-height: 1.6; }
.order-import-warning-overlay { z-index: 4000; }
.order-import-warning-modal { z-index: 5000; }
.catalog-connection-warning-overlay { z-index: 10000; }
.catalog-connection-warning-modal { z-index: 10001; }
.warning-modal-title { display: flex; align-items: center; gap: 8px; color: #D45757; }
.warning-modal-title h3 { color: #1B1B2F; }
.warning-modal-message { margin: 0; font-size: 14px; line-height: 1.6; }
.prospectus-choice-overlay { z-index: 6000; }
.prospectus-choice-modal { z-index: 7000; width: 600px; }
.prospectus-choice-intro { margin: 0 0 14px; font-size: 13px; line-height: 1.55; color: #5E5E7A; }
.prospectus-choice-list { max-height: 330px; overflow-y: auto; }
.prospectus-choice-row { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border: 1px solid #E2E0DA; border-radius: 6px; margin-bottom: 7px; cursor: pointer; font-size: 13px; line-height: 1.4; }
.prospectus-choice-row:hover, .prospectus-choice-row.selected { border-color: #7C5CBF; background: #F5F3EE; }
.prospectus-choice-row input { margin-top: 2px; accent-color: #7C5CBF; }
.order-import-result { padding: 4px 0; }
.order-import-success { margin: 0 0 14px; padding: 10px 12px; border-radius: 6px; background: #ECFDF3; color: #18794E; font-size: 13px; font-weight: 600; }
.order-import-skipped { padding: 12px 14px; border: 1px solid #F2C6C6; border-radius: 6px; background: #FFF7F7; }
.order-import-skipped h4 { margin: 0 0 8px; color: #B42318; font-size: 13px; }
.order-import-skipped ul { margin: 0; padding-left: 20px; color: #7A271A; font-size: 12px; line-height: 1.6; }
</style>
