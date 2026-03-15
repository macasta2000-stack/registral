/**
 * REGISTRAL — Service Worker
 * sw.js
 *
 * Estrategias de caché por tipo de dato:
 *   - Assets estáticos (JS, CSS, fonts, images) → Cache First
 *   - HTML shell                                 → Network First con fallback offline
 *   - API Supabase (REST/PostgREST)              → Network First con fallback IndexedDB
 *   - Supabase Realtime (WebSocket)              → No interceptado (pasa directo)
 *
 * Background Sync:
 *   - Tag: 'registral-sync'
 *   - Cuando vuelve la conexión, dispara el syncEngine del cliente
 *
 * Offline UI:
 *   - Si no hay conexión y no hay caché, muestra /offline.html
 */

const CACHE_VERSION = 'v1'

const CACHE_NAMES = {
  static:  `registral-static-${CACHE_VERSION}`,
  dynamic: `registral-dynamic-${CACHE_VERSION}`,
  pages:   `registral-pages-${CACHE_VERSION}`,
}

// Assets que se pre-cachean en install
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/offline.html',
  '/manifest.json',
]

// Patrones de URL por estrategia
const STRATEGY_PATTERNS = {
  // Static assets → Cache First (rara vez cambian, se versionen por hash)
  cacheFirst: [
    /\/assets\/.*\.(js|css|woff2?|ttf|eot)$/,
    /\/icons\/.*\.(png|svg|ico|webp)$/,
  ],
  // Supabase REST API → Network First con stale fallback
  networkFirst: [
    /supabase\.co\/rest\/v1/,
    /supabase\.co\/storage\/v1/,
  ],
  // Supabase Auth → Network Only (nunca cachear tokens)
  networkOnly: [
    /supabase\.co\/auth\/v1/,
  ],
  // Supabase Realtime → No interceptar
  bypass: [
    /supabase\.co\/realtime/,
    /wss?:\/\//,
  ],
}

// ─────────────────────────────────────────────────────────────
// INSTALL — Pre-cachear shell de la app
// ─────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAMES.static).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS)
    }).then(() => {
      // Tomar control inmediatamente sin esperar que se cierre la pestaña
      return self.skipWaiting()
    })
  )
})

// ─────────────────────────────────────────────────────────────
// ACTIVATE — Limpiar caches viejos
// ─────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => {
        return Promise.all(
          keys
            .filter(key => !Object.values(CACHE_NAMES).includes(key))
            .map(key => caches.delete(key))
        )
      }),
      // Tomar control de todas las tabs abiertas
      self.clients.claim(),
    ])
  )
})

// ─────────────────────────────────────────────────────────────
// FETCH — Estrategias de caché por patrón de URL
// ─────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = request.url

  // Solo interceptar GET (las mutaciones usan syncEngine + IndexedDB)
  if (request.method !== 'GET') return

  // Bypass: Supabase Realtime y WebSockets
  if (STRATEGY_PATTERNS.bypass.some(p => p.test(url))) return

  // Network Only: Auth endpoints
  if (STRATEGY_PATTERNS.networkOnly.some(p => p.test(url))) {
    event.respondWith(fetch(request))
    return
  }

  // Cache First: assets estáticos hasheados
  if (STRATEGY_PATTERNS.cacheFirst.some(p => p.test(url))) {
    event.respondWith(cacheFirstStrategy(request))
    return
  }

  // Network First: Supabase REST API
  if (STRATEGY_PATTERNS.networkFirst.some(p => p.test(url))) {
    event.respondWith(networkFirstStrategy(request, CACHE_NAMES.dynamic, 300))
    return
  }

  // Default: Network First para navegación (páginas)
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request))
    return
  }

  // Default genérico: Network First
  event.respondWith(networkFirstStrategy(request, CACHE_NAMES.dynamic, 600))
})

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA: Cache First
// Devuelve de caché. Si no existe, va a red y cachea.
// ─────────────────────────────────────────────────────────────

