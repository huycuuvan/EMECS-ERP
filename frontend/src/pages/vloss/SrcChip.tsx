import { Tag } from 'antd'

const SRC: Record<string, [string, string]> = {
  'Trạm cân công ty': ['var(--amber-soft)', 'var(--amber)'],
  'Cân tại xưởng mạ': ['var(--rust-soft)', 'var(--rust-deep)'],
  'Giao khách': ['var(--moss-soft)', 'var(--moss)'],
}

/** Chip nguồn chênh lệch (src-chip của demo). */
export function SrcChip({ src }: { src: string }) {
  const [bg, fg] = SRC[src] ?? SRC['Trạm cân công ty']
  return <Tag variant="filled" style={{ background: bg, color: fg, borderRadius: 999, fontWeight: 600, fontSize: 10.5, margin: 0 }}>{src}</Tag>
}
