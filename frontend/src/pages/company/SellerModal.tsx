/* Form Thông tin công ty (Bên B trên hợp đồng, người ký bộ hồ sơ giao hàng) — dùng ở Danh mục → Thông tin công ty
   và trang Soạn thảo hợp đồng. Chỉ Quản lý sửa được. */
import { Input, Modal } from 'antd'
import { useState } from 'react'
import { useSaveSeller } from '@/api/hooks'
import type { Party } from '@/api/types'
import '../contract-draft/draft.css'

export default function SellerModal({ seller, onClose }: { seller: Party; onClose: () => void }) {
  const [v, setV] = useState<Party>(seller)
  const saveSeller = useSaveSeller()
  const f = (k: keyof Party, label: string, ph?: string) => (
    <label className="sm-row"><span>{label}</span>
      <Input value={(v[k] as string | undefined) ?? ''} placeholder={ph} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
  )
  return (
    <Modal open title="Thông tin công ty (Bên B trên hợp đồng)" okText="Lưu" cancelText="Hủy" width={620}
      confirmLoading={saveSeller.isPending} onCancel={onClose}
      onOk={async () => { await saveSeller.mutateAsync({ ...v, banks: v.banks.map((b) => b.trim()).filter(Boolean) }); onClose() }}>
      <div className="sm-grid">
        {f('name', 'Tên công ty', 'CÔNG TY TNHH …')}
        {f('address', 'Địa chỉ')}
        {f('phone', 'Điện thoại')}
        <label className="sm-row"><span>Tài khoản số</span>
          <Input.TextArea autoSize={{ minRows: 2 }} value={v.banks.join('\n')} placeholder="Mỗi dòng 1 tài khoản: số TK ngân hàng … - Chi nhánh …"
            onChange={(e) => setV({ ...v, banks: e.target.value.split('\n') })} /></label>
        {f('taxCode', 'Mã số thuế')}
        {f('representative', 'Người đại diện', 'Bà / Ông …')}
        {f('title', 'Chức vụ', 'Giám đốc')}
        {f('representativeHonorific', 'Xưng hô người đại diện', 'Ông / Bà')}
        {f('workshopRep', 'Quản đốc / QLSX (bên giao hàng)', 'Họ tên — in trên biên bản giao nhận, chứng chỉ xuất xưởng')}
        {f('workshopTitle', 'Chức vụ quản đốc', 'Quản đốc phân xưởng')}
        {f('workshopHonorific', 'Xưng hô quản đốc', 'Ông / Bà')}
        {f('city', 'Nơi lập biên bản', 'Hà Nội')}
      </div>
      <p className="caption" style={{ margin: '8px 0 0' }}>Nhập một lần, dùng cho mọi hợp đồng (Bên B). Chỉ Quản lý sửa được.</p>
    </Modal>
  )
}
