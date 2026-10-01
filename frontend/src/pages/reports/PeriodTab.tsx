/* Tab 1 — Đối ứng phiếu theo kỳ: 5 ô tổng theo tầng, bóc tách chênh Cân xuất ↔ Đến mạ (trên xe / rơi rớt chưa duyệt),
   biểu đồ 4 tuần, nhật ký chứng từ trong kỳ. */
import { App, Button, Input, Modal, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Archive, Check } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useAcceptLoss, useMismatches, useMovementLog, useTasks, useVlossList } from '@/api/hooks'
import type { Task } from '@/api/types'
import ExportButton from '@/components/ExportButton'
import { useAuth } from '@/lib/auth'
import { fmtKg } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { GroupedBar, LegendRow } from '../dashboard/charts'
import { Panel, StatCell } from '../dashboard/common'
import { MovementFilterBar, MovementTable, tierTotals, useMovementFilter } from '../dashboard/movement'
import { MODAL_Z, signedKg } from '../mismatches/sign'

const STAT_CSS = `
.stat5{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:16px}
.stat5b{margin-top:-6px}
.stat5b>div{position:relative}
.stat5b>div::before{content:'';position:absolute;top:-9px;left:26px;width:1px;height:9px;background:var(--rule)}
.stat5b .c1{grid-column:2/3;transform:translateX(50%)}
.stat5b .c2{grid-column:3/4;transform:translateX(50%)}
@media (max-width:1100px){.stat5{grid-template-columns:repeat(2,minmax(0,1fr))}.stat5b .c1,.stat5b .c2{grid-column:auto;transform:none}}
`

