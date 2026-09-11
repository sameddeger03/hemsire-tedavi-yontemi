const { app, BrowserWindow } = require('electron')

function createWindow() {
  const window = new BrowserWindow({
    width: 560,
    height: 280,
    minWidth: 560,
    minHeight: 280,
    maxWidth: 560,
    maxHeight: 280,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  })

  const html = `<!doctype html>
<html lang="tr">
<head><meta charset="utf-8"><title>Hemşire Tedavi Yönetimi</title>
<style>
  :root { color-scheme: light; font-family: Segoe UI, sans-serif; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f8fafc; color: #1e293b; }
  main { width: 440px; padding: 28px; text-align: center; background: white; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 8px 24px #0f172a18; }
  h1 { margin: 0 0 14px; color: #b42318; font-size: 21px; }
</style></head>
<body><main><h1>Artık Microsoft Store üzerinden uygulama desteklenmiyor</h1></main></body>
</html>`
  window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
}

app.whenReady().then(createWindow)
app.on('window-all-closed', () => app.quit())
