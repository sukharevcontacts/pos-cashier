export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    const baseUrl = import.meta.env.BASE_URL || '/'
    const swUrl = `${baseUrl}sw.js`

    navigator.serviceWorker.register(swUrl, { scope: baseUrl }).catch((error) => {
      console.warn('Service worker registration failed', error)
    })
  })
}
