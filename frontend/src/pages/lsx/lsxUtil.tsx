/* Tiện ích chung cho Lệnh sản xuất (trang danh sách + drawer): hạn hiệu lực, trễ hạn, chip hạn, thanh tiến độ, nhật ký. */
import { Tag } from 'antd'
import { AlarmClock, Check } from 'lucide-react'
import type { CSSProperties } from 'react'
import type { Lsx } from '@/api/types'
import { daysLeft, fmtD, fmtDT, fmtNum, relTime } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { C } from '@/theme'

/** Hạn hiệu lực = hạn gia hạn (nếu có) hoặc hạn gốc. */
export const effDeadline = (x: Lsx) => x.extension?.to ?? x.deadline
export const isLate = (x: Lsx) => x.status !== 'Hoàn thành' && x.status !== 'Từ chối' && new Date(effDeadline(x)) < new Date()
/** "5 giờ" — thời gian lệnh đã chờ xưởng nhận. */
export const waitLabel = (x: Lsx) => relTime(x.assignedAt).replace(' trước', '')
export const pctOf = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0)

const chipBase: CSSProperties = { fontWeight: 600, fontSize: 11, borderRadius: 999, margin: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }

/** Chip hạn của LSX: Hoàn thành / Chưa có xưởng nhận / TRỄ n ngày (đỏ nhấp nháy) / Còn n ngày. */
export function LsxDueChip({ x }: { x: Lsx }) {
  if (x.status === 'Hoàn thành')
    return <Tag variant="filled" style={{ ...chipBase, background: C.mossSoft, color: C.moss }}><Check size={11} />Hoàn thành</Tag>
  if (x.status === 'Từ chối')
    return <Tag variant="filled" style={{ ...chipBase, background: C.paper2, color: C.ash }}>Chưa có xưởng nhận</Tag>
  const dl = daysLeft(effDeadline(x))
  if (isLate(x))
    return <Tag variant="filled" className="chip-overdue" style={{ ...chipBase, background: C.signalSoft, color: C.signal }}><AlarmClock size={11} />TRỄ {Math.abs(dl)} ngày</Tag>
  return <Tag variant="filled" style={{ ...chipBase, background: dl <= 2 ? C.amberSoft : C.paper2, color: dl <= 2 ? C.amber : C.ash }}>Còn {dl} ngày</Tag>
}

/** Ô "Hạn" của bảng: ngày gốc + "→ gia hạn dd/mm" (tooltip lý do) + chip. */
export function LsxDueCell({ x }: { x: Lsx }) {
  return (
    <div>
      <div className="num">
        {fmtD(x.deadline)}
        {x.extension && (
          <span title={`Lý do gia hạn: ${x.extension.reason} (duyệt bởi ${x.extension.approvedBy})`}
            style={{ color: C.rust, fontWeight: 600, cursor: 'help', borderBottom: `1px dotted ${C.rust}`, marginLeft: 4 }}>
            → gia hạn {fmtD(x.extension.to).slice(0, 5)}
          </span>
        )}
      </div>
      <div style={{ marginTop: 4 }}><LsxDueChip x={x} /></div>
    </div>
  )
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 6, background: C.paper2, borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: 3 }} />
    </div>
  )
}

/** Giờ cảnh báo xưởng chưa nhập sản lượng ngày (khớp END_OF_DAY_HOUR ở backend). */
export const DAILY_DEADLINE_HOUR = 20
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '')

/** Sản lượng hôm nay của lệnh đang SX: số kg + GIỜ nhập/sửa (để Quản lý biết số mới tới đâu), hoặc cảnh báo chưa nhập. */
export function TodayOutput({ x }: { x: Lsx }) {
  if (x.status !== 'Đang SX') return null
  const st: CSSProperties = { fontSize: 11, marginTop: 4, fontVariantNumeric: 'tabular-nums' }
  if (x.today) return (
    <div style={{ ...st, color: C.ink3 }}>
      Hôm nay <b>{fmtNum(x.today.kg)} kg</b> · {x.today.edited ? 'sửa' : 'nhập'} lúc <b>{hhmm(x.today.at)}</b>
    </div>
  )
  const late = new Date().getHours() >= DAILY_DEADLINE_HOUR
  return <div style={{ ...st, color: late ? C.signal : C.amber, fontWeight: 700 }}>Chưa nhập sản lượng hôm nay{late ? ' — quá 20h' : ''}</div>
}

/** Tiến độ theo khối lượng (kg) — xanh khi hoàn thành, đỏ khi trễ, vàng khi đang chạy — kèm sản lượng hôm nay. */
export function LsxMiniProgress({ x }: { x: Lsx }) {
  const pk = pctOf(x.kgDone, x.kgPlan)
  const color = x.status === 'Hoàn thành' ? C.moss : isLate(x) ? C.signal : C.amber
  const lbl: CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: C.ash, marginBottom: 3, fontVariantNumeric: 'tabular-nums' }
  return (
    <div style={{ minWidth: 170 }}>
      <div style={lbl}><span>{fmtNum(x.kgDone)}/{fmtNum(x.kgPlan)} kg</span><span>{pk}%</span></div>
      <MiniBar pct={pk} color={color} />
      <TodayOutput x={x} />
    </div>
  )
}

/** Nhật ký lệnh (mới nhất trên cùng); dòng TỪ CHỐI / QUÁ HẠN tô đỏ. */
export function LsxTimeline({ log }: { log: Lsx['log'] }) {
  const items = [...log].sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  if (!items.length) return <p className="caption">Chưa có nhật ký.</p>
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((l, i) => {
        const alert = /TỪ CHỐI|QUÁ HẠN|trình lý do/i.test(l.text)
        const last = i === items.length - 1
        return (
          <li key={i} style={{ position: 'relative', padding: '0 0 14px 22px' }}>
            <span style={{ position: 'absolute', left: 5, top: 5, width: 8, height: 8, borderRadius: '50%', background: alert ? C.signal : C.rust }} />
            {!last && <span style={{ position: 'absolute', left: 8.5, top: 15, bottom: -2, width: 1, background: C.rule }} />}
            <div className="mono" style={{ fontSize: 11, color: C.ash }}>{fmtDT(l.at)}</div>
            <div style={{ fontSize: 12.5, marginTop: 1, color: alert ? C.signal : C.ink, fontWeight: alert ? 600 : 400 }}>{l.text}</div>
          </li>
        )
      })}
    </ul>
  )
}

/** Quyền thao tác LSX: xưởng (sx) nhận/từ chối/cập nhật tiến độ; Quản lý (admin) phát lệnh + duyệt gia hạn. Admin làm được tất cả. */
export function useLsxPerms() {
  const { hasRole } = useAuth()
  return { canSx: hasRole('sx'), canQl: hasRole('admin') }
}
