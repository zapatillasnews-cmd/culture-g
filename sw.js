const CACHE = 'culture-g-v4';

// Ces fichiers DOIVENT être mis en cache pour que l'app fonctionne offline
const CORE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/config.js',
  '/js/data.js',
  '/js/auth.js',
  '/js/app.js',
  '/manifest.webmanifest',
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Inter:wght@400;500;600;700&display=swap',
];

// Images en best-effort (ignorées si absentes)
const IMAGES = [
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
  '/assets/art/guernica.jpg',
  '/assets/art/montres-molles.jpg',
  '/assets/art/demoiselles-avignon.jpg',
  '/assets/art/tournesols.jpg',
  '/assets/art/radeau-meduse.jpg',
  '/assets/art/las-meninas.jpg',
  '/assets/art/arnolfini.jpg',
  '/assets/art/american-gothic.jpg',
  '/assets/art/grande-jatte.jpg',
  '/assets/art/frida-kahlo.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(async c => {
      await c.addAll(CORE);
      // Images en best-effort : on tente, on ignore les erreurs
      await Promise.allSettled(
        IMAGES.map(url => fetch(url).then(r => r.ok ? c.put(url, r) : null).catch(() => null))
      );
      self.skipWaiting();
    })
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
