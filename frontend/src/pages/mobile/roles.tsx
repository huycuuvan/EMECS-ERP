/* 4 màn theo vai trò: Quản lý A · Sản xuất · Thủ kho · Lái xe (port renderQL/renderSX/renderKho/renderDriver). */
import {
  AlarmClock, AlertTriangle, Banknote, BarChart3, Bell, BellRing, Boxes, CheckCheck, CheckCircle2, ChevronDown, ClipboardList,
  Clock, Coffee, Factory, FileClock, FileSignature, FileWarning, Flame, Gauge, History, Hourglass, Inbox,
  Monitor, Navigation, PackageCheck, PenLine, Plus, Scale, ShieldCheck, Siren, Timer, Truck, UserRound,
  UserX, X, type LucideIcon,
} from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  useDashboard, useLsxAccept, useLsxList, useMismatches, useMovementLog, useNotifications, useOverdueDocs, useReadAllNotifications,
  useReceipts, useTaskAccept,
  useTaskDepart, useTasks, useWeighings,
} from '@/api/hooks'
import type { Lsx, Mismatch, OverdueDoc, Receipt, Task, Weighing } from '@/api/types'
import { fmtD, fmtDT, fmtKg, fmtT, hoursOver, moneyShort, relTime } from '@/lib/format'
import { TaskRoute } from './route'
import { useSignFlow } from './sign'
import AssignedGoods from '../weighings/AssignedGoods'
import { ddmm } from '@/pages/lsx/lsxUtil'
import PushToggle from '@/notify/PushToggle'
import { useOpenNotification } from '@/notify/Realtime'
import { DelivForm, GalvForm, LsxProgressForm, MaterialForm, PcFillForm, ReceiptForm, RejectForm } from './forms'
import { useMaterials } from '@/api/hooksMaster'
import {
  fmtN, hoursLeftOf, isOverdueTask, lsxDeadline, type MAlert, type MRole, ROLES, signed, typeLabel, useMob,
} from './core'
import { AlertRow, Btn, Card, DLink, Empty, Kg, Line, Loading, PgRow, SecTitle, StatusChip, TypeChip } from './kit'

/* ---------------------------------------------------------------- khung: header + body + bottom nav */
interface ShellProps {
  role: MRole; sub?: string; alerts: MAlert[]; tab: string; setTab: (t: string) => void
  badges?: Record<string, number>; loading?: boolean; children: ReactNode; onRoleSheet: () => void
}
export function Shell({ role, sub, alerts, tab, setTab, badges = {}, loading, children, onRoleSheet }: ShellProps) {
  const m = useMob()
  const R = ROLES[role]
  const red = alerts.filter((a) => a.red).length
  const { data: notifs = [] } = useNotifications()
  const unread = notifs.filter((n) => !n.read).length
  const openBell = () => m.sheet({
    icon: BellRing, title: `Thông báo — ${R.label}`,
    body: <NotifSheet alerts={alerts} />,
  })
  return (
    <>
      <div className="m-header">
        <button type="button" className="hd-who" onClick={onRoleSheet} aria-label="Đổi vai trò">
          <span className="hd-ic"><R.icon /></span>
          <span className="hd-tt"><b>{R.label}<ChevronDown /></b><span>{sub ?? R.sub}</span></span>
        </button>
        <Link to="/dashboard" className="m-iconbtn phone-only" aria-label="Về bản desktop"><Monitor /></Link>
        <button type="button" className="m-iconbtn" onClick={openBell} aria-label="Thông báo">
          <Bell />{unread + alerts.length > 0 && <span className="bdg">{unread + alerts.length > 9 ? '9+' : unread + alerts.length}</span>}
        </button>
      </div>
      <div className="m-body" key={role + tab}>{loading ? <Loading /> : children}</div>
      <nav className="m-nav">
        {R.tabs.map((t) => {
          const n = t.id === 'cb' ? red : (badges[t.id] ?? 0)
          return (
            <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {n > 0 && <span className="nav-dot">{n}</span>}<t.icon />{t.label}
            </button>
          )
        })}
      </nav>
    </>
  )
}

/** Sheet chuông: thông báo mới (realtime, bấm mở thẳng phiếu) + cảnh báo của vai trò. */
function NotifSheet({ alerts }: { alerts: MAlert[] }) {
  const m = useMob()
  const { data: notifs = [] } = useNotifications()
  const readAll = useReadAllNotifications()
  const openN = useOpenNotification()
  const unread = notifs.filter((n) => !n.read).length
  return (
    <>
      <PushToggle />
      <SecTitle icon={Bell} count={unread} red={unread > 0}>Thông báo mới</SecTitle>
      {unread > 0 && <button type="button" className="m-linkbtn" onClick={() => readAll.mutate(undefined)}>Đánh dấu đã đọc hết</button>}
      {notifs.length ? notifs.slice(0, 30).map((n) => (
        <button key={n.id} type="button" className={'m-notif' + (n.read ? ' read' : '') + ` t-${n.type}`}
          onClick={() => { m.close(); openN(n) }}>
          <b>{n.title}</b>{n.sub && <span>{n.sub}</span>}<small>{relTime(n.at)}</small>
        </button>
      )) : <Empty icon={ShieldCheck}>Chưa có thông báo.</Empty>}
      <SecTitle icon={BellRing} count={alerts.length} red={alerts.some((a) => a.red)}>Cảnh báo</SecTitle>
      {alerts.length ? alerts.map((a, i) => <AlertRow key={i} a={a} />) : <Empty icon={ShieldCheck}>Không có cảnh báo nào.</Empty>}
    </>
  )
}

