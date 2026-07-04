const CACHE = 'eligemarket-v4'

self.addEventListener('install', e => {
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  
  const url = e.request.url
  
  // Nunca cachear: APIs externas, assets JS dinámicos, supabase
  if (url.includes('supabase') || 
      url.includes('googleapis') ||
      url.includes('cdn.jsdelivr') ||
      url.includes('/assets/') ||
      url.includes('.js?') ||
      url.includes('jspdf')) return

  // Solo cachear HTML principal
  if (url.endsWith('/') || url.endsWith('index.html')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
          return res
        })
        .catch(() => caches.match('./index.html'))
    )
  }
})
