/* Drawer LSX: chuỗi giao nhận 5 bước + bảng phiếu liên quan nhóm theo bước, có dòng ĐỐI ỨNG giữa các nhóm
   (port phần chainHtml / docsTable của ERPPeek.register('lsx') trong steel-data.js). */
import type { CSSProperties, ReactNode } from 'react'
import type { Lsx, Receipt, Task, Weighing } from '@/api/types'
import { fmtDT, fmtNum } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { C } from '@/theme'

const sum = <T,>(arr: T[], f: (r: T) => number | null | undefined) => arr.reduce((a, r) => a + (Number(f(r)) || 0), 0)
const eq = (a: number, b: number) => Math.abs(a - b) < 0.5
const signed = (d: number) => (d > 0 ? '+' : '') + fmtNum(d)

export interface FlowData { rcs: Receipt[]; pcs: Weighing[]; diMa: Task[]; giao: Task[] }

/** Lọc phiếu liên quan của lệnh: PTN theo LSX, phiếu cân theo LSX, thẻ đi mạ theo phiếu cân, thẻ giao theo thẻ đi mạ. */
export function flowOf(x: Lsx, receipts: Receipt[], weighings: Weighing[], tasks: Task[]): FlowData {
  const rcs = receipts.filter((r) => r.lsxId === x.id)
  const pcs = weighings.filter((p) => p.lsxId === x.id)
  const pcIds = new Set(pcs.map((p) => p.id))
  const diMa = tasks.filter((t) => t.type === 'di_ma' && t.refId != null && pcIds.has(t.refId))
  const dmIds = new Set(diMa.map((t) => t.id))
  const giao = tasks.filter((t) => t.type === 'giao_khach' && t.refId != null && dmIds.has(t.refId))
  return { rcs, pcs, diMa, giao }
}

export function FlowChain({ x, f }: { x: Lsx; f: FlowData }) {
  const steps = [
    { label: 'SX báo xong', who: 'Xưởng SX', kg: x.kgDone, color: C.steel },
    { label: 'Kho tiếp nhận', who: `${f.rcs.length} phiếu PTN`, kg: sum(f.rcs, (r) => r.kg), color: C.steel },
    { label: 'Cân xuất lên xe', who: `${f.pcs.length} phiếu cân`, kg: sum(f.pcs, (p) => p.kgActual), color: C.amber },
    { label: 'Xưởng mạ nhận', who: `${f.diMa.length} chuyến`, kg: sum(f.diMa, (t) => t.kgAtGalv), color: C.rust },
    { label: 'Khách ký nhận', who: `${f.giao.length} chuyến giao`, kg: sum(f.giao, (t) => t.kgDelivered), color: C.moss },
  ]
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'stretch', overflowX: 'auto', margin: '4px 0 10px' }}>
        {steps.map((st, i) => {
          const d = i > 0 ? st.kg - steps[i - 1].kg : 0
          return (
            <div key={st.label} style={{ display: 'flex', flex: 1 }}>
              {i > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 2px', minWidth: 44 }}>
                  <span style={{ fontSize: 14, color: C.ash }}>→</span>
                  <span className="num" style={{ fontSize: 9, fontWeight: 700, color: eq(d, 0) ? C.moss : C.signal }}>{eq(d, 0) ? 'khớp ✓' : signed(d)}</span>
                </div>
              )}
              <div style={{ flex: 1, minWidth: 96, background: C.canvas, border: `1px solid ${C.rule}`, borderTop: `3px solid ${st.color}`, borderRadius: 10, padding: '8px 10px' }}>
                <div className="mono" style={{ fontSize: 8, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ash }}>{st.label}</div>
                <div className="num" style={{ fontSize: 15, fontWeight: 800, color: st.color }}>{fmtNum(st.kg)} kg</div>
                <div style={{ fontSize: 9.5, color: C.ash }}>{st.who}</div>
              </div>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 10.5, color: C.ash, margin: '-4px 0 6px' }}>
        Chênh giữa 2 bước liền kề = hàng đang nằm lại ở bước trước (tồn kho, đang trên đường, còn tại mạ) hoặc lệch có biên bản.
      </div>
    </>
  )
}

interface DocRow { date: string | null; id: string; from: string; to: string; kg: number | null; delta: number | null; st: string; ml: string | null; overdue?: boolean }

const td: CSSProperties = { padding: '6px 8px', borderBottom: `1px solid ${C.ruleHair}`, fontSize: 12, verticalAlign: 'top' }
const tdR: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }

