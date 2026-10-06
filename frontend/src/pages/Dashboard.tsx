/* Dashboard điều hành — port pages/01-dashboard.html:
   KPI · Trung tâm cảnh báo · Đối ứng phiếu giao — xuất (nhật ký mọi phiếu) · biểu đồ · đối ứng 3 điểm cân theo hợp đồng. */
import { App, Button, Result, Select, Skeleton, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  AlarmClock, Banknote, AlertTriangle, ArrowRight, BarChart3, BellRing, CalendarPlus, ClipboardX, Factory, FileSignature, Hourglass, Info, RotateCcw, Scale,
  Smartphone, TimerOff, XCircle,
} from 'lucide-react'
import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMovementLog, useResetDemo } from '@/api/hooks'
import { useDashboardByTag, useRunEndOfDay } from '@/api/hooksMaster'
import type { ContractAggLite, MovementRow } from '@/api/types'
import { AdvChip, CompleteChip, Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtDelta, fmtDT, fmtKg, fmtT, money, relTime } from '@/lib/format'
import { PaymentDecision } from '@/peek/drawers/contract/PaymentApprovals'
import { ExtensionDecision } from '@/peek/drawers/contract/Extensions'
import { ddmm } from './lsx/lsxUtil'
import RecordLink from '@/peek/RecordLink'
import { usePeek } from '@/peek/context'
import { Donut, GroupedBar, LegendRow } from './dashboard/charts'
import { ThreePointChecks, threePoint } from './dashboard/checks'
import { AlertCard, AlertEmpty, AlertItem, Chip, Grid, Panel, SectionLabel } from './dashboard/common'
import { MovementFilterBar, MovementTable, tierTotals, useMovementFilter } from './dashboard/movement'
import { signedKg, useSignMismatchDialog } from './mismatches/sign'
import CustomerTags from './orders/CustomerTags'
import { TagFilter } from './customers/tags'

const DONUT_COLORS = ['#1e6b3a', '#4b5563', '#e30f1b', '#8a6100', '#d4d5d9']
const tons1 = (kg: number) => Math.round(kg / 100) / 10

const LATE = new Set(['soon', 'overdue'])

