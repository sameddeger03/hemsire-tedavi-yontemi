import { ref } from 'vue'

const api = () => window.electronAPI
let _catalogSyncPromise = null

export function useDrugCatalog(deps) {
  const drugCatalogList = ref([])

  async function syncDrugCatalog(apiUrl) {
    if (_catalogSyncPromise) return _catalogSyncPromise
    _catalogSyncPromise = (async () => {
      const url = apiUrl || deps.apiUrl.value
      const fullUrl = url.includes('/api/drugs') ? url : `${url}/api/drugs`
      const syncResult = await api().dbSyncDrugCatalog(fullUrl)
      const ok = syncResult === true || syncResult?.ok === true
      const changed = syncResult === true || syncResult?.changed !== false
      if (ok) {
        if (changed) deps.clearDrugPropsCache?.()
        deps.serverOnline.value = true
        deps.catalogLastUpdatedAt.value = new Date().toISOString()
        await api().configSet('drugCatalogLastSyncedAt', deps.catalogLastUpdatedAt.value)
        if (changed) {
          await loadDrugCatalog()
          await loadDrugFullNameMap()
          if (deps.selectedPatientId.value) await deps.loadDrugProps(deps.selectedPatientId.value)
        }
      }
      return ok
    })()
    try {
      return await _catalogSyncPromise
    } finally {
      _catalogSyncPromise = null
    }
  }

  async function loadDrugCatalog() {
    drugCatalogList.value = await api().dbGetActiveIngredients()
  }

  async function loadDrugFullNameMap() {
    deps.drugFullNameMap.value = await api().dbGetDrugFullNameMap()
  }

  return {
    drugCatalogList,
    syncDrugCatalog,
    clearDrugPropsCache: () => deps.clearDrugPropsCache?.(),
    loadDrugCatalog,
    loadDrugFullNameMap
  }
}