function Row({ d }: { d: DocRow }) {
  const bad = /Lệch|Từ chối/.test(d.st) || d.overdue
  const stColor = bad ? C.signal : /Hoàn thành|Đã/.test(d.st) ? C.moss : C.amber
  return (
    <tr>
      <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDT(d.date)}</td>
      <td style={td}><RecordLink id={d.id} style={{ color: C.rust }} /></td>
      <td style={{ ...td, fontSize: 11 }}>{d.from} <span style={{ color: C.ash }}>→</span> {d.to}</td>
      <td style={{ ...tdR, fontWeight: 700 }}>{d.kg != null ? fmtNum(d.kg) : <RecordLink id={d.id} danger>CHƯA ĐIỀN</RecordLink>}</td>
      <td style={tdR}>
        {d.delta == null ? <span style={{ color: C.ash3 }}>—</span>
          : eq(d.delta, 0) ? <span style={{ color: C.moss }}>✓ khớp</span>
            : <>
              {d.ml ? <RecordLink id={d.ml} danger>{signed(d.delta)} ⚠</RecordLink> : <span style={{ color: C.signal, fontWeight: 700 }}>{signed(d.delta)}</span>}
            </>}
      </td>
      <td style={{ ...td, color: stColor, fontWeight: bad ? 700 : 400, fontSize: 10.5, whiteSpace: 'nowrap' }}>{d.st}{d.overdue ? ' · QUÁ HẠN' : ''}</td>
    </tr>
  )
}

function GroupHead({ no, title, color, count, kg }: { no: string; title: string; color: string; count: number; kg: number }) {
  const bg = color + '18'
  return (
    <tr>
      <td colSpan={4} style={{ padding: '8px 10px', background: bg, borderLeft: `4px solid ${color}`, fontWeight: 800, fontSize: 10.5, letterSpacing: '.05em', color }}>
        {no} {title} <span style={{ fontWeight: 500, color: C.ash }}>· {count} phiếu</span>
      </td>
      <td colSpan={2} style={{ padding: '8px 10px', background: bg, textAlign: 'right', fontWeight: 800, color }}>Σ {fmtNum(kg)} kg</td>
    </tr>
  )
}

function BalRow({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={6} style={{ padding: '8px 12px', background: ok ? C.mossSoft : C.amberSoft, fontWeight: 700, fontSize: 11, color: ok ? C.moss : '#7a5c0e' }}>
        <span className="mono" style={{ letterSpacing: '.06em' }}>ĐỐI ỨNG</span>&nbsp; {children}
      </td>
    </tr>
  )
}

const Empty = () => <tr><td colSpan={6} style={{ padding: '7px 10px', color: C.ash3, fontSize: 10.5, fontStyle: 'italic' }}>Chưa phát sinh phiếu ở bước này.</td></tr>