function AlertTab({ alerts, before }: { alerts: MAlert[]; before?: ReactNode }) {
  return (
    <>
      {before}
      <SecTitle icon={BellRing} count={alerts.length} red={alerts.some((a) => a.red)}>Cảnh báo của tôi</SecTitle>
      {alerts.length ? alerts.map((a, i) => <AlertRow key={i} a={a} />) : <Empty icon={ShieldCheck}>Không có cảnh báo nào.</Empty>}
    </>
  )
}

interface RoleViewProps { tab: string; setTab: (t: string) => void; onRoleSheet: () => void }

/* ================================================================ 1) LÁI XE */
const taskRank = (t: Task) => (isOverdueTask(t) ? 0 : t.status === 'Chờ xác nhận' ? 1 : t.status === 'Đã nhận' ? 2 : t.status === 'Đang chạy' ? 3 : t.status === 'Từ chối' ? 4 : 5)

function driverAlerts(tasks: Task[]): MAlert[] {
  const out: MAlert[] = []
  tasks.forEach((t) => {
    if (isOverdueTask(t)) out.push({ ic: AlarmClock, t: `${t.id} QUÁ HẠN điền phiếu ${hoursOver(t.fillDeadline!)}h`, s: `${typeLabel(t)} · ${fmtKg(t.kgRequired)} — điền số cân + ảnh ngay`, red: true, open: ['vc', t.id] })
    else if (t.status === 'Chờ xác nhận') out.push({ ic: Hourglass, t: `Thẻ mới ${t.id} chờ bạn xác nhận`, s: `Giao lúc ${fmtDT(t.assignedAt)} · ${fmtKg(t.kgRequired)}`, open: ['vc', t.id] })
  })
  return out
}

export function DriverView({ tab, setTab, onRoleSheet, driver, setDriver, lockDriver }: RoleViewProps & { driver: string; setDriver: (d: string) => void; lockDriver?: boolean }) {
  const m = useMob()
  const { data: all = [], isLoading } = useTasks()
  // lái xe đăng nhập chỉ thấy chính mình; Quản lý xem được mọi tài xế
  const drivers = lockDriver ? [driver] : (m.meta?.drivers ?? [])
  const mine = all.filter((t) => t.driver === driver)
  const alerts = driverAlerts(mine)

  const seg = (
    <div className="seg">
      {drivers.map((d) => {
        const n = all.filter((t) => t.driver === d && (isOverdueTask(t) || t.status === 'Chờ xác nhận')).length
        return (
          <button key={d} type="button" className={driver === d ? 'active' : ''} onClick={() => setDriver(d)}>
            <UserRound /><span className="nm">{d}</span>{n > 0 && <span className="seg-n">{n}</span>}
          </button>
        )
      })}
    </div>
  )

  let body: ReactNode
  if (tab === 'cb') body = <AlertTab alerts={alerts} before={seg} />
  else if (tab === 'xong') {
    const done = mine.filter((t) => t.status === 'Hoàn thành' || t.status === 'Từ chối')
      .sort((a, b) => String(b.filledAt || b.assignedAt).localeCompare(String(a.filledAt || a.assignedAt)))
    body = <>{seg}<SecTitle icon={CheckCircle2} count={done.length}>Chuyến đã kết thúc</SecTitle>
      {done.length ? done.map((t) => <TaskCard key={t.id} t={t} />) : <Empty icon={Inbox}>Chưa có chuyến nào kết thúc.</Empty>}</>
  } else {
    const act = mine.filter((t) => t.status !== 'Hoàn thành' && t.status !== 'Từ chối')
      .sort((a, b) => taskRank(a) - taskRank(b) || String(b.assignedAt).localeCompare(String(a.assignedAt)))
    const nOver = act.filter(isOverdueTask).length
    body = <>{seg}<SecTitle icon={ClipboardList} count={act.length} red={nOver > 0}>Thẻ công việc của tôi</SecTitle>
      {act.length ? act.map((t) => <TaskCard key={t.id} t={t} />) : <Empty icon={Coffee}>Không có việc đang chờ — nghỉ tay chút.</Empty>}</>
  }
  return (
    <Shell role="laixe" sub={`${driver} · Đội vận tải`} alerts={alerts} tab={tab} setTab={setTab} onRoleSheet={onRoleSheet} loading={isLoading}>
      {body}
    </Shell>
  )
}

