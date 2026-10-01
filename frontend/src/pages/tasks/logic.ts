/* Logic thuần cho thẻ lái xe (quá hạn, countdown...). */
import { useEffect, useState } from 'react'
import type { Task } from '@/api/types'

/** Đồng hồ cho countdown hạn điền phiếu (tick mỗi 30s). */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(h)
  }, [ms])
  return now
}

/** Quá hạn điền phiếu = đã xuất phát, có hạn 24h, chưa điền, đã qua hạn (giống demo). */
export const isOverdue = (t: Task, now = Date.now()) => !!t.fillDeadline && !t.filledAt && now > new Date(t.fillDeadline).getTime()
export const hoursOverAt = (iso: string, now = Date.now()) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 3600000))
/** Thẻ "rảnh" chưa tới bước điền phiếu. */
export const isIdle = (t: Task) => t.status === 'Chờ xác nhận' || t.status === 'Từ chối' || t.status === 'Đã nhận'
export const typeLabel = (t: Task) => (t.type === 'di_ma' ? 'Đi mạ' : 'Giao khách')

/** Còn bao lâu tới hạn: "còn 5h 12p". */
export function countdown(iso: string, now = Date.now()) {
  const ms = new Date(iso).getTime() - now
  if (ms <= 0) return null
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  return h > 0 ? `còn ${h}h ${String(m % 60).padStart(2, '0')}p` : `còn ${m}p`
}