export default function Dashboard() {
  const [tag, setTag] = useState<string>()
  const { data: d, isLoading, isError } = useDashboardByTag(tag)
  const { can } = useAuth()
  const { open } = usePeek()
  const { modal } = App.useApp()
  const reset = useResetDemo()
  const signDialog = useSignMismatchDialog()
  const canSign = can('sai-lech', 'full')

  const refContract = useRef<HTMLDivElement>(null)
  const refOverdue = useRef<HTMLDivElement>(null)
  const refMismatch = useRef<HTMLDivElement>(null)
  const scrollTo = (r: RefObject<HTMLDivElement | null>) => r.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  const header = <Header tag={tag} setTag={setTag} />
  if (isLoading) return <>{header}<Skeleton active paragraph={{ rows: 12 }} /></>
  if (isError || !d) return <>{header}<Result status="error" title="Không tải được dữ liệu dashboard" /></>

  const alerts = d.contractAlerts
  const nOver = alerts.filter((a) => a.complete.state === 'overdue' || a.deliver.state === 'overdue').length
  const nSoon = alerts.filter((a) => a.complete.state === 'soon' || a.deliver.state === 'soon').length
  const nAdv = alerts.filter((a) => a.adv.state === 'missing').length
  const pays = d.pendingPayments
  const pm = d.pendingMismatches
  const nPending = d.pendingLSX.length + d.pendingTasks.length

  return (
    <div>
      {header}

      {/* ================= KPI ================= */}
      <KpiGrid>
        <Kpi tone="steel" label="Đang triển khai" value={d.activeContracts}
          sub={`hợp đồng · đã giao lũy kế ${fmtT(d.deliveredKgTotal)}`} onClick={() => open('hd', 'HD-2609-01')} />
        <Kpi tone="signal" label="Cảnh báo hợp đồng" value={<span className={alerts.length ? 'text-signal' : ''}>{alerts.length}</span>}
          sub={<span className="text-signal">{nOver} quá hạn (trả HĐ / giao hàng) · {nSoon} sắp tới hạn · {nAdv} tạm ứng chưa về</span>} onClick={() => scrollTo(refContract)} />
        <Kpi tone="signal" label="Thẻ / phiếu quá hạn" value={<span className={d.overdueDocs.length ? 'text-signal' : ''}>{d.overdueDocs.length}</span>}
          sub={<span className="text-signal">chưa điền số kg + ảnh phiếu</span>} onClick={() => scrollTo(refOverdue)} />
        <Kpi tone="rust" label="Sai lệch chờ QL ký" value={<span className={pm.length ? 'text-signal' : ''}>{pm.length}</span>}
          sub={<span style={{ color: 'var(--rust)' }}>{pm.length ? `tổng lệch ${fmtKg(d.pendingMismatchKg)} chờ ký` : 'không còn sai lệch chờ ký'}</span>}
          onClick={() => scrollTo(refMismatch)} />
      </KpiGrid>

      {/* ================= TRUNG TÂM CẢNH BÁO ================= */}
      <SectionLabel>Trung tâm cảnh báo</SectionLabel>
      <Grid>
        <div ref={refContract} style={{ scrollMarginTop: 80 }}>
          <AlertCard icon={<AlarmClock size={15} color="var(--signal)" />} title="Hợp đồng: hạn trả HĐ · hạn giao hàng · tạm ứng" count={alerts.length} bad>
            {alerts.length ? alerts.map((x) => (
              <AlertItem key={x.contract.id} onClick={() => open('hd', x.contract.id)}
                t1={<><span className="mono" style={{ fontWeight: 700 }}>{x.contract.id}</span> · {x.contract.customer}</>}
                t2={<>{x.contract.code && <>{x.contract.code} · </>}{fmtT(x.contract.totalKg)} · {x.adv.state === 'missing'
                  ? <span className="text-signal" style={{ fontWeight: 700 }}><AlertTriangle size={11} style={{ verticalAlign: -2 }} /> Tạm ứng {x.adv.label}</span>
                  : x.adv.label}
                  {LATE.has(x.deliver.state) && <> · <span className={x.deliver.state === 'overdue' ? 'text-signal' : 'text-amber'} style={{ fontWeight: 700 }}>{x.deliver.label}</span></>}
                  </>}
                right={LATE.has(x.complete.state) || !LATE.has(x.deliver.state) ? <CompleteChip info={x.complete} /> : <CompleteChip info={x.deliver} />} />
            )) : <AlertEmpty>Không có hợp đồng cần chú ý.</AlertEmpty>}
          </AlertCard>
        </div>

        <div ref={refOverdue} style={{ scrollMarginTop: 80 }}>
          <AlertCard icon={<ClipboardX size={15} color="var(--signal)" />} title="Thẻ công việc & phiếu quá hạn" count={d.overdueDocs.length} bad>
            {d.overdueDocs.length ? d.overdueDocs.map((o) => (
              <AlertItem key={o.type + o.id} onClick={() => open(o.type, o.id)}
                t1={<><span className="mono text-signal" style={{ fontWeight: 700 }}>{o.id}</span> · {o.person} ({o.dept})</>}
                t2={<>{o.kind} · HĐ <RecordLink id={o.contractId} type="hd" /> · thiếu <b className="text-signal">{o.missing}</b></>}
                right={<Chip tone="over" blink icon={<TimerOff size={11} />}>quá hạn {o.hoursOver}h</Chip>} />
            )) : <AlertEmpty>Mọi thẻ / phiếu đã điền đủ số và ảnh.</AlertEmpty>}
          </AlertCard>
        </div>

        <div ref={refMismatch} style={{ scrollMarginTop: 80 }}>
          <AlertCard icon={<Scale size={15} color="var(--rust)" />} title="Sai lệch cân chờ Quản lý ký" count={pm.length} bad>
            {pm.length ? pm.map((m) => (
              <AlertItem key={m.id} onClick={() => open('sl', m.id)}
                t1={<><span className="mono" style={{ fontWeight: 700 }}>{m.id}</span> · phiếu <RecordLink id={m.refId} type={m.refType} /> · HĐ <RecordLink id={m.contractId} type="hd" /></>}
                t2={<>{m.reason || m.source} · {m.reportedBy} ({m.dept}) · {fmtDT(m.date)}</>}
                right={<>
                  <span className="mono num text-signal" style={{ fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }}>{signedKg(m.delta)}</span>
                  {canSign && <Button type="primary" size="small" onClick={(e) => { e.stopPropagation(); signDialog(m) }}>Ký ngay</Button>}
                </>} />
            )) : <AlertEmpty>Không còn sai lệch chờ Quản lý ký.</AlertEmpty>}
          </AlertCard>
        </div>

        {d.pendingExtensions.length > 0 && (
          <AlertCard icon={<CalendarPlus size={15} color="var(--amber)" />} title="Xin gia hạn trả hợp đồng chờ duyệt" count={d.pendingExtensions.length} bad>
            {d.pendingExtensions.map((e) => (
              <AlertItem key={e.id} onClick={() => open('hd', e.contractId)}
                t1={<><span className="mono" style={{ fontWeight: 700 }}>{e.contractId}</span> · {e.customer}</>}
                t2={<>{e.requestedBy}: {e.reason} · {e.complete?.label}</>}
                right={<ExtensionDecision e={e} />} />
            ))}
          </AlertCard>
        )}

        <AlertCard icon={<Banknote size={15} color="var(--amber)" />} title="Tiền về chờ Quản lý duyệt" count={pays.length} bad={pays.length > 0}>
          {pays.length ? pays.map((p) => (
            <AlertItem key={p.id} onClick={() => open('hd', p.contractId)}
              t1={<><span className="mono" style={{ fontWeight: 700 }}>{p.contractId}</span> · {p.customer}</>}
              t2={<>{p.type} · <b className="num">{money(p.amount)}</b> · {p.createdBy || 'kế toán'} nhập {relTime(p.date)}{p.note && <> · {p.note}</>}</>}
              right={<PaymentDecision p={p} />} />
          )) : <AlertEmpty>Không có khoản tiền về chờ duyệt.</AlertEmpty>}
        </AlertCard>

        {d.lsxMissedYesterday.length > 0 && (
          <AlertCard icon={<Factory size={15} color="var(--signal)" />} title="Xưởng không cập nhật sản lượng hôm qua" count={d.lsxMissedYesterday.length} bad>
            {d.lsxMissedYesterday.map((x) => (
              <AlertItem key={x.id} onClick={() => open('lsx', x.id)}
                t1={<><span className="mono text-signal" style={{ fontWeight: 700 }}>{x.id}</span> · {x.name}</>}
                t2={<>HĐ <RecordLink id={x.contractId} type="hd" /> · lũy kế {fmtKg(x.kgDone)} / {fmtKg(x.kgPlan)}
                  {x.lastUpdateAt ? <> · nhập gần nhất {fmtDT(x.lastUpdateAt)}</> : ' · chưa nhập lần nào'}</>}
                right={<Chip tone="over" icon={<AlertTriangle size={11} />}>{x.missedDays.length > 1 ? `Bỏ trống ${x.missedDays.length} ngày` : `Hôm qua ${ddmm(x.missedDays[0])}`}</Chip>} />
            ))}
          </AlertCard>
        )}

        <AlertCard icon={<Hourglass size={15} color="var(--amber)" />} title="Chờ xác nhận công việc" count={nPending}>
          {d.pendingLSX.map((x) => x.status === 'Chờ nhận' ? (
            <AlertItem key={x.id} onClick={() => open('lsx', x.id)}
              t1={<><span className="mono" style={{ fontWeight: 700 }}>{x.id}</span> · {x.name}</>}
              t2={<>HĐ <RecordLink id={x.contractId} type="hd" /> · phát lệnh {fmtDT(x.assignedAt)}</>}
              right={<Chip tone="soon" icon={<Hourglass size={11} />}>Xưởng chưa nhận · {relTime(x.assignedAt)}</Chip>} />
          ) : (
            <AlertItem key={x.id} onClick={() => open('lsx', x.id)}
              t1={<><span className="mono text-signal" style={{ fontWeight: 700 }}>{x.id}</span> · {x.name}</>}
              t2={<>HĐ <RecordLink id={x.contractId} type="hd" /> · lý do: <b className="text-signal">{x.rejectReason || '—'}</b></>}
              right={<Chip tone="over" icon={<XCircle size={11} />}>SX TỪ CHỐI</Chip>} />
          ))}
          {d.pendingTasks.map((t) => {
            const kindLbl = t.type === 'di_ma' ? 'Thẻ đi mạ' : 'Thẻ giao khách'
            return t.status === 'Chờ xác nhận' ? (
              <AlertItem key={t.id} onClick={() => open('vc', t.id)}
                t1={<><span className="mono" style={{ fontWeight: 700 }}>{t.id}</span> · {t.driver}</>}
                t2={<>{kindLbl} · HĐ <RecordLink id={t.contractId} type="hd" /> · {fmtKg(t.kgRequired)}</>}
                right={<Chip tone="soon" icon={<Hourglass size={11} />}>Tài xế chưa nhận · {relTime(t.assignedAt)}</Chip>} />
            ) : (
              <AlertItem key={t.id} onClick={() => open('vc', t.id)}
                t1={<><span className="mono text-signal" style={{ fontWeight: 700 }}>{t.id}</span> · {t.driver}</>}
                t2={<>{kindLbl} · HĐ <RecordLink id={t.contractId} type="hd" /> · lý do: <b className="text-signal">{t.rejectReason || '—'}</b></>}
                right={<Chip tone="over" icon={<XCircle size={11} />}>TỪ CHỐI</Chip>} />
            )
          })}
          {!nPending && <AlertEmpty>Mọi lệnh và thẻ đã được xác nhận.</AlertEmpty>}
        </AlertCard>
      </Grid>

      {/* ================= ĐỐI ỨNG PHIẾU GIAO — XUẤT ================= */}
      <SectionLabel>Đối ứng phiếu giao — xuất (nhật ký mọi phiếu)</SectionLabel>
      <MovementSection />

      {/* ================= BIỂU ĐỒ ================= */}
      <Grid>
        <WhereIsSteel contracts={d.contracts} />
        <WeeklyChart />
      </Grid>

      {/* ================= ĐỐI ỨNG 3 ĐIỂM CÂN THEO HỢP ĐỒNG ================= */}
      <SectionLabel>Đối ứng 3 điểm cân theo hợp đồng</SectionLabel>
      <ContractChecks contracts={d.contracts} />

      {can('dashboard', 'full') && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="text" size="small" icon={<RotateCcw size={13} />} loading={reset.isPending}
            onClick={() => modal.confirm({
              title: 'Làm mới dữ liệu demo',
              content: <p>Xóa mọi thao tác đã làm và nạp lại <b>kịch bản demo gốc</b> (HĐ FE01, sai lệch, thẻ quá hạn...)?</p>,
              okText: 'Làm mới', cancelText: 'Hủy',
              onOk: () => reset.mutateAsync(undefined).catch(() => undefined),
            })}>
            Làm mới dữ liệu demo
          </Button>
        </div>
      )}
    </div>
  )
}

