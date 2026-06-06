// Minimal service worker v2

self.addEventListener('install', (event) => {
  console.log('Service Worker: Yükleniyor...');
  // Yeni worker'ın beklemeden hemen aktif olmasını sağlar.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Aktif ediliyor...');
  // Aktivasyondan sonra, yeni service worker tüm istemcilerin kontrolünü alır.
  event.waitUntil(self.clients.claim());
});

// Bu, istekleri doğrudan ağa yönlendiren bir "geçirgen" (passthrough) fetch işleyicisidir.
// Önbellekleme yapmaz. Uygulamanın PWA olarak yüklenebilmesi için gereklidir.
self.addEventListener('fetch', (event) => {
  // Tarayıcının isteği normal şekilde işlemesine izin ver.
  return;
});

// İstemciden (uygulamadan) gelen bekleme aşamasını atlama mesajını dinler.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