export default function PeriodTab() {
  const { f, setF, params } = useMovementFilter()
  const { data: periodRows, isLoading } = useMovementLog(params)
  const { data: chartRows } = useMovementLog({ contractId: params.contractId })
  const { data: tasks } = useTasks({ type: 'di_ma' })
  const { data: vloss } = useVlossList()
  const { data: mismatches } = useMismatches()
  const [popup, setPopup] = useState<'truck' | 'loss' | null>(null)

  const all = periodRows ?? []
  const shown = f.kind ? all.filter((r) => r.kind === f.kind) : all
  // 5 ô tổng trong kỳ (không áp bộ lọc loại phiếu để đối ứng đủ tầng)
  const t = tierTotals(all)
  const chenh = t.pc - t.giao

  // ---- bóc tách chênh CÂN XUẤT ↔ ĐẾN MẠ ----
  const { truckList, lossList, onTruck, vaultKg } = useMemo(() => {
    // so sánh theo thời điểm (chuỗi ISO có thể khác số chữ số ms) → dùng Date
    const inKyD = (d: string | null) => !!d && (!params.from || new Date(d) >= new Date(params.from)) && (!params.to || new Date(d) <= new Date(params.to))
    const diMa = (tasks ?? []).filter((x) => x.status !== 'Từ chối' && (!params.contractId || x.contractId === params.contractId) && inKyD(x.departedAt || x.assignedAt))
    const truckList = diMa.filter((x) => x.kgAtGalv == null)
    const lossList = diMa.filter((x) => x.kgAtGalv != null && x.kgAtGalv !== x.kgRequired)
    const vaultList = (vloss ?? []).filter((e) => e.source === 'Cân tại xưởng mạ' && (!params.contractId || e.contractId === params.contractId) && inKyD(e.date))
    return {
      truckList, lossList,
      onTruck: truckList.reduce((s, x) => s + (Number(x.kgRequired) || 0), 0),
      vaultKg: vaultList.reduce((s, e) => s + (Number(e.kg) || 0), 0),
    }
  }, [tasks, vloss, params])
  const loss = t.pc - t.ma - onTruck - vaultKg // phần rơi rớt CHƯA được QL duyệt

  // ---- biểu đồ 4 tuần (theo hợp đồng, không theo kỳ) ----
  const series = useMemo(() => {
    const s: Record<string, number[]> = { 'Cân xuất đi mạ': [0, 0, 0, 0], 'Nhập xưởng mạ': [0, 0, 0, 0], 'Giao khách': [0, 0, 0, 0] }
    const now = Date.now()
    ;(chartRows ?? []).forEach((r) => {
      if (r.kg == null || !r.date || !s[r.kind]) return
      const w = Math.floor((now - new Date(r.date).getTime()) / (7 * 86400000))
      if (w < 0 || w > 3) return
      s[r.kind][3 - w] += r.kg
    })
    return s
  }, [chartRows])

  return (
    <>
      <style>{STAT_CSS}</style>
      <Panel style={{ marginBottom: 24 }}>
        <MovementFilterBar f={f} setF={setF} />
        <div className="stat5">
          <StatCell label="SX bàn giao (PTN)" value={fmtKg(t.ptn)} cap="kho tiếp nhận từ xưởng" color="var(--steel)" />
          <StatCell label="Cân xuất công ty (PC)" value={fmtKg(t.pc)} cap="kg thực cân tại trạm" />
          <StatCell label="Đến xưởng mạ" value={fmtKg(t.ma)} cap="bên mạ xác nhận cân" color="var(--rust)" />
          <StatCell label="Giao khách" value={fmtKg(t.giao)} cap="khách ký nhận" color="var(--moss)" />
          <StatCell label="Chênh giữa các tầng" danger={chenh !== 0} color={chenh !== 0 ? 'var(--signal)' : 'var(--moss)'}
            value={(chenh === 0 ? '' : chenh > 0 ? '−' : '+') + fmtKg(Math.abs(chenh))} cap="= hàng đang đi đường / tồn tại mạ / có sai lệch" />
        </div>
        <div className="stat5 stat5b">
          <div className="c1">
            <StatCell dashed label="Trên xe đang tới mạ" value={fmtKg(onTruck)} color="#9c7714" onClick={() => setPopup('truck')} title="Bấm xem danh sách chuyến xe"
              cap={`${truckList.length} chuyến đã cân xuất, mạ chưa xác nhận — bấm xem phiếu`} />
          </div>
          <div className="c2">
            <StatCell dashed danger={loss !== 0} color={loss !== 0 ? 'var(--signal)' : 'var(--moss)'} onClick={() => setPopup('loss')}
              title="Bấm xem phiếu liên quan & duyệt chuyển kho ảo" label="Rơi rớt chưa duyệt"
              value={loss === 0 ? '0 kg ✓' : (loss > 0 ? '−' : '+') + fmtKg(Math.abs(loss))}
              cap={`Cân xuất ${fmtKg(t.pc)} − mạ ${fmtKg(t.ma)} − xe ${fmtKg(onTruck)} − kho ảo ${fmtKg(vaultKg)} — bấm duyệt`} />
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>Đối ứng kg theo tuần (4 tuần gần nhất)</div>
        <LegendRow items={[
          { label: 'Cân xuất công ty (PC)', color: '#14130f' }, { label: 'Đến xưởng mạ', color: '#c5400a' }, { label: 'Giao khách', color: '#2f5d3a' },
        ]} />
        <GroupedBar height={250} unit="kg" labels={['3 tuần trước', '2 tuần trước', 'Tuần trước', 'Tuần này']} datasets={[
          { name: 'Cân xuất công ty', color: '#14130f', values: series['Cân xuất đi mạ'] },
          { name: 'Đến xưởng mạ', color: '#c5400a', values: series['Nhập xưởng mạ'] },
          { name: 'Giao khách', color: '#2f5d3a', values: series['Giao khách'] },
        ]} />
      </Panel>

      <Panel title={<>Nhật ký chứng từ trong kỳ <span className="caption" style={{ fontWeight: 400 }}>— {shown.length} chứng từ</span></>}
        extra={<ExportButton kind="movement-log" size="small" params={{ contract_id: params.contractId, date_from: params.from, date_to: params.to, kind: f.kind }} />}>
        <MovementTable rows={shown} loading={isLoading} nullText="chưa điền" whoTitle="Người thực hiện" emptyText="Không có chứng từ nào trong kỳ đã chọn." />
      </Panel>

      <TruckModal open={popup === 'truck'} rows={truckList} onClose={() => setPopup(null)} />
      <LossModal open={popup === 'loss'} rows={lossList} onClose={() => setPopup(null)}
        mismatchStatus={(id) => mismatches?.find((m) => m.id === id)?.status ?? ''} />
    </>
  )
}

