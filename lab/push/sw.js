/* Notification test only. This file controls nothing outside /lab/push/. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('push', function (e) {
  e.waitUntil(self.registration.showNotification('Village West Team', {
    body: 'Test: a new post is waiting for you.',
    icon: '../../icons/icon-192.png',
    tag: 'vw-test'
  }));
});
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.openWindow('./'));
});
