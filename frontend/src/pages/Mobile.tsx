/* Bản mobile hiện trường (route /mobile, không dùng AppLayout) — port pages/mobile.html của bản demo.
   Desktop: sân khấu tối + khung iPhone ở giữa, thanh chọn vai trò phía trên.
   Điện thoại thật (≤ 520px): toàn màn hình; bấm tên vai trò trên header để đổi vai trò / về bản desktop. */
import { ArrowLeft, BatteryFull, Monitor, Signal, Wifi, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { useMeta } from '@/api/hooks'
import type { RoleId } from '@/api/types'
import { useAuth } from '@/lib/auth'
import { homeFor } from '@/layout/nav'
import { Detail } from './mobile/details'
import { Ctx, KIND_META, type Kind, type MobCtx, type MRole, refKindOf, ROLE_ORDER, ROLES, type SheetSpec } from './mobile/core'
import { DriverView, KhoView, QlView, SxView } from './mobile/roles'
import './mobile/mobile.css'

interface Layer extends SheetSpec { key: number }

function Clock() {
  const fmt = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
  const [t, setT] = useState(fmt)
  useEffect(() => { const h = setInterval(() => setT(fmt()), 30000); return () => clearInterval(h) }, [])
  return <span>{t}</span>
}

function MobileInner() {
  const { data: meta } = useMeta()
  const [params, setParams] = useSearchParams()
  const { user, hasRole } = useAuth()
  // Vai trò hiện trường được phép theo tài khoản: Quản lý xem mọi vai trò; còn lại theo vai trò được gán.
  const MAP: Partial<Record<RoleId, MRole>> = { sx: 'sanxuat', kho: 'thukho', lx: 'laixe' }
  const allowed: MRole[] = hasRole('admin') ? ROLE_ORDER
    : ROLE_ORDER.filter((r) => (user?.roles ?? []).some((x) => MAP[x] === r))
  const qRole = params.get('role') as MRole | null
  const role: MRole = qRole && allowed.includes(qRole) ? qRole : (allowed[0] ?? 'quanly')
  const lockDriver = !hasRole('admin')
  const driver = lockDriver ? (user?.name ?? '') : (params.get('driver') || meta?.drivers[0] || '')
  const [tab, setTab] = useState(() => ROLES[role].tabs[0].id)
  const activeTab = ROLES[role].tabs.some((t) => t.id === tab) ? tab : ROLES[role].tabs[0].id

  /* ---------- bottom sheet (chồng nhiều lớp) ---------- */
  const [layers, setLayers] = useState<Layer[]>([])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [zoomSrc, setZoomSrc] = useState<string | null>(null)
  const seq = useRef(0)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sheetOpenRef = useRef(false)
  const layersRef = useRef<Layer[]>([])
  useEffect(() => { sheetOpenRef.current = sheetOpen; layersRef.current = layers }, [sheetOpen, layers])

  const push = useCallback((s: SheetSpec) => {
    if (clearTimer.current) { clearTimeout(clearTimer.current); clearTimer.current = null }
    const keep = sheetOpenRef.current
    sheetOpenRef.current = true
    setLayers((ls) => [...(keep ? ls : []), { ...s, key: ++seq.current }])
    setSheetOpen(true)
  }, [])
  const close = useCallback(() => {
    sheetOpenRef.current = false
    setSheetOpen(false)
    if (clearTimer.current) clearTimeout(clearTimer.current)
    clearTimer.current = setTimeout(() => { setLayers([]); clearTimer.current = null }, 320)
  }, [])
  const pop = useCallback(() => {
    if (layersRef.current.length <= 1) close()
    else setLayers((ls) => ls.slice(0, -1))
  }, [close])

  const ctx = useMemo<MobCtx>(() => ({
    role, meta, tol: meta?.toleranceKg ?? 30,
    open: (kind: Kind, id: string) => push({ icon: KIND_META[kind].icon, title: `${KIND_META[kind].label} ${id}`, body: <Detail kind={kind} id={id} /> }),
    sheet: push, pop, close, zoom: setZoomSrc,
  }), [role, meta, push, pop, close])

  // mở từ thông báo: /mobile?xem=<mã> → mở thẳng chi tiết bản ghi
  useEffect(() => {
    const id = params.get('xem')
    if (!id) return
    ctx.open(refKindOf(id), id)
    const next = new URLSearchParams(params)
    next.delete('xem')
    setParams(next, { replace: true })
  }, [params, setParams, ctx])

  useEffect(() => {
    const prev = document.title
    document.title = 'Bản mobile hiện trường — EMECS Việt Nam'
    return () => { document.title = prev }
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (zoomSrc) setZoomSrc(null)
      else if (sheetOpenRef.current) pop()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoomSrc, pop])

  /* ---------- đổi vai trò / tài xế ---------- */
  const switchRole = (r: MRole) => {
    const next = new URLSearchParams(params)
    next.set('role', r)
    setParams(next, { replace: true })
    setTab(ROLES[r].tabs[0].id)
    close()
  }
  const setDriver = (d: string) => {
    const next = new URLSearchParams(params)
    next.set('driver', d)
    setParams(next, { replace: true })
  }
  const roleSheet = () => push({
    icon: ROLES[role].icon, title: 'Chọn vai trò',
    body: (
      <>
        <div className="role-list">
          {allowed.map((r) => {
            const R = ROLES[r]
            return (
              <button key={r} type="button" className={'role-opt' + (role === r ? ' active' : '')} onClick={() => switchRole(r)}>
                <span className="hd-ic"><R.icon /></span>
                <span><b>{R.label}</b><span>{r === 'laixe' ? `${driver} · Đội vận tải` : R.sub}</span></span>
              </button>
            )
          })}
        </div>
        <div className="btn-row" style={{ marginTop: 16 }}>
          <Link to="/dashboard" className="btn-m"><Monitor />Về bản desktop</Link>
        </div>
      </>
    ),
  })

  const top = layers[layers.length - 1]
  const viewProps = { tab: activeTab, setTab, onRoleSheet: roleSheet }

  if (!allowed.length) return (
    <div className="mob-root" style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--paper)', textAlign: 'center', padding: 24 }}>
      <div>Tài khoản của bạn không có vai trò hiện trường (xưởng, kho, lái xe).<br /><Link to="/dashboard" style={{ color: 'var(--rust-2)' }}>Về bản desktop</Link></div>
    </div>
  )

  return (
    <div className="mob-root">
      <Link className="back-desktop" to="/dashboard"><ArrowLeft />Về bản desktop</Link>
      <div className="mob-stage">
        <div className="stage-title">
          <div className="kicker">EMECS Việt Nam · App hiện trường</div>
          <h1>Giao diện điện thoại theo vai trò</h1>
          <p>Chọn vai trò để xem đúng màn hình người đó cầm trên tay — thao tác thật, dữ liệu đối ứng thật.</p>
        </div>
        <div className="role-bar">
          {allowed.map((r) => {
            const R = ROLES[r]
            return (
              <button key={r} type="button" className={'role-pill' + (role === r ? ' active' : '')} onClick={() => switchRole(r)}>
                <R.icon />{R.label}
              </button>
            )
          })}
        </div>

        <div className="phone">
          <div className="phone-screen">
            <div className="phone-notch" />
            <div className="m-status">
              <Clock />
              <span className="st-right"><Signal /><Wifi /><BatteryFull /></span>
            </div>
            <Ctx.Provider value={ctx}>
              {role === 'laixe' ? <DriverView {...viewProps} driver={driver} setDriver={setDriver} lockDriver={lockDriver} />
                : role === 'sanxuat' ? <SxView {...viewProps} />
                  : role === 'thukho' ? <KhoView {...viewProps} />
                    : <QlView {...viewProps} />}

              <div className={'m-backdrop' + (sheetOpen ? ' open' : '')} onClick={close} />
              <div className={'m-sheet' + (sheetOpen ? ' open' : '')} role="dialog" aria-modal="true" aria-hidden={!sheetOpen}>
                <div className="sheet-grip" />
                {top && (
                  <div className="sheet-head">
                    {layers.length > 1 && <button type="button" className="x" onClick={pop} aria-label="Quay lại"><ArrowLeft /></button>}
                    <top.icon />
                    <b>{top.title}</b>
                    <button type="button" className="x close" onClick={close} aria-label="Đóng"><X /></button>
                  </div>
                )}
                {layers.map((l) => (
                  <div key={l.key} className="sheet-body sheet-layer" hidden={l !== top}>{l.body}</div>
                ))}
              </div>
              {zoomSrc && (
                <div className="m-zoom" onClick={() => setZoomSrc(null)}>
                  <img src={zoomSrc} alt="Ảnh phiếu phóng to" />
                  <div className="zoom-hint">Chạm để đóng</div>
                </div>
              )}
            </Ctx.Provider>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Bản điện thoại chỉ có màn của Quản lý / xưởng / kho / lái xe — vai trò khác (kế toán) về màn của mình. */
export default function Mobile() {
  const { user, hasRole } = useAuth()
  const field = hasRole('admin') || (user?.roles ?? []).some((r) => r === 'sx' || r === 'kho' || r === 'lx')
  if (!field) return <Navigate to={homeFor(user?.permissions, user?.roles)} replace />
  return <MobileInner />
}
