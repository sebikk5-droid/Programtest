const CACHE_NAME = "servicebericht-v27-6-70";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./companies.json",
  "./Leer.pdf",
  "./vendor/pdf-lib.min.js",
  "./sw.js"
];

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

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Always network-first for HTML so updates apply quickly.
  if (url.pathname.endsWith("/index.html") || req.mode === "navigate") {
    event.respondWith(
      fetch(req, {cache:"no-store"})
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Cache-first for local assets (pdf-lib, template PDF, companies).
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (!res || !res.ok) return res;
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      });
    })
  );
});
