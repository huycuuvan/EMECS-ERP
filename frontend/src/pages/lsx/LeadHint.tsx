/* Hạn lệnh SX khi phát lệnh: hôm nay + tiến độ (số ngày xưởng làm). Chỉ là hạn của lệnh sản xuất —
   không so với ngày hoàn thành hợp đồng (đó là hạn của kế toán làm hợp đồng, không liên quan sản xuất). */
import dayjs from 'dayjs'

export default function LeadHint({ lead }: { lead?: number | null }) {
  const today = dayjs().startOf('day')
  const days = lead || 7
  return (
    <p className="caption" style={{ margin: '0 0 12px' }}>
      Hạn lệnh: <b>{today.add(days, 'day').format('DD/MM/YYYY')}</b> (hôm nay {today.format('DD/MM')} + {days} ngày) — xưởng phải làm xong khối lượng của lệnh trước ngày này; quá hạn thì báo trễ, Quản lý gia hạn được.
    </p>
  )
}
