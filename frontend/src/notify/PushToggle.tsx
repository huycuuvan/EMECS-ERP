/* Nút bật thông báo đẩy trên máy này (desktop: trong popover chuông; mobile: trong sheet thông báo). */
import { App, Button } from 'antd'
import { BellRing } from 'lucide-react'
import { useEffect, useState } from 'react'
import { enablePush, pushState, PUSH_HINT, type PushState } from './push'

export default function PushToggle({ compact }: { compact?: boolean }) {
  const { message } = App.useApp()
  const [st, setSt] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { pushState().then(setSt).catch(() => setSt('unsupported')) }, [])
  if (!st || st === 'on') return st === 'on' && !compact ? <div className="caption" style={{ padding: '6px 2px' }}>{PUSH_HINT.on}</div> : null
  const turnOn = async () => {
    setBusy(true)
    try {
      const r = await enablePush()
      setSt(r)
      if (r === 'on') message.success('Đã bật thông báo trên máy này')
      else message.warning(PUSH_HINT[r])
    } catch {
      message.error('Không bật được thông báo — thử lại sau')
    } finally { setBusy(false) }
  }
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 2px', borderBottom: '1px solid var(--rule-hair)', flexWrap: 'wrap' }}>
      {st === 'off' && <Button size="small" type="primary" icon={<BellRing size={13} />} loading={busy} onClick={turnOn}>Bật thông báo trên máy</Button>}
      <span className="caption" style={{ flex: 1, minWidth: 180 }}>{PUSH_HINT[st]}</span>
    </div>
  )
}
