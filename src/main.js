import { createApp } from 'vue'
import App from './App.vue'

const app = createApp(App)

app.directive('tooltip', {
  mounted(el, binding) {
    let tip = null
    let tipWidth = 0
    let tipHeight = 0
    let moveFrame = null
    let pendingPosition = null
    const positionTip = (clientX, clientY) => {
      if (!tip) return
      let left = clientX
      let top = clientY + 16
      if (left + tipWidth > window.innerWidth - 8) left = window.innerWidth - tipWidth - 8
      if (top + tipHeight > window.innerHeight - 8) top = clientY - tipHeight - 8
      tip.style.left = left + 'px'
      tip.style.top = top + 'px'
    }
    const show = (e) => {
      if (tip) { tip.remove(); tip = null }
      const text = el.dataset.tooltip || binding.value
      if (!text) return
      tip = document.createElement('div')
      tip.className = 'v-tooltip'
      tip.textContent = text
      document.body.appendChild(tip)
      const rect = tip.getBoundingClientRect()
      tipWidth = rect.width
      tipHeight = rect.height
      positionTip(e.clientX, e.clientY)
    }
    const move = (e) => {
      if (!tip) return
      pendingPosition = { clientX: e.clientX, clientY: e.clientY }
      if (moveFrame !== null) return
      moveFrame = requestAnimationFrame(() => {
        moveFrame = null
        if (!pendingPosition) return
        positionTip(pendingPosition.clientX, pendingPosition.clientY)
        pendingPosition = null
      })
    }
    const hide = () => {
      if (moveFrame !== null) cancelAnimationFrame(moveFrame)
      moveFrame = null
      pendingPosition = null
      if (tip) { tip.remove(); tip = null }
    }
    el.addEventListener('mouseenter', show)
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseleave', hide)
  },
  updated(el, binding) {
    // binding değiştiğinde tooltip'i güncelle
    if (binding.value !== undefined) el.dataset.tooltip = binding.value || ''
  }
})

app.config.errorHandler = (err, instance, info) => {
  console.error('Vue Error:', err)
}

app.mount('#app')

const loader = document.getElementById('app-loading')
const hideLoader = () => {
  if (loader) {
    loader.classList.add('app-loading-done')
    setTimeout(() => loader.remove(), 400)
  }
}
const preloadTest = new URLSearchParams(window.location.search).get('preload') === '1'
if (preloadTest) setTimeout(hideLoader, 5000)
else hideLoader()
