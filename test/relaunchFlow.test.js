const { classifySecondInstanceCommand, createRelaunchCoordinator } = require('../electron/relaunchFlow')

function createDependencies(overrides = {}) {
  const calls = []
  const dependencies = {
    hideMainWindow: jest.fn(() => calls.push('hide')),
    focusActiveGate: jest.fn(() => calls.push('focus-gate')),
    runSplashGate: jest.fn(async () => { calls.push('splash'); return { action: 'update' } }),
    ensureApiAccess: jest.fn(async () => { calls.push('auth'); return true }),
    runUpdateGate: jest.fn(async () => calls.push('update')),
    runDataUpdateGate: jest.fn(async () => calls.push('data')),
    restoreRuntimeUpdater: jest.fn(() => calls.push('restore-updater')),
    reloadMainWindow: jest.fn(async () => calls.push('reload')),
    showMainWindow: jest.fn(() => calls.push('show')),
    onError: jest.fn(),
    ...overrides
  }
  return { calls, dependencies }
}

describe('classifySecondInstanceCommand', () => {
  test('hatırlatma ve arka plan çağrılarını normal kullanıcı açılışından ayırır', () => {
    expect(classifySecondInstanceCommand(['app.exe', '--background-reminder'])).toBe('reminder')
    expect(classifySecondInstanceCommand(['app.exe', '--background'])).toBe('background')
    expect(classifySecondInstanceCommand(['app.exe'])).toBe('foreground')
  })
})

describe('createRelaunchCoordinator', () => {
  test('çevrimiçi yeniden açılışta kapıları çalıştırıp arayüzü sıfırlar', async () => {
    const { calls, dependencies } = createDependencies()
    const coordinator = createRelaunchCoordinator(dependencies)

    await coordinator.run()

    expect(calls).toEqual(['hide', 'splash', 'update', 'data', 'restore-updater', 'reload', 'show'])
    expect(coordinator.isRunning()).toBe(false)
  })

  test('çevrimdışı açılışta güncelleme kapılarını atlar', async () => {
    const { calls, dependencies } = createDependencies({
      runSplashGate: jest.fn(async () => { calls.push('splash'); return { action: 'offline' } })
    })

    await createRelaunchCoordinator(dependencies).run()

    expect(calls).toEqual(['hide', 'splash', 'restore-updater', 'reload', 'show'])
  })

  test('yetkilendirme iptal edilirse arka plan çalışmasını görünür yapmaz', async () => {
    const { calls, dependencies } = createDependencies({
      runSplashGate: jest.fn(async () => { calls.push('splash'); return { action: 'auth', error: 'Geçersiz anahtar' } }),
      ensureApiAccess: jest.fn(async () => { calls.push('auth'); return false })
    })

    const result = await createRelaunchCoordinator(dependencies).run()

    expect(result.action).toBe('hidden')
    expect(calls).toEqual(['hide', 'splash', 'auth'])
  })

  test('aynı anda gelen ikinci çağrıda yeni kapı açmaz, mevcut kapıyı öne getirir', async () => {
    let finishSplash
    const { calls, dependencies } = createDependencies({
      runSplashGate: jest.fn(() => new Promise(resolve => {
        calls.push('splash')
        finishSplash = resolve
      }))
    })
    const coordinator = createRelaunchCoordinator(dependencies)

    const firstRun = coordinator.run()
    const secondRun = coordinator.run()
    finishSplash({ action: 'offline' })
    await Promise.all([firstRun, secondRun])

    expect(dependencies.runSplashGate).toHaveBeenCalledTimes(1)
    expect(dependencies.focusActiveGate).toHaveBeenCalledTimes(1)
  })

  test('beklenmeyen kapı hatasında ana pencereyi geri getirir', async () => {
    const error = new Error('kapı hatası')
    const { calls, dependencies } = createDependencies({
      runUpdateGate: jest.fn(async () => { calls.push('update'); throw error })
    })

    const result = await createRelaunchCoordinator(dependencies).run()

    expect(result.action).toBe('recovered')
    expect(dependencies.onError).toHaveBeenCalledWith(error)
    expect(calls).toEqual(['hide', 'splash', 'update', 'restore-updater', 'reload', 'show'])
  })
})
