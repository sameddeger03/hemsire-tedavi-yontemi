const fs = require('fs')
const path = require('path')
const vm = require('vm')

function loadModule() {
  const source = fs.readFileSync(path.join(__dirname, '../src/domain/dosageBounds.js'), 'utf8')
    .replace('export function calculateAcceptedDoseRange', 'function calculateAcceptedDoseRange')
    .replace('export function doseAmountsForPeriod', 'function doseAmountsForPeriod')
    .concat('\nmodule.exports = { calculateAcceptedDoseRange, doseAmountsForPeriod }')
  const context = { module: { exports: {} }, exports: {} }
  vm.runInNewContext(source, context)
  return context.module.exports
}

describe('calculateAcceptedDoseRange', () => {
  const { calculateAcceptedDoseRange, doseAmountsForPeriod } = loadModule()

  test('hesaplanan min ve max doza tolerans uygular', () => {
    expect(calculateAcceptedDoseRange(1200, 1800, 2)).toEqual({ min: 1176, max: 1836 })
  })

  test('mutlak maksimum doza tolerans uygulamaz', () => {
    expect(calculateAcceptedDoseRange(1200, 2000, 2, 2000)).toEqual({ min: 1176, max: 2000 })
  })

  test('toleranslı üst sınır mutlak maksimumu aşarsa tavanda sınırlar', () => {
    expect(calculateAcceptedDoseRange(1200, 1990, 2, 2000)).toEqual({ min: 1176, max: 2000 })
  })

  test('günlük kuralda planlanan bütün dozları toplar', () => {
    expect(doseAmountsForPeriod([3000, 3000], 'day')).toEqual([6000])
  })

  test('doz başına kuralda dozları ayrı ayrı bırakır', () => {
    expect(doseAmountsForPeriod([3000, 3000], 'dose')).toEqual([3000, 3000])
  })
})
