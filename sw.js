const CACHE = 'culture-g-v10';

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
  '/assets/art/arnolfini.jpg',
  '/assets/art/american-gothic.jpg',
  '/assets/art/saturne-goya.jpg',
  '/assets/art/ecole-athenes.jpg',
  '/assets/art/frida-kahlo.jpg',
  '/assets/art/glaneuses.jpg',
  '/assets/art/nympheas.jpg',
  '/assets/art/olympia-manet.jpg',
  '/assets/art/meules-monet.jpg',
  '/assets/art/femme-ombrelle.jpg',
  '/assets/art/nuit-rhone.jpg',
  '/assets/art/autoportrait-oreille.jpg',
  '/assets/art/primavera.jpg',
  '/assets/art/joueurs-cartes.jpg',
  '/assets/art/montagne-victoire.jpg',
  '/assets/art/songe-rousseau.jpg',
  '/assets/art/dejeuner-canotiers.jpg',
  '/assets/art/ronde-nuit.jpg',
  '/assets/art/moulin-galette.jpg',
  '/assets/art/grande-jatte.jpg',
  '/assets/art/odalisque.jpg',
  '/assets/art/laitiere-vermeer.jpg',
  '/assets/art/creation-adam.jpg',
  '/assets/art/las-meninas.jpg',
  '/assets/art/nighthawks-hopper.jpg',
  '/assets/art/dejeuner-herbe.jpg',
  '/assets/art/tres-mayo-goya.jpg',
  '/assets/art/chambre-arles.jpg',
  '/assets/art/serment-horaces.jpg',
  '/assets/art/balancoire-fragonard.jpg',
  '/assets/histoire/pyramides-gizeh.jpg',
  '/assets/histoire/colisee-rome.jpg',
  '/assets/histoire/grande-muraille.jpg',
  '/assets/histoire/colomb-amerique.jpg',
  '/assets/histoire/imprimerie.jpg',
  '/assets/histoire/peste-noire.jpg',
  '/assets/histoire/bastille.jpg',
  '/assets/histoire/independance-usa.jpg',
  '/assets/histoire/sacre-napoleon.jpg',
  '/assets/histoire/premiere-gm.jpg',
  '/assets/histoire/revolution-russe.jpg',
  '/assets/histoire/seconde-gm.jpg',
  '/assets/histoire/hiroshima.jpg',
  '/assets/histoire/lune-apollo11.jpg',
  '/assets/histoire/mur-berlin.jpg',
  '/assets/histoire/11-septembre.jpg',
  '/assets/histoire/pompei.jpg',
  '/assets/histoire/jeanne-darc.jpg',
  '/assets/histoire/constantinople.jpg',
  '/assets/histoire/reforme-luther.jpg',
  '/assets/histoire/revolution-industrielle.jpg',
  '/assets/histoire/titanic.jpg',
  '/assets/histoire/gandhi.jpg',
  '/assets/histoire/gagarine.jpg',
  '/assets/histoire/mlk.jpg',
  '/assets/histoire/mandela.jpg',
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
  const req = e.request;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isImage = req.destination === 'image';

  // Network-first pour le code de l'app (HTML/CSS/JS same-origin) :
  // on a TOUJOURS la dernière version en ligne, le cache ne sert que hors-ligne.
  const isCore = sameOrigin && (
    req.mode === 'navigate' ||
    url.pathname === '/' ||
    /\.(html|css|js|webmanifest)$/.test(url.pathname)
  );

  if (isCore) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Cache-first (stale-while-revalidate) pour les images, polices, etc.
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req).then(res => {
        if (res.ok && (sameOrigin || isImage)) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => cached);
      return cached || network;
    })
  );
});