function TaskCard({ t }: { t: Task }) {
  const m = useMob()
  const accept = useTaskAccept()
  const depart = useTaskDepart()
  const isMa = t.type === 'di_ma'
  const overdue = isOverdueTask(t)
  const hl = hoursLeftOf(t)
  return (
    <Card open={['vc', t.id]} overdue={overdue}>
      {overdue && <div className="overdue-banner"><Siren />QUÁ HẠN {hoursOver(t.fillDeadline!)}h — điền ngay!</div>}
      <div className="mc-top"><TypeChip type={t.type} /><span className="mc-id">{t.id}</span><span className="mc-status"><StatusChip status={t.status} overdue={overdue} /></span></div>
      <TaskRoute t={t} />
      <Line k="Giao việc" vClass="light">{fmtDT(t.assignedAt)} · {relTime(t.assignedAt)}</Line>
      {t.fillDeadline && !t.filledAt && !overdue && t.status === 'Đang chạy' && (
        <div className="deadline-chip"><Timer />Còn&nbsp;<b>{hl}h</b>&nbsp;để điền phiếu (hạn {fmtDT(t.fillDeadline)})</div>
      )}

      {t.status === 'Chờ xác nhận' && (
        <div className="btn-row">
          <Btn variant="accept" icon={CheckCheck} loading={accept.isPending} onClick={() => accept.mutate(t.id)}>ĐỒNG Ý NHẬN</Btn>
          <Btn variant="danger-line" icon={X} flex={0.6} onClick={() => m.sheet({ icon: X, title: `Từ chối thẻ ${t.id}`, body: <RejectForm kind="task" id={t.id} /> })}>Từ chối</Btn>
        </div>
      )}
      {t.status === 'Đã nhận' && (
        <>
          <div className="btn-row"><Btn variant="rust" icon={Navigation} loading={depart.isPending} onClick={() => depart.mutate(t.id)}>XUẤT PHÁT</Btn></div>
          <div className="f-hint" style={{ marginTop: 6, textAlign: 'center' }}>Điền số cân + ảnh phiếu trước <b>{t.fillDeadline ? fmtDT(t.fillDeadline) : 'hạn trả phiếu'}</b>.</div>
        </>
      )}
      {t.status === 'Đang chạy' && t.qlRejectReason && <Line k="QL không chấp nhận" kFix vClass="red-txt sm">{t.qlRejectReason} — điền lại phiếu</Line>}
      {t.status === 'Đang chạy' && (isMa ? <GalvForm t={t} /> : <DelivForm t={t} />)}
      {t.status === 'Chờ QL duyệt' && <>
        <Line k="Đã gửi phiếu" vClass="sm">{isMa ? `Mạ cân ${fmtN(t.kgAtGalv)} kg` : `Mạ ${fmtN(t.kgPicked)} / khách ${fmtN(t.kgDelivered)} kg`}</Line>
        <Line k="Lý do lệch" kFix vClass="sm">{t.reason}{t.reasonNote ? ` — ${t.reasonNote}` : ''}</Line>
        <div className="f-hint" style={{ color: 'var(--amber)' }}>Đang chờ Quản lý chấp nhận.</div>
      </>}
      {t.status === 'Hoàn thành' && (
        <>
          {isMa
            ? <Line k="Bên mạ cân" vClass={t.mismatchId ? 'red-txt' : 'moss-txt'}>{fmtN(t.kgAtGalv)} kg{t.mismatchId ? ` · lệch ${signed((t.kgAtGalv ?? 0) - t.kgRequired)} kg` : ' · khớp'}</Line>
            : <Line k="Mạ ký / khách ký" vClass={t.mismatchId ? 'red-txt' : 'moss-txt'}>{fmtN(t.kgPicked)} / {fmtN(t.kgDelivered)} kg{t.mismatchId ? ' · CÓ SAI LỆCH' : ' · khớp'}</Line>}
          {t.filledAt && <Line k="Điền phiếu lúc" vClass="light">{fmtDT(t.filledAt)}</Line>}
          <Line k="Ảnh phiếu đính kèm">
            {t.hasPhoto ? <button type="button" className="m-chip ok" onClick={() => m.open('vc', t.id)}><CheckCheck />Đã có · xem</button>
              : <span className="m-chip bad"><AlertTriangle />Thiếu ảnh</span>}
          </Line>
          {t.mismatchId && <Line k="Biên bản"><DLink kind="sl" id={t.mismatchId} warn /></Line>}
        </>
      )}
      {t.status === 'Từ chối' && <Line k="Lý do từ chối" kFix vClass="red-txt sm">{t.rejectReason}</Line>}
    </Card>
  )
}

/* ================================================================ 2) SẢN XUẤT */
const lsxRank = (x: Lsx) => (x.status === 'Chờ nhận' ? 0 : x.status === 'Đang SX' ? 1 : x.status === 'Từ chối' ? 2 : 3)

function sxAlerts(xs: Lsx[]): MAlert[] {
  const out: MAlert[] = []
  xs.forEach((x) => {
    if (x.status === 'Chờ nhận') out.push({ ic: Hourglass, t: `${x.id} chờ xưởng nhận lệnh`, s: `Phát ${relTime(x.assignedAt)} · hạn ${fmtD(x.deadline)}`, open: ['lsx', x.id] })
    else if (x.status === 'Đang SX') {
      const { dl } = lsxDeadline(x)
      if (x.missedYesterday) out.push({ ic: AlarmClock, t: `${x.id} — hôm qua ${ddmm(x.missedDays[0])} KHÔNG cập nhật sản lượng`, s: 'Nhập bù ngày hôm qua (không làm thì nhập 0)', red: true, open: ['lsx', x.id] })
      if (dl < 0) out.push({ ic: AlarmClock, t: `${x.id} TRỄ hạn ${Math.abs(dl)} ngày`, s: x.name, red: true, open: ['lsx', x.id] })
      else if (dl <= 1) out.push({ ic: Clock, t: `${x.id} còn ${dl} ngày tới hạn`, s: x.name, open: ['lsx', x.id] })
    }
  })
  return out
}

export function SxView({ tab, setTab, onRoleSheet }: RoleViewProps) {
  const { data: xs = [], isLoading } = useLsxList()
  const { data: rcs = [], isLoading: l2 } = useReceipts()
  const alerts = sxAlerts(xs)
  let body: ReactNode
  if (tab === 'cb') body = <AlertTab alerts={alerts} />
  else if (tab === 'ptn') {
    const list = [...rcs].sort((a, b) => b.date.localeCompare(a.date))
    body = <><SecTitle icon={PackageCheck} count={list.length}>Thành phẩm đã bàn giao kho</SecTitle>
      {list.length ? list.map((r) => <ReceiptCard key={r.id} r={r} chip="Kho đã nhận" />) : <Empty icon={Inbox}>Chưa bàn giao thành phẩm nào.</Empty>}</>
  } else {
    const sorted = [...xs].sort((a, b) => lsxRank(a) - lsxRank(b) || b.assignedAt.localeCompare(a.assignedAt))
    body = <><SecTitle icon={ClipboardList} count={sorted.length}>Lệnh sản xuất của xưởng</SecTitle>
      {sorted.length ? sorted.map((x) => <LsxCard key={x.id} x={x} />) : <Empty icon={Inbox}>Chưa có lệnh sản xuất.</Empty>}</>
  }
  return (
    <Shell role="sanxuat" alerts={alerts} tab={tab} setTab={setTab} onRoleSheet={onRoleSheet} loading={isLoading || l2}
      badges={{ lsx: xs.filter((x) => x.status === 'Chờ nhận').length }}>
      {body}
    </Shell>
  )
}

