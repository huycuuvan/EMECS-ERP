/* Thông báo đẩy (Web Push): hiện trên điện thoại / máy tính kể cả khi đã đóng webapp.
   Trình duyệt chỉ cho dùng khi trang mở bằng HTTPS (hoặc localhost). iPhone: phải "Thêm vào MH chính" rồi mở từ biểu tượng. */
import { api } from '@/api/client'

export type PushState = 'unsupported' | 'insecure' | 'ios-install' | 'denied' | 'off' | 'on'

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return null
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

export async function pushState(): Promise<PushState> {
  if (!window.isSecureContext) return 'insecure'
  if (isIOS() && !standalone()) return 'ios-install'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'on' : 'off'
}

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

/** Xin quyền + đăng ký nhận thông báo cho tài khoản đang đăng nhập. Gọi từ một lần bấm nút. */
export async function enablePush(): Promise<PushState> {
  const st = await pushState()
  if (st !== 'off') return st
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await registerSW())
  if (!reg) return 'unsupported'
  await navigator.serviceWorker.ready
  const { data } = await api.get<{ publicKey: string }>('/push/key')
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(data.publicKey) }))
  await api.post('/push/subscribe', sub.toJSON())
  return 'on'
}

/** Đăng xuất / tắt: hủy đăng ký trên máy này để không nhận thông báo của tài khoản cũ. */
export async function disablePush(): Promise<void> {
  const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  try { await api.post('/push/unsubscribe', sub.toJSON()) } catch { /* bỏ qua */ }
  await sub.unsubscribe()
}

/** Đã bật trên máy này → gửi lại đăng ký cho tài khoản hiện tại (sau khi đăng nhập lại). */
export async function resyncPush(): Promise<void> {
  if ((await pushState()) !== 'on') return
  const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription()
  if (sub) { try { await api.post('/push/subscribe', sub.toJSON()) } catch { /* bỏ qua */ } }
}

export const PUSH_HINT: Record<PushState, string> = {
  unsupported: 'Trình duyệt này không hỗ trợ thông báo đẩy — dùng Chrome / Safari bản mới.',
  insecure: 'Thông báo đẩy cần trang chạy HTTPS (tên miền có chứng chỉ). Hiện vẫn nhận thông báo trực tiếp khi đang mở app.',
  'ios-install': 'iPhone: bấm nút Chia sẻ → "Thêm vào MH chính", rồi mở app từ biểu tượng đó để bật thông báo.',
  denied: 'Bạn đã chặn thông báo cho trang này — mở cài đặt trang trong trình duyệt để cho phép lại.',
  off: 'Bật để nhận thông báo trên máy kể cả khi đã đóng app.',
  on: 'Đã bật thông báo trên máy này.',
}
