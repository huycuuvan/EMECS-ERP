/* Tab "Theo xe" — Bảng giám sát chi tiết số tấn theo từng xe (M06): số chuyến, kg đến mạ, kg lấy từ mạ,
   kg giao khách, lệch, chuyến chưa điền số; mở rộng dòng để xem từng chuyến. */
import { DatePicker, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { type Dayjs } from 'dayjs'
import { Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useVehicleTonnage } from '@/api/hooksMaster'
import type { VehicleTonnageRow, VehicleTrip } from '@/api/typesMaster'
import { StatusTag } from '@/components/ui'
import { fmtDelta, fmtDT, fmtKg, fmtT } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { KindChip } from '../Vehicles'
import { Panel, StatCell } from '../dashboard/common'
import { TypeChip } from '../tasks/util'

const PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: '7 ngày qua', value: [dayjs().subtract(7, 'day'), dayjs()] },
  { label: '30 ngày qua', value: [dayjs().subtract(30, 'day'), dayjs()] },
  { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs()] },
  { label: 'Tháng trước', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
]

function Trips({ trips }: { trips: VehicleTrip[] }) {
  const cols: ColumnsType<VehicleTrip> = [
    { title: 'Thẻ', key: 'id', render: (_, t) => <RecordLink id={t.id} type="vc" /> },
    { title: 'Loại', key: 'type', render: (_, t) => <TypeChip type={t.type} /> },
    { title: 'Ngày', key: 'date', render: (_, t) => <span className="num">{fmtDT(t.date)}</span> },
    { title: 'Tài xế', key: 'drv', dataIndex: 'driver' },
    { title: 'HĐ', key: 'hd', render: (_, t) => <RecordLink id={t.contractId} type="hd" /> },
    { title: 'KG yêu cầu', key: 'req', align: 'right', render: (_, t) => <span className="num">{fmtKg(t.kgRequired)}</span> },
    { title: 'Số cân điền', key: 'kg', align: 'right', render: (_, t) => t.kg == null ? <span className="text-amber">chưa điền</span> : <span className="num">{fmtKg(t.kg)}</span> },
    { title: 'Lệch', key: 'delta', align: 'right', render: (_, t) => t.delta ? <b className="num text-signal">{fmtDelta(t.delta)}</b> : <span className="text-ash">—</span> },
    { title: 'Trạng thái', key: 'st', render: (_, t) => <StatusTag status={t.status} /> },
  ]
  return <Table<VehicleTrip> size="small" rowKey="id" columns={cols} dataSource={trips} pagination={false} scroll={{ x: 900 }} />
}

