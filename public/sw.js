/* Offline support. The app shell is cached on install; questions and account data use
   network-first so they stay fresh online and still work offline. Admin pages are never cached. */
var SHELL = 'prov-shell-v10';
var DATA = 'prov-data';
var IMAGES = 'prov-img';
var SHELL_FILES = ['/', '/app.css', '/app.js', '/i18n.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];
var DATA_PATHS = ['/api/config', '/api/me', '/api/questions', '/api/reviews', '/api/qr.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('prov-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function networkFirst(req, cacheName) {
  return fetch(req).then(function (res) {
    if (res.ok) {
      var copy = res.clone();
      caches.open(cacheName).then(function (c) { c.put(req, copy); });
    }
    return res;
  }).catch(function () {
    return caches.match(req).then(function (hit) { return hit || Promise.reject(new Error('offline')); });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(SHELL).then(function (c) {
    return c.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);

  if (url.origin === location.origin) {
    if (url.pathname.indexOf('/admin') === 0 || url.pathname.indexOf('/api/admin') === 0) return;
    if (DATA_PATHS.indexOf(url.pathname) >= 0) return e.respondWith(networkFirst(req, DATA));
    if (url.pathname.indexOf('/api/') === 0) return;
    if (req.mode === 'navigate') {
      return e.respondWith(fetch(req).catch(function () { return caches.match('/'); }));
    }
    return e.respondWith(staleWhileRevalidate(req));
  }

  // Question pictures hosted elsewhere: keep a copy for offline use.
  if (req.destination === 'image') {
    e.respondWith(caches.open(IMAGES).then(function (c) {
      return c.match(req).then(function (hit) {
        return hit || fetch(req).then(function (res) { c.put(req, res.clone()); return res; });
      });
    }));
  }
});
