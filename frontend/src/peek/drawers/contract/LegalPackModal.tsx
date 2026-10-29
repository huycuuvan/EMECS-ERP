/* Bộ hồ sơ gửi khách kèm hợp đồng (yêu cầu anh Thắng 29/10): hợp đồng + biên bản giao nhận + chứng chỉ xuất xưởng
   theo mẫu Word của công ty. Bảng hàng, bên mua, số HĐ tự lấy theo hợp đồng; ở đây chỉ điền phần riêng
   (ngày lập, công trình, người giao / người nhận). Sửa được cả khi hợp đồng đã nhận về.
   Giấy tờ cố định của công ty (ĐKKD, hồ sơ năng lực, CO/CQ…) tải lên 1 lần, tự kèm vào bộ .zip của mọi hợp đồng.
   Ô điền theo hợp đồng bôi vàng trên file Word (bỏ tích → bản sạch không bôi). */
import { Button, Checkbox, DatePicker, Form, Input, Modal, Popconfirm, Select, Upload } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { Download, FileArchive, FileText, Paperclip, Trash2, Upload as UploadIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAddLegalFile, useDeleteLegalFile, useLegalFiles, useLegalPack, useSaveLegal } from '@/api/hooks'
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
  const [mark, setMark] = useState(true)
  const { data: files = [] } = useLegalFiles()
  const addFile = useAddLegalFile()
  const delFile = useDeleteLegalFile()

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
      await downloadFile(path, name, { mark })
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
        <Checkbox checked={mark} onChange={(e) => setMark(e.target.checked)} style={{ marginBottom: 4 }}>
          Bôi vàng chỗ điền theo hợp đồng <span className="caption">(bỏ tích: bản sạch để gửi khách)</span>
        </Checkbox>
        <DocRow title="Hợp đồng kinh tế" loading={busy === 'hd'}
          onClick={() => download('hd', `/contracts/${c.id}/document.docx`, `Hop-dong_${c.id}.docx`)} />
        {forms.map((f) => (
          <DocRow key={f.key} title={f.title} loading={busy === f.key}
            onClick={() => download(f.key, `/contracts/${c.id}/legal/${f.key}.docx`, `${f.key}_${c.id}.docx`)} />
        ))}
      </div>
      <div style={{ display: 'grid', gap: 6, borderTop: '1px solid var(--rule)', paddingTop: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span className="caption" style={{ fontWeight: 600 }}>Giấy tờ công ty — dùng chung, tự kèm vào bộ .zip</span>
          {canEdit && (
            <Upload showUploadList={false} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              beforeUpload={(f) => { addFile.mutate(f); return false }}>
              <Button size="small" icon={<UploadIcon size={12} />} loading={addFile.isPending}>Tải lên</Button>
            </Upload>
          )}
        </div>
        {files.length === 0 && (
          <span className="caption">Chưa có. VD: đăng ký kinh doanh, hồ sơ năng lực, CO/CQ vật liệu (PDF, ảnh, Word, Excel; tối đa 20MB).</span>
        )}
        {files.map((f) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <a href={f.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <Paperclip size={13} color="var(--ash)" />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <span className="caption">{f.size < 1024 * 1024 ? `${Math.max(1, Math.round(f.size / 1024))} KB` : `${(f.size / 1024 / 1024).toFixed(1)} MB`}</span>
            </a>
            {canEdit && (
              <Popconfirm zIndex={MODAL_Z + 1} title={`Xóa ${f.name}?`} description="Các bộ hồ sơ tải sau sẽ không kèm file này nữa."
                okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => delFile.mutateAsync(f.id)}>
                <Button size="small" danger type="text" icon={<Trash2 size={13} />} aria-label="Xóa" />
              </Popconfirm>
            )}
          </div>
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
