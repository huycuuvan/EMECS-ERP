/* Danh mục → Thông tin công ty (anh Thắng 31/10: trước chỉ sửa được trong trang Soạn thảo của 1 hợp đồng, khó tìm):
   Bên B trên hợp đồng + người ký bộ hồ sơ giao hàng + giấy tờ công ty kèm bộ .zip. Chỉ Quản lý sửa. */
import { Alert, Button, Skeleton } from 'antd'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useSeller } from '@/api/hooks'
import { Cell, CellGrid, PageHeader, Sec } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { Panel } from './dashboard/common'
import CompanyFiles from './company/CompanyFiles'
import SellerModal from './company/SellerModal'

export default function Company() {
  const { data: s, isLoading } = useSeller()
  const { hasRole, can } = useAuth()
  const isQl = hasRole('admin')
  const [editing, setEditing] = useState(false)
  const v = (x?: string) => x?.trim() || <span className="text-ash" style={{ fontWeight: 400 }}>(chưa nhập)</span>
  const person = (hon?: string, name?: string, title?: string) =>
    name?.trim() ? <>{hon && `${hon} `}{name}{title && <span className="caption" style={{ fontWeight: 400 }}> · {title}</span>}</> : v()

  return (
    <div>
      <PageHeader title="Thông tin công ty" desc="Bên B trên hợp đồng, người ký biên bản giao nhận / chứng chỉ xuất xưởng — nhập một lần, dùng cho mọi hợp đồng"
        extra={isQl && <Button type="primary" icon={<Pencil size={14} />} onClick={() => setEditing(true)}>Sửa thông tin công ty</Button>} />
      {isLoading || !s ? <Skeleton active paragraph={{ rows: 8 }} /> : (
        <div style={{ display: 'grid', gap: 16, maxWidth: 900 }}>
          {!s.name.trim() && <Alert type="warning" showIcon title="Chưa khai báo thông tin công ty"
            description={isQl ? 'Bấm "Sửa thông tin công ty" để nhập — hợp đồng và bộ hồ sơ gửi khách sẽ tự điền Bên B.' : 'Nhờ Quản lý nhập thông tin công ty.'} />}
          <Panel>
            <Sec>Bên B trên hợp đồng</Sec>
            <CellGrid>
              <Cell label="Tên công ty" wide>{v(s.name)}</Cell>
              <Cell label="Địa chỉ" wide>{v(s.address)}</Cell>
              <Cell label="Điện thoại">{v(s.phone)}</Cell>
              <Cell label="Mã số thuế">{v(s.taxCode)}</Cell>
              <Cell label="Tài khoản" wide>{s.banks.length ? s.banks.map((b) => <div key={b}>{b}</div>) : v()}</Cell>
              <Cell label="Người đại diện">{person(s.representativeHonorific, s.representative, s.title)}</Cell>
              <Cell label="Nơi lập biên bản">{v(s.city)}</Cell>
            </CellGrid>
            <Sec>Bên giao hàng trên biên bản giao nhận / chứng chỉ xuất xưởng</Sec>
            <CellGrid>
              <Cell label="Quản đốc / QLSX" wide>{person(s.workshopHonorific, s.workshopRep, s.workshopTitle)}</Cell>
            </CellGrid>
          </Panel>
          <Panel>
            <CompanyFiles canEdit={can('hop-dong', 'edit')} />
          </Panel>
        </div>
      )}
      {editing && s && <SellerModal seller={s} onClose={() => setEditing(false)} />}
    </div>
  )
}
