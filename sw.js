// Service worker: the game works offline (except the online lobby).
// Network first, so a new version is used as soon as it is online.
const CACHE_NAME = "hexaprog-v1";
const ASSETS = [
  "./", "index.html", "site.webmanifest", "icon/icon.svg",
  "engine/hex.js", "engine/rules.js", "engine/core.js",
  "ai/ai.js", "ai/eval.js", "ai/rng.js",
  "lab/runner.js", "lab/lab-worker.js",
  "ui/app.js", "ui/board.js", "ui/lab.js", "ui/ai-worker.js",
  "net/online.js", "net/backend-firebase.js", "net/firebase-config.js",
];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match(e.request)));
});
