/* Biểu đồ SVG thuần — port ERPCharts (donut / groupedBar / bar) của bản demo, không dùng thư viện chart.
   viewBox cố định + width 100% → co giãn đều theo khung chứa. */
import { Tooltip } from 'antd'
import type { ReactNode } from 'react'

const GRID = '#e7e8ea'
const MUTED = '#8b8e96'
const AXIS = '#62656d'

const axisLabel = (v: number) => (v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(v < 10 ? 1 : 0))
const nf = (v: number) => v.toLocaleString('vi-VN', { maximumFractionDigits: 2 })

/* ------------------------------------------------------------------ donut */
export interface DonutPart { label: string; value: number; color: string }

export function Donut({ parts, size = 200, centerLabel, centerValue, onPartClick }: {
  parts: DonutPart[]; size?: number; centerLabel?: ReactNode; centerValue?: ReactNode; onPartClick?: (i: number) => void
}) {
  const cx = size / 2, cy = size / 2
  const r = size / 2 - 8
  const ir = r * 0.62
  const total = parts.reduce((s, p) => s + Math.max(0, p.value), 0)
  let angle = -Math.PI / 2
  const shapes: ReactNode[] = []
  parts.forEach((p, i) => {
    const v = Math.max(0, p.value)
    if (!total || !v) return
    const title = `${p.label}: ${nf(v)}`
    if (v >= total - 1e-9) {
      // một phần chiếm trọn vòng → vẽ vành khuyên bằng 2 đường tròn
      shapes.push(
        <path key={i} fillRule="evenodd" fill={p.color} style={{ cursor: onPartClick ? 'pointer' : undefined }} onClick={() => onPartClick?.(i)}
          d={`M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 Z M ${cx - ir} ${cy} a ${ir} ${ir} 0 1 0 ${2 * ir} 0 a ${ir} ${ir} 0 1 0 ${-2 * ir} 0 Z`}>
          <title>{title}</title>
        </path>,
      )
      return
    }
    const a = (v / total) * 2 * Math.PI
    const large = a > Math.PI ? 1 : 0
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle)
    const x2 = cx + r * Math.cos(angle + a), y2 = cy + r * Math.sin(angle + a)
    const x3 = cx + ir * Math.cos(angle + a), y3 = cy + ir * Math.sin(angle + a)
    const x4 = cx + ir * Math.cos(angle), y4 = cy + ir * Math.sin(angle)
    shapes.push(
      <path key={i} fill={p.color} style={{ cursor: onPartClick ? 'pointer' : undefined }} onClick={() => onPartClick?.(i)}
        d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${ir} ${ir} 0 ${large} 0 ${x4} ${y4} Z`}>
        <title>{title}</title>
      </path>,
    )
    angle += a
  })
  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', width: '100%', maxWidth: size, height: 'auto', margin: '0 auto' }}>
      {!total && <circle cx={cx} cy={cy} r={(r + ir) / 2} fill="none" stroke={GRID} strokeWidth={r - ir} />}
      {shapes}
      {centerLabel != null && (
        <>
          <text x={cx} y={cy - 6} fontSize={13} fill={AXIS} textAnchor="middle">{centerLabel}</text>
          <text x={cx} y={cy + 18} fontSize={20} fontWeight={700} fill="#1c1c1e" textAnchor="middle">{centerValue}</text>
        </>
      )}
    </svg>
  )
}

/* ------------------------------------------------------------------ grouped bar */
export interface Series { name: string; color: string; values: number[] }

export function GroupedBar({ labels, datasets, height = 240, unit = '', width = 640 }: {
  labels: string[]; datasets: Series[]; height?: number; unit?: string; width?: number
}) {
  const padT = 20, padB = 34, padL = 44, padR = 14
  const cw = width - padL - padR, ch = height - padT - padB
  const all = datasets.flatMap((d) => d.values)
  const max = Math.max(1, ...all) * 1.12
  const n = labels.length
  const slotW = cw / n
  const groupW = slotW * 0.6
  const gap = 2
  const barW = Math.max(1, (groupW - gap * (datasets.length - 1)) / datasets.length)
  const suf = unit ? ' ' + unit : ''
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', width: '100%', height: 'auto' }}>
      {[0, 1, 2, 3, 4].map((i) => {
        const y = padT + (ch * i) / 4
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={width - padR} y2={y} stroke={GRID} strokeWidth={1} />
            <text x={padL - 8} y={y + 4} fontSize={10} fill={MUTED} textAnchor="end">{axisLabel((max * (4 - i)) / 4)}</text>
          </g>
        )
      })}
      {labels.map((lb, i) => {
        const gx = padL + i * slotW + (slotW - groupW) / 2
        return (
          <g key={lb + i}>
            {datasets.map((d, j) => {
              const v = d.values[i] || 0
              const bh = Math.max(2, (v / max) * ch)
              return (
                <rect key={d.name} x={gx + j * (barW + gap)} y={padT + ch - bh} width={barW} height={bh} fill={d.color} rx={3}>
                  <title>{`${d.name} · ${lb}: ${nf(v)}${suf}`}</title>
                </rect>
              )
            })}
            <text x={padL + i * slotW + slotW / 2} y={height - padB + 18} fontSize={10.5} fill={AXIS} textAnchor="middle">{lb}</text>
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ horizontal bar (nhãn dài, ví dụ lý do lệch) */
export function HBar({ items, color = '#a3121b', unit = 'kg' }: { items: { label: string; value: number }[]; color?: string; unit?: string }) {
  const max = Math.max(1, ...items.map((x) => x.value))
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((x) => (
        <Tooltip key={x.label} title={`${x.label}: ${nf(x.value)} ${unit}`}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, marginBottom: 4 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.label}</span>
              <b className="num mono" style={{ color, whiteSpace: 'nowrap' }}>{nf(x.value)} {unit}</b>
            </div>
            <div style={{ height: 10, background: 'var(--paper-2)', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${(x.value / max) * 100}%`, height: '100%', background: color, borderRadius: 6 }} />
            </div>
          </div>
        </Tooltip>
      ))}
    </div>
  )
}

/** Chú giải màu dạng hàng ngang. */
export function LegendRow({ items }: { items: { label: ReactNode; color: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '8px 2px', fontSize: 11.5, color: 'var(--ash)' }}>
      {items.map((x, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <i style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: x.color }} />{x.label}
        </span>
      ))}
    </div>
  )
}
