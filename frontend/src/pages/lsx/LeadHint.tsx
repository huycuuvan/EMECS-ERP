/* Hạn lệnh SX khi phát lệnh = hôm nay + tiến độ (số ngày xưởng làm), so với HẠN GIAO HÀNG cho khách của hợp đồng
   (không phải hạn trả hợp đồng — đó là việc giấy tờ của kế toán). Trễ hơn → nhắc màu vàng, không chặn,
   gợi ý tiến độ tối đa để kịp, bấm là đặt luôn. */
import { Button } from 'antd'
import { AlarmClock, CheckCircle2 } from 'lucide-react'
import dayjs from 'dayjs'
import { C } from '@/theme'

export default function LeadHint({ deliverBy, lead, onFit }: { deliverBy?: string | null; lead?: number | null; onFit?: (days: number) => void }) {
  const today = dayjs().startOf('day')
  const days = lead || 7
  const end = today.add(days, 'day')
  const fmt = (d: dayjs.Dayjs) => d.format('DD/MM/YYYY')
  const how = <>hôm nay {today.format('DD/MM')} + {days} ngày</>
  if (!deliverBy) return <p className="caption" style={{ margin: '0 0 12px' }}>Hạn lệnh: <b>{fmt(end)}</b> ({how}) — hợp đồng chưa có hạn giao hàng để so.</p>
  const by = dayjs(deliverBy).startOf('day')
  const max = by.diff(today, 'day')  // tiến độ tối đa để hạn lệnh không trễ hạn giao hàng
  if (!end.isAfter(by)) return (
    <p className="caption" style={{ margin: '0 0 12px', display: 'flex', gap: 6, alignItems: 'center', color: C.moss }}>
      <CheckCircle2 size={13} style={{ flex: 'none' }} />
      <span>Hạn lệnh <b>{fmt(end)}</b> ({how}) — trước hạn giao hàng cho khách {fmt(by)}.</span>
    </p>
  )
  return (
    <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, lineHeight: 1.55, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: C.amber, fontWeight: 700 }}>
        <AlarmClock size={14} style={{ flex: 'none', marginTop: 3 }} />
        <span>Hạn lệnh {fmt(end)} trễ hơn hạn giao hàng cho khách {fmt(by)}</span>
      </div>
      <div>Hạn lệnh = {how}. {max >= 1
        ? <>Để kịp giao khách, tiến độ tối đa <b>{max} ngày</b> (chưa tính thời gian đi mạ và giao).</>
        : <>Hạn giao hàng {max === 0 ? 'là hôm nay' : 'đã qua'} — báo khách lùi ngày hoặc Quản lý sửa hạn giao hàng trong hợp đồng.</>}
        {' '}Vẫn phát lệnh được nếu đã thống nhất với khách.</div>
      {max >= 1 && onFit && <div><Button size="small" onClick={() => onFit(max)}>Đặt tiến độ {max} ngày</Button></div>}
    </div>
  )
}
