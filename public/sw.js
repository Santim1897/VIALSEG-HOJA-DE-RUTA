// Service worker mínimo: permite abrir la app del conductor sin señal.
// Páginas: red primero, copia guardada si no hay conexión. Archivos estáticos: copia guardada primero.
const CACHE = "vialseg-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET" || new URL(request.url).pathname.startsWith("/api/")) return;
  const estatico = /\/_next\/static\/|\.(png|svg|css|js|woff2?)$/.test(request.url);
  e.respondWith(
    (estatico
      ? caches.match(request).then((r) => r || fetch(request).then((res) => guardar(request, res)))
      : fetch(request).then((res) => guardar(request, res)).catch(() => caches.match(request))
    ).then((r) => r || Response.error()),
  );
});

function guardar(request, res) {
  if (res.ok) {
    const copia = res.clone();
    caches.open(CACHE).then((c) => c.put(request, copia));
  }
  return res;
}