function Header({ tag, setTag }: { tag?: string; setTag: (v?: string) => void }) {
  const { can, hasRole } = useAuth()
  const navigate = useNavigate()
  const { message, modal } = App.useApp()
  const runEod = useRunEndOfDay()
  const run = async (force = false) => {
    const r = await runEod.mutateAsync(force)
    if (r.ran) message.success(r.created ? `Đã gửi ${r.created} cảnh báo cuối ngày tới đúng bộ phận` : 'Không có việc tồn cần cảnh báo hôm nay')
    else modal.confirm({
      title: 'Hôm nay đã chạy cảnh báo cuối ngày', content: 'Chạy lại sẽ tạo thêm một lượt thông báo. Tiếp tục?',
      okText: 'Chạy lại', cancelText: 'Hủy', onOk: () => run(true),
    })
  }
  return (
    <PageHeader title="Dashboard điều hành" desc="Quản lý A nhìn 1 màn biết cả công ty: hợp đồng — cảnh báo — đối ứng 3 điểm cân"
      extra={<>
        <TagFilter value={tag} onChange={setTag} />
        {hasRole('admin') && (
          <Button icon={<BellRing size={14} />} loading={runEod.isPending} onClick={() => run()}>Chạy cảnh báo cuối ngày</Button>
        )}
        <Button type="primary" icon={<Smartphone size={14} />} onClick={() => navigate('/mobile')}>Giao diện điện thoại</Button>
        {can('bao-cao') && <Button icon={<BarChart3 size={14} />} onClick={() => navigate('/bao-cao')}>Báo cáo đối ứng</Button>}
        {can('hop-dong') && (
          <Button type="primary" icon={<FileSignature size={14} />} style={{ background: 'var(--ink)' }} onClick={() => navigate('/hop-dong')}>Hợp đồng</Button>
        )}
      </>} />
  )
}

