/* MÀN 2 — ĐỐI ỨNG HÀNG GIAO ⇄ TIỀN VỀ (tài khoản chữ T, lũy kế chạy từng dòng). */
import { DeleteButton } from '@/components/DeleteRecord'
import { AlertCircle, ArrowLeftRight, CheckCircle2, Landmark, PackageOpen, ShieldCheck } from 'lucide-react'
import type { ContractAgg } from '@/api/types'
import { Cell, CellGrid, Sec } from '@/components/ui'
import { fmtD, fmtKg, money } from '@/lib/format'
import RecordLink from '../../RecordLink'

export default function MoneyTab({ g }: { g: ContractAgg }) {
  const c = g.contract
  // vế nợ = KG KHÁCH KÝ NHẬN (thẻ giao khách xong / Quản lý đã duyệt) × đơn giá — không tính VAT
  const deliv = g.tasksGiao.filter((t) => t.kgDelivered != null && t.status === 'Hoàn thành')
    .sort((a, b) => (a.filledAt || '').localeCompare(b.filledAt || ''))
  const noRows = deliv.map((t, i) => {
    const v = g.billedValues[t.id] ?? 0
    const luy = deliv.slice(0, i + 1).reduce((s, x) => s + (g.billedValues[x.id] ?? 0), 0)
    return { t, v, luy }
  })
  const pays = (c.payments || []).filter((p) => p.status === 'Đã duyệt')  // chờ duyệt / từ chối: xem khối Tiền về chờ duyệt
  const coRows = pays.map((p, i) => ({ p, luy: pays.slice(0, i + 1).reduce((s, x) => s + x.amount, 0) }))
  const conGiao = c.totalKg - g.deliveredKg
  const conThu = c.value - g.paidTotal

  return (
    <>
      <Sec icon={<ArrowLeftRight />}>Đối ứng hàng giao ⇄ tiền về — ghi theo 2 vế như sổ kế toán</Sec>
      <div className="hdta">
        <div className="hdta-box">
          <div className="hdta-h no"><PackageOpen size={13} />VẾ NỢ — KHÁCH ĐÃ KÝ NHẬN (ghi tăng công nợ)</div>
          <table><tbody>
            {noRows.length ? noRows.map(({ t, v, luy }) => (
              <tr key={t.id}>
                <td className="num">{fmtD(t.filledAt)}</td>
                <td><RecordLink id={t.id} type="vc" style={{ color: 'var(--rust)' }} /></td>
                <td className="num">{fmtKg(t.kgDelivered)}</td>
                <td><b className="num">{money(v)}</b><div className="hdta-luy">lũy kế {money(luy)}</div></td>
              </tr>
            )) : <tr><td colSpan={4} style={{ color: 'var(--ash)', textAlign: 'center', padding: 14 }}>Chưa có chuyến nào khách ký nhận.</td></tr>}
            <tr className="hdta-tot">
              <td colSpan={2}>TỔNG {deliv.length} chuyến · {fmtKg(g.billedKg)}{g.billPendingKg > 0 && <> · <span style={{ color: 'var(--amber)' }}>+{fmtKg(g.billPendingKg)} chờ duyệt</span></>}</td>
              <td colSpan={2} className="num">{money(g.deliveredValue)}</td>
            </tr>
          </tbody></table>
        </div>
        <div className="hdta-box">
          <div className="hdta-h co"><Landmark size={13} />VẾ CÓ — TIỀN KHÁCH CHUYỂN VỀ (ghi giảm)</div>
          <table><tbody>
            {coRows.length ? coRows.map(({ p, luy }) => (
              <tr key={p.id}>
                <td className="num">{fmtD(p.date)}</td>
                <td>{p.type}{p.note && <div className="hdta-luy">{p.note}</div>}</td>
                <td><b className="num">{money(p.amount)}</b><div className="hdta-luy">lũy kế {money(luy)}</div>
                  <DeleteButton url={`/payments/${p.id}`} label={`khoản tiền về ${money(p.amount)}`} text="Xóa" /></td>
              </tr>
            )) : <tr><td colSpan={3} style={{ color: 'var(--ash)', textAlign: 'center', padding: 14 }}>Chưa có tiền về.</td></tr>}
            <tr className="hdta-tot">
              <td colSpan={2}>TỔNG {pays.length} lần tiền về (đã duyệt)</td>
              <td className="num">{money(g.paidTotal)}</td>
            </tr>
          </tbody></table>
        </div>
      </div>

      {g.debt > 0 ? (
        <div className="hddebt no"><AlertCircle size={17} />SỐ DƯ CÔNG NỢ: khách còn nợ {money(g.debt)}
          <small>(khách đã ký nhận {money(g.deliveredValue)} − tiền về {money(g.paidTotal)})</small></div>
      ) : g.debt < 0 ? (
        <div className="hddebt co"><ShieldCheck size={17} />TIỀN VỀ TRƯỚC HÀNG {money(-g.debt)}
          <small>(tiền về {money(g.paidTotal)} − khách đã ký nhận {money(g.deliveredValue)})</small></div>
      ) : (
        <div className="hddebt co"><CheckCircle2 size={17} />CÂN BẰNG TUYỆT ĐỐI: hàng khách ký nhận = tiền đã về = {money(g.paidTotal)} ✓</div>
      )}

      <CellGrid>
        <Cell label="Còn phải giao">
          {conGiao <= 0 ? '0 kg — ĐÃ GIAO ĐỦ ✓' : `${fmtKg(conGiao)} (~${Math.ceil(conGiao / 10000)} chuyến xe 10T)`}
        </Cell>
        <Cell label="Còn phải thu theo HĐ">{conThu <= 0 ? '0₫ — ĐÃ THU ĐỦ ✓' : money(conThu)}</Cell>
      </CellGrid>
    </>
  )
}
