/* Tài liệu đính kèm (PDF / ảnh): file ký chốt của đơn hàng, bản scan hợp đồng đã ký.
   Backend lưu `/uploads/<mã>_<tên-gốc>.pdf`, trả link ký có hạn → mở tab mới để xem. */
import { App, Button, Upload } from 'antd'
import { FileUp, Paperclip, X } from 'lucide-react'
import { useState } from 'react'
import { errorMessage, uploadDoc } from '@/api/client'

/** Tên hiển thị: bỏ mã ngẫu nhiên phía trước và phần ký `?exp=…`. Bản ghi cũ chỉ có tên file (chưa có bản thật). */
export function docName(url: string): string {
  const path = url.split('?')[0]
  const base = path.slice(path.lastIndexOf('/') + 1)
  return base.replace(/^[0-9a-f]{10}_/, '')
}

const isUploaded = (v?: string | null) => !!v && v.startsWith('/uploads/')

export function DocLink({ value }: { value?: string | null }) {
  if (!value) return <span className="text-ash">—</span>
  if (!isUploaded(value)) return <span className="text-ash" title="Chỉ có tên file, chưa tải bản thật lên">{value} (chưa có file)</span>
  return (
    <a href={value} target="_blank" rel="noreferrer"
      style={{ color: 'var(--rust)', display: 'inline-flex', alignItems: 'center', gap: 5, wordBreak: 'break-all' }}>
      <Paperclip size={12} style={{ flex: 'none' }} />{docName(value)}
    </a>
  )
}

/** Dùng trong Form.Item (value/onChange) hoặc độc lập. Không có onChange → chỉ xem. */
export default function DocAttach({ value, onChange, buttonText = 'Tải file PDF / ảnh lên' }: {
  value?: string | null; onChange?: (url: string) => void | Promise<unknown>; buttonText?: string
}) {
  const { message } = App.useApp()
  const [busy, setBusy] = useState(false)
  const pick = async (file: File) => {
    setBusy(true)
    try {
      await onChange?.(await uploadDoc(file))
      message.success(`Đã đính kèm ${file.name}`)
    } catch (e) {
      message.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
    return false  // tự upload, không để antd gửi
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      {(value || !onChange) && <DocLink value={value} />}
      {onChange && (
        <>
          <Upload accept=".pdf,image/jpeg,image/png,image/webp" showUploadList={false} beforeUpload={pick}>
            <Button size="small" icon={<FileUp size={13} />} loading={busy}>{isUploaded(value) ? 'Thay file' : buttonText}</Button>
          </Upload>
          {value && <Button size="small" type="text" icon={<X size={13} />} aria-label="Gỡ file" onClick={() => onChange('')} />}
        </>
      )}
    </div>
  )
}
