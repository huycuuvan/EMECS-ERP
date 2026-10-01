/* Khối ảnh phiếu đính kèm (phiếu cân / phiếu mạ / phiếu giao nhận): xem phóng to, chụp/tải ảnh, ảnh demo, xóa.
   Giá trị ảnh lưu dạng URL (/uploads/...) hoặc data URL. */
import { App, Button, Image, Space, Upload } from 'antd'
import { Camera, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { demoTicket, errorMessage, uploadImage } from '@/api/client'

interface Props {
  photo: string | null | undefined
  /** Gọi khi ảnh đổi (url mới hoặc null khi xóa). Nếu không truyền → chỉ xem. */
  onChange?: (photo: string | null) => void | Promise<unknown>
  /** Nhãn + kg để sinh ảnh demo. */
  demo?: { label: string; kg: number }
  emptyText?: string
}

export default function PhotoBlock({ photo, onChange, demo, emptyText = 'Chưa có ảnh đính kèm — bắt buộc chụp phiếu ký tay.' }: Props) {
  const { message, modal } = App.useApp()
  const [busy, setBusy] = useState(false)
  const run = async (f: () => Promise<string | null>) => {
    setBusy(true)
    try { await onChange?.(await f()) } catch (e) { message.error(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <div>
      {photo ? <Image src={photo} className="ticket-photo" alt="Ảnh phiếu" /> : <div className="photo-empty">{emptyText}</div>}
      {onChange && (
        <Space wrap style={{ marginTop: 10 }}>
          <Upload accept="image/*" showUploadList={false} beforeUpload={(file) => { run(() => uploadImage(file)); return false }}>
            <Button size="small" icon={<Camera size={14} />} loading={busy}>{photo ? 'Thay ảnh khác' : 'Chụp / tải ảnh lên'}</Button>
          </Upload>
          {demo && <Button size="small" icon={<Sparkles size={14} />} disabled={busy} onClick={() => run(() => demoTicket(demo.label, demo.kg))}>Ảnh demo</Button>}
          {photo && (
            <Button size="small" danger icon={<Trash2 size={14} />} disabled={busy}
              onClick={() => modal.confirm({
                title: 'Xóa ảnh đính kèm?', content: 'Bản ghi sẽ chuyển về trạng thái thiếu ảnh và bị nhắc trên báo cáo.',
                okText: 'Xóa ảnh', okButtonProps: { danger: true }, cancelText: 'Hủy', onOk: () => run(async () => null),
              })}>Xóa ảnh</Button>
          )}
        </Space>
      )}
    </div>
  )
}

/** Input chọn ảnh trong form (trả URL). Dùng cho form điền phiếu. */
export function PhotoInput({ value, onChange, demo }: { value?: string | null; onChange?: (v: string | null) => void; demo?: { label: string; kg: number } }) {
  return <PhotoBlock photo={value} onChange={(v) => onChange?.(v)} demo={demo} emptyText="Chưa có ảnh — chụp phiếu ký tay hoặc dùng ảnh demo." />
}
