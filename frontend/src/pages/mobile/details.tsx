/* Sheet chi tiết bản ghi trong khung điện thoại — bấm card ở mọi vai trò là mở, sheet chồng sheet (port detailXxx của demo). */
import {
  AlarmClock, AlertTriangle, Banknote, CalendarClock, CheckCheck, FileClock, FileWarning, Flame, Gauge, History,
  Inbox, Link2, List, PackageCheck, PackageOpen, PenLine, PencilLine, Scale, Truck, Warehouse, type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import {
  useContract, useLedger, useLsx, useMismatch, useReceipt, useReceipts, useTask, useTaskPhoto,
  useWeighing, useWeighingPhoto, useWeighings,
} from '@/api/hooks'
import type { LedgerKey } from '@/api/types'
import { fmtD, fmtDT, fmtT, hoursOver, moneyShort } from '@/lib/format'
import { ContractEditForm, LsxExtendForm, LsxProgressForm, PcFillForm } from './forms'
import { fmtN, isOverdueTask, type Kind, lsxDeadline, signed, useMob } from './core'
import { Btn, DGrid, DItem, DLink, Empty, Loading, PgRow, PhotoManage, SecTitle, StatusChip, TypeChip } from './kit'
import { useSignFlow } from './sign'
import { TaskRoute } from './route'

const NotFound = ({ id }: { id: string }) => <Empty icon={Inbox}>Không tìm thấy bản ghi {id}.</Empty>

export function Detail({ kind, id }: { kind: Kind; id: string }) {
  switch (kind) {
    case 'lsx': return <DetailLsx id={id} />
    case 'pc': return <DetailPc id={id} />
    case 'ptn': return <DetailPtn id={id} />
    case 'vc': return <DetailVc id={id} />
    case 'hd': return <DetailHd id={id} />
    case 'sl': return <DetailSl id={id} />
  }
}

/* ---------------------------------------------------------------- LỆNH SẢN XUẤT */
function DetailLsx({ id }: { id: string }) {
  const m = useMob()
  const { data: x, isLoading } = useLsx(id)
  const { data: rcs = [] } = useReceipts({ lsxId: id })
  const { data: pcsAll = [] } = useWeighings(x ? { contractId: x.contractId } : undefined)
  if (isLoading) return <Loading />
  if (!x) return <NotFound id={id} />
  const { eff, dl, late } = lsxDeadline(x)
  const pcs = pcsAll.filter((p) => p.lsxId === x.id)
  return (
    <>
      <div className="mc-top" style={{ marginBottom: 4 }}>
        <StatusChip status={x.status} />
        {late && <span className="m-chip bad"><AlarmClock />TRỄ {Math.abs(dl)} ngày</span>}
      </div>
      <DGrid>
        <DItem k="Tên lệnh" full small>{x.name}</DItem>
        <DItem k="Hợp đồng"><DLink kind="hd" id={x.contractId} /></DItem>
        <DItem k="Hạn hoàn thành"><span className={late ? 'red-txt' : ''}>{fmtD(eff)}{x.extension && <small> (gia hạn)</small>}</span></DItem>
        <DItem k="Phát lệnh" sub={x.assignedBy}>{fmtDT(x.assignedAt)}</DItem>
        <DItem k="Xưởng nhận" sub={x.acceptedBy ?? undefined}>{x.acceptedAt ? fmtDT(x.acceptedAt) : '—'}</DItem>
        <DItem k="Kế hoạch">{fmtN(x.kgPlan)} kg</DItem>
        <DItem k="Đã đạt">{fmtN(x.kgDone)} kg{x.lastUpdateAt && <small> · cập nhật {fmtDT(x.lastUpdateAt)}</small>}</DItem>
        {x.rejectReason && <DItem k="Lý do từ chối" full small><span className="red-txt">{x.rejectReason}</span></DItem>}
        {x.extension && <DItem k="Lý do gia hạn" full small>{x.extension.reason} — duyệt bởi {x.extension.approvedBy}</DItem>}
      </DGrid>
      <PgRow label="Khối lượng" done={x.kgDone} plan={x.kgPlan} unit="kg" tone="success" />
      <div className="btn-row">
        {x.status === 'Đang SX' && (
          <Btn variant="primary" icon={Gauge} onClick={() => m.sheet({ icon: Gauge, title: `Cập nhật tiến độ ${x.id}`, body: <LsxProgressForm x={x} /> })}>Cập nhật tiến độ</Btn>
        )}
        {m.role === 'quanly' && (x.status === 'Đang SX' || x.status === 'Chờ nhận') && (
          <Btn icon={CalendarClock} onClick={() => m.sheet({ icon: CalendarClock, title: `Gia hạn ${x.id}`, body: <LsxExtendForm x={x} /> })}>Gia hạn</Btn>
        )}
      </div>
      {(rcs.length > 0 || pcs.length > 0) && (
        <>
          <SecTitle icon={Link2}>Bản ghi liên quan</SecTitle>
          <div className="dlink-row">
            {rcs.map((r) => <DLink key={r.id} kind="ptn" id={r.id} />)}
            {pcs.map((p) => <DLink key={p.id} kind="pc" id={p.id} />)}
          </div>
        </>
      )}
      {x.log.length > 0 && (
        <>
          <SecTitle icon={History}>Nhật ký lệnh</SecTitle>
          {x.log.map((l, i) => <div key={i} className="log-line"><span className="lt">{fmtDT(l.at)}</span><span>{l.text}</span></div>)}
        </>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- PHIẾU CÂN */
function DetailPc({ id }: { id: string }) {
  const m = useMob()
  const { data: p, isLoading } = useWeighing(id)
  const photo = useWeighingPhoto()
  if (isLoading) return <Loading />
  if (!p) return <NotFound id={id} />
  const delta = p.kgActual != null && !p.receiptId ? p.kgActual - p.kgExpected : null
  const bad = delta != null && Math.abs(delta) > m.tol
  return (
    <>
      <div className="mc-top" style={{ marginBottom: 4 }}><StatusChip status={p.status} /></div>
      <DGrid>
        <DItem k="Hợp đồng"><DLink kind="hd" id={p.contractId} /></DItem>
        <DItem k="Lệnh SX"><DLink kind="lsx" id={p.lsxId} /></DItem>
        <DItem k="Ngày cân">{fmtDT(p.date)}</DItem>
        <DItem k="Người lập" small>{p.by}</DItem>
        <DItem k="Kg theo lệnh xuất">{fmtN(p.kgExpected)} kg</DItem>
        <DItem k="Kg cân thực tế">
          {p.kgActual != null
            ? <span className={bad ? 'red-txt' : 'moss-txt'}>{fmtN(p.kgActual)} kg{delta ? ` (${signed(delta)})` : ' · khớp'}</span>
            : <span className="red-txt">Chưa cân</span>}
        </DItem>
        <DItem k="Ký bốc xếp" small>{p.signers.bocXep || '—'}</DItem>
        <DItem k="Ký thủ kho" small>{p.signers.kho || '—'}</DItem>
        <DItem k="Ký lái xe" small>{p.signers.laiXe || <span className="red-txt">Chưa ký</span>}</DItem>
        {p.mismatchId && <DItem k="Biên bản sai lệch"><DLink kind="sl" id={p.mismatchId} warn /></DItem>}
      </DGrid>
      {p.status === 'Chờ cân' && (
        <div className="btn-row">
          <Btn variant="primary" icon={Scale} onClick={() => m.sheet({ icon: Scale, title: `Nhập kết quả cân ${p.id}`, body: <PcFillForm p={p} /> })}>Nhập kết quả cân</Btn>
        </div>
      )}
      <PhotoManage photo={p.photo} onChange={(ph) => photo.mutateAsync({ id: p.id, photo: ph })}
        demo={{ label: `${p.id} · phiếu cân trạm`, kg: p.kgActual ?? p.kgExpected }} />
    </>
  )
}

/* ---------------------------------------------------------------- PHIẾU CHUẨN BỊ HÀNG */
function DetailPtn({ id }: { id: string }) {
  const { data: r, isLoading } = useReceipt(id)
  if (isLoading) return <Loading />
  if (!r) return <NotFound id={id} />
  return (
    <>
      <div className="mc-top" style={{ marginBottom: 4 }}><span className="m-chip ok"><CheckCheck />Đã tiếp nhận</span></div>
      <DGrid>
        <DItem k="Lệnh SX"><DLink kind="lsx" id={r.lsxId} /></DItem>
        <DItem k="Hợp đồng"><DLink kind="hd" id={r.contractId} /></DItem>
        <DItem k="Ngày nhận">{fmtDT(r.date)}</DItem>
        <DItem k="Người nhận" small>{r.by}</DItem>
        <DItem k="Số lượng">{fmtN(r.qty)} SP</DItem>
        <DItem k="Khối lượng">{fmtN(r.kg)} kg</DItem>
        <DItem k="Ghi chú" full small>{r.note || '—'}</DItem>
      </DGrid>
    </>
  )
}

/* ---------------------------------------------------------------- THẺ VẬN CHUYỂN */
function DetailVc({ id }: { id: string }) {
  const { data: t, isLoading } = useTask(id)
  const photo = useTaskPhoto()
  if (isLoading) return <Loading />
  if (!t) return <NotFound id={id} />
  const isMa = t.type === 'di_ma'
  const overdue = isOverdueTask(t)
  const missing = <span className="red-txt">Chưa điền</span>
  return (
    <>
      <div className="mc-top" style={{ marginBottom: 4 }}><TypeChip type={t.type} /><StatusChip status={t.status} overdue={overdue} /></div>
      <TaskRoute t={t} />
      <DGrid>
        <DItem k="Hợp đồng"><DLink kind="hd" id={t.contractId} /></DItem>
        <DItem k="Chứng từ gốc">{t.refId ? <DLink id={t.refId} /> : '—'}</DItem>
        <DItem k="Tài xế" small>{t.driver}</DItem>
        <DItem k="Giao việc">{fmtDT(t.assignedAt)}</DItem>
        <DItem k="Xuất phát">{t.departedAt ? fmtDT(t.departedAt) : '—'}</DItem>
        <DItem k="Hạn trả phiếu">
          {t.fillDeadline ? <span className={overdue ? 'red-txt' : ''}>{fmtDT(t.fillDeadline)}{overdue ? ` · QUÁ ${hoursOver(t.fillDeadline)}h` : ''}</span> : '—'}
        </DItem>
        <DItem k={isMa ? 'Kg cân xuất công ty' : 'Kg yêu cầu lấy từ mạ'}>{fmtN(t.kgRequired)} kg</DItem>
        {isMa ? (
          <DItem k="Kg bên mạ cân">
            {t.kgAtGalv != null
              ? <span className={t.mismatchId ? 'red-txt' : 'moss-txt'}>{fmtN(t.kgAtGalv)} kg{t.mismatchId ? ` · lệch ${signed(t.kgAtGalv - t.kgRequired)}` : ' · khớp'}</span>
              : missing}
          </DItem>
        ) : (
          <>
            <DItem k="Kg ký với mạ">{t.kgPicked != null ? `${fmtN(t.kgPicked)} kg` : missing}</DItem>
            <DItem k="Kg khách ký nhận">{t.kgDelivered != null ? <span className={t.mismatchId ? 'red-txt' : 'moss-txt'}>{fmtN(t.kgDelivered)} kg</span> : missing}</DItem>
          </>
        )}
        {t.filledAt && <DItem k="Điền phiếu lúc">{fmtDT(t.filledAt)}</DItem>}
        {t.mismatchId && <DItem k="Biên bản sai lệch"><DLink kind="sl" id={t.mismatchId} warn /></DItem>}
        {t.rejectReason && <DItem k="Lý do từ chối" full small><span className="red-txt">{t.rejectReason}</span></DItem>}
        {t.note && <DItem k="Ghi chú" full small>{t.note}</DItem>}
      </DGrid>
      <PhotoManage photo={t.photo} onChange={(ph) => photo.mutateAsync({ id: t.id, photo: ph })}
        demo={{ label: isMa ? `Phiếu cân xưởng mạ · ${t.id}` : `Phiếu giao nhận · ${t.id}`, kg: t.kgAtGalv ?? t.kgDelivered ?? t.kgRequired }} />
    </>
  )
}

/* ---------------------------------------------------------------- BIÊN BẢN SAI LỆCH */
function DetailSl({ id }: { id: string }) {
  const m = useMob()
  const { data: s, isLoading } = useMismatch(id)
  const signFlow = useSignFlow()
  if (isLoading) return <Loading />
  if (!s) return <NotFound id={id} />
  const pending = s.status === 'Chờ QL ký'
  return (
    <>
      <div className="mc-top" style={{ marginBottom: 4 }}><StatusChip status={s.status} /></div>
      <DGrid>
        <DItem k="Nguồn phát sinh" small>{s.source}</DItem>
        <DItem k="Chứng từ"><DLink kind={s.refType} id={s.refId} /></DItem>
        <DItem k="Hợp đồng"><DLink kind="hd" id={s.contractId} /></DItem>
        <DItem k="Ngày ghi nhận">{fmtDT(s.date)}</DItem>
        <DItem k="Kỳ vọng">{fmtN(s.expected)} kg</DItem>
        <DItem k="Thực tế">{fmtN(s.actual)} kg</DItem>
        <DItem k="Chênh lệch"><span className="red-txt" style={{ fontSize: 19, fontWeight: 700 }}>{signed(s.delta)} kg</span></DItem>
        <DItem k="Người báo" small>{s.reportedBy} · {s.dept}</DItem>
        <DItem k="Lý do" full small>{s.reason}</DItem>
        <DItem k="Diễn giải" full small>{s.reasonNote || '—'}</DItem>
        <DItem k="Quản lý ký" full small>
          {s.signedAt ? <span className="moss-txt">{s.signedBy} · {fmtDT(s.signedAt)}</span> : <span className="red-txt">Chưa ký</span>}
        </DItem>
      </DGrid>
      {pending && m.role === 'quanly' && (
        <div className="btn-row"><Btn variant="rust" icon={PenLine} onClick={() => signFlow(s)}>KÝ XÁC NHẬN</Btn></div>
      )}
      {pending && m.role !== 'quanly' && <div className="f-hint" style={{ textAlign: 'center', marginTop: 10 }}>Đang chờ Quản lý A ký xác nhận.</div>}
    </>
  )
}

/* ---------------------------------------------------------------- HỢP ĐỒNG: Tổng quan / Hàng ⇄ Tiền / Luân chuyển */
function DetailHd({ id }: { id: string }) {
  const [seg, setSeg] = useState<'tq' | 'ht' | 'lc'>('tq')
  const segs = [{ id: 'tq', l: 'Tổng quan' }, { id: 'ht', l: 'Hàng ⇄ Tiền' }, { id: 'lc', l: 'Luân chuyển' }] as const
  return (
    <>
      <div className="sheet-seg">
        {segs.map((s) => <button key={s.id} type="button" className={seg === s.id ? 'active' : ''} onClick={() => setSeg(s.id)}>{s.l}</button>)}
      </div>
      {seg === 'tq' ? <HdOverview id={id} /> : seg === 'ht' ? <HdMoney id={id} /> : <HdLedger id={id} />}
    </>
  )
}

function HdOverview({ id }: { id: string }) {
  const m = useMob()
  const { data: g, isLoading } = useContract(id)
  const [edit, setEdit] = useState(false)
  if (isLoading) return <Loading />
  if (!g) return <NotFound id={id} />
  const c = g.contract, due = g.due, adv = g.adv
  return (
    <>
      <div className="mc-top" style={{ marginBottom: 4 }}>
        <StatusChip status={c.status} />
        {due.state === 'overdue' && <span className="m-chip bad"><FileClock />{due.label}</span>}
      </div>
      <DGrid>
        <DItem k="Khách hàng" full small>{c.customer}</DItem>
        <DItem k="Giá trị HĐ">{moneyShort(c.value)}</DItem>
        <DItem k="Đơn giá">{fmtN(c.unitPrice)} ₫/kg</DItem>
        <DItem k="Khối lượng">{fmtT(c.totalKg)} · {fmtN(c.totalQty)} {c.unit}</DItem>
        <DItem k="Hạn trả HĐ"><span className={due.state === 'overdue' ? 'red-txt' : due.state === 'due' ? 'amber-txt' : ''}>{due.label}</span></DItem>
        <DItem k="Ngày ký">{c.signDate ? fmtD(c.signDate) : <span className="red-txt">Chưa ký</span>}</DItem>
        <DItem k={`Tạm ứng ${c.advance ? c.advance.pct + '%' : ''}`} small>
          <span className={adv.state === 'missing' ? 'red-txt' : adv.state === 'ok' ? 'moss-txt' : ''}>{adv.label}</span>
        </DItem>
        <DItem k="Đã thanh toán">{moneyShort(g.paidTotal)} <small>({g.pctPaid}%)</small></DItem>
        <DItem k="Công nợ hiện tại">
          {g.debt > 0 ? <span className="red-txt">Khách nợ {moneyShort(g.debt)}</span>
            : g.debt < 0 ? <span className="moss-txt">Tiền trước hàng {moneyShort(-g.debt)}</span> : <span className="moss-txt">Cân bằng</span>}
        </DItem>
        {c.note && <DItem k="Ghi chú" full small>{c.note}</DItem>}
      </DGrid>
      <PgRow label="Sản xuất" done={g.producedKg} plan={c.totalKg} unit="kg" />
      <PgRow label="Giao khách" done={g.deliveredKg} plan={c.totalKg} unit="kg" tone="success" />
      {m.role === 'quanly' && (edit
        ? <ContractEditForm c={c} onDone={() => setEdit(false)} />
        : <div className="btn-row"><Btn icon={PencilLine} onClick={() => setEdit(true)}>Sửa đơn giá / tạm ứng / hạn trả</Btn></div>)}
    </>
  )
}

function HdMoney({ id }: { id: string }) {
  const { data: g, isLoading } = useContract(id)
  if (isLoading) return <Loading />
  if (!g) return <NotFound id={id} />
  const c = g.contract
  const giaoDone = g.tasksGiao.filter((t) => t.kgDelivered != null).sort((a, b) => String(a.filledAt ?? '').localeCompare(String(b.filledAt ?? '')))
  return (
    <>
      <div className="hd-block no">
        <div className="hb-head"><PackageOpen />NỢ — HÀNG ĐÃ GIAO (ghi tăng công nợ)</div>
        {giaoDone.length ? giaoDone.map((t) => (
          <div key={t.id} className="hb-row">
            <span className="hr-l">{fmtD(t.filledAt)} · <b>{t.id}</b> · {fmtN(t.kgDelivered)} kg</span>
            <span className="hr-r">{moneyShort(Math.round((t.kgDelivered ?? 0) * (c.unitPrice || 0)))}</span>
          </div>
        )) : <div className="hb-row"><span className="hr-l">Chưa có chuyến giao nào</span><span className="hr-r">0₫</span></div>}
        <div className="hb-total"><span>Lũy kế giao {fmtN(g.deliveredKg)} kg</span><span>{moneyShort(g.deliveredValue)}</span></div>
      </div>
      <div className="hd-block co">
        <div className="hb-head"><Banknote />CÓ — TIỀN ĐÃ VỀ TÀI KHOẢN</div>
        {c.payments.length ? c.payments.map((p) => (
          <div key={p.id} className="hb-row"><span className="hr-l">{fmtD(p.date)} · {p.type}</span><span className="hr-r moss-txt">{moneyShort(p.amount)}</span></div>
        )) : <div className="hb-row"><span className="hr-l">Chưa có khoản tiền nào về</span><span className="hr-r">0₫</span></div>}
        <div className="hb-total"><span>Lũy kế tiền về ({g.pctPaid}%)</span><span>{moneyShort(g.paidTotal)}</span></div>
      </div>
      {g.debt > 0
        ? <div className="band bad"><AlertTriangle />Số dư công nợ: khách còn nợ {moneyShort(g.debt)}</div>
        : g.debt < 0
          ? <div className="band ok"><CheckCheck />Tiền về trước hàng {moneyShort(-g.debt)} — an toàn dòng tiền</div>
          : <div className="band ok"><CheckCheck />Hàng ⇄ tiền cân bằng tuyệt đối</div>}
    </>
  )
}

const LED_POS: { k: LedgerKey; l: string; ic: LucideIcon }[] = [
  { k: 'kho', l: 'Tồn kho thành phẩm', ic: Warehouse },
  { k: 'duong', l: 'Đang tới xưởng mạ', ic: Truck },
  { k: 'ma', l: 'Tại xưởng mạ', ic: Flame },
  { k: 'giao', l: 'Đã giao khách', ic: PackageCheck },
  { k: 'lech', l: 'Lệch đã ghi nhận', ic: FileWarning },
]
const POS_LBL: Record<LedgerKey, string> = { kho: 'Kho', duong: 'Đường', ma: 'Tại mạ', giao: 'Giao', lech: 'Lệch' }

function HdLedger({ id }: { id: string }) {
  const { data: led, isLoading } = useLedger(id)
  if (isLoading) return <Loading />
  if (!led) return <NotFound id={id} />
  return (
    <>
      <div className="led-src">
        <div className="led-head">NGUỒN HÀNG {fmtN(led.totalIn)} KG &nbsp;=&nbsp; PHÂN BỔ</div>
        {LED_POS.map((pos) => {
          const v = led.final[pos.k]
          const zero = Math.abs(v) < 0.5
          return (
            <div key={pos.k} className="led-pos">
              <span className="lp-k"><pos.ic />{pos.l}</span>
              <span className={'lp-v ' + (zero ? 'zero' : pos.k === 'lech' ? 'red-txt' : '')}>{zero ? '0 ✓' : `${fmtN(v)} kg`}</span>
            </div>
          )
        })}
      </div>
      {led.balanced
        ? <div className="band ok"><Scale />CÂN ĐỐI KHỚP: nguồn {fmtN(led.totalIn)} kg = phân bổ {fmtN(led.allocated)} kg ✓</div>
        : <div className="band bad"><AlertTriangle />CÂN ĐỐI LỆCH: nguồn {fmtN(led.totalIn)} kg ≠ phân bổ {fmtN(led.allocated)} kg</div>}
      {!led.rows.length ? <Empty icon={Inbox}>Chưa phát sinh luân chuyển nào trên hợp đồng này.</Empty> : (
        <>
          <SecTitle icon={List} count={led.rows.length}>Dòng luân chuyển</SecTitle>
          {led.rows.map((r) => (
            <div key={r.id + r.type} className="led-row">
              <div className="lr-top"><span className="lr-date">{fmtD(r.date)}</span><DLink id={r.id} /></div>
              <div className="lr-lbl">{r.label}</div>
              <div className="led-chips">
                {(Object.keys(r.delta) as LedgerKey[]).map((k) => {
                  const v = r.delta[k]
                  if (!v) return null
                  return <span key={k} className={'lchip ' + (v > 0 ? 'pos' : 'neg')}>{POS_LBL[k]} {v > 0 ? '+' : '−'}{fmtN(Math.abs(v))}</span>
                })}
                {r.zeroed.map((k) => <span key={'z' + k} className="lchip pos">{POS_LBL[k]} về 0 ✓</span>)}
                {r.mismatchId && <DLink kind="sl" id={r.mismatchId} warn />}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  )
}
