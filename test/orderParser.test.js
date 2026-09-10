const { parseOrders } = require('../electron/orderParser')

describe('OrderParser', () => {
  describe('parseOrders', () => {
    test('boş pano için hata döndürür', () => {
      expect(parseOrders('').error).toBeTruthy()
    })

    test('yalnız başlık içeren pano için hata döndürür', () => {
      expect(parseOrders('Hizmet Adı').error).toBe('En az 2 satır gerekli (başlık + veri)')
    })

    test('yalnız Hizmet Adı sütunuyla onaylanan varsayılanları üretir', () => {
      const result = parseOrders('Hizmet Adı\nAMİKASİN 500 MG')

      expect(result).toEqual({
        error: null,
        orders: [{
          name: 'AMİKASİN 500 MG',
          dose: '1 adet',
          doseValue: 1,
          doseUnit: 'adet',
          route: 'DGR',
          times: '10:00',
          note: '',
          startDate: ''
        }]
      })
    })

    test('sütun sırası değişse de alanları başlık adından bulur', () => {
      const input = [
        'Açıklama\tSaatler\tKul. Şek.\tHizmet Adı\tDoz Birimi\tO. Dozu',
        'Tok karnına\t08:00 20:00\tIV İntravenöz\tMEROSİD IV 1 GR\tmg\t500'
      ].join('\n')

      expect(parseOrders(input).orders[0]).toEqual({
        name: 'MEROSİD IV 1 GR',
        dose: '500 mg',
        doseValue: 500,
        doseUnit: 'mg',
        route: 'IV',
        times: '10:00, 22:00',
        note: 'Tok karnına',
        startDate: ''
      })
    })

    test('boş opsiyonel hücreleri varsayılanlarla tamamlar', () => {
      const input = 'O. Dozu\tHizmet Adı\tKul. Şek.\tSaatler\tAçıklama\n\tDIGOXIN\t\t\t'

      expect(parseOrders(input).orders[0]).toEqual({
        name: 'DIGOXIN',
        dose: '1 adet',
        doseValue: 1,
        doseUnit: 'adet',
        route: 'DGR',
        times: '10:00',
        note: '',
        startDate: ''
      })
    })

    test('saat değerlerini değil geçerli benzersiz saat adedini kullanır', () => {
      const input = 'Hizmet Adı\tSaatler\nİLAÇ A\t01:15, 09:45, 17:20, 17:20'

      expect(parseOrders(input).orders[0].times).toBe('06:00, 14:00, 22:00')
    })

    test('geçerli saat bulunamazsa 10:00 kullanır', () => {
      const input = 'Hizmet Adı\tSaatler\nİLAÇ A\trastgele, 25:00, 10:75'

      expect(parseOrders(input).orders[0].times).toBe('10:00')
    })

    test('panodaki tarih alanlarını başlangıç tarihine taşımaz', () => {
      const input = 'Kayıt Tarihi\tİşlem Tarihi\tKaçıncı Gün\tHizmet Adı\n01/08/2026\t02/08/2026\t3 Gün\tİLAÇ A'

      expect(parseOrders(input).orders[0].startDate).toBe('')
    })

    test('Hizmet Adı sütunu yoksa panonun tamamını reddeder', () => {
      const result = parseOrders('O. Dozu\tSaatler\n1\t10:00')

      expect(result.error).toBe('İlaç adı sütunu bulunamadı (Hizmet Adı)')
      expect(result.orders).toEqual([])
    })

    test('Order Tipi Hizmet olan satırları filtreler', () => {
      const input = 'Hizmet Adı\tOrder Tipi\nİlaç Değil\tHizmet\nAMİKASİN\tNormal'

      expect(parseOrders(input).orders.map(order => order.name)).toEqual(['AMİKASİN'])
    })
  })
})
