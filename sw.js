// Kalibrasyon — no-op service worker (onbellek YOK; her zaman agdan guncel surum).
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
// Fetch'e karisma -> tarayici normal ag davranisi, bayat onbellek olmaz.