function LsxCard({ x }: { x: Lsx }) {
  const m = useMob()
  const accept = useLsxAccept()
  const { eff, dl, late } = lsxDeadline(x)
  return (
    <Card open={['lsx', x.id]} overdue={late}>
      {late && <div className="overdue-banner"><Siren />TRỄ HẠN {Math.abs(dl)} ngày — báo Quản lý!</div>}
      <div className="mc-top"><span className="mc-id">{x.id}</span><span className="mc-status"><StatusChip status={x.status} /></span></div>
      <Line vClass="left">{x.name}</Line>
      <Line k={`HĐ ${x.contractId} · phát ${relTime(x.assignedAt)}`} vClass={'sm ' + (late ? 'red-txt' : '')}>
        Hạn {fmtD(eff)}{x.extension ? ' (gia hạn)' : ''}{x.status === 'Đang SX' ? (late ? ` · TRỄ ${Math.abs(dl)}d` : ` · còn ${dl}d`) : ''}
      </Line>
      <PgRow label="Khối lượng" done={x.kgDone} plan={x.kgPlan} unit="kg" tone="success" />
      {x.status === 'Đang SX' && (x.today
        ? <Line k="Hôm nay" vClass="sm">{fmtN(x.today.kg)} kg · {x.today.edited ? 'sửa' : 'nhập'} lúc {fmtDT(x.today.at)}</Line>
        : <Line k="Hôm nay" vClass={'sm ' + (new Date().getHours() >= 20 ? 'red-txt' : '')}>Chưa nhập sản lượng</Line>)}
      {x.status === 'Đang SX' && (x.missedYesterday
        ? <Line k={`Hôm qua ${ddmm(x.missedDays[0])}`} vClass="sm red-txt">KHÔNG cập nhật{x.missedDays.length > 1 ? ` · bỏ trống ${x.missedDays.length} ngày` : ''}</Line>
        : x.yesterday && <Line k="Hôm qua" vClass="sm">{fmtN(x.yesterday.kg)} kg · {x.yesterday.edited ? 'sửa' : 'nhập'} lúc {fmtDT(x.yesterday.at)}</Line>)}
      {x.status === 'Chờ nhận' && (
        <div className="btn-row">
          <Btn variant="accept" icon={CheckCheck} loading={accept.isPending} onClick={() => accept.mutate(x.id)}>NHẬN LỆNH</Btn>
          <Btn variant="danger-line" icon={X} flex={0.6} onClick={() => m.sheet({ icon: X, title: `Từ chối lệnh ${x.id}`, body: <RejectForm kind="lsx" id={x.id} /> })}>Từ chối</Btn>
        </div>
      )}
      {x.status === 'Đang SX' && (
        <div className="btn-row">
          <Btn variant="primary" icon={Gauge} onClick={() => m.sheet({ icon: Gauge, title: `Sản lượng ngày ${x.id}`, body: <LsxProgressForm x={x} /> })}>Nhập sản lượng hôm nay</Btn>
        </div>
      )}
      {x.status === 'Từ chối' && <Line k="Lý do" kFix vClass="red-txt sm" style={{ marginTop: 6 }}>{x.rejectReason}</Line>}
    </Card>
  )
}

function ReceiptCard({ r, chip, showBy }: { r: Receipt; chip: string; showBy?: boolean }) {
  return (
    <Card open={['ptn', r.id]}>
      <div className="mc-top"><span className="mc-id">{r.id}</span><span className="mc-status m-chip ok"><CheckCheck />{chip}</span></div>
      <Line k={`${r.lsxId} · ${r.contractId}`}><Kg value={r.kg} /></Line>
      <Line k={`${fmtDT(r.date)} · ${fmtN(r.qty)} SP${showBy ? ' · ' + r.by : ''}`} vClass="light">{showBy ? null : r.note || null}</Line>
      {showBy && r.note && <Line k="Ghi chú" kFix vClass="light">{r.note}</Line>}
    </Card>
  )
}

/* ================================================================ 3) THỦ KHO */
function khoAlerts(ps: Weighing[], ods: OverdueDoc[]): MAlert[] {
  const out: MAlert[] = []
  ps.forEach((p) => {
    if (p.status === 'Chờ cân') out.push({ ic: Scale, t: `${p.id} chờ nhập kết quả cân`, s: `Lệnh xuất ${fmtKg(p.kgExpected)}`, red: true, open: ['pc', p.id] })
    else if (p.status === 'Lệch — chờ ký') out.push({ ic: AlertTriangle, t: `${p.id} lệch ${signed((p.kgActual ?? 0) - p.kgExpected)} kg — chờ QL ký`, s: `HĐ ${p.contractId}`, red: true, open: ['pc', p.id] })
  })
  ods.forEach((d) => {
    if (d.type === 'pc') out.push({ ic: AlarmClock, t: `${d.id} thiếu ${d.missing}`, s: `Quá ${d.hoursOver}h chưa hoàn thiện phiếu`, red: true, open: ['pc', d.id] })
  })
  return out
}

