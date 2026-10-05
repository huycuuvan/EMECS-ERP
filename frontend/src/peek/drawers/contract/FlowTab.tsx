/* MÀN 3 — BẢNG CÂN ĐỐI LUÂN CHUYỂN THÉP: nguồn = phân bổ, dải phân bổ, sổ số dư chạy. */
import { Skeleton } from 'antd'
import { AlertTriangle, CheckCircle2, History, Scale } from 'lucide-react'
import type { ContractAgg, Ledger } from '@/api/types'
import { Sec } from '@/components/ui'
import { fmtDT, fmtNum } from '@/lib/format'
import RecordLink from '../../RecordLink'
import { FLOW_COLS } from './utils'

const sg = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtNum(Math.abs(n))

export default function FlowTab({ g, L }: { g: ContractAgg; L?: Ledger }) {
  if (!L) return <Skeleton active paragraph={{ rows: 6 }} style={{ marginTop: 20 }} />
  return (
    <>
      <Sec icon={<Scale />}>Bảng cân đối luân chuyển thép — NGUỒN HÀNG = PHÂN BỔ</Sec>
      <div className="hdbs">
        <div className="hdbs-box">
          <div className="hdbs-t">Nguồn hàng (SX bàn giao vào kho)</div>
          <div className="hdbs-big">{fmtNum(L.totalIn)} kg</div>
          <div style={{ fontSize: 11.5, color: 'var(--ash)', marginTop: 4 }}>{g.receipts.length} phiếu chuẩn bị hàng từ {g.lsxs.length} lệnh SX</div>
        </div>
        <div className="hdbs-eq">=</div>
        <div className="hdbs-box">
          <div className="hdbs-t">Phân bổ hiện tại (thép đang nằm ở đâu)</div>
          {FLOW_COLS.map((col) => {
            const v = L.final[col.k]
            return (
              <div className="hdbs-row" key={col.k}>
                <span className="hdbs-dot" style={{ background: col.color }} />{col.label}
                <b style={{ color: v === 0 ? 'var(--moss)' : col.color }}>{fmtNum(v)} kg{v === 0 ? ' ✓' : ''}</b>
              </div>
            )
          })}
        </div>
      </div>
      {L.balanced ? (
        <div className="hdbal ok"><CheckCircle2 size={15} />CÂN ĐỐI KHỚP: {fmtNum(L.totalIn)} kg nguồn = {fmtNum(L.allocated)} kg phân bổ — không thất thoát ngoài sổ</div>
      ) : (
        <div className="hdbal bad"><AlertTriangle size={15} />MẤT CÂN ĐỐI {fmtNum(L.totalIn - L.allocated)} kg — kiểm tra ngay chứng từ!</div>
      )}
      <div className="flowbar">
        {FLOW_COLS.map((col) => {
          const v = Math.max(0, L.final[col.k])
          const pct = L.totalIn ? (v / L.totalIn) * 100 : 0
          return pct > 0.2 ? <i key={col.k} style={{ width: `${pct}%`, background: col.color }} title={`${col.label}: ${fmtNum(v)} kg`} /> : null
        })}
      </div>
      <div className="flowleg">
        {FLOW_COLS.map((col) => <span key={col.k}><span className="hdbs-dot" style={{ background: col.color }} />{col.label}</span>)}
      </div>

      <Sec icon={<History />}>Sổ luân chuyển — mỗi dòng trừ nơi này, cộng nơi kia; hợp đồng xong thì các cột trung gian VỀ 0</Sec>
      <div style={{ overflowX: 'auto' }}>
        <table className="hdledger">
          <thead>
            <tr>
              <th>Thời điểm</th><th>Chứng từ</th><th>Nghiệp vụ</th>
              {FLOW_COLS.map((col) => (
                <th key={col.k}><span className="hdbs-dot" style={{ verticalAlign: -1, background: col.color }} /> {col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {L.rows.length ? L.rows.map((e, i) => (
              <tr key={`${e.id}-${i}`}>
                <td className="num">{fmtDT(e.date)}</td>
                <td><RecordLink id={e.id} type={e.type} style={{ color: 'var(--rust)' }} /></td>
                <td>
                  {e.label}
                  {e.mismatchId && <> <RecordLink id={e.mismatchId} type="sl" danger><span title="Có biên bản sai lệch — bấm mở">⚠</span></RecordLink></>}
                </td>
                {FLOW_COLS.map((col) => {
                  const after = e.after[col.k]
                  const dv = e.delta[col.k]
                  if (dv !== undefined && dv !== 0) {
                    const cls = 'lg-cell ' + (dv >= 0 ? 'lg-up' : 'lg-down') + (e.zeroed.includes(col.k) ? ' lg-zero' : '')
                    return <td key={col.k} className={cls}><b>{fmtNum(after)}</b><i>{sg(dv)}</i></td>
                  }
                  return <td key={col.k} className="lg-mut">{after === 0 ? '·' : fmtNum(after)}</td>
                })}
              </tr>
            )) : (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--ash)', padding: 16 }}>Chưa có nghiệp vụ luân chuyển.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>SỐ DƯ HIỆN TẠI (kg)</td>
              {FLOW_COLS.map((col) => {
                const v = L.final[col.k]
                const color = col.k === 'giao' || v === 0 ? 'var(--moss)' : col.k === 'lech' ? 'var(--signal)' : '#8a6100'
                return <td key={col.k} style={{ color }}>{fmtNum(v)}{v === 0 ? ' ✓' : ''}</td>
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--ash)', marginTop: 8, lineHeight: 1.6 }}>
        <b>Cách đọc:</b> ô xanh = cộng vào, ô cam = trừ ra, dấu ✓ = vị trí vừa VỀ 0 (đã đối ứng hết).
        {' '}"Lệch ghi nhận" là phần chênh đã lập biên bản sai lệch (⚠ bấm mở biên bản) — lệch giao bù sẽ tự triệt tiêu về 0.
      </div>
    </>
  )
}
