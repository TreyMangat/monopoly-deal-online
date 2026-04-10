// ============================================================
// Monopoly Deal Online — Service Worker (PWA offline support)
// ============================================================

const CACHE_NAME = 'monopoly-deal-v4';

const APP_SHELL = [
  '/',
  '/manifest.json',
  '/icons/icon-180.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/images/title-logo.png',
];

const OFFLINE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Monopoly Deal — Offline</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#141624;color:#eee;font-family:'Segoe UI',system-ui,sans-serif;
  display:flex;flex-direction:column;align-items:center;justify-content:center;
  height:100vh;text-align:center;padding:24px}
h1{font-size:24px;margin-bottom:12px}
p{color:#888;font-size:15px;max-width:320px;line-height:1.5}
.icon{font-size:48px;margin-bottom:16px}
button{margin-top:24px;background:#2ED1C0;color:#141624;border:none;
  border-radius:8px;padding:12px 28px;font-size:15px;font-weight:600;cursor:pointer}
button:active{opacity:.7}
</style>
</head>
<body>
<div class="icon">📡</div>
<h1>You're offline</h1>
<p>Monopoly Deal needs an internet connection to play. Reconnect and try again.</p>
<button onclick="location.reload()">Retry</button>
</body>
</html>`;

// ---- Install: pre-cache app shell ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ---- Activate: clean old caches ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ---- Fetch: network-first for navigation, cache-first for static assets ----
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip WebSocket and non-GET requests
  if (request.url.includes('/ws') || request.method !== 'GET') {
    return;
  }

  // Navigation requests (HTML pages): network-first with offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || new Response(OFFLINE_HTML, {
            headers: { 'Content-Type': 'text/html' },
          }))
        )
    );
    return;
  }

  // Static assets (icons, manifest): cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        return response;
      });
    })
  );
});