export function KhoView({ tab, setTab, onRoleSheet }: RoleViewProps) {
  const m = useMob()
  const { data: ps = [], isLoading } = useWeighings()
  const { data: rcs = [], isLoading: l2 } = useReceipts()
  const { data: ods = [] } = useOverdueDocs()
  const { data: mats = [] } = useMaterials()
  const alerts = khoAlerts(ps, ods)
  const pend = ps.filter((p) => p.status === 'Chờ cân' || p.status === 'QL từ chối').sort((a, b) => b.date.localeCompare(a.date))
  let body: ReactNode
  if (tab === 'cb') body = <AlertTab alerts={alerts} />
  else if (tab === 'nvl') {
    body = <>
      <div className="btn-row" style={{ marginTop: 0, marginBottom: 4 }}>
        <Btn variant="primary" icon={Plus} onClick={() => m.sheet({ icon: Boxes, title: 'Phiếu nhập nguyên liệu', body: <MaterialForm /> })}>Nhập nguyên liệu (hàng về)</Btn>
      </div>
      <SecTitle icon={Boxes} count={mats.length}>Phiếu nhập gần nhất</SecTitle>
      {mats.length ? mats.slice(0, 15).map((x) => (
        <Card key={x.id}>
          <div className="mc-top"><span className="mc-id">{x.id}</span><span className="mc-status">{fmtD(x.date)}</span></div>
          <Line vClass="left">{x.supplier}{x.spec ? ` · ${x.spec}` : ''}</Line>
          <Line k={x.kgSupplier != null ? 'NCC / cân thực tế' : 'Cân thực tế'}>{x.kgSupplier != null ? `${fmtN(x.kgSupplier)} / ` : ''}{fmtN(x.kg)} kg</Line>
          {x.delta != null && <Line k="Chênh" vClass={Math.abs(x.delta) > 0.5 ? 'red-txt' : 'moss-txt'}>{Math.abs(x.delta) > 0.5 ? `${signed(x.delta)} kg` : 'Khớp'}</Line>}
        </Card>
      )) : <Empty icon={Inbox}>Chưa có phiếu nhập nguyên liệu.</Empty>}
    </>
  }
  else if (tab === 'ptn') {
    const list = [...rcs].sort((a, b) => b.date.localeCompare(a.date))
    body = <>
      <div className="btn-row" style={{ marginTop: 0, marginBottom: 4 }}>
        <Btn variant="primary" icon={Plus} onClick={() => m.sheet({ icon: PackageCheck, title: 'Lập phiếu chuẩn bị hàng', body: <ReceiptForm /> })}>Lập phiếu chuẩn bị hàng</Btn>
      </div>
      <SecTitle icon={PackageCheck} count={list.length}>Phiếu chuẩn bị hàng gần nhất</SecTitle>
      {list.length ? list.map((r) => <ReceiptCard key={r.id} r={r} chip="Đã tiếp nhận" showBy />) : <Empty icon={Inbox}>Chưa có phiếu chuẩn bị hàng.</Empty>}
    </>
  } else {
    const rest = ps.filter((p) => p.status !== 'Chờ cân').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8)
    body = <>
      <SecTitle icon={Scale} count={pend.length} red={pend.length > 0}>Chờ cân xuất</SecTitle>
      {pend.length ? pend.map((p) => <PcCard key={p.id} p={p} />) : <Empty icon={Scale}>Không có phiếu chờ cân — tạo lệnh xuất ở bản desktop sẽ hiện tại đây.</Empty>}
      <SecTitle icon={History} count={rest.length}>Phiếu cân gần đây</SecTitle>
      {rest.map((p) => <PcCard key={p.id} p={p} />)}
    </>
  }
  return (
    <Shell role="thukho" alerts={alerts} tab={tab} setTab={setTab} onRoleSheet={onRoleSheet} loading={isLoading || l2} badges={{ can: pend.length }}>
      {body}
    </Shell>
  )
}

function PcCard({ p }: { p: Weighing }) {
  const m = useMob()
  const delta = p.kgActual != null && !p.receiptId ? p.kgActual - p.kgExpected : null
  const bad = !!p.mismatchId
  return (
    <Card open={['pc', p.id]}>
      <div className="mc-top"><span className="mc-id">{p.id}</span><span className="mc-status"><StatusChip status={p.status} /></span></div>
      <Line k={`${p.contractId} · ${p.lsxId}`} vClass="light">{fmtDT(p.date)}</Line>
      <Line k="Quản lý giao"><Kg value={p.kgExpected} /></Line>
      {(p.status === 'Chờ cân' || p.status === 'QL từ chối') && <AssignedGoods receiptId={p.receiptId} compact />}
      {p.signers.laiXe && <Line k="Tài xế (QL chỉ định)" vClass="sm">{p.signers.laiXe}{p.vehiclePlate ? ` · ${p.vehiclePlate}` : ''}</Line>}
      {p.status === 'QL từ chối' && <Line k="QL từ chối" kFix vClass="red-txt sm">{p.rejectReason} — cân lại</Line>}
      {p.kgActual != null && (
        <Line k="Cân thực tế (hàng)" vClass={bad ? 'red-txt' : 'moss-txt'}>{fmtN(p.kgActual)} kg{delta ? ` (${signed(delta)})` : ' · khớp'}
          {p.grossKg != null && <small> · tổng {fmtN(p.grossKg)} − xe {fmtN(p.tareKg)}</small>}</Line>
      )}
      {(p.status === 'Lệch — chờ ký' || p.status === 'Chờ QL duyệt') && <Line k="Công nợ" vClass="red-txt sm">Chờ Quản lý duyệt mới tính{p.reason ? ` · lý do: ${p.reason}` : ''}</Line>}
      {p.kgActual != null && (
        <Line k="Ảnh phiếu ký 3 bên">
          {p.hasPhoto ? <button type="button" className="m-chip ok" onClick={() => m.open('pc', p.id)}><CheckCheck />Đã có · xem</button>
            : <span className="m-chip bad"><AlertTriangle />Thiếu ảnh</span>}
        </Line>
      )}
      {(p.status === 'Chờ cân' || p.status === 'QL từ chối') && (
        <div className="btn-row">
          <Btn variant="primary" icon={Scale} onClick={() => m.sheet({ icon: Scale, title: `Nhập kết quả cân ${p.id}`, body: <PcFillForm p={p} /> })}>{p.status === 'QL từ chối' ? 'Cân lại' : 'Nhập kết quả cân'}</Btn>
        </div>
      )}
    </Card>
  )
}

