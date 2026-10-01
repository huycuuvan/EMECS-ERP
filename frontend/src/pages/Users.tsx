/* Quản trị người dùng (chỉ Quản lý): tài khoản, vai trò (được kiêm nhiều vai trò), khóa/mở, đặt lại mật khẩu,
   bảng quyền hiệu lực theo trang, nhật ký thao tác. */
import { App, Button, Form, Input, Modal, Select, Space, Switch, Table, Tabs, Tag, Tooltip } from 'antd'
import { KeyRound, Pencil, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useAuditLogs, useCreateUser, useMeta, useResetUserPassword, useUpdateUser, useUsers } from '@/api/hooks'
import type { AuthUser } from '@/api/types'
import { PageHeader } from '@/components/ui'
import { fmtDT, relTime } from '@/lib/format'
import { useAuth } from '@/lib/auth'
import { NAV_FLAT } from '@/layout/nav'
import { C } from '@/theme'

const LV = { full: { t: 'Đầy đủ', c: C.moss }, limited: { t: 'Giới hạn', c: C.amber }, view: { t: 'Chỉ xem', c: C.steel } }

function UserForm({ open, user, onClose }: { open: boolean; user: AuthUser | null; onClose: () => void }) {
  const { data: meta } = useMeta()
  const create = useCreateUser()
  const update = useUpdateUser()
  const [form] = Form.useForm()
  const isNew = !user
  const roleOptions = (meta?.roles ?? []).map((r) => ({ value: r.id, label: r.label }))
  return (
    <Modal open={open} title={isNew ? 'Tạo tài khoản' : `Sửa tài khoản — ${user?.name}`} okText={isNew ? 'Tạo tài khoản' : 'Lưu'}
      cancelText="Hủy" onCancel={onClose} destroyOnHidden confirmLoading={create.isPending || update.isPending}
      onOk={() => form.validateFields().then(async (v) => {
        if (isNew) await create.mutateAsync(v)
        else await update.mutateAsync({ id: user!.id, name: v.name, phone: v.phone, dept: v.dept, roles: v.roles })
        onClose()
      })}>
      <Form form={form} layout="vertical" preserve={false}
        initialValues={user ? { name: user.name, phone: user.phone, dept: user.dept, roles: user.roles } : { roles: [] }}>
        <Form.Item name="name" label="Họ tên" rules={[{ required: true, message: 'Nhập họ tên' }]}><Input /></Form.Item>
        <Form.Item name="phone" label="Số điện thoại (tên đăng nhập)" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
          <Input inputMode="tel" />
        </Form.Item>
        <Form.Item name="dept" label="Bộ phận"><Input placeholder="Kho, Vận tải, Sản xuất…" /></Form.Item>
        <Form.Item name="roles" label="Vai trò" extra="Một người có thể kiêm nhiều vai trò (vd thủ kho kiêm lái xe) — quyền lấy mức cao nhất."
          rules={[{ required: true, type: 'array', min: 1, message: 'Chọn ít nhất 1 vai trò' }]}>
          <Select mode="multiple" options={roleOptions} />
        </Form.Item>
        {isNew && (
          <Form.Item name="password" label="Mật khẩu ban đầu" extra="Người dùng sẽ được yêu cầu đổi khi đăng nhập lần đầu."
            rules={[{ required: true, min: 6, message: 'Tối thiểu 6 ký tự' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        )}
      </Form>
    </Modal>
  )
}

function ResetPassword({ user, onClose }: { user: AuthUser | null; onClose: () => void }) {
  const reset = useResetUserPassword()
  const [form] = Form.useForm()
  return (
    <Modal open={!!user} title={`Đặt lại mật khẩu — ${user?.name}`} okText="Đặt lại" cancelText="Hủy" onCancel={onClose}
      destroyOnHidden confirmLoading={reset.isPending}
      onOk={() => form.validateFields().then(async (v) => { await reset.mutateAsync({ id: user!.id, password: v.password }); onClose() })}>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="password" label="Mật khẩu mới" rules={[{ required: true, min: 6, message: 'Tối thiểu 6 ký tự' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}

function UsersTab() {
  const { data = [], isLoading } = useUsers()
  const { data: meta } = useMeta()
  const { user: me } = useAuth()
  const update = useUpdateUser()
  const { modal } = App.useApp()
  const [editing, setEditing] = useState<AuthUser | null | 'new'>(null)
  const [resetting, setResetting] = useState<AuthUser | null>(null)
  const roleLabel = (r: string) => meta?.roles.find((x) => x.id === r)?.label ?? r
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Button type="primary" icon={<UserPlus size={15} />} onClick={() => setEditing('new')}>Tạo tài khoản</Button>
      </div>
      <Table<AuthUser> rowKey="id" loading={isLoading} dataSource={data} pagination={false} scroll={{ x: 900 }}
        expandable={{
          expandedRowRender: (u) => (
            <Space wrap size={[6, 6]}>
              <span className="micro-u" style={{ marginRight: 6 }}>Quyền hiệu lực:</span>
              {NAV_FLAT.map((n) => {
                const lv = u.permissions[n.id] as keyof typeof LV | undefined
                return <Tag key={n.id} style={{ color: lv ? LV[lv].c : C.ash3, borderColor: lv ? LV[lv].c : C.ruleSoft, background: 'transparent' }}>
                  {n.label}: {lv ? LV[lv].t : 'Ẩn'}</Tag>
              })}
            </Space>
          ),
        }}
        columns={[
          { title: 'Họ tên', dataIndex: 'name', width: 220, render: (v, u) => <span><b>{v}</b>{u.id === me?.id && <Tag style={{ marginLeft: 6 }}>Bạn</Tag>}<div className="caption">{u.dept}</div></span> },
          { title: 'Đăng nhập', dataIndex: 'phone', render: (v) => <span className="mono">{v}</span> },
          { title: 'Vai trò', dataIndex: 'roles', render: (rs: string[]) => <Space wrap size={4}>{rs.map((r) => <Tag key={r} color={r === 'admin' ? 'volcano' : undefined}>{roleLabel(r)}</Tag>)}</Space> },
          { title: 'Đăng nhập gần nhất', dataIndex: 'lastLoginAt', render: (v) => v ? <Tooltip title={fmtDT(v)}>{relTime(v)}</Tooltip> : <span className="text-ash">Chưa đăng nhập</span> },
          { title: 'Hoạt động', dataIndex: 'active', render: (v: boolean, u) => (
            <Switch checked={v} disabled={u.id === me?.id} onChange={(on) => on ? update.mutate({ id: u.id, active: true })
              : modal.confirm({ title: `Khóa tài khoản ${u.name}?`, content: 'Người này sẽ không đăng nhập được. Dữ liệu họ đã nhập vẫn giữ nguyên.',
                okText: 'Khóa', okButtonProps: { danger: true }, cancelText: 'Hủy', onOk: () => update.mutateAsync({ id: u.id, active: false }) })} />
          ) },
          { title: '', key: 'act', align: 'right', render: (_, u) => (
            <Space>
              <Button size="small" icon={<Pencil size={13} />} onClick={() => setEditing(u)}>Sửa</Button>
              <Button size="small" icon={<KeyRound size={13} />} onClick={() => setResetting(u)}>Đặt lại mật khẩu</Button>
            </Space>
          ) },
        ]} />
      <UserForm open={editing !== null} user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      <ResetPassword user={resetting} onClose={() => setResetting(null)} />
    </>
  )
}

const ACTION_LABEL: [RegExp, string][] = [
  [/\/orders\/[^/]+\/send-to-kt$/, 'Chuyển kế toán'], [/\/orders$/, 'Tạo đơn hàng'], [/\/orders\/[^/]+$/, 'Sửa đơn hàng'],
  [/\/contracts\/[^/]+\/payments$/, 'Ghi nhận tiền về'], [/\/contracts\/[^/]+\/signed$/, 'Ký hợp đồng'],
  [/\/contracts\/[^/]+\/returned$/, 'Trả hợp đồng'], [/\/contracts\/[^/]+$/, 'Sửa hợp đồng'],
  [/\/lsx$/, 'Phát lệnh SX'], [/\/lsx\/[^/]+\/accept$/, 'Nhận lệnh SX'], [/\/lsx\/[^/]+\/reject$/, 'Từ chối lệnh SX'],
  [/\/lsx\/[^/]+\/progress$/, 'Cập nhật tiến độ'], [/\/lsx\/[^/]+\/extend$/, 'Duyệt gia hạn'],
  [/\/receipts$/, 'Lập phiếu tiếp nhận'], [/\/weighings$/, 'Tạo phiếu cân'], [/\/weighings\/[^/]+\/fill$/, 'Nhập kết quả cân'],
  [/\/weighings\/[^/]+\/photo$/, 'Cập nhật ảnh phiếu cân'], [/\/tasks$/, 'Giao thẻ lái xe'], [/\/tasks\/[^/]+\/accept$/, 'Lái xe nhận thẻ'],
  [/\/tasks\/[^/]+\/reject$/, 'Lái xe từ chối'], [/\/tasks\/[^/]+\/depart$/, 'Xe xuất phát'], [/\/tasks\/[^/]+\/fill-galv$/, 'Điền phiếu mạ'],
  [/\/tasks\/[^/]+\/fill-delivery$/, 'Điền phiếu giao'], [/\/tasks\/[^/]+\/photo$/, 'Cập nhật ảnh thẻ'],
  [/\/mismatches\/[^/]+\/sign$/, 'Ký sai lệch'], [/\/vloss\/accept-loss$/, 'Duyệt kho ảo'], [/\/vloss\/[^/]+\/resolve$/, 'Xử lý kho ảo'],
  [/\/users\/[^/]+\/reset-password$/, 'Đặt lại mật khẩu'], [/\/users$/, 'Tạo tài khoản'], [/\/users\/[^/]+$/, 'Sửa tài khoản'],
  [/\/auth\/change-password$/, 'Đổi mật khẩu'], [/\/uploads$/, 'Tải ảnh lên'], [/\/admin\/reset$/, 'Khôi phục dữ liệu demo'],
  [/\/notifications\/read-all$/, 'Đọc thông báo'],
]
const actionOf = (path: string) => ACTION_LABEL.find(([re]) => re.test(path))?.[1] ?? path
const recordOf = (path: string) => path.match(/\/(DH|HD|LSX|PTN|PC|VC|SL|VK)-[\w-]+/)?.[0].slice(1) ?? ''

function AuditTab() {
  const { data: users = [] } = useUsers()
  const [userId, setUserId] = useState<string | undefined>()
  const { data = [], isLoading } = useAuditLogs({ userId })
  return (
    <>
      <Select allowClear placeholder="Lọc theo người dùng" style={{ width: 260, marginBottom: 12 }} value={userId} onChange={setUserId}
        options={users.map((u) => ({ value: u.id, label: u.name }))} />
      <Table rowKey="id" loading={isLoading} dataSource={data} size="small" pagination={{ pageSize: 30 }}
        columns={[
          { title: 'Thời điểm', dataIndex: 'at', width: 140, render: (v) => <span className="num">{fmtDT(v)}</span> },
          { title: 'Người thao tác', dataIndex: 'userName', render: (v) => v ?? <span className="text-ash">—</span> },
          { title: 'Thao tác', dataIndex: 'path', render: (p: string) => <span>{actionOf(p)} <span className="mono text-ash">{recordOf(p)}</span></span> },
          { title: 'Kết quả', dataIndex: 'status', width: 110, render: (s: number) => s < 400 ? <Tag color="green">Thành công</Tag>
            : <Tooltip title={`HTTP ${s}`}><Tag color={s === 403 ? 'orange' : 'red'}>{s === 403 ? 'Không có quyền' : 'Lỗi'}</Tag></Tooltip> },
        ]} />
    </>
  )
}

export default function Users() {
  return (
    <>
      <PageHeader title="Người dùng & phân quyền" desc="Cấp tài khoản theo số điện thoại, gán vai trò, khóa tài khoản và theo dõi ai đã thao tác gì." />
      <Tabs items={[
        { key: 'users', label: 'Tài khoản', children: <UsersTab /> },
        { key: 'audit', label: 'Nhật ký thao tác', children: <AuditTab /> },
      ]} />
    </>
  )
}
