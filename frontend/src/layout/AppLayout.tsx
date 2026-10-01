/* Khung ứng dụng: sidebar tối (nhóm menu theo bản demo, ẩn/đánh dấu theo vai trò) + topbar
   (breadcrumb · chọn vai trò · giao diện điện thoại · chuông thông báo · khôi phục demo). */
import { Avatar, Badge, Button, Dropdown, Empty, Grid, Layout, Popover, Result, Tooltip } from 'antd'
import { Bell, Eye, KeyRound, LogOut, Menu as MenuIcon, RotateCcw, Smartphone, SquarePen } from 'lucide-react'
import { useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useMeta, useNotifications, useReadAllNotifications, useResetDemo } from '@/api/hooks'
import ChangePasswordModal from '@/components/ChangePasswordModal'
import { useAuth } from '@/lib/auth'
import { relTime } from '@/lib/format'
import { C } from '@/theme'
import { NAV, NAV_FLAT } from './nav'

const { Sider, Header, Content } = Layout

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { level } = useAuth()
  const { pathname } = useLocation()
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Link to="/dashboard" onClick={onNavigate} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '20px 20px 16px', textDecoration: 'none' }}>
        <span style={{ width: 34, height: 34, borderRadius: 8, background: C.rust, color: C.paper, display: 'grid', placeItems: 'center', fontWeight: 800 }}>ST</span>
        <span>
          <div style={{ color: C.paper, fontWeight: 800, letterSpacing: '.04em' }}>STEEL ONE</div>
          <div className="mono" style={{ color: C.ash2, fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase' }}>Điều hành kết cấu thép</div>
        </span>
      </Link>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 20px' }}>
        {NAV.map((g) => {
          const items = g.items.filter((i) => level(i.id))
          if (!items.length) return null
          return (
            <div key={g.section} style={{ marginTop: 14 }}>
              <div className="mono" style={{ color: C.ash2, fontSize: 9.5, letterSpacing: '.16em', textTransform: 'uppercase', padding: '0 10px 6px' }}>{g.section}</div>
              {items.map((i) => {
                const active = pathname.startsWith(i.path)
                const lvl = level(i.id)
                const Icon = i.icon
                return (
                  <Link key={i.id} to={i.path} onClick={onNavigate}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 8, marginBottom: 2,
                      color: active ? C.paper : '#cfc9b9', background: active ? C.rust : 'transparent', fontSize: 13.5,
                      fontWeight: active ? 600 : 500, textDecoration: 'none',
                    }}>
                    <Icon size={16} />
                    <span style={{ flex: 1 }}>{i.label}</span>
                    {lvl === 'view' && <Tooltip title="Chỉ xem"><Eye size={13} style={{ opacity: .6 }} /></Tooltip>}
                    {lvl === 'limited' && <Tooltip title="Thao tác giới hạn"><SquarePen size={13} style={{ opacity: .6 }} /></Tooltip>}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>
    </div>
  )
}

function NotificationBell() {
  const { data = [] } = useNotifications()
  const readAll = useReadAllNotifications()
  const unread = data.filter((n) => !n.read).length
  const color = { info: C.steel, success: C.moss, warning: C.amber, error: C.signal }
  const content = (
    <div style={{ width: 360, maxHeight: 440, overflowY: 'auto' }}>
      {data.length === 0 ? <Empty description="Chưa có thông báo" /> : data.map((n) => (
        <div key={n.id} style={{ display: 'flex', gap: 10, padding: '10px 4px', borderBottom: `1px solid ${C.ruleHair}`, opacity: n.read ? .65 : 1 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: color[n.type], marginTop: 6, flex: 'none' }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{n.title}</div>
            <div className="caption">{n.sub}</div>
            <div className="mono" style={{ fontSize: 10, color: C.ash2, marginTop: 2 }}>{relTime(n.at)}</div>
          </div>
        </div>
      ))}
    </div>
  )
  return (
    <Popover trigger="click" placement="bottomRight" content={content}
      title={<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>Thông báo
        {unread > 0 && <Button type="link" size="small" onClick={() => readAll.mutate(undefined)}>Đánh dấu đã đọc</Button>}</div>}>
      <Badge count={unread} size="small" color={C.rust}>
        <Button shape="circle" icon={<Bell size={16} />} aria-label="Thông báo" />
      </Badge>
    </Popover>
  )
}

export default function AppLayout() {
  const { user, roles, level, hasRole, logout } = useAuth()
  const { data: meta } = useMeta()
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const reset = useResetDemo()
  const [mobileNav, setMobileNav] = useState(false)
  const screens = Grid.useBreakpoint()
  const [pwOpen, setPwOpen] = useState(false)
  const roleText = roles.map((r) => meta?.roles.find((x) => x.id === r)?.label ?? r).join(' · ')
  const initials = (user?.name ?? '?').split(' ').filter(Boolean).slice(-2).map((w) => w[0]).join('').toUpperCase()
  const current = NAV_FLAT.find((i) => pathname.startsWith(i.path))
  const allowed = !current || !!level(current.id)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {screens.lg && (
        <Sider width={256} style={{ position: 'sticky', top: 0, height: '100vh' }} className="app-sider">
          <Sidebar />
        </Sider>
      )}
      {mobileNav && (
        <div onClick={() => setMobileNav(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,19,15,.45)', zIndex: 900 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: 264, height: '100%', background: C.ink }}>
            <Sidebar onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}
      <Layout>
        <Header style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${C.rule}`, position: 'sticky', top: 0, zIndex: 50 }}>
          <Button className="mobile-nav-btn" type="text" icon={<MenuIcon size={18} />} onClick={() => setMobileNav(true)} aria-label="Menu" />
          <div style={{ flex: 1, minWidth: 0, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            <b>{current?.section ?? 'STEEL ONE'}</b>{current && <span className="text-ash"> · {current.label}</span>}
          </div>
          <Tooltip title="Giao diện điện thoại (lái xe / xưởng / kho)">
            <Button shape="circle" icon={<Smartphone size={16} />} onClick={() => navigate('/mobile')} />
          </Tooltip>
          <NotificationBell />
          <Dropdown trigger={['click']} menu={{ items: [
            { key: 'me', disabled: true, label: <div style={{ lineHeight: 1.35 }}><b style={{ color: C.ink }}>{user?.name}</b><div className="caption">{roleText}</div><div className="mono caption">{user?.phone}</div></div> },
            { type: 'divider' },
            { key: 'pw', icon: <KeyRound size={14} />, label: 'Đổi mật khẩu', onClick: () => setPwOpen(true) },
            ...(hasRole('admin') && import.meta.env.DEV ? [{ key: 'reset', icon: <RotateCcw size={14} />, label: 'Khôi phục dữ liệu demo', onClick: () => reset.mutate(undefined) }] : []),
            { type: 'divider' as const },
            { key: 'logout', icon: <LogOut size={14} />, label: 'Đăng xuất', danger: true, onClick: () => { logout(); navigate('/login') } },
          ] }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <span className="hide-sm" style={{ textAlign: 'right', lineHeight: 1.2 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
                <div className="caption" style={{ fontSize: 11 }}>{roleText}</div>
              </span>
              <Avatar style={{ background: C.ink, fontWeight: 700 }}>{initials}</Avatar>
            </span>
          </Dropdown>
        </Header>
        <Content className="app-content">
          {allowed ? <Outlet /> : (
            <Result status="403" title="Không có quyền truy cập" subTitle={`Vai trò hiện tại không được xem mục "${current?.label}".`}
              extra={<Button onClick={() => navigate('/dashboard')}>Về Dashboard</Button>} />
          )}
        </Content>
      </Layout>
      <ChangePasswordModal open={pwOpen || !!user?.mustChangePassword} forced={!!user?.mustChangePassword} onClose={() => setPwOpen(false)} />
    </Layout>
  )
}