/* ================================================================ 4) QUẢN LÝ A */
export function QlView({ tab, setTab, onRoleSheet }: RoleViewProps) {
  const { data: dash, isLoading } = useDashboard()
  const { data: mms = [], isLoading: l2 } = useMismatches()
  const [days, setDays] = useState(7)

  const alerts = useMemo<MAlert[]>(() => {
    if (!dash) return []
    const out: MAlert[] = []
    dash.overdueDocs.forEach((d) => out.push({ ic: AlarmClock, t: `${d.kind} ${d.id} QUÁ HẠN ${d.hoursOver}h`, s: `${d.person} (${d.dept}) còn thiếu: ${d.missing}`, red: true, open: [d.type, d.id] }))
    dash.pendingMismatches.forEach((mm) => out.push({ ic: FileWarning, t: `${mm.id} lệch ${signed(mm.delta)} kg chờ ký`, s: `${mm.source} · ${mm.refId} · ${mm.reason}`, red: true, open: ['sl', mm.id] }))
    dash.contractAlerts.forEach((a) => {
      if (a.complete.state === 'overdue' || a.complete.state === 'soon')
        out.push({ ic: FileClock, t: `${a.contract.id} — ${a.complete.label}`, s: a.contract.customer, red: a.complete.state === 'overdue', open: ['hd', a.contract.id] })
      if (a.adv.state === 'missing') out.push({ ic: Banknote, t: `${a.contract.id} tạm ứng ${a.adv.label}`, s: a.contract.customer, red: true, open: ['hd', a.contract.id] })
    })
    dash.lsxMissedYesterday.forEach((x) => out.push({ ic: Factory, t: `${x.id} — hôm qua ${ddmm(x.missedDays[0])} xưởng KHÔNG cập nhật sản lượng`, s: x.name, red: true, open: ['lsx', x.id] }))
    dash.pendingLSX.forEach((x) => out.push({ ic: Factory, t: x.id + (x.status === 'Từ chối' ? ' bị xưởng TỪ CHỐI' : ' chờ xưởng nhận'), s: x.rejectReason || x.name, red: x.status === 'Từ chối', open: ['lsx', x.id] }))
    dash.pendingTasks.forEach((t) => out.push({ ic: Truck, t: t.id + (t.status === 'Từ chối' ? ' bị lái xe từ chối' : ' chờ lái xe xác nhận'), s: t.driver + (t.rejectReason ? ' · ' + t.rejectReason : ''), red: t.status === 'Từ chối', open: ['vc', t.id] }))
    return out
  }, [dash])

  let body: ReactNode = null
  if (dash) {
    if (tab === 'hd') body = <QlContracts dash={dash} />
    else if (tab === 'bc') body = <QlReport dash={dash} days={days} setDays={setDays} />
    else if (tab === 'sl') body = <><SecTitle icon={FileWarning} count={mms.length}>Sổ sai lệch khối lượng</SecTitle><MismatchList list={mms} /></>
    else body = <QlHome dash={dash} />
  }
  return (
    <Shell role="quanly" alerts={alerts} tab={tab} setTab={setTab} onRoleSheet={onRoleSheet} loading={isLoading || (tab === 'sl' && l2)}
      badges={{ sl: dash?.pendingMismatches.length ?? 0 }}>
      {body}
    </Shell>
  )
}

type Dash = NonNullable<ReturnType<typeof useDashboard>['data']>

