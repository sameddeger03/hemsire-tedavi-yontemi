const path = require('path')
const { buildSync } = require('esbuild')

function loadViteModule(relativePath) {
  const filename = path.resolve(__dirname, '..', relativePath)
  const result = buildSync({
    entryPoints: [filename],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    write: false,
    loader: { '.js': 'js' },
    logLevel: 'silent'
  })
  const code = result.outputFiles[0].text
  const loaded = { exports: {} }
  const fn = new Function('module', 'exports', 'require', code)
  fn(loaded, loaded.exports, require)
  return loaded.exports
}

module.exports = { loadViteModule }