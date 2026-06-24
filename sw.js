const CACHE = 'culture-g-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/config.js',
  '/js/data.js',
  '/js/auth.js',
  '/js/app.js',
  '/manifest.webmanifest',
  '/assets/art/joconde.jpg',
  '/assets/art/nuit-etoilee.jpg',
  '/assets/art/le-cri.jpg',
  '/assets/art/jeune-fille-perle.jpg',
  '/assets/art/grande-vague.jpg',
  '/assets/art/naissance-venus.jpg',
  '/assets/art/liberte.jpg',
  '/assets/art/impression-soleil.jpg',
  '/assets/art/le-baiser.jpg',
  '/assets/art/la-cene.jpg',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Inter:wght@400;500;600;700&display=swap',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => {
      const network = fetch(e.request).then(res => {
        const sameOrigin = e.request.url.startsWith(self.location.origin);
        const isImage = e.request.destination === 'image';
        if (res.ok && (sameOrigin || isImage)) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      });
      return cached || network;
    })
  );
});
