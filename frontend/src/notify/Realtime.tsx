/* Thông báo realtime: giữ 1 kết nối SSE tới máy chủ khi đã đăng nhập.
   Có thông báo mới → cập nhật chuông + dữ liệu trên màn ngay, hiện popup góc màn; bấm popup → mở thẳng bản ghi.
   Đồng thời đăng ký service worker (thông báo đẩy khi đóng app) và nhận lệnh "mở" từ thông báo của máy. */
import { useQueryClient } from '@tanstack/react-query'
import { App } from 'antd'
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, tokenStore } from '@/api/client'
import type { Notification } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { C } from '@/theme'
import { registerSW, resyncPush } from './push'
import { notifTarget } from './target'

const ICON = {
  info: <Info size={18} color={C.steel} />, success: <CheckCircle2 size={18} color={C.moss} />,
  warning: <AlertTriangle size={18} color={C.amber} />, error: <XCircle size={18} color={C.signal} />,
}

/** Bấm 1 thông báo: đánh dấu đã đọc (riêng người này) + mở bản ghi. */
export function useOpenNotification() {
  const { user, roles } = useAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  return useCallback((n: Pick<Notification, 'id' | 'refId'>) => {
    api.post(`/notifications/${n.id}/read`).then(() => qc.invalidateQueries({ queryKey: ['notifications'] })).catch(() => undefined)
    navigate(notifTarget(n.refId, user?.permissions, roles))
  }, [user, roles, navigate, qc])
}

export default function RealtimeBridge() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const { notification } = App.useApp()
  const navigate = useNavigate()
  const openN = useOpenNotification()

  useEffect(() => { if (user) registerSW().then(() => resyncPush()) }, [user])

  useEffect(() => {
    const token = tokenStore.get()
    if (!user || !token || typeof EventSource === 'undefined') return
    const es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`)
    es.addEventListener('notif', (ev) => {
      let n: Notification
      try { n = JSON.parse((ev as MessageEvent).data) } catch { return }
      qc.invalidateQueries()  // chuông + mọi màn đang mở tự tải lại số liệu mới
      const key = `n${n.id}`
      notification.open({
        key, message: n.title, description: n.sub || undefined, icon: ICON[n.type] ?? ICON.info,
        placement: window.innerWidth < 640 ? 'top' : 'topRight', duration: 8,
        style: { cursor: n.refId ? 'pointer' : undefined },
        onClick: () => { notification.destroy(key); openN(n) },
      })
      try { navigator.vibrate?.(120) } catch { /* máy không hỗ trợ rung */ }
    })
    return () => es.close()
  }, [user, qc, notification, openN])

  // bấm thông báo của máy (service worker) khi app đang mở → điều hướng trong app, không mở tab mới
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const h = (e: MessageEvent) => { if (e.data?.type === 'open' && typeof e.data.url === 'string') navigate(e.data.url) }
    navigator.serviceWorker.addEventListener('message', h)
    return () => navigator.serviceWorker.removeEventListener('message', h)
  }, [navigate])

  return null
}
