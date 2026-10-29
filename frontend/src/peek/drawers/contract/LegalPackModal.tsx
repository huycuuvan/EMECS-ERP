/* Bộ hồ sơ gửi khách kèm hợp đồng (yêu cầu anh Thắng 29/10): hợp đồng + biên bản giao nhận + chứng chỉ xuất xưởng
   theo mẫu Word của công ty. Bảng hàng, bên mua, số HĐ tự lấy theo hợp đồng; ở đây chỉ điền phần riêng
   (ngày lập, công trình, người giao / người nhận). Sửa được cả khi hợp đồng đã nhận về. */
import { Button, DatePicker, Form, Input, Modal, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Download, FileArchive, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLegalPack, useSaveLegal } from '@/api/hooks'
import { downloadFile } from '@/api/hooksEdit'
import type { Contract, LegalFields } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { MODAL_Z } from './utils'

type V = Omit<LegalFields, 'date'> & { date?: Dayjs | null }
const HON = [{ value: 'Ông', label: 'Ông' }, { value: 'Bà', label: 'Bà' }]

export default function LegalPackModal({ contract: c, onClose }: { contract: Contract; onClose: () => void }) {
  const { can } = useAuth()
  const canEdit = can('hop-dong', 'edit')
  const { data: pack } = useLegalPack(c.id)
  const save = useSaveLegal()
  const [form] = Form.useForm<V>()
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    if (pack) form.setFieldsValue({ ...pack.data, date: pack.data.date ? dayjs(pack.data.date) : null })
  }, [pack, form])

  /** lưu phần đã điền rồi tải file (người chỉ có quyền xem thì tải theo bản đã lưu) */
  const download = async (key: string, path: string, name: string) => {
    setBusy(key)
    try {
      if (canEdit) {
        const v = form.getFieldsValue()
        await save.mutateAsync({ cid: c.id, ...v, date: v.date ? v.date.format('YYYY-MM-DD') : '' })
      }
      await downloadFile(path, name)
    } finally { setBusy(null) }
  }
  const forms = (pack?.forms ?? []).filter((f) => f.ready)

  return (
    <Modal open zIndex={MODAL_Z} title={`Bộ hồ sơ gửi khách — HĐ ${c.number || c.id}`} onCancel={onClose} width={640}
      footer={[
        <Button key="close" onClick={onClose}>Đóng</Button>,
        <Button key="zip" type="primary" icon={<FileArchive size={14} />} loading={busy === 'zip'}
          onClick={() => download('zip', `/contracts/${c.id}/legal.zip`, `Ho-so_${c.id}.zip`)}>Tải cả bộ (.zip)</Button>,
      ]}>
      <p className="caption" style={{ margin: '4px 0 12px' }}>
        Bảng hàng, bên mua và số hợp đồng tự lấy theo hợp đồng. Ô để trống thì file in dấu chấm để ký / điền tay.
      </p>
      <Form form={form} layout="vertical" disabled={!canEdit} requiredMark={false}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 12px' }}>
          <Form.Item name="date" label="Ngày lập biên bản / chứng chỉ">
            <DatePicker format="DD/MM/YYYY" style={{ width: '100%' }} placeholder="Để trống: ký tay ngày" />
          </Form.Item>
          <Form.Item name="project" label="Công trình">
            <Input placeholder="VD: Hạ điện áp đường dây 375E10.4" />
          </Form.Item>
        </div>
        <div className="caption" style={{ fontWeight: 600, marginBottom: 6 }}>Bên giao hàng (công ty mình)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: '0 10px' }}>
          <Form.Item name="giverHonorific"><Select options={HON} placeholder="Ông/Bà" allowClear /></Form.Item>
          <Form.Item name="giverName"><Input placeholder="Họ tên (quản đốc / QLSX)" /></Form.Item>
          <Form.Item name="giverTitle"><Input placeholder="Chức vụ" /></Form.Item>
        </div>
        <div className="caption" style={{ fontWeight: 600, marginBottom: 6 }}>Bên nhận hàng — {pack?.buyer}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: '0 10px' }}>
          <Form.Item name="receiverHonorific"><Select options={HON} placeholder="Ông/Bà" allowClear /></Form.Item>
          <Form.Item name="receiverName"><Input placeholder="Họ tên người nhận" /></Form.Item>
          <Form.Item name="receiverTitle"><Input placeholder="Chức vụ" /></Form.Item>
        </div>
      </Form>
      <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
        <DocRow title="Hợp đồng kinh tế" loading={busy === 'hd'}
          onClick={() => download('hd', `/contracts/${c.id}/document.docx`, `Hop-dong_${c.id}.docx`)} />
        {forms.map((f) => (
          <DocRow key={f.key} title={f.title} loading={busy === f.key}
            onClick={() => download(f.key, `/contracts/${c.id}/legal/${f.key}.docx`, `${f.key}_${c.id}.docx`)} />
        ))}
      </div>
    </Modal>
  )
}

function DocRow({ title, loading, onClick }: { title: string; loading: boolean; onClick: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><FileText size={14} color="var(--ash)" />{title}</span>
      <Button size="small" icon={<Download size={12} />} loading={loading} onClick={onClick}>Tải Word</Button>
    </div>
  )
}
