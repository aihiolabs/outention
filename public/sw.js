const CACHE_NAME = "outention-shell-v6";
const SHELL_PATHS = ["./", "./favicon.svg", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png", "./manifest.webmanifest"];

self.addEventListener("install", event => {
  const urls = SHELL_PATHS.map(path => new URL(path, self.registration.scope).toString());
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urls)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.includes("/api/")) return;
  if (request.mode === "navigate") {
    const fallback = new URL("./", self.registration.scope).toString();
    event.respondWith(fetch(request).catch(() => caches.match(fallback)));
    return;
  }
  event.respondWith(fetch(request).then(response => {
    if (response.ok) caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
