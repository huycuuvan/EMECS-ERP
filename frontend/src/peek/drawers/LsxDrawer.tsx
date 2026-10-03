/* Drawer Lệnh sản xuất — port ERPPeek.register('lsx') trong steel-data.js:
   thông tin lệnh · tiến độ SP & kg · chuỗi giao nhận 5 bước · bảng phiếu liên quan có đối ứng · nhật ký · thao tác theo vai trò. */
import { Button, Tag } from 'antd'
import { CalendarDays, Factory, GitCompareArrows, Gauge, History, Info, Link2, TableProperties } from 'lucide-react'
import { useContracts, useLsx, useReceipts, useTasks, useWeighings } from '@/api/hooks'
import HistoryBlock from '@/components/HistoryBlock'
import { Bar, Cell, CellGrid, Sec } from '@/components/ui'
import { daysLeft, fmtD, fmtDT, fmtKg, fmtT, relTime } from '@/lib/format'
import { LsxAdminActions } from '@/pages/lsx/LsxEditModals'
import { useLsxActions } from '@/pages/lsx/LsxModals'
import { effDeadline, isLate, LsxTimeline, pctOf, TodayOutput, useLsxPerms } from '@/pages/lsx/lsxUtil'
import { C } from '@/theme'
import PeekShell from '../PeekShell'
import RecordLink from '../RecordLink'
import { FlowChain, FlowTable, flowOf } from './lsx/LsxFlow'