/* ---------------------------------------------------------------- popup phiếu liên quan */
function PopLink({ id, type, onNav, danger, children }: { id: string | null; type: 'vc' | 'pc' | 'hd' | 'sl'; onNav: () => void; danger?: boolean; children?: ReactNode }) {
  if (!id) return <span className="text-ash">—</span>
  return <span onClickCapture={onNav}><RecordLink id={id} type={type} danger={danger} style={danger ? undefined : { color: 'var(--rust)' }}>{children}</RecordLink></span>
}
const popHint = <p className="caption" style={{ margin: '8px 0 0' }}>Bấm mã phiếu để mở bản ghi gốc (popup sẽ đóng).</p>

function TruckModal({ open, rows, onClose }: { open: boolean; rows: Task[]; onClose: () => void }) {
  const columns: ColumnsType<Task> = [
    { title: 'Thẻ xe', dataIndex: 'id', render: (id) => <PopLink id={id} type="vc" onNav={onClose} /> },
    { title: 'Phiếu cân gốc', dataIndex: 'refId', render: (id) => <PopLink id={id} type="pc" onNav={onClose} /> },
    { title: 'Hợp đồng', dataIndex: 'contractId', render: (id) => <PopLink id={id} type="hd" onNav={onClose} /> },
    { title: 'Tài xế', dataIndex: 'driver' },
    { title: 'KL cân xuất', dataIndex: 'kgRequired', align: 'right', render: (v) => <b className="num">{fmtKg(v)}</b> },
    {
      title: 'Trạng thái', dataIndex: 'status', render: (s, x) => {
        const over = !!x.fillDeadline && Date.now() > new Date(x.fillDeadline).getTime()
        return <span style={over ? { color: 'var(--signal)', fontWeight: 700 } : { color: '#9c7714' }}>{s}{over ? ' · QUÁ HẠN ĐIỀN' : ''}</span>
      },
    },
  ]
  return (
    <Modal open={open} onCancel={onClose} zIndex={MODAL_Z} width={820} title={`Hàng đã cân xuất — đang trên xe tới xưởng mạ (${rows.length} chuyến)`}
      footer={<Button type="primary" onClick={onClose}>Đóng</Button>}>
      <Table<Task> size="small" rowKey="id" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 680, y: '52vh' }}
        locale={{ emptyText: <div style={{ padding: 20, color: 'var(--ash)' }}>Không có chuyến nào đang trên đường.</div> }} />
      {popHint}
    </Modal>
  )
}

