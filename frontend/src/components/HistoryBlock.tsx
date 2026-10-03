/* Mục "Lịch sử chỉnh sửa" ở cuối drawer bản ghi: ai sửa, lúc nào, trường nào (tên tiếng Việt), cũ → mới, lý do.
   Các trường đổi trong cùng một lần lưu (cùng người, cùng lý do, cách nhau < 5 giây) gộp thành một mục. */
import { Skeleton } from 'antd'
import { ArrowRight, History } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { useHistory } from '@/api/hooksEdit'
import type { FieldChange, HistoryEntity } from '@/api/typesEdit'
import { Sec } from '@/components/ui'
import { fmtD, fmtDelta, fmtDT, fmtKg, fmtNum, money } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'

const LABEL: Record<string, string> = {
  // phiếu cân
  kgExpected: 'KL theo lệnh xuất', kgActual: 'KL cân thực tế', 'signers.bocXep': 'Bốc xếp ký', 'signers.kho': 'Thủ kho ký',
  'signers.laiXe': 'Lái xe ký', mismatchId: 'Biên bản sai lệch', status: 'Trạng thái',
  // phiếu tiếp nhận
  qty: 'Số lượng SP', kg: 'Khối lượng', note: 'Ghi chú',
  // thẻ lái xe
  driver: 'Tài xế', kgRequired: 'KG yêu cầu', refId: 'Chứng từ gốc', kgAtGalv: 'Số cân bên mạ', kgPicked: 'KG ký với mạ',
  kgDelivered: 'KG khách ký', acceptedAt: 'Xác nhận lúc', rejectReason: 'Lý do từ chối', assignedAt: 'Giao việc lúc',
  // sai lệch
  reason: 'Lý do sai lệch', reasonNote: 'Diễn giải', expected: 'Số đúng (kỳ vọng)', actual: 'Số thực tế', delta: 'Chênh lệch',
  // lệnh SX
  name: 'Tên lệnh', qtyPlan: 'SL kế hoạch', kgPlan: 'KL kế hoạch', leadDays: 'Tiến độ (ngày)', deadline: 'Hạn hoàn thành',
  assignedBy: 'Phát lệnh bởi', acceptedBy: 'Người nhận lệnh', extension: 'Gia hạn đến',
  // đơn hàng / hợp đồng
  customer: 'Khách hàng', code: 'Mã nội bộ', file: 'File ký chốt', items: 'Hàng hóa', totalKg: 'Tổng khối lượng',
  value: 'Giá trị', owner: 'Phụ trách', dueAt: 'Hạn trả HĐ', unitPrice: 'Đơn giá/kg', advancePct: '% tạm ứng',
  advanceRequired: 'Tạm ứng yêu cầu', vatPct: 'Thuế VAT (%)',
}
const LABEL_BY_TYPE: Partial<Record<HistoryEntity, Record<string, string>>> = {
  lsx: { assignedAt: 'Phát lệnh lúc', acceptedAt: 'Nhận lệnh lúc', rejectReason: 'Lý do xưởng từ chối' },
  ptn: { kg: 'Khối lượng tiếp nhận' },
}
const KG = new Set(['kgExpected', 'kgActual', 'kg', 'kgRequired', 'kgAtGalv', 'kgPicked', 'kgDelivered', 'expected', 'actual', 'kgPlan', 'totalKg'])
const MONEY = new Set(['value', 'unitPrice', 'advanceRequired'])
const DATE_ONLY = new Set(['deadline', 'dueAt', 'extension'])
const ISO = /^\d{4}-\d{2}-\d{2}T/

function fmtValue(field: string, v: string | null): ReactNode {
  if (v == null || v === '') return <span className="text-ash">—</span>
  if (ISO.test(v)) return DATE_ONLY.has(field) ? fmtD(v) : fmtDT(v)
  const n = Number(v)
  if (!Number.isNaN(n) && v.trim() !== '') {
    if (field === 'delta') return fmtDelta(n)
    if (KG.has(field)) return fmtKg(n)
    if (MONEY.has(field)) return money(n)
    if (field === 'advancePct') return `${fmtNum(n)}%`
    return fmtNum(n)
  }
  if (field === 'mismatchId' || field === 'refId') return <RecordLink id={v} />
  return v
}

interface Group { key: number; at: string; userName: string; reason: string; items: FieldChange[] }

function groupOf(list: FieldChange[]): Group[] {
  const out: Group[] = []
  for (const c of list) {
    const g = out[out.length - 1]
    const near = g && Math.abs(new Date(g.at).getTime() - new Date(c.at).getTime()) < 5000
    if (g && near && g.userName === (c.userName ?? '') && g.reason === c.reason) g.items.push(c)
    else out.push({ key: c.id, at: c.at, userName: c.userName ?? '', reason: c.reason, items: [c] })
  }
  return out
}

export default function HistoryBlock({ type, id }: { type: HistoryEntity; id: string }) {
  const { data, isLoading, isError } = useHistory(type, id)
  const groups = useMemo(() => groupOf(data ?? []), [data])
  const label = (f: string) => LABEL_BY_TYPE[type]?.[f] ?? LABEL[f] ?? f

  return (
    <>
      <Sec icon={<History />}>Lịch sử chỉnh sửa</Sec>
      {isLoading ? <Skeleton active paragraph={{ rows: 2 }} title={false} />
        : isError ? <div className="photo-empty">Không tải được lịch sử chỉnh sửa.</div>
          : !groups.length ? <div className="photo-empty">Chưa có lần chỉnh sửa nào — số liệu đang là bản gốc.</div>
            : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {groups.map((g, i) => (
                  <li key={g.key} style={{ position: 'relative', padding: '0 0 14px 22px' }}>
                    <span style={{ position: 'absolute', left: 5, top: 5, width: 8, height: 8, borderRadius: '50%', background: 'var(--rust)' }} />
                    {i < groups.length - 1 && <span style={{ position: 'absolute', left: 8.5, top: 15, bottom: -2, width: 1, background: 'var(--rule)' }} />}
                    <div style={{ fontSize: 12, color: 'var(--ash)' }}>
                      <b style={{ color: 'var(--ink)' }}>{g.userName || 'Hệ thống'}</b> · <span className="mono">{fmtDT(g.at)}</span>
                    </div>
                    {g.reason && <div style={{ fontSize: 12, marginTop: 2 }}><span className="caption">Lý do:</span> <i>{g.reason}</i></div>}
                    <div style={{ marginTop: 4, display: 'grid', gap: 3 }}>
                      {g.items.map((c) => (
                        <div key={c.id} style={{ fontSize: 12.5, display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                          <span style={{ color: 'var(--ash)', minWidth: 120 }}>{label(c.field)}</span>
                          <span className="num" style={{ textDecoration: 'line-through', color: 'var(--ash)' }}>{fmtValue(c.field, c.oldValue)}</span>
                          <ArrowRight size={11} color="var(--ash)" style={{ alignSelf: 'center' }} />
                          <span className="num" style={{ fontWeight: 600 }}>{fmtValue(c.field, c.newValue)}</span>
                        </div>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
    </>
  )
}
