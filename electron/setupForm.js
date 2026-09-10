(function exposeSetupForm(root, factory) {
  const api = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  if (root) root.setupForm = api
})(typeof window !== 'undefined' ? window : globalThis, () => {
  function readCredentials(apiUrlInput, apiKeyInput) {
    return { apiUrl: apiUrlInput.value, apiKey: apiKeyInput.value }
  }

  function setSubmitting({ apiUrlInput, apiKeyInput, submit }, submitting) {
    apiUrlInput.disabled = submitting
    apiKeyInput.disabled = submitting
    submit.disabled = submitting
    submit.textContent = submitting ? 'Doğrulanıyor...' : 'Doğrula ve Aç'
  }

  return { readCredentials, setSubmitting }
})