/* ---------------------------------------------------------------- nhật ký phiếu + tổng theo tầng */
function MovementSection() {
  const { f, setF, params } = useMovementFilter()
  const { data, isLoading } = useMovementLog(params)
  const rows = data ?? []
  const shown = f.kind ? rows.filter((r) => r.kind === f.kind) : rows
  // tổng theo tầng trong kỳ (theo thời gian + hợp đồng, không phụ thuộc lọc loại phiếu)
  const tot = tierTotals(rows)
  const cell = (lb: string, v: number) => (
    <div style={{ padding: '8px 12px', background: 'var(--paper)', border: '1px solid var(--rule)', borderRadius: 10, minWidth: 118 }}>
      <div style={{ fontSize: 10, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--ash)' }}>{lb}</div>
      <div className="mono num" style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>{fmtKg(v)}</div>
    </div>
  )
  const delta = (a: number, b: number) => {
    const dd = b - a, bad = Math.abs(dd) > 0.5
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, fontSize: 10, color: 'var(--ash)', minWidth: 62 }}>
        <ArrowRight size={13} />
        <span className="mono num" style={{ fontWeight: 700, fontSize: 11.5, color: bad ? 'var(--signal)' : 'var(--moss)' }}>{bad ? fmtDelta(dd) : 'khớp'}</span>
      </div>
    )
  }
  return (
    <Panel style={{ marginBottom: 24 }}>
      <MovementFilterBar f={f} setF={setF} />
      <MovementTable rows={shown} loading={isLoading} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: '12px 4px 2px', borderTop: '2px solid var(--rule)', marginTop: 8 }}>
        {cell('Chuẩn bị hàng (giao kho)', tot.ptn)}{delta(tot.ptn, tot.pc)}
        {cell('Cân xuất công ty', tot.pc)}{delta(tot.pc, tot.ma)}
        {cell('Mạ xác nhận', tot.ma)}{delta(tot.ma, tot.giao)}
        {cell('Giao khách ký', tot.giao)}
      </div>
      <p className="caption" style={{ margin: '8px 0 0' }}>
        <Info size={12} style={{ verticalAlign: -2 }} /> Tổng theo tầng trong kỳ lọc. Chênh giữa các tầng <b className="text-signal">bôi đỏ</b> = hàng đang kẹt ở tầng trước
        (tồn kho, trên đường, tại mạ) hoặc thất thoát — bấm phiếu để truy nguyên.
      </p>
    </Panel>
  )
}

