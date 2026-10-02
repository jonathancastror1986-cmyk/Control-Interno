// EL SERVICE WORKER
// =================
//
// -------------------------------------------------------------------
// POR QUÉ ESTE ARCHIVO
// --------------------
//
// "app.html" no se puede versionar con "?v=". La versión va en la dirección, y a "app.html"
// se llega con "window.location.href", que no lleva ningún parámetro.
//
// Y sin "?v=", el navegador guarda el HTML y recargar no siempre lo vuelve a pedir. El
// síntoma es que se escribe una pantalla nueva, se recarga, y sigue la anterior. No da error:
// abre, se ve bien, y ejecuta el código de hace tres commits. Ver [cache-01].
//
// -------------------------------------------------------------------
// Y LA REGLA: PRIMERO LA RED
// ---------------------------
//
// Para el HTML va a la red PRIMERO y al caché solo si la red no responde. Al revés —caché
// primero— es lo rápido pero es justamente lo que pasa hoy sin querer.
//
// Y para el CSS y el JS va al caché PRIMERO, porque esos sí llevan "?v=", y con el "?v=" el
// archivo con número distinto es un archivo distinto. Ver [cache-02].
//
// -------------------------------------------------------------------
// Y LO DE OTROS SITIOS NO SE TOCA
// -------------------------------
//
// Las librerías de CDN y las consultas a Supabase son de otro origen. Este archivo no las
// guarda: lo que no es del proyecto, no se cachea desde acá. Ver [cache-03].
//
const CACHE = 'ca-v55';

self.addEventListener('install', (e) => {
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (e) => {
  // Borra los cachés viejos. Sin esto se acumularían uno por versión, que es la forma que
  // tiene un service worker de comerse la memoria del móvil sin decir nada.
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Lo de otro origen no se guarda. Ver [cache-03].
  if (url.origin !== self.location.origin) return;

  // El HTML: primero la red.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').indexOf('text/html') >= 0) {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('pages/app.html')))
    );
    return;
  }

  // El CSS y el JS: primero el caché. Y solo si son del proyecto.
  if (!/\/(css|js|config|models|controllers|views)\//.test(url.pathname)) return;

  e.respondWith(
    caches.match(req).then((guardado) => {
      if (guardado) return guardado;
      return fetch(req).then((r) => {
        if (r && r.status === 200 && r.type === 'basic') {
          const copia = r.clone();
          caches.open(CACHE).then((c) => c.put(req, copia)).catch(() => {});
        }
        return r;
      });
    })
  );
});
