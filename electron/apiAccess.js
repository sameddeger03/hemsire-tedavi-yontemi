function normalizeApiUrl(value) {
  const input = String(value || '').trim()
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(input) ? input : `https://${input}`
  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    throw new Error('Geçerli bir API adresi girin.')
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Geçerli bir API adresi girin.')
  }
  if (parsed.username || parsed.password) {
    throw new Error('API adresi kullanıcı bilgisi içeremez.')
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
  if (parsed.protocol === 'http:' && !localHosts.has(parsed.hostname.toLowerCase())) {
    throw new Error('Uzak API adresleri HTTPS kullanmalıdır.')
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, '')
  return parsed.toString().replace(/\/$/, '')
}

function normalizeApiAddressInput(value) {
  const input = String(value || '').trim()
  const match = input.match(/^([a-z\d.-]+)(?::(\d{1,5}))?$/i)
  const hostname = match?.[1]
  const port = match?.[2]
  const labelsAreValid = hostname?.split('.').every(label => (
    /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/i.test(label) && label.length <= 63
  ))

  if (!match || !labelsAreValid || hostname.length > 253 || (port && (+port < 1 || +port > 65535))) {
    throw new Error('API adresini protokol veya yol olmadan girin (ör. tedavi.dislek.com).')
  }

  const localHost = ['localhost', '127.0.0.1', '::1'].includes(hostname.toLowerCase())
  return normalizeApiUrl(`${localHost ? 'http' : 'https'}://${input}`)
}

async function activateApiAccess(values, dependencies) {
  let apiUrl
  try {
    apiUrl = normalizeApiAddressInput(values?.apiUrl)
  } catch (error) {
    return { success: false, error: error.message }
  }

  const apiKey = String(values?.apiKey || '').trim()
  if (!apiKey) return { success: false, error: 'API anahtarı zorunludur.' }

  const addressIsValid = await dependencies.validateAddress(apiUrl)
  if (!addressIsValid) return { success: false, error: 'API adresi doğrulanamadı.' }

  const keyResult = await dependencies.verifyKey(apiUrl, apiKey)
  if (!keyResult.success) return keyResult

  try {
    await dependencies.saveCredentials({ apiUrl, apiKey })
  } catch {
    return { success: false, error: 'Kurulum ayarları kaydedilemedi.' }
  }
  return { success: true }
}

module.exports = { normalizeApiUrl, normalizeApiAddressInput, activateApiAccess }