/* ---------------------------------------------------------------- donut: hàng HĐ đang ở đâu */
function WhereIsSteel({ contracts }: { contracts: ContractAggLite[] }) {
  const { open } = usePeek()
  const withMove = contracts.filter((g) => g.producedKg + g.weighedKg > 0)
  const [cid, setCid] = useState('HD-2609-01')
  const g = contracts.find((x) => x.contract.id === cid) ?? withMove[0] ?? contracts[0]
  if (!g) return <Panel title="Hàng hợp đồng đang ở đâu?"><AlertEmpty>Chưa có hợp đồng.</AlertEmpty></Panel>
  const c = g.contract
  const parts = [
    { label: 'Đã giao khách', v: g.deliveredKg },
    { label: 'Còn tại xưởng mạ', v: Math.max(0, g.atGalvKg) },
    { label: 'Đang trên đường tới mạ', v: Math.max(0, g.inTransitToGalvKg) },
    { label: 'Tồn kho chờ cân', v: Math.max(0, g.stockKg) },
    { label: 'Chưa sản xuất', v: Math.max(0, c.totalKg - g.producedKg) },
  ]
  return (
    <Panel
      title={<span>Hàng HĐ <RecordLink id={c.id} type="hd" style={{ color: 'var(--rust)' }} /> ({c.code ? `${c.code} — ` : ''}{c.customer}) đang ở đâu?</span>}
      extra={withMove.length > 1 && (
        <Select size="small" value={c.id} onChange={setCid} style={{ minWidth: 150 }} popupMatchSelectWidth={false}
          options={withMove.map((x) => ({ value: x.contract.id, label: `${x.contract.id} — ${x.contract.code || x.contract.customer}` }))} />
      )}
      sub={`${fmtT(c.totalKg)} theo hợp đồng · đã SX ${g.pctProduced}% · đã giao ${g.pctDelivered}%`}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, alignItems: 'center' }}>
        <Donut size={200} centerLabel="Đã giao" centerValue={`${g.pctDelivered}%`}
          parts={parts.map((p, i) => ({ label: p.label, value: tons1(p.v), color: DONUT_COLORS[i] }))} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {parts.map((p, i) => {
            const warn = (i === 2 || i === 3) && p.v > 0 // đang trên đường / tồn chờ cân = hàng đang kẹt
            return (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: warn ? 'pointer' : undefined }}
                onClick={warn ? () => open('hd', c.id) : undefined}>
                <span style={{ width: 10, height: 10, borderRadius: 3, flex: 'none', background: DONUT_COLORS[i] }} />{p.label}
                <span className="mono num" style={{ marginLeft: 'auto', fontSize: 11.5, ...(warn ? { color: 'var(--signal)', fontWeight: 700 } : {}) }}>{fmtT(p.v)}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

/* ---------------------------------------------------------------- groupedBar 4 tuần gần nhất */
function WeeklyChart() {
  const { data } = useMovementLog()
  const { labels, pc, ma, giao } = useMemo(() => {
    const now = new Date()
    const weeks = [3, 2, 1, 0].map((i) => {
      const end = new Date(now.getTime() - i * 7 * 86400000)
      const s = new Date(end.getTime() - 6 * 86400000)
      return { start: new Date(s.getFullYear(), s.getMonth(), s.getDate()), s, end, pc: 0, ma: 0, giao: 0 }
    })
    ;(data ?? []).forEach((r: MovementRow) => {
      if (r.kg == null || !r.date) return
      const dt = new Date(r.date)
      weeks.forEach((w) => {
        if (dt >= w.start && dt <= w.end) {
          if (r.kind === 'Cân xuất đi mạ') w.pc += r.kg!
          else if (r.kind === 'Nhập xưởng mạ') w.ma += r.kg!
          else if (r.kind === 'Giao khách') w.giao += r.kg!
        }
      })
    })
    const d2 = (x: Date) => `${String(x.getDate()).padStart(2, '0')}/${String(x.getMonth() + 1).padStart(2, '0')}`
    return {
      labels: weeks.map((w) => `${d2(w.s)}–${d2(w.end)}`),
      pc: weeks.map((w) => tons1(w.pc)), ma: weeks.map((w) => tons1(w.ma)), giao: weeks.map((w) => tons1(w.giao)),
    }
  }, [data])
  return (
    <Panel title="Đối ứng 3 điểm cân theo tuần (tấn)" sub="Cân xuất công ty vs mạ xác nhận vs khách ký nhận — 4 tuần gần nhất">
      <GroupedBar height={230} unit="tấn" labels={labels} datasets={[
        { name: 'Cân xuất công ty', color: '#17181c', values: pc },
        { name: 'Mạ xác nhận', color: '#4b5563', values: ma },
        { name: 'Khách ký nhận', color: '#d11a24', values: giao },
      ]} />
      <LegendRow items={[
        { label: 'Cân xuất công ty', color: '#17181c' }, { label: 'Mạ xác nhận', color: '#4b5563' }, { label: 'Khách ký nhận', color: '#d11a24' },
      ]} />
    </Panel>
  )
}

/* ---------------------------------------------------------------- bảng 3 điểm cân theo hợp đồng */
function ContractChecks({ contracts }: { contracts: ContractAggLite[] }) {
  const { open } = usePeek()
  const navigate = useNavigate()
  const rows = contracts.filter((g) => g.producedKg + g.weighedKg > 0 || g.contract.status === 'Đã nhận về')
  const kgCell = (v: number, sub?: ReactNode) => (
    <div><b className="num mono" style={{ fontSize: 12.5 }}>{fmtKg(v)}</b>{sub && <div style={{ fontSize: 11, color: 'var(--ash)' }}>{sub}</div>}</div>
  )
  const columns: ColumnsType<ContractAggLite> = [
    {
      title: 'Hợp đồng', key: 'id', render: (_, g) => (
        <div><RecordLink id={g.contract.id} type="hd" /><div style={{ fontSize: 11, color: 'var(--ash)' }}>{[g.contract.code, g.contract.customer].filter(Boolean).join(' · ')}</div>
          <CustomerTags name={g.contract.customer} /></div>
      ),
    },
    { title: 'Cân xuất công ty', key: 'pc', align: 'right', render: (_, g) => kgCell(g.weighedKg) },
    {
      title: 'Đến xưởng mạ', key: 'ma', align: 'right',
      render: (_, g) => kgCell(g.sentGalvKg, g.inTransitToGalvKg > 0 ? <span style={{ color: 'var(--amber)' }}>+ {fmtKg(g.inTransitToGalvKg)} trên đường</span> : undefined),
    },
    { title: 'Lấy từ mạ', key: 'pick', align: 'right', render: (_, g) => kgCell(g.pickedKg, g.atGalvKg > 0 ? `còn tại mạ ${fmtKg(g.atGalvKg)}` : undefined) },
    { title: 'Khách ký nhận', key: 'giao', align: 'right', render: (_, g) => kgCell(g.deliveredKg) },
    { title: '3 điểm cân', key: 'chk', render: (_, g) => <ThreePointChecks g={g} /> },
    {
      title: 'Chờ ký SL', key: 'sl', render: (_, g) => {
        const n = threePoint(g).pendingSl
        return n > 0
          ? <a className="text-signal" style={{ fontWeight: 800 }} onClick={(e) => { e.stopPropagation(); navigate('/sai-lech') }}>{n} chờ ký</a>
          : <span className="text-ash">0</span>
      },
    },
    { title: 'Tiền về', key: 'adv', render: (_, g) => <AdvChip adv={g.adv} /> },
    { title: 'Trạng thái', key: 'st', render: (_, g) => <StatusTag status={g.contract.status} /> },
  ]
  return (
    <Panel style={{ marginBottom: 16 }}>
      <Table<ContractAggLite> size="small" rowKey={(g) => g.contract.id} columns={columns} dataSource={rows} pagination={false}
        rowClassName="clickable-row" onRow={(g) => ({ onClick: () => open('hd', g.contract.id) })} scroll={{ x: 980 }} />
      <p className="caption" style={{ margin: '10px 0 0' }}>
        <Info size={12} style={{ verticalAlign: -2 }} /> 3 điểm cân: <b>cân xuất công ty = cân đến xưởng mạ = lấy từ mạ đi giao khách</b>. Rê chuột vào ✓/✗ để xem chi tiết, bấm dòng để mở hồ sơ đối ứng hợp đồng.
      </p>
    </Panel>
  )
}