export default function VehicleTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(PRESETS[1].value)
  const period = useMemo(() => range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : undefined, [range])
  const { data = [], isLoading } = useVehicleTonnage(period)
  const tot = data.reduce((s, r) => ({
    trips: s.trips + r.tripCount, galv: s.galv + r.kgToGalv, deliv: s.deliv + r.kgDelivered, lech: s.lech + r.mismatchKg, open: s.open + r.openTrips,
  }), { trips: 0, galv: 0, deliv: 0, lech: 0, open: 0 })

  const columns: ColumnsType<VehicleTonnageRow> = [
    {
      title: 'Xe', key: 'plate', render: (_, r) => r.plate
        ? <div><span className="mono" style={{ fontWeight: 700 }}>{r.plate}</span> <KindChip kind={r.kind} />
          <div className="sub-soft">{r.capacityKg != null ? `tải trọng ${fmtT(r.capacityKg)}` : 'ngoài danh mục'}</div></div>
        : <span className="text-signal" style={{ fontWeight: 700 }}>Chưa gán xe</span>,
    },
    { title: 'Tài xế', key: 'drv', render: (_, r) => r.drivers.length ? r.drivers.join(', ') : <span className="text-ash">{r.defaultDriver || '—'}</span> },
    {
      title: 'Chuyến', key: 'trips', align: 'right', sorter: (a, b) => a.tripCount - b.tripCount,
      render: (_, r) => <span className="num"><b>{r.tripCount}</b><div className="sub-soft">{r.diMaTrips} đi mạ · {r.giaoTrips} giao</div></span>,
    },
    { title: 'Đến xưởng mạ', key: 'galv', align: 'right', sorter: (a, b) => a.kgToGalv - b.kgToGalv, render: (_, r) => <span className="num">{fmtKg(r.kgToGalv)}</span> },
    { title: 'Lấy từ mạ', key: 'pick', align: 'right', render: (_, r) => <span className="num">{fmtKg(r.kgPicked)}</span> },
    { title: 'Giao khách ký', key: 'deliv', align: 'right', sorter: (a, b) => a.kgDelivered - b.kgDelivered, render: (_, r) => <span className="num">{fmtKg(r.kgDelivered)}</span> },
    {
      title: 'Tổng đã chở', key: 'total', align: 'right', sorter: (a, b) => (a.kgToGalv + a.kgDelivered) - (b.kgToGalv + b.kgDelivered),
      render: (_, r) => <b className="num">{fmtT(r.kgToGalv + r.kgDelivered)}</b>,
    },
    {
      title: 'Lệch', key: 'lech', align: 'right',
      render: (_, r) => r.mismatchKg > 0
        ? <span className="num text-signal" style={{ fontWeight: 700 }}>{fmtKg(r.mismatchKg)}<div className="sub-soft">{r.mismatchTrips} chuyến lệch</div></span>
        : <span className="text-moss" style={{ fontWeight: 700 }}>khớp</span>,
    },
    { title: 'Chưa điền số', key: 'open', align: 'right', render: (_, r) => r.openTrips ? <span className="num text-amber" style={{ fontWeight: 700 }}>{r.openTrips}</span> : <span className="text-ash">0</span> },
    { title: 'Chuyến gần nhất', key: 'last', render: (_, r) => <span className="num">{fmtDT(r.lastTrip)}</span> },
  ]

  return (
    <Panel title="Giám sát số tấn theo từng xe"
      extra={<DatePicker.RangePicker value={range} onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)} format="DD/MM/YYYY"
        presets={PRESETS} allowClear placeholder={['Từ ngày', 'Đến ngày']} />}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
        <StatCell label="Số chuyến" value={tot.trips} cap={range ? 'trong kỳ (theo ngày xuất phát)' : 'toàn bộ thời gian'} />
        <StatCell label="Chở đến xưởng mạ" value={fmtT(tot.galv)} cap="bên mạ cân xác nhận" color="var(--steel)" />
        <StatCell label="Giao khách ký nhận" value={fmtT(tot.deliv)} cap="khách ký nhận" color="var(--moss)" />
        <StatCell label="Lệch theo chuyến" value={fmtKg(tot.lech)} cap="tổng |lệch| từng chuyến" color={tot.lech ? 'var(--signal)' : 'var(--moss)'} danger={tot.lech > 0} />
        <StatCell label="Chuyến chưa điền số" value={tot.open} cap="chưa có số cân mạ / khách ký" color={tot.open ? 'var(--amber)' : 'var(--ink)'} />
      </div>
      <Table<VehicleTonnageRow> size="middle" rowKey={(r) => r.plate ?? '__none__'} loading={isLoading} columns={columns} dataSource={data}
        pagination={false} scroll={{ x: 1180 }}
        expandable={{ expandedRowRender: (r) => <Trips trips={r.trips} />, rowExpandable: (r) => r.trips.length > 0 }}
        locale={{ emptyText: 'Chưa có xe / chuyến nào trong kỳ.' }} />
      <p className="caption" style={{ margin: '10px 0 0' }}>
        <Info size={12} style={{ verticalAlign: -2 }} /> Xe gán khi Quản lý giao thẻ công việc. Không tính thẻ bị từ chối. Bấm <b>+</b> để xem từng chuyến; bấm mã thẻ để mở chi tiết.
      </p>
    </Panel>
  )
}
