function classifySecondInstanceCommand(commandLine = []) {
  if (commandLine.includes('--background-reminder')) return 'reminder'
  if (commandLine.includes('--background')) return 'background'
  return 'foreground'
}

function createRelaunchCoordinator({
  hideMainWindow,
  focusActiveGate,
  runSplashGate,
  ensureApiAccess,
  runUpdateGate,
  runDataUpdateGate,
  restoreRuntimeUpdater,
  reloadMainWindow,
  showMainWindow,
  onError
}) {
  let currentRun = null

  async function execute() {
    hideMainWindow()

    try {
      const splashResult = await runSplashGate()
      if (splashResult?.action === 'quit') return { action: 'hidden' }

      if (splashResult?.action === 'auth') {
        const authorized = await ensureApiAccess(splashResult.error || '')
        if (!authorized) return { action: 'hidden' }
      }

      if (splashResult?.action !== 'offline') {
        await runUpdateGate()
        await runDataUpdateGate()
      }

      restoreRuntimeUpdater()
      await reloadMainWindow()
      showMainWindow()
      return { action: 'shown' }
    } catch (error) {
      onError?.(error)
      try { restoreRuntimeUpdater() } catch {}
      try { await reloadMainWindow() } catch {}
      showMainWindow()
      return { action: 'recovered', error }
    }
  }

  function run() {
    if (currentRun) {
      focusActiveGate?.()
      return currentRun
    }

    currentRun = execute().finally(() => { currentRun = null })
    return currentRun
  }

  return {
    run,
    isRunning: () => Boolean(currentRun)
  }
}

module.exports = { classifySecondInstanceCommand, createRelaunchCoordinator }
