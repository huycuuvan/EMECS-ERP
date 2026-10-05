/* Trang đăng nhập (số điện thoại + mật khẩu).
   Chế độ demo (npm run dev hoặc VITE_DEMO_LOGIN=1): hiện danh sách tài khoản demo để đăng nhập nhanh từng vai trò. */
import { Alert, App, Button, Form, Input } from 'antd'
import { KeyRound, LogIn, Phone } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage } from '@/api/client'
import type { AuthUser } from '@/api/types'
import { homeFor, NAV_FLAT } from '@/layout/nav'
import { useAuth } from '@/lib/auth'
import { C } from '@/theme'

const DEMO = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === '1'
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'steel123'
// Khớp tài khoản seed ở backend/app/config.py (PEOPLE)
const DEMO_ACCOUNTS = [
  { phone: '0900000001', name: 'Quản lý A', role: 'Quản lý — điều hành, ký sai lệch' },
  { phone: '0900000002', name: 'Trần Thu Hà', role: 'NV1 — Kế toán' },
  { phone: '0900000003', name: 'Lê Văn Xưởng', role: 'NV2 — Xưởng sản xuất' },
  { phone: '0900000004', name: 'Ngô Minh Kho', role: 'NV3 — Thủ kho' },
  { phone: '0900000005', name: 'Phạm Văn Tài', role: 'NV3 — Lái xe' },
  { phone: '0900000006', name: 'Lê Đức Vận', role: 'NV3 — Lái xe' },
]

/** Trang đích sau đăng nhập: trang định mở (nếu đủ quyền), không thì lái xe / xưởng → điện thoại, còn lại → Dashboard. */
function targetFor(u: AuthUser, want: string | null) {
  const page = want && NAV_FLAT.find((n) => want.startsWith(n.path))
  const allowed = want && want !== '/' && (want.startsWith('/mobile') || (page && u.permissions[page.id]))
  return allowed ? want : homeFor(u.permissions, u.roles)
}

export default function Login() {
  const { user, login } = useAuth()
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  if (user) return <Navigate to={targetFor(user, params.get('next'))} replace />

  const submit = async (phone: string, password: string) => {
    setBusy(true); setErr(null)
    try {
      const u = await login(phone, password)
      message.success(`Xin chào ${u.name}`)
      navigate(targetFor(u, params.get('next')), { replace: true })
    } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: C.ink, padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 420, background: C.paper, borderRadius: 16, padding: '32px 28px', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <img src="/logo-emecs.png" alt="EMECS Việt Nam" width={64} height={64} style={{ flex: 'none' }} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: '.03em' }}>EMECS VIỆT NAM</div>
            <div className="micro-u">Điều hành cơ khí kết cấu thép</div>
          </div>
        </div>
        <h2 style={{ margin: '0 0 4px', fontSize: 22 }}>Đăng nhập</h2>
        <p className="caption" style={{ marginTop: 0, marginBottom: 20 }}>Dùng số điện thoại và mật khẩu được Quản lý cấp.</p>
        {err && <Alert type="error" showIcon message={err} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" requiredMark={false} onFinish={(v: { phone: string; password: string }) => submit(v.phone, v.password)}>
          <Form.Item name="phone" label="Số điện thoại" rules={[{ required: true, message: 'Nhập số điện thoại' }]}>
            <Input size="large" prefix={<Phone size={16} />} inputMode="tel" autoComplete="username" placeholder="09xx xxx xxx" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu" rules={[{ required: true, message: 'Nhập mật khẩu' }]}>
            <Input.Password size="large" prefix={<KeyRound size={16} />} autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" size="large" block loading={busy} icon={<LogIn size={16} />}>Đăng nhập</Button>
        </Form>
        <p className="caption" style={{ marginTop: 14, marginBottom: 0 }}>Quên mật khẩu? Liên hệ Quản lý để được đặt lại.</p>

        {DEMO && (
          <div style={{ marginTop: 24, borderTop: `1px solid ${C.rule}`, paddingTop: 16 }}>
            <div className="micro-u" style={{ marginBottom: 8 }}>Bản demo — đăng nhập nhanh theo vai trò</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {DEMO_ACCOUNTS.map((a) => (
                <button key={a.phone} type="button" disabled={busy} onClick={() => submit(a.phone, DEMO_PASSWORD)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, textAlign: 'left', padding: '9px 12px', borderRadius: 10, border: `1px solid ${C.rule}`, background: C.canvas, cursor: 'pointer', font: 'inherit' }}>
                  <span><b style={{ fontSize: 13.5 }}>{a.name}</b><span className="caption" style={{ display: 'block' }}>{a.role}</span></span>
                  <span className="mono" style={{ fontSize: 11, color: C.ash }}>{a.phone}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