export default function LsxDrawer({ id }: { id: string }) {
  const { data: x, isLoading, isError } = useLsx(id)
  const { data: receipts = [] } = useReceipts({ lsxId: id })
  const { data: weighings = [] } = useWeighings()
  const { data: tasks = [] } = useTasks()
  const { data: contracts = [] } = useContracts()
  const { canSx, canQl } = useLsxPerms()
  const act = useLsxActions()

  if (!x) return <PeekShell type="lsx" id={id} loading={isLoading} notFound={!isLoading && (isError || !x)} />

  const c = contracts.find((z) => z.id === x.contractId)
  const pk = pctOf(x.kgDone, x.kgPlan)
  const eff = effDeadline(x)
  const late = isLate(x)
  const open = x.status !== 'Hoàn thành' && x.status !== 'Từ chối'
  const dl = daysLeft(eff)
  const lateInfo = open ? (dl < 0 ? `TRỄ ${Math.abs(dl)} ngày` : `Còn ${dl} ngày`) : ''
  const f = flowOf(x, receipts, weighings, tasks)

  const actions = (
    <>
      {x.status === 'Chờ nhận' && canSx && <>
        <Button size="small" type="primary" onClick={() => act.accept(x)}>Nhận lệnh</Button>
        <Button size="small" ghost onClick={() => act.reject(x)}>Từ chối</Button>
      </>}
      {(x.status === 'Đang SX' || x.status === 'Hoàn thành') && canSx && <Button size="small" type="primary" onClick={() => act.progress(x)}>Nhập sản lượng ngày</Button>}
      {open && canQl && <Button size="small" ghost danger={late} onClick={() => act.extend(x)}>Gia hạn (QL)</Button>}
      <LsxAdminActions x={x} ghost />
    </>
  )

  return (
    <PeekShell type="lsx" id={x.id} status={x.status} actions={actions}
      sub={<span>
        HĐ {x.contractId} · {fmtT(x.kgPlan)}
        {lateInfo && <Tag variant="filled" className={late ? 'chip-overdue' : undefined}
          style={{ marginLeft: 8, borderRadius: 999, fontWeight: 700, background: late ? C.signalSoft : C.paper2, color: late ? C.signal : C.ink3 }}>{lateInfo}</Tag>}
      </span>}>
      <Sec icon={<Info />}>Thông tin lệnh</Sec>
      <CellGrid>
        <Cell label="Tên lệnh" wide>{x.name}</Cell>
        <Cell label="Hợp đồng"><RecordLink id={x.contractId} style={{ color: C.rust }} />{c && <div className="caption" style={{ fontWeight: 400 }}>{c.customer}</div>}</Cell>
        <Cell label="Phát lệnh bởi">{x.assignedBy}</Cell>
        <Cell label="Ngày phát lệnh">{fmtDT(x.assignedAt)}</Cell>
        <Cell label="Tiến độ yêu cầu">{x.leadDays} ngày</Cell>
        <Cell label="Hạn hoàn thành" alert={late}>
          {late ? <a className="text-signal" onClick={() => canQl && act.extend(x)} style={{ cursor: canQl ? 'pointer' : 'default' }}>
            {fmtD(x.deadline)}{x.extension && ` → gia hạn ${fmtD(x.extension.to)}`} · {lateInfo}
          </a> : <>{fmtD(x.deadline)}{x.extension && ` → gia hạn ${fmtD(x.extension.to)}`}</>}
        </Cell>
        <Cell label="Trạng thái nhận lệnh" alert={x.status === 'Từ chối'}>
          {x.acceptedAt ? `Nhận lúc ${fmtDT(x.acceptedAt)}` : x.status === 'Từ chối' ? 'TỪ CHỐI' : `Chờ ${relTime(x.assignedAt)}`}
          {x.acceptedBy && <div className="caption" style={{ fontWeight: 400 }}>{x.acceptedBy}</div>}
        </Cell>
        {x.rejectReason && <Cell label="Lý do từ chối" wide alert>{x.rejectReason}</Cell>}
        {x.extension && <Cell label="Lý do gia hạn (QL duyệt)" wide>
          {x.extension.reason}
          <div className="caption" style={{ fontWeight: 400 }}>Duyệt bởi {x.extension.approvedBy} · {fmtDT(x.extension.at)}</div>
        </Cell>}
      </CellGrid>

      <Sec icon={<Gauge />}>Tiến độ sản xuất</Sec>
      <CellGrid>
        <Cell label="Khối lượng lũy kế" extra={<Bar percent={pk} color={x.status === 'Hoàn thành' ? C.moss : late ? C.signal : C.amber} />}>
          {fmtKg(x.kgDone)} / {fmtKg(x.kgPlan)} ({pk}%)
        </Cell>
        <Cell label="Cập nhật gần nhất" alert={x.status === 'Đang SX' && !x.today}>
          {x.lastUpdateAt ? fmtDT(x.lastUpdateAt) : 'Chưa nhập ngày nào'}
          <TodayOutput x={x} />
        </Cell>
      </CellGrid>

      <Sec icon={<CalendarDays />}>Sản lượng theo ngày (xưởng nhập · giờ nhập / sửa)</Sec>
      {x.daily.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="pk-items" style={{ minWidth: 560 }}>
            <thead><tr><th>Ngày</th><th className="r">Sản lượng</th><th className="r">Lũy kế</th><th>Nhập lúc</th><th>Sửa gần nhất</th><th>Ghi chú</th></tr></thead>
            <tbody>
              {x.daily.map((d) => (
                <tr key={d.id}>
                  <td className="num">{fmtD(d.day)}</td>
                  <td className="r"><b>{fmtKg(d.kg)}</b></td>
                  <td className="r">{fmtKg(d.cumKg)}</td>
                  <td>{fmtDT(d.createdAt)}<div className="sub-soft">{d.createdBy}</div></td>
                  <td>{d.updatedAt
                    ? <><span style={{ color: C.amber, fontWeight: 600 }}>{fmtDT(d.updatedAt)}</span><div className="sub-soft">{fmtKg(d.prevKg)} → {fmtKg(d.kg)} · {d.updatedBy}</div></>
                    : <span className="text-ash">—</span>}</td>
                  <td className="sub-soft" style={{ marginTop: 0 }}>{d.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="caption">Xưởng chưa nhập sản lượng ngày nào.</p>}

      <Sec icon={<GitCompareArrows />}>Giao nhận giữa các bên từ lệnh — lũy kế 5 bước</Sec>
      <FlowChain x={x} f={f} />

      <Sec icon={<TableProperties />}>Bảng phiếu liên quan của lệnh (bấm mã phiếu mở bản ghi)</Sec>
      <FlowTable x={x} f={f} />

      {x.log.length > 0 && <>
        <Sec icon={<History />}>Nhật ký</Sec>
        <LsxTimeline log={x.log} />
      </>}

      <Sec icon={<Link2 />}>Liên kết</Sec>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Factory size={13} color={C.ash} />
        <RecordLink id={x.contractId} />
        {f.rcs.map((r) => <RecordLink key={r.id} id={r.id} />)}
        {f.pcs.map((p) => <RecordLink key={p.id} id={p.id} danger={!!p.mismatchId && p.status === 'Lệch — chờ ký'} />)}
      </div>

      <HistoryBlock type="lsx" id={x.id} />

      {act.node}
    </PeekShell>
  )
}
