const {
  normalizeProductName,
  parseIlacabakProductUrl,
  parseIlacabakPdfUrl,
  parseIlacProspektusuDocumentPageUrl,
  parseIlacProspektusuPdfUrl
} = require('../electron/prospectusSources')

describe('direct prospectus sources', () => {
  test('normalizes Turkish product names for exact matching', () => {
    expect(normalizeProductName('İnfüzyonluk Çözelti')).toBe('infuzyonluk cozelti')
  })

  test('selects only the exact İlacabak product and its PDF', () => {
    const fullName = 'VANKOCENT 500 MG IV INFUZYONLUK COZELTI HAZIRLAMAK ICIN LIYOFILIZE TOZ'
    const searchHtml = `<ul>
      <li><a href="vankocent-500-mg-iv-infuzyonluk-cozelti-hazirlamak-icin-liyofilize-toz-30517" title="${fullName}">${fullName}</a></li>
      <li><a href="wrong-product-1" title="VANKOCENT 250 MG">VANKOCENT 250 MG</a></li>
    </ul>`
    expect(parseIlacabakProductUrl(searchHtml, fullName))
      .toBe('https://www.ilacabak.com/vankocent-500-mg-iv-infuzyonluk-cozelti-hazirlamak-icin-liyofilize-toz-30517')
    expect(parseIlacabakPdfUrl('<a href="pdf/8d78f0e50dd8068.pdf">PDF formatında ulaşmak için tıklayınız.</a>'))
      .toBe('https://www.ilacabak.com/pdf/8d78f0e50dd8068.pdf')
  })

  test('extracts KÜB and KT document pages from the exact barcode result', () => {
    const html = `<li class="urun">
      <a href="//www.ilacprospektusu.com/ilac/195/vankocent">Vankocent</a>
      <a class="kuburl" href="//kub.ilacprospektusu.com/ilac/17555-vankocent-kub"></a>
      <a class="kturl" href="//kt.ilacprospektusu.com/ilac/17556-vankocent-kt"></a>
    </li>`
    expect(parseIlacProspektusuDocumentPageUrl(html, 'KÜB'))
      .toBe('https://kub.ilacprospektusu.com/ilac/17555-vankocent-kub')
    expect(parseIlacProspektusuDocumentPageUrl(html, 'Kullanma Talimatı'))
      .toBe('https://kt.ilacprospektusu.com/ilac/17556-vankocent-kt')
  })

  test('selects the requested PDF type from the KÜB/KT list', () => {
    const html = `<div class="kubktliste slk">
      <a class="pdf" title="KUB" href="//pdf.ilacprospektusu.com/17555-vankocent-kub.pdf"></a>
      <a class="pdf" title="KT" href="//pdf.ilacprospektusu.com/17556-vankocent-kt.pdf"></a>
    </div>`
    expect(parseIlacProspektusuPdfUrl(html, 'KÜB'))
      .toBe('https://pdf.ilacprospektusu.com/17555-vankocent-kub.pdf')
    expect(parseIlacProspektusuPdfUrl(html, 'Kullanma Talimatı'))
      .toBe('https://pdf.ilacprospektusu.com/17556-vankocent-kt.pdf')
  })
})