function QlHome({ dash }: { dash: Dash }) {
  const als = dash.contractAlerts, ods = dash.overdueDocs
  const pms = dash.pendingMismatches
  const pl = dash.pendingLSX, pt = dash.pendingTasks
  const nMiss = dash.lsxMissedYesterday
  const nWarn = als.length + ods.length + nMiss.length
  return (
    <>
      <SecTitle icon={Siren} count={nWarn} red={nWarn > 0}>Cảnh báo</SecTitle>
      {!nWarn && <Empty icon={ShieldCheck}>Không có cảnh báo — hệ thống sạch.</Empty>}
      {nMiss.map((x) => <AlertRow key={x.id} a={{ ic: Factory, t: `${x.id} — hôm qua ${ddmm(x.missedDays[0])} xưởng KHÔNG cập nhật sản lượng`, s: `${x.name}${x.missedDays.length > 1 ? ` · bỏ trống ${x.missedDays.length} ngày` : ''}`, red: true, open: ['lsx', x.id] }} />)}
      {ods.map((d) => <AlertRow key={d.id} a={{ ic: AlarmClock, t: `${d.kind} ${d.id} — QUÁ HẠN ${d.hoursOver}h`, s: `${d.person} (${d.dept}) còn thiếu: ${d.missing} · HĐ ${d.contractId}`, red: true, open: [d.type, d.id] }} />)}
      {als.map((a) => (
        <div key={a.contract.id}>
          {(a.complete.state === 'overdue' || a.complete.state === 'soon') && (
            <AlertRow a={{ ic: FileClock, t: `${a.contract.id} — ${a.complete.label}`, s: `${a.contract.customer} · phụ trách ${a.contract.owner}`, red: a.complete.state === 'overdue', open: ['hd', a.contract.id] }} />
          )}
          {a.adv.state === 'missing' && (
            <AlertRow a={{ ic: Banknote, t: `${a.contract.id} — tạm ứng ${a.adv.label}`, s: `${a.contract.customer} · đã ký ${a.contract.signDate ? fmtD(a.contract.signDate) : '—'} — đòi trước khi phát lệnh SX`, red: true, open: ['hd', a.contract.id] }} />
          )}
        </div>
      ))}

      <SecTitle icon={FileWarning} count={pms.length} red={pms.length > 0}>Sai lệch chờ ký</SecTitle>
      {pms.length ? <MismatchList list={pms} /> : <Empty icon={CheckCircle2}>Không còn sai lệch chờ ký.</Empty>}

      <SecTitle icon={Inbox} count={pl.length + pt.length}>Chờ xử lý</SecTitle>
      {!pl.length && !pt.length && <Empty icon={Inbox}>Không có việc tồn.</Empty>}
      {pl.map((x) => {
        const rej = x.status === 'Từ chối'
        return (
          <Card key={x.id} open={['lsx', x.id]}>
            <div className="mc-top"><span className="m-chip neutral"><Factory />Lệnh SX</span><span className="mc-id">{x.id}</span><span className="mc-status"><StatusChip status={x.status} /></span></div>
            <Line k={x.name} vClass="sm">{fmtN(x.kgPlan)} kg</Line>
            {rej ? <Line k="Lý do" kFix vClass="red-txt sm">{x.rejectReason}</Line> : <Line k={`Phát ${relTime(x.assignedAt)}`} vClass="sm">chờ xưởng nhận</Line>}
          </Card>
        )
      })}
      {pt.map((t) => {
        const rej = t.status === 'Từ chối'
        return (
          <Card key={t.id} open={['vc', t.id]}>
            <div className="mc-top"><TypeChip type={t.type} /><span className="mc-id">{t.id}</span><span className="mc-status"><StatusChip status={t.status} /></span></div>
            <Line k={`${t.driver} · HĐ ${t.contractId}`} vClass="sm">{fmtN(t.kgRequired)} kg</Line>
            {rej ? <Line k="Lý do" kFix vClass="red-txt sm">{t.rejectReason}</Line> : <Line k={`Giao ${relTime(t.assignedAt)}`} vClass="sm">chờ lái xe xác nhận</Line>}
          </Card>
        )
      })}
    </>
  )
}

function MismatchList({ list }: { list: Mismatch[] }) {
  const signFlow = useSignFlow()
  if (!list.length) return <Empty icon={CheckCircle2}>Chưa có biên bản sai lệch.</Empty>
  return (
    <>
      {list.map((mm) => {
        const pending = mm.status === 'Chờ QL ký'
        return (
          <Card key={mm.id} open={['sl', mm.id]} overdue={pending}>
            <div className="mc-top"><span className="mc-id">{mm.id}</span><span className="mc-status"><StatusChip status={mm.status} /></span></div>
            <Line k={`${mm.source} · ${mm.refId} · HĐ ${mm.contractId}`} />
            <Line k="Kỳ vọng / thực tế">{fmtN(mm.expected)} / {fmtN(mm.actual)} kg</Line>
            <Line k="Chênh lệch"><span className="mc-kg red-txt">{signed(mm.delta)} <small className="red-txt">kg</small></span></Line>
            <Line k="Lý do" kFix vClass="light">{mm.reason}{mm.reasonNote ? ` — ${mm.reasonNote}` : ''}</Line>
            <Line k="Người báo" vClass="sm">{mm.reportedBy} · {mm.dept} · {fmtDT(mm.date)}</Line>
            {pending
              ? <div className="btn-row"><Btn variant="rust" icon={PenLine} onClick={() => signFlow(mm)}>KÝ XÁC NHẬN</Btn></div>
              : <Line k="Đã ký" vClass="moss-txt sm">{mm.signedBy} · {fmtDT(mm.signedAt)}</Line>}
          </Card>
        )
      })}
    </>
  )
}

function QlContracts({ dash }: { dash: Dash }) {
  const cs = dash.contracts
  return (
    <>
      <SecTitle icon={FileSignature} count={cs.length}>Hợp đồng đang theo dõi</SecTitle>
      {cs.map((g) => {
        const c = g.contract, comp = g.complete, adv = g.adv
        const dueBad = comp.state === 'overdue', dueWarn = comp.state === 'soon'
        return (
          <Card key={c.id} open={['hd', c.id]} overdue={dueBad}>
            {dueBad && <div className="overdue-banner"><Siren />{comp.label}</div>}
            <div className="mc-top"><span className="mc-id">{c.id}</span><span className="mc-status"><StatusChip status={c.status} /></span></div>
            <Line vClass="left">{c.customer}</Line>
            <Line k={`${fmtN(c.totalQty)} ${c.unit} · ${fmtT(c.totalKg)}`}>{moneyShort(c.value)}</Line>
            <Line k="Ngày hoàn thành" vClass={'sm ' + (dueBad ? 'red-txt' : dueWarn ? 'amber-txt' : '')}>{comp.label}</Line>
            <Line k="Tạm ứng" vClass={'sm ' + (adv.state === 'missing' ? 'red-txt' : '')}>{adv.label}</Line>
            <PgRow label="Sản xuất" done={g.producedKg} plan={c.totalKg} unit="kg" />
            <PgRow label="Giao khách" done={g.deliveredKg} plan={c.totalKg} unit="kg" tone="success" />
            <Line k="Đối ứng hàng — tiền" vClass={'sm ' + (g.debt > 0 ? 'red-txt' : 'moss-txt')} style={{ marginTop: 8 }}>
              {g.debt > 0 ? `Khách nợ ${moneyShort(g.debt)}` : `Tiền trước hàng ${moneyShort(-g.debt)}`}
            </Line>
          </Card>
        )
      })}
    </>
  )
}

