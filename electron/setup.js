const form = document.getElementById('setup-form')
const apiUrl = document.getElementById('api-url')
const apiKey = document.getElementById('api-key')
const errorBox = document.getElementById('error')
const submit = document.getElementById('submit')
const { readCredentials, setSubmitting } = window.setupForm

const query = new URLSearchParams(window.location.search)
const initialError = query.get('error')
apiUrl.value = (query.get('apiUrl') || '').replace(/^https?:\/\//i, '')
if (initialError) errorBox.textContent = initialError

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorBox.textContent = ''
  setSubmitting({ apiUrlInput: apiUrl, apiKeyInput: apiKey, submit }, true)
  try {
    const result = await window.setupAPI.activate(readCredentials(apiUrl, apiKey))
    if (!result.success) errorBox.textContent = result.error
  } catch (error) {
    errorBox.textContent = `Doğrulama başarısız: ${error.message}`
  } finally {
    setSubmitting({ apiUrlInput: apiUrl, apiKeyInput: apiKey, submit }, false)
  }
})
