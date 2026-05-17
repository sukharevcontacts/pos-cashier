const CACHE_NAME = 'pos-cashier-pwa-v5'

const STATIC_CACHE_PATHS = [
  '/pos/',
  '/pos/favicon.svg',
  '/pos/icons.svg',
  '/pos/pwa-icon-192.png',
  '/pos/pwa-icon-512.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_CACHE_PATHS))
      .catch(() => undefined),
  )

  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => (key === CACHE_NAME ? undefined : caches.delete(key)))))
      .then(() => self.clients.claim()),
  )
})

function isApiRequest(url) {
  return (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/pos-api/') ||
    url.pathname.startsWith('/pos/api/')
  )
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/pos/assets/') ||
    url.pathname === '/pos/favicon.svg' ||
    url.pathname === '/pos/icons.svg' ||
    url.pathname === '/pos/pwa-icon-192.png' ||
    url.pathname === '/pos/pwa-icon-512.png' ||
    url.pathname === '/pos/manifest.webmanifest'
  )
}


self.addEventListener('message', (event) => {
  const type = event.data && event.data.type

  if (type === 'POS_SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  if (type === 'POS_CLEAR_CACHES') {
    event.waitUntil(
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .then(() => self.clients.claim()),
    )
  }
})

self.addEventListener('fetch', (event) => {
  {
    const versionUrl = new URL(event.request.url)

    if (
      event.request.method === 'GET' &&
      versionUrl.origin === self.location.origin &&
      (versionUrl.pathname === '/pos/app-version.json' || versionUrl.pathname === '/pos/assets/app-version.json')
    ) {
      event.respondWith(fetch(event.request, { cache: 'no-store' }))
      return
    }
  }

  const request = event.request

  if (request.method !== 'GET') return

  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return

  // Важно: кассовые API, заказы, пайщики, остатки, оплаты не кэшируем.
  if (isApiRequest(url)) return

  // Страница приложения: сначала сеть, кэш только как fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put('/pos/', copy))
          return response
        })
        .catch(() => caches.match('/pos/')),
    )

    return
  }

  // Статические файлы frontend можно кэшировать.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse

        return fetch(request).then((response) => {
          const copy = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          return response
        })
      }),
    )
  }
})
