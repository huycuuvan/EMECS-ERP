/* Giải thích hạn lệnh khi phát lệnh SX: hạn lệnh = hôm nay + tiến độ (ngày), so với ngày hoàn thành đơn.
   Trễ hơn ngày hoàn thành → nhắc (không chặn) và gợi ý tiến độ tối đa để kịp, bấm là đặt luôn. */
import { Button } from 'antd'
import { AlarmClock, CheckCircle2 } from 'lucide-react'
import dayjs from 'dayjs'
import { C } from '@/theme'

export default function LeadHint({ completeBy, lead, onFit }: { completeBy?: string | null; lead?: number | null; onFit: (days: number) => void }) {
  const today = dayjs().startOf('day')
  const days = lead || 7
  const end = today.add(days, 'day')
  const fmt = (d: dayjs.Dayjs) => d.format('DD/MM/YYYY')
  const how = <>hôm nay {today.format('DD/MM')} + {days} ngày tiến độ</>
  if (!completeBy) return <p className="caption" style={{ margin: '0 0 12px' }}>Hạn lệnh: <b>{fmt(end)}</b> ({how}).</p>

  const by = dayjs(completeBy).startOf('day')
  const max = by.diff(today, 'day')  // số ngày tiến độ tối đa để hạn lệnh không trễ ngày hoàn thành
  if (!end.isAfter(by)) return (
    <p className="caption" style={{ margin: '0 0 12px', display: 'flex', gap: 6, alignItems: 'center', color: C.moss }}>
      <CheckCircle2 size={13} style={{ flex: 'none' }} />
      <span>Hạn lệnh <b>{fmt(end)}</b> ({how}) — kịp ngày hoàn thành đơn {fmt(by)}.</span>
    </p>
  )
  return (
    <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, lineHeight: 1.55, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', color: C.amber, fontWeight: 700 }}>
        <AlarmClock size={14} style={{ flex: 'none', marginTop: 3 }} />
        <span>Hạn lệnh {fmt(end)} trễ hơn ngày hoàn thành đơn {fmt(by)}</span>
      </div>
      <div>Hạn lệnh = {how}. {max >= 1
        ? <>Để xưởng làm xong trước ngày hoàn thành, tiến độ tối đa <b>{max} ngày</b>.</>
        : <>Ngày hoàn thành đơn {max === 0 ? 'là hôm nay' : 'đã qua'} — không còn đủ thời gian; báo khách lùi ngày hoặc sửa ngày hoàn thành trong hợp đồng.</>}
        {' '}Vẫn phát lệnh được nếu đã thống nhất với khách.</div>
      {max >= 1 && <div><Button size="small" onClick={() => onFit(max)}>Đặt tiến độ {max} ngày</Button></div>}
    </div>
  )
}