export function FlowTable({ x, f }: { x: Lsx; f: FlowData }) {
  const { rcs, pcs, diMa, giao } = f
  if (!(rcs.length + pcs.length + diMa.length + giao.length))
    return <div className="photo-empty">Chưa có phiếu giao nhận nào phát sinh từ lệnh này.</div>
  const now = Date.now()
  const late = (t: Task) => !!t.fillDeadline && !t.filledAt && now > new Date(t.fillDeadline).getTime()
  const byDate = (a: DocRow, b: DocRow) => (a.date || '').localeCompare(b.date || '')
  const g = {
    ptn: rcs.map((r): DocRow => ({ date: r.date, id: r.id, from: 'Xưởng SX', to: `Kho — ${r.by}`, kg: r.kg, delta: null, st: 'Đã tiếp nhận', ml: null })).sort(byDate),
    pc: pcs.map((p): DocRow => ({ date: p.date, id: p.id, from: `Kho — ${p.by}`, to: `Xe — ${p.signers.laiXe || 'chưa gán'}`, kg: p.kgActual,
      delta: p.kgActual != null ? p.kgActual - p.kgExpected : null, st: p.status, ml: p.mismatchId })).sort(byDate),
    ma: diMa.map((t): DocRow => ({ date: t.filledAt || t.departedAt || t.assignedAt, id: t.id, from: `Xe — ${t.driver}`, to: 'Xưởng mạ', kg: t.kgAtGalv,
      delta: t.kgAtGalv != null ? t.kgAtGalv - t.kgRequired : null, st: t.status, ml: t.mismatchId, overdue: late(t) })).sort(byDate),
    giao: giao.map((t): DocRow => ({ date: t.filledAt || t.departedAt || t.assignedAt, id: t.id, from: 'Xưởng mạ', to: `Khách — xe ${t.driver}`, kg: t.kgDelivered,
      delta: t.kgDelivered != null && t.kgPicked != null ? t.kgDelivered - t.kgPicked : null, st: t.status, ml: t.mismatchId, overdue: late(t) })).sort(byDate),
  }
  const khoNhan = sum(rcs, (r) => r.kg)
  const canXuat = sum(pcs, (p) => p.kgActual)
  const maNhan = sum(diMa, (t) => t.kgAtGalv)
  const giaoKh = sum(giao, (t) => t.kgDelivered)
  const tonKho = khoNhan - canXuat
  const inTransit = sum(diMa.filter((t) => t.kgAtGalv == null && t.status !== 'Từ chối'), (t) => t.kgRequired)
  const lechMa = sum(diMa.filter((t) => t.kgAtGalv != null), (t) => t.kgRequired - (t.kgAtGalv ?? 0))
  const picked = sum(giao, (t) => t.kgPicked)
  const conTaiMa = maNhan - picked
  const lechGiao = sum(giao.filter((t) => t.kgDelivered != null && t.kgPicked != null), (t) => (t.kgPicked ?? 0) - (t.kgDelivered ?? 0))
  const th: CSSProperties = { ...td, background: C.paper2, fontFamily: 'var(--ff-mono)', fontSize: 9.5, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ash, textAlign: 'left', fontWeight: 700 }
  const join = (parts: (string | false)[]) => parts.filter(Boolean).join(' + ')

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${C.rule}`, borderRadius: 10, background: C.canvas }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={th}>Thời điểm</th><th style={th}>Phiếu</th><th style={th}>Bên giao → Bên nhận</th>
          <th style={{ ...th, textAlign: 'right' }}>KL (kg)</th><th style={{ ...th, textAlign: 'right' }}>Chênh</th><th style={th}>Trạng thái</th>
        </tr></thead>
        <tbody>
          <GroupHead no="①" title="SX BÀN GIAO → KHO" color={C.steel} count={g.ptn.length} kg={khoNhan} />
          {g.ptn.length ? g.ptn.map((d) => <Row key={d.id} d={d} />) : <Empty />}
          <GroupHead no="②" title="KHO CÂN XUẤT → LÊN XE" color={C.amber} count={g.pc.length} kg={canXuat} />
          {g.pc.length ? g.pc.map((d) => <Row key={d.id} d={d} />) : <Empty />}
          <BalRow ok={eq(tonKho, 0)}>
            Kho nhận {fmtNum(khoNhan)} − cân xuất {fmtNum(canXuat)} = {eq(tonKho, 0) ? 'ĐÃ CÂN XUẤT HẾT ✓' : <b>tồn kho chờ cân {fmtNum(tonKho)} kg</b>}
          </BalRow>
          <GroupHead no="③" title="XE CHỞ → XƯỞNG MẠ XÁC NHẬN" color={C.rust} count={g.ma.length} kg={maNhan} />
          {g.ma.length ? g.ma.map((d) => <Row key={d.id} d={d} />) : <Empty />}
          <BalRow ok={eq(canXuat, maNhan)}>
            Cân xuất {fmtNum(canXuat)} − mạ xác nhận {fmtNum(maNhan)} = {eq(canXuat, maNhan) ? 'KHỚP TUYỆT ĐỐI ✓'
              : <><b>{fmtNum(canXuat - maNhan)} kg</b> ({join([inTransit > 0 && `đang trên đường ${fmtNum(inTransit)} kg`, !eq(lechMa, 0) && `lệch có biên bản ${fmtNum(lechMa)} kg`])})</>}
          </BalRow>
          <GroupHead no="④" title="LẤY TỪ MẠ → KHÁCH KÝ NHẬN" color={C.moss} count={g.giao.length} kg={giaoKh} />
          {g.giao.length ? g.giao.map((d) => <Row key={d.id} d={d} />) : <Empty />}
          <BalRow ok={eq(conTaiMa, 0) && eq(lechGiao, 0)}>
            Mạ nhận {fmtNum(maNhan)} − khách ký {fmtNum(giaoKh)} = {eq(conTaiMa, 0) && eq(lechGiao, 0) ? 'ĐÃ LẤY & GIAO TRỌN ✓'
              : <><b>{fmtNum(maNhan - giaoKh)} kg</b> ({join([!eq(conTaiMa, 0) && `còn tại xưởng mạ ${fmtNum(conTaiMa)} kg`, !eq(lechGiao, 0) && `lệch giao có biên bản ${fmtNum(lechGiao)} kg`])})</>}
          </BalRow>
        </tbody>
        <tfoot>
          <tr style={{ background: C.paper2 }}>
            <td colSpan={3} style={{ fontWeight: 700, padding: '7px 10px', fontSize: 11.5 }}>
              TỔNG THEO LỆNH: kho nhận {fmtNum(khoNhan)} · cân xuất {fmtNum(canXuat)} · mạ nhận {fmtNum(maNhan)} · khách ký {fmtNum(giaoKh)}
            </td>
            <td colSpan={3} style={{ fontWeight: 700, padding: '7px 10px', textAlign: 'right', fontSize: 11.5, color: eq(giaoKh, x.kgDone) ? C.moss : C.amber }}>
              {eq(giaoKh, x.kgDone) ? 'ĐÃ GIAO TRỌN LỆNH ✓' : `còn ${fmtNum(x.kgDone - giaoKh)} kg chưa tới khách`}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
