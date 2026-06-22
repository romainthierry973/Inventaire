// Service worker minimal : met en cache le shell applicatif (HTML/CSS/JS) pour
// que l'app continue de se charger même avec une connexion atelier capricieuse.
// L'inventaire lui-même vit dans IndexedDB (déjà disponible hors-ligne) ;
// seul l'appel à l'API Gemini nécessite une vraie connexion réseau.

const CACHE_NAME = 'ciel-inventory-shell-v1';
const SHELL_URLS = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {
      // Si certaines ressources échouent au moment de l'install, on ne bloque pas
      // l'activation : mieux vaut un SW partiellement utile qu'aucun SW.
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Ne jamais intercepter les appels vers l'API Gemini : ils doivent toujours
  // atteindre le réseau (sinon on servirait une réponse périmée à une analyse IA).
  if (request.url.includes('generativelanguage.googleapis.com')) return;

  // Stratégie "network first, fallback cache" pour le HTML (toujours essayer
  // d'avoir la dernière version), "cache first" pour le reste (JS/CSS/assets).
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/').then((res) => res ?? Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && request.method === 'GET') {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
