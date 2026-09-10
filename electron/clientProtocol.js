function isCompatibleServer(body) {
  return body?.success === true &&
    body.service === 'tedavi-server' &&
    body.protocolVersion === 1
}

module.exports = { isCompatibleServer }
