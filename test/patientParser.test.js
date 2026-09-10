const { parsePatients } = require('../electron/patientParser')

describe('PatientParser', () => {
  test('sütun sırası değişse de bulunan hasta alanlarını başlıklardan okur', () => {
    const input = [
      'Cinsiyet\tHasta No\tDoğum Tarihi\tHasta Adı',
      'Kadın\t638879\t04/02/2006\tFADİME ÖZİŞ'
    ].join('\n')

    expect(parsePatients(input)).toEqual({
      error: null,
      patients: [{
        name: 'FADİME ÖZİŞ',
        patientNo: '638879',
        gender: 'Kadın',
        birthDate: '2006-02-04'
      }]
    })
  })

  test('eksik sütunları hata vermeden yok sayar', () => {
    expect(parsePatients('Hasta No\n7300898')).toEqual({
      error: null,
      patients: [{ patientNo: '7300898' }]
    })
  })

  test('boş ve geçersiz değerleri forma taşımadan okunabilen alanları korur', () => {
    const input = 'Hasta Adı\tCinsiyet\tDoğum Tarihi\nAYŞE\tBilinmiyor\t31/02/2020'

    expect(parsePatients(input)).toEqual({
      error: null,
      patients: [{ name: 'AYŞE' }]
    })
  })

  test('birden fazla hasta satırını seçim için ayrı kayıtlar halinde döndürür', () => {
    const input = 'Hasta Adı\tHasta No\nALİ VELİ\t1\nAYŞE YILMAZ\t2'

    expect(parsePatients(input).patients).toEqual([
      { name: 'ALİ VELİ', patientNo: '1' },
      { name: 'AYŞE YILMAZ', patientNo: '2' }
    ])
  })

  test('tanınan başlık veya kullanılabilir değer yoksa panoyu reddeder', () => {
    expect(parsePatients('Servis\tYatak\nA\t101')).toEqual({
      error: 'Geçersiz pano: Hasta bilgisi bulunamadı.',
      patients: []
    })
    expect(parsePatients('Hasta Adı\tHasta No\n\t')).toEqual({
      error: 'Geçersiz pano: Hasta bilgisi bulunamadı.',
      patients: []
    })
  })
})
