// King's Vendetta service worker: shows "your turn" push notifications. It does not cache anything,
// so new deploys are never hidden behind an old copy.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || "King's Vendetta", {
    body: d.body || 'Your turn!',
    icon: 'images/icon-192.png',
    badge: 'images/icon-192.png',
    tag: 'kv-turn',
    renotify: true,
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf('kings-vendetta') >= 0 || list[i].url.indexOf('localhost') >= 0) { list[i].navigate(url); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
