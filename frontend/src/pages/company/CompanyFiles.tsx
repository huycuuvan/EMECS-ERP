/* Giấy tờ cố định của công ty (ĐKKD, hồ sơ năng lực, CO/CQ…): tải lên 1 lần, tự kèm vào bộ hồ sơ .zip của mọi hợp đồng.
   Dùng ở Danh mục → Thông tin công ty và cửa sổ "Bộ hồ sơ gửi khách". */
import { Button, Popconfirm, Upload } from 'antd'
import { Paperclip, Trash2, Upload as UploadIcon } from 'lucide-react'
import { useAddLegalFile, useDeleteLegalFile, useLegalFiles } from '@/api/hooks'

const fmtSize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

export default function CompanyFiles({ canEdit, zIndex }: { canEdit: boolean; zIndex?: number }) {
  const { data: files = [] } = useLegalFiles()
  const addFile = useAddLegalFile()
  const delFile = useDeleteLegalFile()
  return (
    <div style={{ display: 'grid', gap: 6 }}>
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
            <span className="caption">{fmtSize(f.size)}</span>
          </a>
          {canEdit && (
            <Popconfirm zIndex={zIndex} title={`Xóa ${f.name}?`} description="Các bộ hồ sơ tải sau sẽ không kèm file này nữa."
              okText="Xóa" cancelText="Hủy" okButtonProps={{ danger: true }} onConfirm={() => delFile.mutateAsync(f.id)}>
              <Button size="small" danger type="text" icon={<Trash2 size={13} />} aria-label="Xóa" />
            </Popconfirm>
          )}
        </div>
      ))}
    </div>
  )
}
