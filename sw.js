const CACHE = 'spider-v3';
const FILES = [
  './', 'index.html', 'manifest.json', 'icon.svg', 'css/style.css',
  'js/app.js', 'js/dom.js', 'js/model.js', 'js/web.js', 'js/storage.js', 'js/remote.js',
  'js/setup.js', 'js/record.js', 'js/result.js', 'js/teacher.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// 学校の通信が遅いときに待たせないよう、保存済みのファイルがあれば 3 秒で切り替える
const NETWORK_WAIT_MS = 3000;

async function respond(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  const network = fetch(request).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(request, copy));
    }
    return res;
  });
  if (!cached) return network;
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), NETWORK_WAIT_MS));
  return Promise.race([network.catch(() => cached), timeout]);
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(respond(e.request));
});
