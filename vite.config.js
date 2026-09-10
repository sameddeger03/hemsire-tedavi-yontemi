import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const PROD_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'"
const DEV_CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; img-src 'self' data:; font-src 'self'; connect-src 'self' ws://localhost:* http://localhost:*"

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'csp-inject',
      transformIndexHtml(html, ctx) {
        const isDev = process.env.VITE_DEV_SERVER_URL || ctx.server
        return html.replace('__CSP_PLACEHOLDER__', isDev ? DEV_CSP : PROD_CSP)
      }
    }
  ],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: false
  },
  server: {
    port: 5173,
    strictPort: true
  }
})
