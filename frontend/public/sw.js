/* Service worker EMECS ERP — nhận thông báo đẩy (Web Push) khi app đã đóng; bấm thông báo mở thẳng bản ghi.
   Không cache trang (luôn lấy bản mới nhất từ máy chủ). */
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch (err) { d = { title: 'EMECS Việt Nam', body: e.data ? e.data.text() : '' } }
  const url = `/xem/${encodeURIComponent(d.ref || '-')}?n=${d.id || ''}`
  e.waitUntil((async () => {
    // app đang mở trên màn hình → app đã tự hiện popup (realtime), không hiện trùng thông báo của máy
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.some((w) => w.visibilityState === 'visible')) return
    await self.registration.showNotification(d.title || 'EMECS Việt Nam', {
      body: d.body || '', icon: '/icon-192.png', badge: '/icon-192.png', tag: `n${d.id || Date.now()}`,
      data: { url }, vibrate: [120, 60, 120],
    })
  })())
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if ('focus' in w) { await w.focus(); w.postMessage({ type: 'open', url }); return }
    }
    await self.clients.openWindow(url)
  })())
})
