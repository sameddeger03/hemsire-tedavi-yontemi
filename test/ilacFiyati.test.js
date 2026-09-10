const mockReadFileSync = jest.fn()
const mockMkdirSync = jest.fn()
const mockWriteFileSync = jest.fn()
const mockRenameSync = jest.fn()

jest.mock('fs', () => ({
  readFileSync: (...args) => mockReadFileSync(...args),
  mkdirSync: (...args) => mockMkdirSync(...args),
  writeFileSync: (...args) => mockWriteFileSync(...args),
  renameSync: (...args) => mockRenameSync(...args)
}))

jest.mock('electron', () => ({
  app: { getPath: () => 'C:\\test-user-data' }
}))

const barcode = '8699606691426'
const pageHtml = `
  <p class="info-card__label">SGK Durumu</p>
  <p class="info-card__value">Bedeli Ödenir</p>
  <div class="accordion-item">
    <div id="content-besin-etkilesimi" class="accordion-collapse collapse">
      <div class="accordion-body">
        <div class="sesli-dinle-area page-content">
          İlacın yiyecek ve içeceklerle bilinen bir etkileşimi yoktur.
          <div><ins class="adsbygoogle">reklam</ins><script>reklam()</script></div>
          <div class="alert alert-danger"><p>Sorumluluk reddi metni</p></div>
        </div>
      </div>
    </div>
  </div>
  <div class="accordion-item">Sonraki bölüm</div>
  <div id="content-kullanma-talimati">
    <div><a href="/dosyalar/ornek-kullanma-talimati.pdf?download=1&amp;lang=tr">Kullanma Talimatı</a></div>
  </div>
  <div id="content-kisa-urun-bilgisi">
    <a href="https://www.ilacfiyati.com/dosyalar/ornek-kisa-urun-bilgisi.pdf#belge">Kısa Ürün Bilgisi</a>
  </div>
`

describe('ilacfiyati.com besin etkileşimi', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
    delete process.env.APPDATA
    global.fetch = jest.fn()
  })

  afterAll(() => {
    global.fetch = originalFetch
  })

  test('yalnız content-besin-etkilesimi içeriğini çıkarır', () => {
    const { extractBesinEtkilesimi } = require('../electron/ilacFiyati')

    expect(extractBesinEtkilesimi(pageHtml)).toBe('İlacın yiyecek ve içeceklerle bilinen bir etkileşimi yoktur.')
  })

  test('KÜB ve KT bağlantılarını ilgili içerik bölümlerinden çıkarır', () => {
    const { extractDocumentLinks } = require('../electron/ilacFiyati')

    expect(extractDocumentLinks(pageHtml)).toEqual({
      kub: 'https://www.ilacfiyati.com/dosyalar/ornek-kisa-urun-bilgisi.pdf',
      kt: 'https://ilacfiyati.com/dosyalar/ornek-kullanma-talimati.pdf?download=1&lang=tr'
    })
  })

  test('ilacfiyati.com dışındaki belge bağlantılarını kabul etmez', () => {
    const { extractDocumentLinks } = require('../electron/ilacFiyati')
    const html = '<div id="content-kisa-urun-bilgisi"><a href="https://example.com/belge.pdf">Belge</a></div>'

    expect(extractDocumentLinks(html)).toEqual({ kub: '', kt: '' })
  })

  test('besin etkileşimi bulunan güncel cache kaydını ağ isteği olmadan döndürür', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      [barcode]: {
        fetchedAt: Date.now(),
        cards: { 'SGK Durumu': 'Bedeli Ödenir' },
        besinEtkilesimi: 'Cache içeriği',
        documents: { kub: 'https://ilacfiyati.com/dosyalar/cache-kub.pdf', kt: '' }
      }
    }))
    const { getDrugInfo } = require('../electron/ilacFiyati')

    await expect(getDrugInfo(barcode)).resolves.toMatchObject({
      success: true,
      cached: true,
      besinEtkilesimi: 'Cache içeriği',
      documents: { kub: 'https://ilacfiyati.com/dosyalar/cache-kub.pdf', kt: '' }
    })
    expect(global.fetch).not.toHaveBeenCalled()
  })

  test('eski cache kaydında belge alanı yoksa sayfayı yenileyip bağlantıları cacheler', async () => {
    mockReadFileSync.mockReturnValue(JSON.stringify({
      [barcode]: {
        fetchedAt: Date.now(),
        cards: { 'SGK Durumu': 'Bedeli Ödenir' },
        besinEtkilesimi: 'Eski cache içeriği'
      }
    }))
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'success', items: [{ slug: 'ornek-ilac' }] })
      })
      .mockResolvedValueOnce({ ok: true, text: async () => pageHtml })
    const { getDrugInfo } = require('../electron/ilacFiyati')

    await expect(getDrugInfo(barcode)).resolves.toMatchObject({
      success: true,
      cached: false,
      besinEtkilesimi: 'İlacın yiyecek ve içeceklerle bilinen bir etkileşimi yoktur.',
      documents: {
        kub: 'https://www.ilacfiyati.com/dosyalar/ornek-kisa-urun-bilgisi.pdf',
        kt: 'https://ilacfiyati.com/dosyalar/ornek-kullanma-talimati.pdf?download=1&lang=tr'
      }
    })
    const persisted = JSON.parse(mockWriteFileSync.mock.calls[0][1])
    expect(persisted[barcode].besinEtkilesimi).toBe('İlacın yiyecek ve içeceklerle bilinen bir etkileşimi yoktur.')
    expect(persisted[barcode].documents).toEqual({
      kub: 'https://www.ilacfiyati.com/dosyalar/ornek-kisa-urun-bilgisi.pdf',
      kt: 'https://ilacfiyati.com/dosyalar/ornek-kullanma-talimati.pdf?download=1&lang=tr'
    })
  })
})
