/* Village West Team: phone notifications only. This file does not cache or change how the app loads. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

/* The server sends no post content, so the wording lives here. */
self.addEventListener('push', function (e) {
  e.waitUntil(self.registration.showNotification('Something new to read', {
    body: 'Open the app to see it.',
    icon: 'icons/icon-192.png',
    tag: 'vw-new'
  }));
});

/* Tapping it brings the app forward if it is open, or opens it. The app signs in from the link saved on this phone. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf(self.registration.scope) === 0 && list[i].url.indexOf('/lab/') === -1 && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(self.registration.scope);
  }));
});
