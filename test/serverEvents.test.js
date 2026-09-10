const http = require('http')
const { createSseParser, startServerEvents } = require('../electron/serverEvents')

test('parçalı SSE mesajlarını event ve JSON verisiyle ayrıştırır', () => {
  const events = []
  const parse = createSseParser((event, data) => events.push({ event, data }))
  parse(': heartbeat comment\n\nevent: catalog-updated\ndata: {"entries":')
  parse('300}\n\nevent: heartbeat\ndata: {"ok":true}\n\n')
  expect(events).toEqual([
    { event: 'catalog-updated', data: { entries: 300 } },
    { event: 'heartbeat', data: { ok: true } }
  ])
})

test('çok satırlı metin verisini korur', () => {
  const events = []
  const parse = createSseParser((event, data) => events.push({ event, data }))
  parse('event: message\ndata: ilk\ndata: ikinci\n\n')
  expect(events).toEqual([{ event: 'message', data: 'ilk\nikinci' }])
})

test('kopan event stream kısa gecikmeyle yeniden bağlanır', async () => {
  let connections = 0
  let resolveReconnected
  const reconnected = new Promise(resolve => { resolveReconnected = resolve })
  const server = http.createServer((req, res) => {
    connections++
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('event: connected\ndata: {}\n\n')
    setTimeout(() => res.end(), 30)
    if (connections === 2) resolveReconnected()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const states = []
  const connection = startServerEvents({
    getApiUrl: () => `http://127.0.0.1:${server.address().port}`,
    getApiKey: () => 'test-key', onConnectionChange: online => states.push(online), random: () => 0
  })
  await Promise.race([reconnected, new Promise((_, reject) => setTimeout(() => reject(new Error('yeniden bağlanmadı')), 3000))])
  connection.stop()
  await new Promise(resolve => server.close(resolve))
  expect(connections).toBeGreaterThanOrEqual(2)
  expect(states).toEqual(expect.arrayContaining([true, false]))
})
