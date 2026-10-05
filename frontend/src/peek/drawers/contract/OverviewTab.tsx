/* MÀN 1 — TỔNG QUAN: thông tin HĐ, tạm ứng & dòng tiền, tiến độ, trạng thái 3 điểm cân. */
import { AlertTriangle, CheckCircle2, CreditCard, Info, Scale, Truck } from 'lucide-react'
import { useUpdateContract } from '@/api/hooks'
import type { ContractAgg } from '@/api/types'
import DocAttach from '@/components/DocAttach'
import { useAuth } from '@/lib/auth'
import { Bar, Cell, CellGrid, Sec } from '@/components/ui'
import { fmtD, fmtKg, fmtNum, fmtT, money } from '@/lib/format'
import { C } from '@/theme'

const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmtNum(Math.abs(n))

export default function OverviewTab({ g, onGoFlow, onPay }: { g: ContractAgg; onGoFlow: () => void; onPay?: () => void }) {
  const c = g.contract
  const comp = g.complete, adv = g.adv
  const { can } = useAuth()
  const upd = useUpdateContract()
  const canFile = can('hop-dong', 'edit')
  const keyChecks = g.checks.filter((k) => k.key)
  const compAlert = comp.state === 'overdue' || comp.state === 'soon'
  const advMissing = adv.state === 'missing'
  return (
    <>
      <Sec icon={<Info />}>Thông tin hợp đồng</Sec>
      <CellGrid>
        <Cell label="Khách hàng">{c.customer}</Cell>
        <Cell label="Mã đơn">{c.code}</Cell>
        <Cell label="Chuyển kế toán">{fmtD(c.sentToKtAt)}</Cell>
        <Cell label="Ngày hoàn thành" alert={compAlert}>{comp.label}</Cell>
        <Cell label="Ngày ký">{c.signDate ? fmtD(c.signDate) : 'Chưa ký'}</Cell>
        <Cell label="Phụ trách">{c.owner}</Cell>
        <Cell label="Giá trị hợp đồng">{money(c.value)} · {fmtNum(c.unitPrice)}₫/kg</Cell>
        <Cell label="Khối lượng">{fmtNum(c.totalQty)} {c.unit} · {fmtKg(c.totalKg)}</Cell>
        <Cell label="Bản scan hợp đồng đã ký" wide>
          <DocAttach value={c.signedFile} buttonText="Tải bản scan HĐ đã ký"
            onChange={canFile ? (url) => upd.mutateAsync({ id: c.id, signedFile: url }) : undefined} />
        </Cell>
        {c.note && <Cell label="Ghi chú" wide>{c.note}</Cell>}
      </CellGrid>

      <Sec icon={<CreditCard />}>Tạm ứng &amp; dòng tiền</Sec>
      <CellGrid>
        <Cell label="Tạm ứng theo HĐ" alert={advMissing}>
          {advMissing && onPay
            ? <a className="text-signal" style={{ textDecoration: 'underline' }} onClick={onPay}>{adv.label}</a>
            : adv.label}
        </Cell>
        <Cell label="Tiền đã về lũy kế" extra={<Bar percent={g.pctPaid} />}>{money(g.paidTotal)} ({g.pctPaid}%)</Cell>
      </CellGrid>

      <Sec icon={<Truck />}>Tiến độ (xe 10 tấn/chuyến — giao nhiều đợt)</Sec>
      <CellGrid>
        <Cell label="Đã sản xuất" extra={<Bar percent={g.pctProduced} color={C.steel} />}>
          {fmtT(g.producedKg)} / {fmtT(c.totalKg)} ({g.pctProduced}%)
        </Cell>
        <Cell label="Đã giao khách" extra={<Bar percent={g.pctDelivered} />}>{fmtT(g.deliveredKg)} ({g.pctDelivered}%)</Cell>
      </CellGrid>

      <Sec icon={<Scale />}>Trạng thái 3 điểm cân — chi tiết ở màn "Luân chuyển thép"</Sec>
      <div className="hdchecks">
        {keyChecks.map((k) => (
          <span key={k.label} className={'hdck ' + (k.ok ? 'ok' : 'bad')} onClick={k.ok ? undefined : onGoFlow}
            title={k.ok ? `${k.aLbl}: ${fmtKg(k.a)} · ${k.bLbl}: ${fmtKg(k.b)}` : `${k.aLbl}: ${fmtKg(k.a)} · ${k.bLbl}: ${fmtKg(k.b)} — ${k.note}. Bấm xem sổ luân chuyển`}>
            {k.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
            {k.label}{k.ok ? ' — khớp' : ` — lệch ${signed(k.delta)} kg`}
          </span>
        ))}
      </div>
    </>
  )
}
