/* Offline support for the installed app: the app files are cached and served
   instantly, then refreshed in the background. Price data is never cached here
   (the app keeps its own 15-minute cache). Bump VERSION on each release. */
const VERSION = 'spl-v4';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/indicators.js', './js/data.js', './js/patterns.js', './js/learn.js', './js/backtest.js', './js/live.js',
  './js/context.js', './js/journal.js', './js/trackrecord.js', './js/chart.js', './js/app.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/icon.svg',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return; // prices and fonts go straight to the network
  e.respondWith(caches.open(VERSION).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then(r => { if (r && r.ok) cache.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
