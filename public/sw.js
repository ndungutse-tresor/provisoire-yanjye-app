/* Offline support. The app itself and the questions and account data are fetched fresh when the
   network answers, and come from the saved copy when offline. Admin pages are never cached. */
var SHELL = 'prov-shell-v13';
var WAIT_MS = 3000;   // how long to wait for the server before opening the saved copy
var DATA = 'prov-data';
var SHELL_FILES = ['/', '/app.css', '/app.js', '/i18n.js', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png'];
var DATA_PATHS = ['/api/config', '/api/me', '/api/questions', '/api/reviews', '/api/qr.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return c.addAll(SHELL_FILES); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // Old app versions, and the old copies of pictures from other sites (no longer kept).
    return Promise.all(keys.filter(function (k) { return (k.indexOf('prov-shell-') === 0 && k !== SHELL) || k === 'prov-img'; }).map(function (k) { return caches.delete(k); }));
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

// The newest version of the app when the server answers in time, so an update reaches everyone
// on their next open. The saved copy when offline, or while the (free, sleeping) server wakes up.
function freshFirst(req, key) {
  return caches.open(SHELL).then(function (c) {
    var saved = function () { return c.match(key || req); };
    var net = fetch(req).then(function (res) { if (res.ok) c.put(key || req, res.clone()); return res; });
    return new Promise(function (resolve, reject) {
      var done = false;
      var finish = function (res) { if (!done) { done = true; resolve(res); } };
      var timer = setTimeout(function () { saved().then(function (hit) { if (hit) finish(hit); }); }, WAIT_MS);
      net.then(function (res) { clearTimeout(timer); finish(res); }, function (err) {
        clearTimeout(timer);
        saved().then(function (hit) { if (done) return; done = true; if (hit) resolve(hit); else reject(err); });
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // Only this site's own files. Other sites (and browser extensions) load as normal:
  // the page's security rules don't let this worker fetch them anyway.
  if (url.origin !== location.origin) return;

  if (url.pathname.indexOf('/admin') === 0 || url.pathname.indexOf('/api/admin') === 0) return;
  if (DATA_PATHS.indexOf(url.pathname) >= 0) return e.respondWith(networkFirst(req, DATA));
  if (url.pathname.indexOf('/api/') === 0) return;
  if (req.mode === 'navigate') return e.respondWith(freshFirst(req, '/'));
  return e.respondWith(freshFirst(req));
});