function QlReport({ dash, days, setDays }: { dash: Dash; days: number; setDays: (d: number) => void }) {
  const from = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString() }, [days])
  const { data: logs = [], isLoading } = useMovementLog({ from })
  const sumKind = (kind: string) => logs.filter((l) => l.kind === kind && l.kg != null).reduce((s, l) => s + (l.kg ?? 0), 0)
  const kgSX = sumKind('Chuẩn bị hàng'), kgCan = sumKind('Cân xuất đi mạ'), kgMa = sumKind('Nhập xưởng mạ'), kgGiao = sumKind('Giao khách')
  const chenh = kgCan - kgMa
  const tile = (Icon: LucideIcon, k: string, v: number) => (
    <div className="rpt-tile"><div className="rt-k"><Icon />{k}</div><div className="rt-v">{fmtN(v)} <small>kg</small></div></div>
  )
  const ods = dash.overdueDocs
  const byPerson = ods.reduce<Record<string, { dept: string; docs: OverdueDoc[] }>>((acc, d) => {
    (acc[d.person] ??= { dept: d.dept, docs: [] }).docs.push(d)
    return acc
  }, {})
  return (
    <>
      <div className="rpt-pills">
        {[7, 30].map((d) => <button key={d} type="button" className={days === d ? 'active' : ''} onClick={() => setDays(d)}>{d} ngày gần nhất</button>)}
      </div>
      <SecTitle icon={BarChart3}>Tổng luân chuyển trong kỳ</SecTitle>
      {isLoading ? <Loading /> : (
        <>
          <div className="rpt-grid">
            {tile(Factory, 'SX bàn giao kho', kgSX)}
            {tile(Scale, 'Cân xuất đi mạ', kgCan)}
            {tile(Flame, 'Đến xưởng mạ', kgMa)}
            {tile(PackageCheck, 'Giao khách ký', kgGiao)}
          </div>
          {Math.abs(chenh) > 0.5
            ? <div className="band bad" style={{ marginTop: 9 }}><AlertTriangle />Chênh cân xuất ↔ đến mạ trong kỳ: {signed(chenh)} kg (đang trên đường / chưa điền phiếu / lệch)</div>
            : <div className="band ok" style={{ marginTop: 9 }}><CheckCheck />Cân xuất = đến mạ trong kỳ — không chênh</div>}
        </>
      )}

      <SecTitle icon={FileSignature} count={dash.contracts.length}>Đối ứng theo hợp đồng</SecTitle>
      {dash.contracts.map((g) => {
        const c = g.contract
        const keyChecks = g.checks.filter((ck) => ck.key)
        const worst = keyChecks.find((ck) => !ck.ok)
        return (
          <Card key={c.id} open={['hd', c.id]} style={{ padding: '12px 13px' }}>
            <div className="mc-top" style={{ marginBottom: 5 }}>
              <span className="mc-id">{c.id}</span>
              <span className="mc-status">
                {!worst ? <span className="m-chip ok"><CheckCheck />Khớp 3 điểm cân</span>
                  : <span className="m-chip bad"><AlertTriangle />Lệch {signed(worst.delta)} kg</span>}
              </span>
            </div>
            <Line k={c.customer} style={{ paddingTop: 0 }} />
            <PgRow label="Đã giao khách" done={g.deliveredKg} plan={c.totalKg} unit="kg" tone="success" />
            <Line k="Công nợ" vClass={'sm ' + (g.debt > 0 ? 'red-txt' : 'moss-txt')} style={{ marginTop: 6 }}>
              {g.debt > 0 ? `Khách nợ ${moneyShort(g.debt)}` : g.debt < 0 ? `Tiền trước hàng ${moneyShort(-g.debt)}` : 'Cân bằng'}
            </Line>
          </Card>
        )
      })}

      <SecTitle icon={UserX} count={ods.length} red={ods.length > 0}>Quá hạn theo người</SecTitle>
      {!ods.length ? <Empty icon={ShieldCheck}>Không ai đang giữ chứng từ quá hạn.</Empty> : Object.entries(byPerson).map(([name, grp]) => (
        <Card key={name} overdue>
          <div className="mc-top">
            <span className="m-chip bad"><UserRound />{name}</span>
            <span className="mc-status" style={{ fontSize: 12, color: 'var(--ash)' }}>{grp.dept} · {grp.docs.length} chứng từ</span>
          </div>
          {grp.docs.map((d) => (
            <Line key={d.id} k={<DLink kind={d.type} id={d.id} />} kFix vClass="red-txt" style={{ fontSize: 12 }}>Quá {d.hoursOver}h · thiếu {d.missing}</Line>
          ))}
        </Card>
      ))}
    </>
  )
}
