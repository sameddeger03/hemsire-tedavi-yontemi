const { createSearchWindow, findResults, getSearchTerms, prepareOptions, resultMatchesTerm, safeGlobalRphUrl } = require('../electron/globalrph')

describe('GlobalRPH search', () => {
  test('searches English active ingredient names before local and commercial names', () => {
    expect(getSearchTerms({
      etken_detay: 'Amphotericin B; Amphotericin',
      active_ingredient: 'Amfoterisin B',
      label: 'AMBISOME'
    })).toEqual(['amphotericin b', 'amphotericin', 'amfoterisin b', 'ambisome'])
  })

  test('accepts only secure GlobalRPH result URLs', () => {
    expect(safeGlobalRphUrl('https://globalrph.com/medcalcs/example/')).toContain('globalrph.com/medcalcs/example')
    expect(safeGlobalRphUrl('https://globalrph.com.evil.example/result')).toBe('')
    expect(safeGlobalRphUrl('http://globalrph.com/result')).toBe('')
  })

  test('isolates search traffic and blocks third-party requests', () => {
    let requestListener
    const onBeforeRequest = jest.fn((filter, listener) => { requestListener = listener })
    const webContents = {
      session: { webRequest: { onBeforeRequest } },
      setWindowOpenHandler: jest.fn(),
      on: jest.fn()
    }
    const BrowserWindow = jest.fn(() => ({ webContents }))

    createSearchWindow(BrowserWindow)

    expect(BrowserWindow.mock.calls[0][0].webPreferences.partition).toMatch(/^globalrph-search-/)
    expect(onBeforeRequest).toHaveBeenCalledWith({ urls: ['*://*/*'] }, expect.any(Function))

    const thirdPartyDecision = jest.fn()
    requestListener({ url: 'https://visitor.omnitagjs.com/visitor/isync' }, thirdPartyDecision)
    expect(thirdPartyDecision).toHaveBeenCalledWith({ cancel: true })

    const globalRphDecision = jest.fn()
    requestListener({ url: 'https://globalrph.com/?s=amphotericin' }, globalRphDecision)
    expect(globalRphDecision).toHaveBeenCalledWith({ cancel: false })
  })

  test('adds dilution to the GlobalRPH search query', async () => {
    const win = {
      loadURL: jest.fn().mockResolvedValue(),
      isDestroyed: jest.fn().mockReturnValue(false),
      destroy: jest.fn(),
      webContents: {
        session: { webRequest: { onBeforeRequest: jest.fn() } },
        setWindowOpenHandler: jest.fn(),
        on: jest.fn(),
        executeJavaScript: jest.fn().mockResolvedValue([])
      }
    }
    const BrowserWindow = jest.fn(() => win)

    await findResults(BrowserWindow, { active_ingredient: 'vancomycin' })

    expect(win.loadURL).toHaveBeenCalledWith('https://globalrph.com/?s=vancomycin+dilution&sources=')
  })

  test('rejects unrelated fallback articles when a search has no result', () => {
    const unrelated = {
      title: 'Intravenous Lipid Rescue: Why It Is Saving Lives',
      url: 'https://globalrph.com/2026/05/intravenous-lipid-rescue/'
    }
    expect(resultMatchesTerm(unrelated, 'aciclovir')).toBe(false)
    expect(resultMatchesTerm({
      title: 'Ambisome (amphotericin B)',
      url: 'https://globalrph.com/dilution/ambisome-ampho-b/'
    }, 'ambisome')).toBe(true)
  })

  test('returns every matching article so the user can choose', () => {
    expect(prepareOptions([
      { title: 'Methotrexate Toxicity and Rescue', url: 'https://globalrph.com/medcalcs/methotrexate-toxicity/', postType: 'Dilution' },
      { title: 'Methotrexate', url: 'https://globalrph.com/dilution/methotrexate/', postType: ' Dilution ' },
      { title: 'Unrelated article', url: 'https://globalrph.com/news/example/', postType: 'Dilution' }
    ], 'methotrexate')).toEqual([
      { title: 'Methotrexate Toxicity and Rescue', url: 'https://globalrph.com/medcalcs/methotrexate-toxicity/' },
      { title: 'Methotrexate', url: 'https://globalrph.com/dilution/methotrexate/' }
    ])
  })

  test('returns only articles whose GlobalRPH post type is Dilution', () => {
    expect(prepareOptions([
      { title: 'Methotrexate', url: 'https://globalrph.com/oncology/methotrexate/', postType: 'Oncology' },
      { title: 'Methotrexate review', url: 'https://globalrph.com/news/methotrexate/', postType: 'Posts' },
      { title: 'Methotrexate dilution', url: 'https://globalrph.com/dilution/methotrexate/', postType: 'dilution' },
      { title: 'Methotrexate without type', url: 'https://globalrph.com/example/methotrexate/' }
    ], 'methotrexate')).toEqual([
      { title: 'Methotrexate dilution', url: 'https://globalrph.com/dilution/methotrexate/' }
    ])
  })
})
