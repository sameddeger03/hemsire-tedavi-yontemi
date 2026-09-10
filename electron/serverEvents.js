const http = require('http')
const https = require('https')

const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000]
const HEARTBEAT_TIMEOUT_MS = 45 * 1000

function createSseParser(onEvent) {
  let buffer = ''
  return chunk => {
    buffer += String(chunk).replace(/\r\n/g, '\n')
    let boundary
    while ((boundary = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + 2)
      if (!block || block.startsWith(':')) continue
      let event = 'message'
      const data = []
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
      }
      if (!data.length) continue
      let parsed = data.join('\n')
      try { parsed = JSON.parse(parsed) } catch {}
      onEvent(event, parsed)
    }
  }
}

function startServerEvents({ getApiUrl, getApiKey, onConnectionChange, onEvent, logger, random = Math.random }) {
  let stopped = false
  let request = null
  let response = null
  let reconnectTimer = null
  let heartbeatTimer = null
  let reconnectAttempt = 0
  let online = false
  let connectionGeneration = 0

  const setOnline = value => {
    if (online === value) return
    online = value
    onConnectionChange?.(value)
  }

  const clearConnection = () => {
    clearTimeout(heartbeatTimer)
    heartbeatTimer = null
    if (request) request.destroy()
    if (response) response.destroy()
    request = null
    response = null
  }

  const scheduleReconnect = () => {
    if (stopped || reconnectTimer) return
    setOnline(false)
    clearConnection()
    const base = RECONNECT_DELAYS_MS[Math.min(reconnectAttempt++, RECONNECT_DELAYS_MS.length - 1)]
    const delay = Math.round(base * (0.85 + random() * 0.3))
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect() }, delay)
  }

  const resetHeartbeat = generation => {
    clearTimeout(heartbeatTimer)
    heartbeatTimer = setTimeout(() => {
      if (generation !== connectionGeneration) return
      logger?.warn('SUNUCU OLAYLARI', 'Heartbeat zaman aşımı; bağlantı yenileniyor')
      scheduleReconnect()
    }, HEARTBEAT_TIMEOUT_MS)
  }

  const connect = () => {
    if (stopped) return
    const apiUrl = String(getApiUrl() || '').replace(/\/$/, '')
    const apiKey = String(getApiKey() || '')
    if (!apiUrl || !apiKey) { scheduleReconnect(); return }
    const generation = ++connectionGeneration
    let target
    try { target = new URL(`${apiUrl}/api/client/events`) }
    catch { scheduleReconnect(); return }
    const client = target.protocol === 'https:' ? https : http
    const failCurrent = () => { if (generation === connectionGeneration) scheduleReconnect() }
    const activeRequest = client.get(target, { headers: { accept: 'text/event-stream', 'x-api-key': apiKey }, timeout: 60000 }, res => {
      if (generation !== connectionGeneration) { res.destroy(); return }
      response = res
      if (res.statusCode !== 200) { res.resume(); failCurrent(); return }
      reconnectAttempt = 0
      setOnline(true)
      resetHeartbeat(generation)
      const parse = createSseParser((event, data) => {
        resetHeartbeat(generation)
        try { onEvent?.(event, data) } catch (error) { logger?.warn('SUNUCU OLAYLARI', error.message) }
      })
      res.setEncoding('utf8')
      res.on('data', parse)
      res.on('end', failCurrent)
      res.on('error', failCurrent)
    })
    request = activeRequest
    activeRequest.on('timeout', () => activeRequest.destroy(new Error('SSE bağlantı zaman aşımı')))
    activeRequest.on('error', failCurrent)
  }

  const reconnect = () => {
    connectionGeneration++
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    reconnectAttempt = 0
    clearConnection()
    setOnline(false)
    connect()
  }

  const stop = () => {
    stopped = true
    connectionGeneration++
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    clearConnection()
    setOnline(false)
  }

  connect()
  return { reconnect, stop, isOnline: () => online }
}

module.exports = { createSseParser, startServerEvents }
