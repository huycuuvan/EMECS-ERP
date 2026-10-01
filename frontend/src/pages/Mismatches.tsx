/* Biên bản sai lệch & Ký xác nhận — port pages/10-sai-lech.html:
   KPI · sổ sai lệch (Chờ QL ký / Đã ký / Tất cả) · ký xác nhận · phân tích theo điểm phát sinh & lý do. */
import { App, Button, Input, Segmented, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { CheckCircle2, Info, PenLine, Printer, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useMismatches } from '@/api/hooks'
import type { Mismatch } from '@/api/types'
import { Kpi, KpiGrid, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtDT, fmtKg } from '@/lib/format'
import RecordLink from '@/peek/RecordLink'
import { usePeek } from '@/peek/context'
import { Donut, HBar, LegendRow } from './dashboard/charts'
import { Grid, Panel } from './dashboard/common'
import { SRC, SrcChip, signedKg, useSignMismatchDialog } from './mismatches/sign'

type TabKey = 'pending' | 'signed' | 'all'

export default function Mismatches() {
  const { data, isLoading } = useMismatches()
  const { can } = useAuth()
  const { open } = usePeek()
  const { message } = App.useApp()
  const signDialog = useSignMismatchDialog()
  const canSign = can('sai-lech', 'full')
  const [tab, setTab] = useState<TabKey>('pending')
  const [q, setQ] = useState('')

  const all = useMemo(() => (data ?? []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')), [data])
  const pending = all.filter((m) => m.status === 'Chờ QL ký')

  /* ---------- KPI ---------- */
  const kpi = useMemo(() => {
    const now = new Date()
    const signedMonth = all.filter((m) => {
      if (!m.signedAt) return false
      const d = new Date(m.signedAt)
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    }).length
    const totalDelta = all.reduce((s, m) => s + Math.abs(m.delta), 0)
    const bySrc: Record<string, number> = {}
    all.forEach((m) => { bySrc[m.source] = (bySrc[m.source] || 0) + 1 })
    const top = Object.keys(bySrc).sort((a, b) => bySrc[b] - bySrc[a])[0]
    return { signedMonth, totalDelta, top, topN: top ? bySrc[top] : 0 }
  }, [all])

  /* ---------- danh sách ---------- */
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return all.filter((m) => {
      if (tab === 'pending' && m.status !== 'Chờ QL ký') return false
      if (tab === 'signed' && m.status !== 'Đã ký xác nhận') return false
      if (!s) return true
      return [m.id, m.refId, m.contractId, m.source, m.reason, m.reasonNote, m.reportedBy, m.dept].some((x) => (x || '').toLowerCase().includes(s))
    })
  }, [all, tab, q])

  const columns: ColumnsType<Mismatch> = [
    { title: 'Mã', dataIndex: 'id', width: 90, render: (id) => <span className="mono" style={{ fontWeight: 700 }}>{id}</span> },
    { title: 'Điểm phát sinh', dataIndex: 'source', render: (s) => <SrcChip source={s} /> },
    { title: 'Chứng từ gốc', dataIndex: 'refId', render: (id, m) => <RecordLink id={id} type={m.refType} style={{ color: 'var(--rust)' }} /> },
    { title: 'Hợp đồng', dataIndex: 'contractId', render: (id) => <RecordLink id={id} type="hd" style={{ color: 'var(--rust)' }} /> },
    { title: 'Kỳ vọng', dataIndex: 'expected', align: 'right', render: (v) => <span className="num" style={{ whiteSpace: 'nowrap' }}>{fmtKg(v)}</span> },
    { title: 'Thực tế', dataIndex: 'actual', align: 'right', render: (v) => <span className="num" style={{ whiteSpace: 'nowrap' }}>{fmtKg(v)}</span> },
    {
      title: 'Chênh', dataIndex: 'delta', align: 'right',
      render: (d) => <span className="num text-signal" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{signedKg(d)}</span>,
    },
    {
      title: 'Lý do', dataIndex: 'reason', width: 220,
      render: (r, m) => <div><b style={{ fontSize: 12 }}>{r}</b>{m.reasonNote && <div style={{ color: 'var(--ash)', fontSize: 11, marginTop: 2 }}>{m.reasonNote}</div>}</div>,
    },
    { title: 'Người báo — phòng', dataIndex: 'reportedBy', render: (p, m) => <div>{p}<div style={{ color: 'var(--ash)', fontSize: 11, marginTop: 2 }}>{m.dept}</div></div> },
    { title: 'Ngày', dataIndex: 'date', render: (d) => <span className="num" style={{ whiteSpace: 'nowrap' }}>{fmtDT(d)}</span> },
    { title: 'Trạng thái', dataIndex: 'status', render: (s) => <StatusTag status={s} /> },
    {
      title: '', key: 'act', fixed: 'right', render: (_, m) => m.status === 'Chờ QL ký'
        ? (canSign
          ? <Button type="primary" size="small" icon={<PenLine size={12} />} onClick={(e) => { e.stopPropagation(); signDialog(m) }}>Ký xác nhận</Button>
          : <span className="caption" style={{ whiteSpace: 'nowrap' }}>Chờ Quản lý A ký</span>)
        : <span className="caption" style={{ color: 'var(--moss)', whiteSpace: 'nowrap' }}><CheckCircle2 size={12} style={{ verticalAlign: -2 }} /> {fmtD(m.signedAt)}</span>,
    },
  ]

  /* ---------- phân tích ---------- */
  const { bySrc, byReason, total } = useMemo(() => {
    const src: Record<string, number> = {}
    const rs: Record<string, number> = {}
    all.forEach((m) => {
      src[m.source] = (src[m.source] || 0) + Math.abs(m.delta)
      rs[m.reason] = (rs[m.reason] || 0) + Math.abs(m.delta)
    })
    return {
      bySrc: Object.entries(src).map(([label, value]) => ({ label, value, color: SRC[label]?.color ?? '#4a5560' })),
      byReason: Object.entries(rs).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      total: all.reduce((s, m) => s + Math.abs(m.delta), 0),
    }
  }, [all])

  return (
    <div>
      <PageHeader title="Biên bản sai lệch & Ký xác nhận"
        desc="Mọi kg lệch quá dung sai ±30 kg phải có lý do và được Quản lý A ký xác nhận mới khép hồ sơ"
        extra={<Button icon={<Printer size={14} />} onClick={() => message.info('Demo: in sổ biên bản sai lệch')}>In sổ sai lệch</Button>} />

      <KpiGrid>
        <Kpi tone="signal" label="Chờ quản lý ký" value={<span className={pending.length ? 'text-signal' : ''}>{isLoading ? '—' : pending.length}</span>}
          sub={<span className="text-signal">biên bản chưa được xác nhận</span>} onClick={() => setTab('pending')} />
        <Kpi tone="moss" label="Đã ký tháng này" value={isLoading ? '—' : kpi.signedMonth}
          sub={<span className="text-moss">Quản lý A đã kiểm tra &amp; chấp nhận</span>} onClick={() => setTab('signed')} />
        <Kpi tone="signal" label="Tổng kg chênh lũy kế" value={<span className="text-signal">{isLoading ? '—' : '−' + fmtKg(kpi.totalDelta)}</span>}
          sub={<span className="text-signal">cộng dồn mọi biên bản</span>} onClick={() => setTab('all')} />
        <Kpi tone="rust" label="Điểm phát sinh nhiều nhất" value={<span style={{ fontSize: 18 }}>{kpi.top || '—'}</span>}
          sub={<span style={{ color: 'var(--rust)' }}>{kpi.top ? `${kpi.topN}/${all.length} biên bản phát sinh tại đây` : ''}</span>} />
      </KpiGrid>

      <Panel style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <Segmented<TabKey> value={tab} onChange={setTab} options={[
            {
              value: 'pending', label: (
                <span>Chờ QL ký<span className="mono" style={{ display: 'inline-block', minWidth: 17, padding: '1px 5px', marginLeft: 6, borderRadius: 999, background: 'var(--signal)', color: '#fff', fontSize: 10, fontWeight: 700, textAlign: 'center' }}>{pending.length}</span></span>
              ),
            },
            { value: 'signed', label: 'Đã ký' },
            { value: 'all', label: 'Tất cả' },
          ]} />
          <Input allowClear prefix={<Search size={14} color="var(--ash)" />} placeholder="Tìm mã, chứng từ, hợp đồng, lý do, người báo…"
            value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 340 }} />
        </div>
        <Table<Mismatch> size="small" rowKey="id" columns={columns} dataSource={rows} loading={isLoading}
          rowClassName={(m) => 'clickable-row' + (m.status === 'Chờ QL ký' ? ' row-alert' : '')}
          onRow={(m) => ({ onClick: () => open('sl', m.id) })} scroll={{ x: 1300 }}
          pagination={{ pageSize: 15, hideOnSinglePage: true, showSizeChanger: false }}
          locale={{
            emptyText: tab === 'pending' && !q
              ? <div style={{ padding: 28, color: 'var(--moss)' }}><b>✓ Không còn biên bản chờ ký.</b> Mọi sai lệch đã được Quản lý A xác nhận.</div>
              : <div style={{ padding: 28, color: 'var(--ash)' }}>Không có biên bản phù hợp bộ lọc.</div>,
          }} />
        <p className="caption" style={{ margin: '12px 0 0' }}>
          <Info size={12} style={{ verticalAlign: -2 }} /> Ký xác nhận xong, phiếu cân gốc đang treo "Lệch — chờ ký" tự chuyển về <b>Đã cân</b>. Bấm dòng để mở biên bản chi tiết.
          {!canSign && <> Chỉ <b>Quản lý A</b> được ký xác nhận.</>}
        </p>
      </Panel>

      <Grid>
        <Panel title="Sai lệch theo điểm phát sinh (kg tuyệt đối)">
          <LegendRow items={bySrc.map((s) => ({ label: `${s.label} — ${fmtKg(s.value)}`, color: s.color }))} />
          {bySrc.length
            ? <Donut size={210} centerLabel="Tổng chênh" centerValue={fmtKg(total)} parts={bySrc.map((s) => ({ label: `${s.label} (${fmtKg(s.value)})`, value: s.value, color: s.color }))} />
            : <div className="caption" style={{ padding: 20 }}>Chưa có biên bản sai lệch.</div>}
        </Panel>
        <Panel title="Sai lệch theo lý do (kg tuyệt đối)">
          <div style={{ marginTop: 12 }}>
            {byReason.length ? <HBar items={byReason} /> : <div className="caption" style={{ padding: 20 }}>Chưa có biên bản sai lệch.</div>}
          </div>
        </Panel>
      </Grid>
    </div>
  )
}
