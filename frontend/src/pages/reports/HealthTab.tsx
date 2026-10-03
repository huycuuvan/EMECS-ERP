/* Tab 3 — Sức khỏe hợp đồng: % SX · % giao · % tiền về · 3 điểm cân · biên bản chờ ký · trạng thái. */
import { Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { BadgeCheck, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDashboard } from '@/api/hooks'
import type { ContractAggLite } from '@/api/types'
import { StatusTag } from '@/components/ui'
import { fmtT, moneyShort } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { usePeek } from '@/peek/context'
import { ThreePointChecks, threePoint } from '../dashboard/checks'
import { MiniProg, Panel } from '../dashboard/common'

export default function HealthTab() {
  const { data, isLoading } = useDashboard()
  const { open } = usePeek()
  const navigate = useNavigate()

  const columns: ColumnsType<ContractAggLite> = [
    {
      title: 'Hợp đồng', key: 'id', render: (_, g) => (
        <div><RecordLink id={g.contract.id} type="hd" style={{ color: 'var(--rust)' }} />
          <div style={{ color: 'var(--ash)', fontSize: 11, marginTop: 2 }}>{g.contract.code} · {fmtT(g.contract.totalKg)}</div></div>
      ),
    },
    { title: 'Khách hàng', key: 'cus', render: (_, g) => g.contract.customer },
    { title: '% Sản xuất', key: 'sx', render: (_, g) => <MiniProg pct={g.pctProduced} top={fmtT(g.producedKg)} color={g.pctProduced >= 100 ? 'var(--moss)' : 'var(--ink)'} /> },
    { title: '% Giao hàng', key: 'giao', render: (_, g) => <MiniProg pct={g.pctDelivered} top={fmtT(g.deliveredKg)} color={g.pctDelivered >= 100 ? 'var(--moss)' : 'var(--amber)'} /> },
    {
      title: '% Tiền về', key: 'tien',
      render: (_, g) => <MiniProg pct={g.pctPaid} top={moneyShort(g.paidTotal)} color={g.pctPaid >= g.pctDelivered ? 'var(--moss)' : 'var(--signal)'} />,
    },
    { title: '3 điểm cân', key: 'chk', render: (_, g) => <ThreePointChecks g={g} /> },
    {
      title: 'Chờ ký SL', key: 'sl', render: (_, g) => {
        const n = threePoint(g).pendingSl
        return n > 0
          ? <a className="text-signal" style={{ fontWeight: 800, whiteSpace: 'nowrap' }} onClick={(e) => { e.stopPropagation(); navigate('/sai-lech') }}>{n} chờ ký</a>
          : <span className="text-ash">0</span>
      },
    },
    {
      title: 'Trạng thái', key: 'st', render: (_, g) => {
        const standard = g.contract.status === 'Đã hoàn thành' && threePoint(g).allOk && g.pctDelivered >= 100
        return (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusTag status={g.contract.status} />
            {standard && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: 'var(--moss-soft)', color: 'var(--moss)', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                <BadgeCheck size={12} /> Hồ sơ chuẩn ✓
              </span>
            )}
          </div>
        )
      },
    },
  ]

  return (
    <Panel title="Sức khỏe toàn bộ hợp đồng — SX · Giao · Tiền · 3 điểm cân">
      <Table<ContractAggLite> size="small" rowKey={(g) => g.contract.id} columns={columns} dataSource={data?.contracts ?? []} loading={isLoading}
        pagination={false} rowClassName="clickable-row" onRow={(g) => ({ onClick: () => open('hd', g.contract.id) })} scroll={{ x: 1100 }} />
      <p className="caption" style={{ margin: '12px 0 0' }}>
        <Info size={12} style={{ verticalAlign: -2 }} /> 3 điểm cân: <b>cân xuất công ty = cân đến xưởng mạ = lấy từ mạ đi giao khách</b>. Bấm dòng để mở hồ sơ đối ứng hợp đồng.
      </p>
    </Panel>
  )
}
