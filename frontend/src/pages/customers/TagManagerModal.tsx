/* Quản lý nhãn khách hàng: tạo / đổi tên / đổi màu / xóa (xóa nhãn = gỡ khỏi mọi khách). */
import { Button, Input, Modal, Popconfirm } from 'antd'
import { Check, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from '@/api/hooksMaster'
import type { TagItem } from '@/api/typesMaster'
import { TAG_COLORS, TagChip } from './tags'

function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {TAG_COLORS.map((c) => (
        <button key={c} type="button" aria-label={`Màu ${c}`} onClick={() => onChange(c)}
          style={{ width: 18, height: 18, borderRadius: 5, background: c, cursor: 'pointer', padding: 0,
            border: value === c ? '2px solid var(--rust-2)' : '2px solid transparent', outline: value === c ? '1px solid var(--ink)' : 'none' }} />
      ))}
    </div>
  )
}

function TagRow({ tag }: { tag: TagItem }) {
  const [name, setName] = useState(tag.name)
  const [color, setColor] = useState(tag.color)
  const update = useUpdateTag()
  const del = useDeleteTag()
  const dirty = name.trim() !== tag.name || color !== tag.color
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.2fr) 90px auto', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--rule-hair)' }}>
      <Input size="small" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      <Swatches value={color} onChange={setColor} />
      <span className="caption num">{tag.customerCount ?? 0} khách</span>
      <span style={{ display: 'flex', gap: 4 }}>
        <Button size="small" type="primary" icon={<Check size={13} />} disabled={!dirty || !name.trim()} loading={update.isPending}
          onClick={() => update.mutate({ id: tag.id, name: name.trim(), color })} aria-label="Lưu nhãn" />
        <Popconfirm title={`Xóa nhãn "${tag.name}"?`} description={tag.customerCount ? `Nhãn sẽ được gỡ khỏi ${tag.customerCount} khách.` : undefined}
          okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => del.mutateAsync(tag.id)}>
          <Button size="small" danger icon={<Trash2 size={13} />} aria-label="Xóa nhãn" />
        </Popconfirm>
      </span>
    </div>
  )
}

export default function TagManagerModal({ onClose }: { onClose: () => void }) {
  const { data: tags = [] } = useTags()
  const create = useCreateTag()
  const [name, setName] = useState('')
  const [color, setColor] = useState(TAG_COLORS[0])
  const add = async () => {
    await create.mutateAsync({ name: name.trim(), color })
    setName('')
  }
  return (
    <Modal open width={640} title="Quản lý nhãn khách hàng" footer={null} onCancel={onClose} destroyOnHidden>
      <p className="caption" style={{ marginTop: 0 }}>
        Nhãn do người dùng tự đặt (VD: <b>Khách thân thiết</b>, <b>Khách lẻ</b>) — gắn cho khách ở danh sách khách hàng, dùng để lọc đơn hàng, hợp đồng, dashboard.
      </p>
      {tags.map((t) => <TagRow key={`${t.id}-${t.name}-${t.color}`} tag={t} />)}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1.2fr) 90px auto', gap: 10, alignItems: 'center', paddingTop: 14 }}>
        <Input size="small" placeholder="Tên nhãn mới" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onPressEnter={() => name.trim() && add()} />
        <Swatches value={color} onChange={setColor} />
        <span>{name.trim() && <TagChip tag={{ name: name.trim(), color }} />}</span>
        <Button size="small" type="primary" icon={<Plus size={13} />} disabled={!name.trim()} loading={create.isPending} onClick={add}>Thêm</Button>
      </div>
    </Modal>
  )
}
