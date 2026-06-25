// sw.js — minimal service worker: offline shell cache + notification clicks.
const CACHE = 'finpulse-v1';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './js/app.js', './js/store.js', './js/email-parser.js',
  './js/sensors.js', './js/impulse.js', './js/notify.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).catch(() => caches.match('./index.html')))
  );
});

// If a real push backend is added later, payloads land here.
self.addEventListener('push', (e) => {
  let data = { title: 'FinPulse', body: 'Update' };
  try { if (e.data) data = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: './icons/icon-192.png' }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => {
    for (const c of cs) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./index.html');
  }));
});
