/* 07 — Thẻ công việc lái xe: đi mạ & giao khách — tài xế xác nhận, xuất phát, điền số cân + ảnh phiếu trong 24h. */
import { Button, Input, Select, Table, Tabs } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { Info, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMeta, useTasks } from '@/api/hooks'
import type { Task } from '@/api/types'
import { Kpi, KpiGrid, PageHeader } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtKg, hoursOver, relTime } from '@/lib/format'
import { usePeek } from '@/peek/context'
import RecordLink from '@/peek/RecordLink'
import CreateTaskModal from './tasks/CreateTaskModal'
import TaskActions from './tasks/TaskActions'
import { isOverdue, useNow } from './tasks/logic'
import { DueCell, KgCell, PhotoCell, RefCell, TaskStatusTag, TypeChip } from './tasks/util'

type TabKey = 'all' | 'cho' | 'dang' | 'quahan' | 'xong' | 'tuchoi'

const panel = { background: 'var(--canvas)', border: '1px solid var(--rule)', borderRadius: 12, padding: '6px 18px 18px' }

export default function Tasks() {
  const { data: tasks = [], isLoading } = useTasks()
  const { data: meta } = useMeta()
  const { can, hasRole } = useAuth()
  const { open } = usePeek()
  const now = useNow()
  const [tab, setTab] = useState<TabKey>('all')
  const [driver, setDriver] = useState<string>()
  const [contract, setContract] = useState<string>()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const tol = meta?.toleranceKg ?? 30
  // Quản lý A giao việc; lái xe chỉ xác nhận / từ chối / xuất phát / điền phiếu
  const canAssign = hasRole('admin') // server: chỉ Quản lý giao thẻ

  const inTab = (t: Task, k: TabKey) => {
    if (k === 'cho') return t.status === 'Chờ xác nhận'
    if (k === 'dang') return (t.status === 'Đã nhận' || t.status === 'Đang chạy') && !isOverdue(t, now)
    if (k === 'quahan') return isOverdue(t, now)
    if (k === 'xong') return t.status === 'Hoàn thành'
    if (k === 'tuchoi') return t.status === 'Từ chối'
    return true
  }

  const base = useMemo(() => {
    const s = q.trim().toLowerCase()
    return tasks.filter((t) => {
      if (driver && t.driver !== driver) return false
      if (contract && t.contractId !== contract) return false
      if (s && !(t.id + ' ' + t.contractId + ' ' + (t.refId ?? '') + ' ' + t.driver + ' ' + t.note).toLowerCase().includes(s)) return false
      return true
    }).sort((a, b) => b.assignedAt.localeCompare(a.assignedAt))
  }, [tasks, driver, contract, q])
  const rows = base.filter((t) => inTab(t, tab))

  const wait = tasks.filter((t) => t.status === 'Chờ xác nhận').length
  const run = tasks.filter((t) => t.status === 'Đã nhận' || t.status === 'Đang chạy').length
  const over = tasks.filter((t) => isOverdue(t, now))
  const rej = tasks.filter((t) => t.status === 'Từ chối').length
  const contractIds = [...new Set(tasks.map((t) => t.contractId))].sort()

  const columns: ColumnsType<Task> = [
    { title: 'Mã thẻ', dataIndex: 'id', width: 110, render: (_, t) => (
      <div><span className="mono" style={{ fontWeight: 700 }}>{t.id}</span><div className="caption" style={{ fontSize: 11 }}>{relTime(t.assignedAt)}</div></div>) },
    { title: 'Loại việc', dataIndex: 'type', render: (_, t) => <TypeChip type={t.type} /> },
    { title: 'Tài xế', dataIndex: 'driver' },
    { title: 'HĐ', dataIndex: 'contractId', render: (v: string) => <RecordLink id={v} style={{ color: 'var(--rust)', fontSize: 12 }} /> },
    { title: 'Chứng từ gốc', dataIndex: 'refId', render: (_, t) => <RefCell t={t} /> },
    { title: 'KG yêu cầu', dataIndex: 'kgRequired', align: 'right', render: (v: number) => <span className="num mono">{fmtKg(v)}</span> },
    { title: 'Số cân điền', key: 'kg', render: (_, t) => <KgCell t={t} tol={tol} /> },
    { title: 'Ảnh phiếu', key: 'photo', render: (_, t) => <PhotoCell t={t} /> },
    { title: 'Hạn điền (24h)', dataIndex: 'fillDeadline', render: (_, t) => <DueCell t={t} now={now} onOpen={() => open('vc', t.id)} /> },
    { title: 'Trạng thái', dataIndex: 'status', render: (_, t) => <TaskStatusTag t={t} now={now} withReason /> },
    ...(can('van-chuyen', 'edit') ? [{ title: 'Thao tác', key: 'act', render: (_: unknown, t: Task) => <TaskActions task={t} /> }] : []),
  ]

  const cnt = (k: TabKey) => base.filter((t) => inTab(t, k)).length
  const tabItems: { key: TabKey; label: string }[] = [
    { key: 'all', label: 'Tất cả' }, { key: 'cho', label: 'Chờ xác nhận' }, { key: 'dang', label: 'Đang thực hiện' },
    { key: 'quahan', label: 'Quá hạn điền' }, { key: 'xong', label: 'Hoàn thành' }, { key: 'tuchoi', label: 'Từ chối' },
  ]

  return (
    <div>
      <PageHeader title="Thẻ công việc lái xe"
        desc={<>Đi mạ &amp; giao khách — tài xế xác nhận, xuất phát, điền số cân + ảnh phiếu trong <b>{meta?.fillHours ?? 24}h</b></>}
        extra={canAssign && <Button type="primary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Giao việc cho lái xe</Button>} />

      <KpiGrid>
        <Kpi tone="amber" label="Chờ tài xế xác nhận" value={wait} sub="thẻ vừa giao, chưa đồng ý / từ chối" onClick={() => setTab('cho')} />
        <Kpi tone="steel" label="Đang thực hiện" value={run} sub="đã nhận việc hoặc xe đang chạy" onClick={() => setTab('dang')} />
        <Kpi tone="signal" label="Quá hạn điền phiếu" value={<span className={over.length ? 'text-signal' : ''}>{over.length}</span>} onClick={() => setTab('quahan')}
          sub={over.length
            ? <span style={{ color: 'var(--signal)' }}>{over.map((t, i) => <span key={t.id}>{i > 0 && ' · '}<RecordLink id={t.id} danger />{` quá ${hoursOver(t.fillDeadline!)}h`}</span>)}</span>
            : 'quá 24h chưa điền số cân + ảnh'} />
        <Kpi tone="signal" label="Bị từ chối" value={rej} sub="cần Quản lý gán tài xế khác" onClick={() => setTab('tuchoi')} />
      </KpiGrid>

      <div style={panel}>
        <Tabs activeKey={tab} onChange={(k) => setTab(k as TabKey)}
          items={tabItems.map((x) => ({ key: x.key, label: <span>{x.label} <span className="caption num" style={{ color: x.key === 'quahan' && cnt(x.key) ? 'var(--signal)' : undefined, fontWeight: 700 }}>{cnt(x.key)}</span></span> }))} />
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm mã thẻ, hợp đồng, chứng từ, tài xế..." value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 320 }} />
          <Select allowClear placeholder="Tất cả tài xế" value={driver} onChange={setDriver} style={{ minWidth: 180 }}
            options={(meta?.drivers ?? []).map((d) => ({ value: d, label: d }))} />
          <Select allowClear placeholder="Tất cả hợp đồng" value={contract} onChange={setContract} style={{ minWidth: 170 }}
            options={contractIds.map((c) => ({ value: c, label: c }))} />
          <span className="caption" style={{ marginLeft: 'auto' }}>{rows.length} thẻ</span>
        </div>
        <Table<Task> rowKey="id" size="middle" loading={isLoading} dataSource={rows} columns={columns} scroll={{ x: 1200 }}
          pagination={{ pageSize: 20, hideOnSinglePage: true }}
          locale={{ emptyText: 'Không có thẻ công việc nào phù hợp bộ lọc.' }}
          rowClassName={(t) => 'clickable-row' + (isOverdue(t, now) ? ' row-alert' : '')}
          onRow={(t) => ({ onClick: () => open('vc', t.id) })} />
      </div>

      <p className="caption" style={{ marginTop: 12, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
        <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
        <span>Bấm dòng để mở <b>thẻ công việc chi tiết</b> (trượt từ phải). Quy tắc: từ lúc xe <b>xuất phát</b>, tài xế có <b>{meta?.fillHours ?? 24}h</b> để điền số cân và tải ảnh phiếu — quá hạn hệ thống bôi đỏ &amp; báo động về Quản lý.</span>
      </p>

      <CreateTaskModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