function LossModal({ open, rows, onClose, mismatchStatus }: { open: boolean; rows: Task[]; onClose: () => void; mismatchStatus: (id: string) => string }) {
  const { can } = useAuth()
  const { modal } = App.useApp()
  const accept = useAcceptLoss()
  const canApprove = can('kho-ao', 'full')

  const acceptUI = (x: Task) => {
    const d = x.kgRequired - (x.kgAtGalv ?? 0)
    let note = ''
    modal.confirm({
      zIndex: MODAL_Z + 10, width: 560, icon: null,
      title: 'Cho phép rơi rớt — chuyển kho ảo',
      okText: 'OK — cho phép & chuyển kho ảo', cancelText: 'Hủy',
      content: (
        <div>
          <p>Quản lý xác nhận CHO PHÉP phần hụt <b className="text-signal">{fmtKg(Math.abs(d))}</b> của chuyến <b>{x.id}</b> (đã kiểm tra thực tế).</p>
          <p className="caption">Lượng này được ghi vào <b>KHO ẢO RƠI RỚT</b> — tổng cân đối trở nên hợp lý: Cân xuất = Mạ nhận + Trên xe + Kho ảo.
            Biên bản sai lệch liên quan (nếu đang chờ) sẽ được ký xác nhận.</p>
          <div className="caption" style={{ marginBottom: 4 }}>Ghi chú duyệt</div>
          <Input placeholder="VD: bavia rơi khi bốc xếp, đã kiểm tra camera" onChange={(e) => { note = e.target.value }} />
        </div>
      ),
      onOk: () => accept.mutateAsync({ refType: 'vc', refId: x.id, note: note || undefined }).catch(() => undefined),
    })
  }

  const columns: ColumnsType<Task> = [
    { title: 'Thẻ xe', dataIndex: 'id', render: (id) => <PopLink id={id} type="vc" onNav={onClose} /> },
    { title: 'Phiếu cân gốc', dataIndex: 'refId', render: (id) => <PopLink id={id} type="pc" onNav={onClose} /> },
    { title: 'Hợp đồng', dataIndex: 'contractId', render: (id) => <PopLink id={id} type="hd" onNav={onClose} /> },
    { title: 'Cân công ty', dataIndex: 'kgRequired', align: 'right', render: (v) => <span className="num">{fmtKg(v)}</span> },
    { title: 'Mạ xác nhận', dataIndex: 'kgAtGalv', align: 'right', render: (v) => <span className="num">{fmtKg(v)}</span> },
    {
      title: 'Chênh', key: 'd', align: 'right',
      render: (_, x) => <span className="num text-signal" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{signedKg((x.kgAtGalv ?? 0) - x.kgRequired)}</span>,
    },
    {
      title: 'Biên bản sai lệch', dataIndex: 'mismatchId', render: (id) => id
        ? <PopLink id={id} type="sl" onNav={onClose} danger>{id} · {mismatchStatus(id)}</PopLink>
        : <span className="text-signal" style={{ fontWeight: 700 }}>CHƯA LẬP BIÊN BẢN</span>,
    },
    {
      title: 'Duyệt kho ảo', key: 'vk', render: (_, x) => x.lossAccepted
        ? <Tag variant="filled" color="green" style={{ whiteSpace: 'nowrap', fontWeight: 700 }}><Archive size={11} style={{ verticalAlign: -2 }} /> ĐÃ CHUYỂN KHO ẢO</Tag>
        : canApprove
          ? <Button type="primary" size="small" icon={<Check size={12} />} style={{ whiteSpace: 'nowrap' }} onClick={() => acceptUI(x)}>OK — cho phép</Button>
          : <span className="caption" style={{ whiteSpace: 'nowrap' }}>Chờ Quản lý A duyệt</span>,
    },
  ]
  return (
    <Modal open={open} onCancel={onClose} zIndex={MODAL_Z} width={1040} title={`Rơi rớt / thất thoát giữa xưởng ↔ xưởng mạ (${rows.length} chuyến có lệch)`}
      footer={<Button type="primary" onClick={onClose}>Đóng</Button>}>
      <Table<Task> size="small" rowKey="id" columns={columns} dataSource={rows} pagination={false} scroll={{ x: 900, y: '52vh' }}
        locale={{ emptyText: <div style={{ padding: 20, color: 'var(--moss)' }}>Không có rơi rớt thất thoát nào giữa xưởng và mạ trong kỳ ✓</div> }} />
      {popHint}
      <p className="caption" style={{ margin: '6px 0 0' }}>
        <Archive size={11} style={{ verticalAlign: -2 }} /> Bấm <b>OK — cho phép</b>: Quản lý chấp nhận phần rơi rớt, chuyển vào <b>kho ảo</b> để tổng cân đối hợp lý (biên bản chờ ký sẽ được ký luôn).
      </p>
    </Modal>
  )
}
