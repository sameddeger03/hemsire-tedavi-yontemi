jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: jest.fn() },
  ipcRenderer: { invoke: jest.fn() }
}))

const { contextBridge, ipcRenderer } = require('electron')
require('../electron/preload')
const api = contextBridge.exposeInMainWorld.mock.calls[0][1]

test('opens before IPC and stays busy until every label settles, including failures', async () => {
  const progress = jest.fn()
  const unsubscribe = api.onPrintProgress(progress)
  const jobs = []
  ipcRenderer.invoke.mockImplementation(() => {
    expect(progress.mock.calls.at(-1)[0]).toBeGreaterThan(0)
    return new Promise((resolve, reject) => jobs.push({ resolve, reject }))
  })
  const first = api.printLabel('first')
  const second = api.printLabel('second')
  expect(progress.mock.calls.map(([count]) => count)).toEqual([0, 1, 2])
  jobs[0].resolve({ success: true })
  await first
  expect(progress).toHaveBeenLastCalledWith(1)
  const rejected = expect(second).rejects.toThrow('IPC failure')
  jobs[1].reject(new Error('IPC failure'))
  await rejected
  expect(progress).toHaveBeenLastCalledWith(0)
  unsubscribe()
})

test('re-subscribing restores pending state and cleanup leaves the new listener intact', async () => {
  let finish
  ipcRenderer.invoke.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const oldListener = jest.fn()
  const removeOld = api.onPrintProgress(oldListener)
  const job = api.printLabel('label')
  const currentListener = jest.fn()
  const removeCurrent = api.onPrintProgress(currentListener)
  expect(currentListener).toHaveBeenLastCalledWith(1)
  removeOld()
  finish({ success: false, error: 'Printer unavailable' })
  await job
  expect(currentListener).toHaveBeenLastCalledWith(0)
  removeCurrent()
  ipcRenderer.invoke.mockResolvedValue({ success: true })
  await api.printLabel('next')
  expect(currentListener.mock.calls.map(([count]) => count)).toEqual([1, 0])
})
