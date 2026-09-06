const CACHE_NAME = "servicebericht-v1-11";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./Leer.pdf",
  "./vendor/pdf-lib.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png"
];

// Large/static assets can stay cache-first; everything else prefers network.
function isStaticAsset(url){
  const p = url.pathname;
  return (
    p.includes("/vendor/") ||
    p.includes("/icons/") ||
    p.endsWith("/Leer.pdf") ||
    p.endsWith(".png") ||
    p.endsWith(".jpg") ||
    p.endsWith(".jpeg") ||
    p.endsWith(".webp") ||
    p.endsWith(".pdf")
  );
}

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", event => {
  if(event.data && event.data.type === "SKIP_WAITING"){
    self.skipWaiting();
  }
});

self.addEventListener("fetch", event => {
  const req = event.request;
  if(req.method !== "GET") return;

  const url = new URL(req.url);
  // Never cache the service worker script itself through Cache API.
  if(url.pathname.endsWith("/sw.js")){
    event.respondWith(fetch(req, {cache:"no-store"}).catch(() => caches.match(req)));
    return;
  }

  const networkFirst =
    req.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/manifest.webmanifest") ||
    !isStaticAsset(url);

  if(networkFirst){
    event.respondWith(
      fetch(req, {cache:"no-store"})
        .then(res => {
          if(res && res.ok){
            const copy = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
          }
          return res;
        })
        .catch(() => caches.match(req).then(cached => cached || caches.match("./index.html")))
    );
    return;
  }

  // Cache-first only for heavy static binaries (PDF, icons, pdf-lib).
  event.respondWith(
    caches.match(req).then(cached => {
      if(cached){
        // Soft refresh in background so the next open is fresh.
        fetch(req).then(res => {
          if(res && res.ok){
            caches.open(CACHE_NAME).then(c => c.put(req, res)).catch(()=>{});
          }
        }).catch(()=>{});
        return cached;
      }
      return fetch(req).then(res => {
        if(res && res.ok){
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(()=>{});
        }
        return res;
      });
    })
  );
});
