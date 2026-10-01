/* Lệnh sản xuất — port pages/04-lenh-san-xuat.html:
   KPI · danh sách lệnh (tiến độ SP & kg, hạn/gia hạn, trạng thái nhận lệnh) · lọc · phát lệnh · xưởng nhận / từ chối ·
   cập nhật tiến độ · QL duyệt gia hạn · nhật ký lệnh được chọn. */
import { Button, Card, Input, Select, Table, type TableColumnsType } from 'antd'
import { Factory, History, Search } from 'lucide-react'
import { useMemo, useState, type MouseEvent } from 'react'
import { useContracts, useLsxList } from '@/api/hooks'
import type { Lsx } from '@/api/types'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { fmtDT, fmtKg, fmtNum, fmtT } from '@/lib/format'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import { C } from '@/theme'
import { useLsxActions } from './lsx/LsxModals'
import { isLate, LsxDueCell, LsxMiniProgress, LsxTimeline, useLsxPerms, waitLabel } from './lsx/lsxUtil'

const sub = { color: C.ash, fontSize: 11, marginTop: 2 }

export default function LsxPage() {
  const { open } = usePeek()
  const { data: all = [], isLoading } = useLsxList()
  const { data: contracts = [] } = useContracts()
  const { canSx, canQl } = useLsxPerms()
  const [q, setQ] = useState('')
  const [fs, setFs] = useState<string>('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const act = useLsxActions({ onCreated: (id) => setSelectedId(id) })

  const cmap = useMemo(() => Object.fromEntries(contracts.map((c) => [c.id, c])), [contracts])

  const rows = useMemo(() => all.filter((x) => {
    const c = cmap[x.contractId]
    if (q && `${x.id} ${x.name} ${x.contractId} ${c?.customer ?? ''}`.toLowerCase().indexOf(q.toLowerCase()) < 0) return false
    if (fs === 'late') return isLate(x)
    if (fs && x.status !== fs) return false
    return true
  }), [all, cmap, q, fs])

  /* KPI */
  const run = all.filter((x) => x.status === 'Đang SX')
  const wait = all.filter((x) => x.status === 'Chờ nhận')
  const rej = all.filter((x) => x.status === 'Từ chối')
  const late = all.filter(isLate)
  const oldest = [...wait].sort((a, b) => a.assignedAt.localeCompare(b.assignedAt))[0]

  const stop = (f: () => void) => (e: MouseEvent) => { e.stopPropagation(); f() }

  const columns: TableColumnsType<Lsx> = [
    {
      title: 'Lệnh sản xuất', key: 'id',
      render: (_, x) => (
        <div>
          <div className="mono" style={{ fontWeight: 600 }}>{x.id}</div>
          <div style={sub}>{x.name}</div>
          <div style={sub}>Phát {fmtDT(x.assignedAt)} · {x.assignedBy}</div>
        </div>
      ),
    },
    {
      title: 'Hợp đồng', key: 'hd',
      render: (_, x) => (
        <div>
          <RecordLink id={x.contractId} style={{ color: C.rust }} />
          <div style={sub}>{cmap[x.contractId]?.customer ?? ''}</div>
        </div>
      ),
    },
    {
      title: 'Kế hoạch', key: 'plan',
      render: (_, x) => (
        <div className="num">
          <b>{fmtNum(x.qtyPlan)}</b> {cmap[x.contractId]?.unit ?? 'SP'}
          <div style={sub}>{fmtKg(x.kgPlan)} · tiến độ {x.leadDays} ngày</div>
        </div>
      ),
    },
    { title: 'Tiến độ (SP & kg)', key: 'prog', render: (_, x) => <LsxMiniProgress x={x} /> },
    { title: 'Hạn', key: 'due', render: (_, x) => <LsxDueCell x={x} /> },
    {
      title: 'Trạng thái nhận lệnh', key: 'acc',
      render: (_, x) => {
        if (x.status === 'Chờ nhận') return (
          <div><StatusTag status="Chờ nhận" /><div style={{ ...sub, color: C.amber, fontWeight: 600 }}>chờ {waitLabel(x)}</div></div>
        )
        if (x.status === 'Từ chối') return (
          <div><StatusTag status="Từ chối" /><div style={{ color: C.signal, fontSize: 11, marginTop: 3, maxWidth: 220, lineHeight: 1.45 }}>{x.rejectReason}</div></div>
        )
        return (
          <div>
            <StatusTag status="Đã nhận" style={x.status === 'Hoàn thành' ? { background: C.mossSoft, color: C.moss } : undefined} />
            <div style={sub}>{fmtDT(x.acceptedAt)} · {x.acceptedBy ?? ''}</div>
          </div>
        )
      },
    },
    {
      title: '', key: 'act',
      render: (_, x) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {x.status === 'Chờ nhận' && canSx && <>
            <Button size="small" type="primary" onClick={stop(() => act.accept(x))}>Nhận lệnh</Button>
            <Button size="small" onClick={stop(() => act.reject(x))}>Từ chối</Button>
          </>}
          {x.status === 'Đang SX' && canSx && <Button size="small" onClick={stop(() => act.progress(x))}>Cập nhật tiến độ</Button>}
          {isLate(x) && canQl && <Button size="small" danger onClick={stop(() => act.extend(x))}>Gia hạn (QL)</Button>}
        </div>
      ),
    },
  ]

  const selected = selectedId ? all.find((x) => x.id === selectedId) : undefined

  return (
    <div>
      <PageHeader title="Lệnh sản xuất"
        desc="Quản lý phát lệnh — xưởng nhận / từ chối có lý do — theo dõi tiến độ SL & kg, gia hạn có phê duyệt"
        extra={canQl && <Button type="primary" icon={<Factory size={14} />} onClick={act.create}>+ Phát lệnh sản xuất</Button>} />

      <KpiGrid>
        <Kpi tone="steel" label="Đang sản xuất" value={run.length}
          sub={`đang chạy ${fmtT(run.reduce((s, x) => s + x.kgPlan, 0))} kế hoạch`} onClick={() => setFs('Đang SX')} />
        <Kpi tone="amber" label="Chờ xưởng nhận" value={wait.length} onClick={() => setFs('Chờ nhận')}
          sub={oldest ? <>chờ lâu nhất: {waitLabel(oldest)} (<RecordLink id={oldest.id} />)</> : 'không có lệnh chờ xưởng xác nhận'} />
        <Kpi tone="signal" label="Bị từ chối" value={<span className="text-signal">{rej.length}</span>} onClick={() => setFs('Từ chối')}
          sub={<span className="text-signal">cần điều chỉnh lịch / phát lại lệnh</span>} />
        <Kpi tone="signal" label="Trễ hạn" value={<span className="text-signal">{late.length}</span>} onClick={() => setFs('late')}
          sub={late.length
            ? <span>{late.map((x, i) => <span key={x.id}>{i > 0 && ' · '}<RecordLink id={x.id} danger /></span>)}</span>
            : <span className="text-signal">chưa có lệnh quá hạn hiệu lực</span>} />
      </KpiGrid>

      <Card styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Input allowClear prefix={<Search size={14} color={C.ash} />} placeholder="Tìm mã lệnh, tên lệnh, hợp đồng, khách hàng..."
            value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1, minWidth: 220, borderRadius: 999 }} />
          <Select value={fs} onChange={setFs} style={{ minWidth: 190 }}
            options={[
              { value: '', label: 'Tất cả trạng thái' },
              ...['Chờ nhận', 'Đang SX', 'Từ chối', 'Hoàn thành'].map((s) => ({ value: s, label: s })),
              { value: 'late', label: 'Trễ hạn' },
            ]} />
        </div>
        <Table<Lsx> rowKey="id" size="middle" loading={isLoading} dataSource={rows} columns={columns}
          pagination={rows.length > 20 ? { pageSize: 20, showSizeChanger: false } : false} scroll={{ x: 1100 }}
          locale={{ emptyText: 'Không có lệnh sản xuất phù hợp bộ lọc.' }}
          rowClassName={(x) => 'clickable-row' + (isLate(x) ? ' row-alert' : '')}
          onRow={(x) => ({
            onClick: () => { setSelectedId(x.id); open('lsx', x.id) },
            style: x.id === selectedId ? { outline: `2px solid ${C.rust}`, outlineOffset: -2 } : undefined,
          })} />
      </Card>

      <Card style={{ marginTop: 20 }} styles={{ body: { padding: 16 } }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: 15 }}>
          <History size={16} /> Nhật ký lệnh được chọn
          {selected && <span className="caption" style={{ fontWeight: 400 }}>— {selected.id} · {selected.name}</span>}
        </div>
        <div style={{ marginTop: 12 }}>
          {!selected
            ? <p className="caption" style={{ margin: 0 }}>Bấm một dòng trong danh sách để xem nhật ký phát lệnh — nhận — tiến độ — gia hạn (đồng thời mở hồ sơ lệnh trượt từ phải).</p>
            : <>
              <LsxTimeline log={selected.log} />
              {selected.rejectReason && <p className="caption text-signal"><b>Lý do từ chối:</b> {selected.rejectReason}</p>}
            </>}
        </div>
      </Card>

      {act.node}
    </div>
  )
}
