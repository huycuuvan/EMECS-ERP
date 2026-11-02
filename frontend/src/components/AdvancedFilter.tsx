/* Bộ lọc nâng cao dùng chung cho danh sách Hợp đồng / Đơn hàng (anh Thắng 02/11): theo ngày (chọn mốc ngày + khoảng,
   có sẵn Tháng này / Tháng trước / Quý / Năm), khách hàng, người phụ trách, tình trạng tiền, giá trị. Lọc ngay khi chọn,
   mỗi điều kiện đang bật hiện thành 1 nhãn bấm × để bỏ. */
import { Badge, Button, DatePicker, InputNumber, Popover, Select, Tag } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { EyeOff, SlidersHorizontal } from 'lucide-react'
import { NUM } from '@/lib/numberInput'

export interface AdvFilter {
  dateKey?: string; range?: [Dayjs, Dayjs] | null; customers?: string[]; owners?: string[]
  money?: string; minM?: number | null; maxM?: number | null
}
type Opt = { value: string; label: string }

const PRESETS: { label: string; value: [Dayjs, Dayjs] }[] = [
  { label: 'Hôm nay', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
  { label: '7 ngày qua', value: [dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')] },
  { label: 'Tháng này', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
  { label: 'Tháng trước', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
  { label: 'Quý này', value: [dayjs().month(Math.floor(dayjs().month() / 3) * 3).startOf('month'), dayjs().month(Math.floor(dayjs().month() / 3) * 3 + 2).endOf('month')] },
  { label: 'Năm nay', value: [dayjs().startOf('year'), dayjs().endOf('year')] },
]

/** Ngày iso có nằm trong khoảng (tính trọn ngày đầu – ngày cuối)? Không chọn khoảng → luôn đúng; chọn mà bản ghi chưa có ngày → loại. */
export function inRange(iso: string | null | undefined, range?: [Dayjs, Dayjs] | null) {
  if (!range) return true
  if (!iso) return false
  const d = dayjs(iso)
  return !d.isBefore(range[0].startOf('day')) && !d.isAfter(range[1].endOf('day'))
}

/** Giá trị (₫) trong khoảng từ – đến (triệu đồng). */
export const inMoney = (v: number, f: AdvFilter) =>
  (f.minM == null || v >= f.minM * 1e6) && (f.maxM == null || v <= f.maxM * 1e6)

export const advCount = (f: AdvFilter) =>
  [f.range, f.customers?.length, f.owners?.length, f.money, f.minM != null || f.maxM != null].filter(Boolean).length

const dd = (d: Dayjs) => d.format('DD/MM/YYYY')

export default function AdvancedFilter({ value: f, onChange, dateFields, customers, owners, moneyOptions }: {
  value: AdvFilter; onChange: (v: AdvFilter) => void
  /** mốc ngày để lọc — mốc đầu tiên là mặc định */
  dateFields: Opt[]; customers: string[]; owners?: string[]; moneyOptions?: Opt[]
}) {
  const set = (p: Partial<AdvFilter>) => onChange({ ...f, ...p })
  const n = advCount(f)
  const dateKey = f.dateKey ?? dateFields[0].value
  const dateLbl = dateFields.find((x) => x.value === dateKey)?.label ?? ''
  const lbl = (t: string) => <div className="caption" style={{ fontWeight: 600, margin: '10px 0 4px' }}>{t}</div>

  const panel = (
    <div style={{ width: 340, maxWidth: 'calc(100vw - 48px)' }}>
      {lbl('Theo ngày')}
      <div style={{ display: 'grid', gap: 6 }}>
        {dateFields.length > 1 && <Select value={dateKey} onChange={(v) => set({ dateKey: v })} options={dateFields} />}
        <DatePicker.RangePicker value={f.range ?? null} format="DD/MM/YYYY" presets={PRESETS} allowClear placeholder={['Từ ngày', 'Đến ngày']}
          onChange={(v) => set({ range: v && v[0] && v[1] ? [v[0], v[1]] : null })} style={{ width: '100%' }} />
      </div>
      {lbl('Khách hàng')}
      <Select mode="multiple" allowClear value={f.customers ?? []} onChange={(v) => set({ customers: v })} style={{ width: '100%' }}
        placeholder="Tất cả khách hàng" maxTagCount="responsive" options={customers.map((c) => ({ value: c, label: c }))} />
      {owners && <>
        {lbl('Người phụ trách')}
        <Select mode="multiple" allowClear value={f.owners ?? []} onChange={(v) => set({ owners: v })} style={{ width: '100%' }}
          placeholder="Tất cả" maxTagCount="responsive" options={owners.map((c) => ({ value: c, label: c }))} />
      </>}
      {moneyOptions && <>
        {lbl('Tiền về')}
        <Select allowClear value={f.money} onChange={(v) => set({ money: v })} style={{ width: '100%' }} placeholder="Tất cả" options={moneyOptions} />
      </>}
      {lbl('Giá trị (triệu đồng)')}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <InputNumber<number> {...NUM} min={0} placeholder="Từ" value={f.minM ?? null} onChange={(v) => set({ minM: v })} style={{ flex: 1 }} />
        <span className="text-ash">–</span>
        <InputNumber<number> {...NUM} min={0} placeholder="Đến" value={f.maxM ?? null} onChange={(v) => set({ maxM: v })} style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <Button size="small" type="text" disabled={!n} onClick={() => onChange({})}>Xóa bộ lọc nâng cao</Button>
      </div>
    </div>
  )

  const money = moneyOptions?.find((x) => x.value === f.money)?.label
  const chips: [string, Partial<AdvFilter>][] = [
    ...(f.range ? [[`${dateLbl}: ${dd(f.range[0])} – ${dd(f.range[1])}`, { range: null }] as [string, Partial<AdvFilter>]] : []),
    ...(f.customers?.length ? [[`Khách: ${f.customers.join(', ')}`, { customers: [] }] as [string, Partial<AdvFilter>]] : []),
    ...(f.owners?.length ? [[`Phụ trách: ${f.owners.join(', ')}`, { owners: [] }] as [string, Partial<AdvFilter>]] : []),
    ...(money ? [[`Tiền về: ${money}`, { money: undefined }] as [string, Partial<AdvFilter>]] : []),
    ...(f.minM != null || f.maxM != null
      ? [[`Giá trị ${f.minM != null ? `từ ${f.minM} tr` : ''}${f.maxM != null ? ` đến ${f.maxM} tr` : ''}`, { minM: null, maxM: null }] as [string, Partial<AdvFilter>]] : []),
  ]

  return <>
    <Popover trigger="click" placement="bottomRight" content={panel} title="Bộ lọc nâng cao">
      <Badge count={n} size="small" color="var(--rust)">
        <Button icon={<SlidersHorizontal size={14} />} type={n ? 'primary' : 'default'} ghost={!!n}>Bộ lọc nâng cao</Button>
      </Badge>
    </Popover>
    {chips.map(([t, clear]) => <Tag key={t} closable onClose={() => set(clear)} color="blue" style={{ margin: 0 }}>{t}</Tag>)}
  </>
}

/** Dòng báo đang ẩn bản ghi đã xong hẳn — để không ai tưởng mất dữ liệu. */
export function HiddenNote({ n, what, onShow }: { n: number; what: string; onShow: () => void }) {
  return (
    <div className="caption" style={{ padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <EyeOff size={13} /> Đang ẩn <b>{n}</b> {what}.
      <Button type="link" size="small" style={{ padding: 0, height: 'auto' }} onClick={onShow}>Xem tất cả</Button>
    </div>
  )
}
