const CACHE = "bcard-mobile-3d-v14";
const OCR_CORE = [
  "tesseract-core.js", "tesseract-core.wasm", "tesseract-core.wasm.js",
  "tesseract-core-lstm.js", "tesseract-core-lstm.wasm", "tesseract-core-lstm.wasm.js",
  "tesseract-core-relaxedsimd.js", "tesseract-core-relaxedsimd.wasm", "tesseract-core-relaxedsimd.wasm.js",
  "tesseract-core-relaxedsimd-lstm.js", "tesseract-core-relaxedsimd-lstm.wasm", "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-simd.js", "tesseract-core-simd.wasm", "tesseract-core-simd.wasm.js",
  "tesseract-core-simd-lstm.js", "tesseract-core-simd-lstm.wasm", "tesseract-core-simd-lstm.wasm.js"
].map(file => `./vendor/tesseract/core/${file}`);
const ASSETS = ["./", "./index.html", "./styles.css", "./logic.js", "./ocr.js", "./app.js", "./manifest.json", "./icon.svg", "./icon-192.png", "./icon-512.png", "./vendor/jquery.min.js", "./vendor/lucide.min.js", "./vendor/fonts/dm-sans/index.css", "./vendor/fonts/nunito/index.css", "./vendor/tesseract/tesseract.min.js", "./vendor/tesseract/worker.min.js", "./vendor/tesseract/lang/vie.traineddata.gz", "./vendor/tesseract/lang/eng.traineddata.gz"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([...ASSETS, ...OCR_CORE])));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) caches.open(CACHE).then(cache => cache.put("./index.html", response.clone()));
      return response;
    }).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && new URL(event.request.url).origin === self.location.origin) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => Response.error())));
});
