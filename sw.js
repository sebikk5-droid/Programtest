const CACHE_NAME = "servicebericht-v1-22";
const APP_SHELL_CRITICAL = [
  "./index.html",
  "./manifest.webmanifest"
];
const APP_SHELL_LAZY = [
  "./Leer.pdf",
  "./vendor/pdf-lib.min.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png"
];

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

// Promise.race timeout – more reliable on older iOS Safari than AbortController alone.
function fetchWithTimeout(request, ms){
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request, {cache:"no-store"})
      .then(res => { clearTimeout(timer); resolve(res); })
      .catch(err => { clearTimeout(timer); reject(err); });
  });
}

async function putInCache(request, response){
  try{
    if(!response || !response.ok) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }catch(e){}
}

async function matchHtml(){
  return (await caches.match("./index.html"))
    || (await caches.match("index.html"))
    || (await caches.match("./"));
}

function offlineHtml(){
  return new Response("Servicebericht offline – bitte erneut laden.", {
    status:503,
    headers:{"Content-Type":"text/plain; charset=utf-8"}
  });
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Critical shell first so the app can open even if PDF/pdf-lib is slow.
    await Promise.all(APP_SHELL_CRITICAL.map(url => cache.add(url).catch(() => null)));
    await self.skipWaiting();
    // Large assets in background – do not block activation/start.
    APP_SHELL_LAZY.forEach(url => { cache.add(url).catch(() => null); });
  })());
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
  if(url.origin !== self.location.origin) return;

  // Never let SW script updates hang on Cache API.
  if(url.pathname.endsWith("/sw.js")){
    event.respondWith(
      fetchWithTimeout(req, 4000).catch(() => caches.match(req).then(c => c || offlineHtml()))
    );
    return;
  }

  const isHtml =
    req.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/") ||
    url.pathname.endsWith("/Programtest") ||
    url.pathname.endsWith("/Programtest/");

  if(isHtml || url.pathname.endsWith("/manifest.webmanifest")){
    event.respondWith((async () => {
      // Instant open from cache when available (prevents iPad "loading forever").
      const cached = isHtml
        ? await matchHtml()
        : (await caches.match(req));

      const network = fetchWithTimeout(req, 3500)
        .then(async res => {
          if(res && res.ok){
            await putInCache(isHtml ? "./index.html" : req, res);
          }
          return res;
        })
        .catch(() => null);

      if(cached){
        // Refresh cache in background; return cached page immediately.
        network.then(() => {}).catch(() => {});
        return cached;
      }

      const fresh = await network;
      if(fresh) return fresh;
      return (await matchHtml()) || offlineHtml();
    })());
    return;
  }

  if(isStaticAsset(url)){
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if(cached){
        fetchWithTimeout(req, 8000).then(res => putInCache(req, res)).catch(()=>{});
        return cached;
      }
      try{
        const res = await fetchWithTimeout(req, 8000);
        await putInCache(req, res);
        return res;
      }catch(e){
        return offlineHtml();
      }
    })());
    return;
  }

  // Default: short network attempt, then cache.
  event.respondWith(
    fetchWithTimeout(req, 4000)
      .then(async res => {
        await putInCache(req, res);
        return res;
      })
      .catch(() => caches.match(req).then(c => c || offlineHtml()))
  );
});
