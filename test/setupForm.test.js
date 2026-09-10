const { readCredentials, setSubmitting } = require('../electron/setupForm')

test('kurulum formundan API adresini ve anahtarı birlikte okur', () => {
  expect(readCredentials(
    { value: 'https://example.com' },
    { value: 'secret' }
  )).toEqual({ apiUrl: 'https://example.com', apiKey: 'secret' })
})

test('kurulum formu protokolsüz API adresini değiştirmeden doğrulamaya iletir', () => {
  expect(readCredentials(
    { value: 'tedavi.dislek.com' },
    { value: 'secret' }
  )).toEqual({ apiUrl: 'tedavi.dislek.com', apiKey: 'secret' })
})

test('doğrulama sırasında iki alanı ve butonu kilitler', () => {
  const controls = {
    apiUrlInput: { disabled: false },
    apiKeyInput: { disabled: false },
    submit: { disabled: false, textContent: 'Doğrula ve Aç' }
  }

  setSubmitting(controls, true)
  expect(controls).toEqual({
    apiUrlInput: { disabled: true },
    apiKeyInput: { disabled: true },
    submit: { disabled: true, textContent: 'Doğrulanıyor...' }
  })

  setSubmitting(controls, false)
  expect(controls).toEqual({
    apiUrlInput: { disabled: false },
    apiKeyInput: { disabled: false },
    submit: { disabled: false, textContent: 'Doğrula ve Aç' }
  })
})
