import { Alert, Form, Input, Modal } from 'antd'
import { useChangePassword } from '@/api/hooks'
import { useAuth } from '@/lib/auth'

/** Đổi mật khẩu. `forced` = lần đăng nhập đầu / sau khi Quản lý đặt lại: không cho đóng. */
export default function ChangePasswordModal({ open, onClose, forced }: { open: boolean; onClose: () => void; forced?: boolean }) {
  const change = useChangePassword()
  const { refresh } = useAuth()
  const [form] = Form.useForm()
  return (
    <Modal open={open} title="Đổi mật khẩu" okText="Đổi mật khẩu" cancelText="Để sau" closable={!forced} mask={{ closable: !forced }}
      cancelButtonProps={{ style: forced ? { display: 'none' } : undefined }} onCancel={onClose} destroyOnHidden
      confirmLoading={change.isPending}
      onOk={() => form.validateFields().then(async (v) => {
        await change.mutateAsync({ oldPassword: v.oldPassword, newPassword: v.newPassword })
        await refresh()
        onClose()
      })}>
      {forced && <Alert type="warning" showIcon message="Bạn đang dùng mật khẩu do Quản lý cấp — vui lòng đổi mật khẩu riêng để tiếp tục." style={{ marginBottom: 16 }} />}
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="oldPassword" label="Mật khẩu hiện tại" rules={[{ required: true, message: 'Nhập mật khẩu hiện tại' }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{ required: true, min: 6, message: 'Tối thiểu 6 ký tự' }]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Form.Item name="confirm" label="Nhập lại mật khẩu mới" dependencies={['newPassword']}
          rules={[{ required: true, message: 'Nhập lại mật khẩu mới' }, ({ getFieldValue }) => ({
            validator: (_, v) => (!v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Mật khẩu nhập lại không khớp'))),
          })]}>
          <Input.Password autoComplete="new-password" />
        </Form.Item>
      </Form>
    </Modal>
  )
}
