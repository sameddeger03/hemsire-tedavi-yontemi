const { drugAliases, matchDrugOptions, openDrugInformation, safeUptodateUrl } = require('../electron/uptodate')

describe('UpToDate drug matching', () => {
  test('matches every formulation beginning with the English active ingredient', () => {
    const options = [
      { title: 'Amphotericin B deoxycholate (conventional)', url: 'https://www.uptodate.com/contents/amphotericin-b-deoxycholate-conventional-drug-information' },
      { title: 'Amphotericin B lipid complex (United States and Canada: Not available)', url: 'https://www.uptodate.com/contents/amphotericin-b-lipid-complex-drug-information' },
      { title: 'Amphotericin B liposomal', url: 'https://www.uptodate.com/contents/amphotericin-b-liposomal-drug-information' },
      { title: 'Amphotericin test', url: 'https://www.uptodate.com/contents/amphotericin-test' }
    ]
    expect(matchDrugOptions(options, { active_ingredient: 'Amfoterisin B', etken_detay: 'Amphotericin B' }))
      .toEqual(options.slice(0, 3))
  })

  test('splits and normalizes alternative active ingredient names', () => {
    expect(drugAliases({ etken_detay: 'Aciclovir; Acyclovir' })).toEqual(['aciclovir', 'acyclovir'])
  })

  test('accepts only UpToDate content links', () => {
    expect(safeUptodateUrl('https://www.uptodate.com/contents/example')).toContain('uptodate.com/contents/example')
    expect(safeUptodateUrl('https://example.com/contents/example')).toBe('')
    expect(safeUptodateUrl('https://www.uptodate.com/login')).toBe('')
  })

  test('opens the selected article in the external browser', async () => {
    const openExternal = jest.fn().mockResolvedValue(undefined)
    const option = { title: 'Example', url: 'https://www.uptodate.com/contents/example' }
    await expect(openDrugInformation(option, openExternal)).resolves.toEqual({ success: true })
    expect(openExternal).toHaveBeenCalledWith(option.url)
  })

})
