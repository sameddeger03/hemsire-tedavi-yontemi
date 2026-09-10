const {
  buildDuckDuckGoSearchUrl,
  decodeDuckDuckGoResultUrl,
  isAllowedDuckDuckGoRequest,
  prepareDuckDuckGoCandidates
} = require('../electron/duckduckgoSearch')

describe('DuckDuckGo browser search', () => {
  test('builds a normal web-search URL', () => {
    expect(buildDuckDuckGoSearchUrl('Aspirin 100 mg KUB pdf'))
      .toBe('https://duckduckgo.com/?q=Aspirin+100+mg+KUB+pdf&ia=web')
  })

  test('allows only DuckDuckGo resources inside the isolated search session', () => {
    expect(isAllowedDuckDuckGoRequest('https://duckduckgo.com/?q=aspirin')).toBe(true)
    expect(isAllowedDuckDuckGoRequest('https://staticcdn.duckduckgo.com/assets/app.js')).toBe(true)
    expect(isAllowedDuckDuckGoRequest('https://visitor.omnitagjs.com/visitor/isync')).toBe(false)
  })

  test('accepts direct and redirected external result links', () => {
    const redirected = `https://links.duckduckgo.com/d.js?uddg=${encodeURIComponent('https://www.titck.gov.tr/example.pdf')}`
    expect(decodeDuckDuckGoResultUrl(redirected)).toBe('https://www.titck.gov.tr/example.pdf')
    expect(prepareDuckDuckGoCandidates([
      { href: 'https://www.titck.gov.tr/example.pdf', text: 'Aspirin KUB' },
      { href: redirected, text: 'Duplicate result' },
      { href: 'https://duckduckgo.com/settings', text: 'Settings' }
    ])).toEqual([{ url: 'https://www.titck.gov.tr/example.pdf', text: 'Aspirin KUB' }])
  })
})