async function cacheFirstStrategy(request) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.static)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Asset not available offline', { status: 503 })
  }
}

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA: Network First
// Va a red. Si falla o tarda más de `timeoutMs`, usa caché stale.
// ─────────────────────────────────────────────────────────────

async function networkFirstStrategy(request, cacheName, timeoutMs = 3000) {
  const cache = await caches.open(cacheName)

  // Race entre fetch y timeout
  const networkPromise = fetch(request).then(async (response) => {
    if (response.ok) {
      // Cachear respuesta exitosa
      cache.put(request, response.clone())
    }
    return response
  })

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Network timeout')), timeoutMs)
  )

  try {
    return await Promise.race([networkPromise, timeoutPromise])
  } catch {
    // Red falló o timeout → devolver stale de caché
    const cached = await cache.match(request)
    if (cached) {
      // Agregar header para que el cliente sepa que es dato cacheado
      const headers = new Headers(cached.headers)
      headers.set('X-Registral-Cache', 'stale')
      return new Response(cached.body, {
        status: cached.status,
        headers,
      })
    }
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// ─────────────────────────────────────────────────────────────
// ESTRATEGIA: Navegación (SPA)
// Siempre devuelve el index.html para rutas de React Router
// ─────────────────────────────────────────────────────────────

async function navigationStrategy(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(CACHE_NAMES.pages)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    // Offline: devolver el shell cacheado (SPA maneja el routing)
    const cached = await caches.match('/index.html') ||
                   await caches.match('/')

    return cached ?? caches.match('/offline.html')
  }
}

// ─────────────────────────────────────────────────────────────
// BACKGROUND SYNC — Procesar cola offline cuando vuelve la conexión
// ─────────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'registral-sync') {
    event.waitUntil(processSyncQueue())
  }
})

/**
 * Notifica a todas las pestañas abiertas que hay sync pendiente.
 * El syncEngine (cliente) se encarga de procesar IndexedDB → Supabase.
 * El SW no accede a Supabase directamente (no tiene el token JWT en scope).
 */
async function processSyncQueue() {
  const clients = await self.clients.matchAll({ type: 'window' })

  if (clients.length === 0) return

  // Enviar mensaje a la primera pestaña activa
  clients[0].postMessage({
    type: 'REGISTRAL_SYNC_REQUESTED',
    timestamp: Date.now(),
  })
}

// ─────────────────────────────────────────────────────────────
// PUSH NOTIFICATIONS — Alertas desde Edge Functions (futuro)
// ─────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return

  let notification
  try {
    notification = event.data.json()
  } catch {
    notification = {
      title: 'REGISTRAL',
      body: event.data.text(),
      icon: '/icons/icon-192.png',
    }
  }

  event.waitUntil(
    self.registration.showNotification(notification.title, {
      body: notification.body,
      icon: notification.icon ?? '/icons/icon-192.png',
      badge: '/icons/badge-72.png',
      data: notification.data ?? {},
      tag: notification.tag ?? 'registral-alert',
      requireInteraction: notification.priority === 'critical',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Si ya hay una pestaña abierta, enfocarla
      const existingClient = clients.find(c => c.url.includes(self.location.origin))
      if (existingClient) {
        existingClient.focus()
        existingClient.postMessage({ type: 'NAVIGATE', url })
        return
      }
      // Si no, abrir nueva pestaña
      return self.clients.openWindow(url)
    })
  )
})

// ─────────────────────────────────────────────────────────────
// MESSAGES — Comunicación bidireccional con el cliente
// ─────────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  switch (event.data?.type) {
    case 'SKIP_WAITING':
      self.skipWaiting()
      break

    case 'CACHE_INVALIDATE': {
      // Invalidar caché de un endpoint específico
      const { url } = event.data
      if (url) {
        caches.open(CACHE_NAMES.dynamic).then(cache => cache.delete(url))
      }
      break
    }

    case 'GET_CACHE_STATUS':
      // Responder con estado del caché (para el indicador de sync)
      event.source?.postMessage({
        type: 'CACHE_STATUS',
        caches: Object.values(CACHE_NAMES),
        version: CACHE_VERSION,
      })
      break

    default:
      break
  }
})
