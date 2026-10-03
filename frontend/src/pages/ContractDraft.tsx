/* Soạn thảo hợp đồng theo MẪU CỦA KHÁCH (kế toán) — /hop-dong/:id/soan-thao.
   Trình bày như trang hợp đồng: ô VÀNG = kế toán nhập; ô ĐỎ = hệ thống tự điền từ bước trước (số HĐ ← mã đơn hàng,
   Bên A ← danh mục Khách hàng, bảng hàng ← đơn hàng, thành tiền / VAT / bằng chữ ← tự tính) — vẫn sửa được nếu cần.
   Lưu → hợp đồng sang bước "Đã soạn thảo"; Tải Word xuất đúng file mẫu; "Đã gửi khách hàng" → báo Quản lý. */
import { Alert, App, Button, DatePicker, Input, InputNumber, Modal, Spin, Tooltip } from 'antd'
import dayjs from 'dayjs'
import { ArrowLeft, Download, Plus, RotateCcw, Save, Send, Settings2, Trash2, UserPen } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useContract, useContractDocument, useSaveContractDocument, useSaveSeller } from '@/api/hooks'
import { blobError, downloadFile } from '@/api/hooksEdit'
import { useCustomers } from '@/api/hooksMaster'
import CustomerFormModal from './customers/CustomerFormModal'
import type { ContractDocument, ContractDraftInput, Party } from '@/api/types'
import { CompleteChip, PageHeader, StatusTag } from '@/components/ui'
import { useAuth } from '@/lib/auth'
import { fmtD, fmtNum } from '@/lib/format'
import { numberWords } from '@/lib/numberWords'
import { numFormatter, numParser } from '@/peek/drawers/contract/utils'
import { useContractFlow } from '@/peek/drawers/contract/useContractFlow'
import './contract-draft/draft.css'

const PARTY_KEYS: (keyof Party)[] = ['name', 'address', 'phone', 'banks', 'taxCode', 'representative', 'title']
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
const samePerson = (a: Party, b: Party) => PARTY_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]))

interface State {
  number: string; date: string | null; basis: string; buyer: Party; scope: string
  prices: Record<string, number | null>; vatPct: number; words: string | null; priceIncludes: string
  paymentMethod: string; advances: (number | null)[]; paymentRest: string; conditions: string
  warranty: string; deliveryTime: string; deliveryPlace: string; acceptancePlace: string
}

const fromDoc = (d: ContractDocument): State => ({
  number: d.number, date: d.date, basis: d.basis.join('\n'), buyer: d.buyer, scope: d.scope,
  prices: Object.fromEntries(d.lines.filter((l) => l.custom).map((l) => [String(l.itemId), l.unitPrice])),
  vatPct: d.vatPct, words: d.words !== d.wordsAuto ? d.words : null, priceIncludes: d.priceIncludes.join('\n'),
  paymentMethod: d.paymentMethod, advances: d.advances.map((a) => a.amount), paymentRest: d.paymentRest.join('\n'),
  conditions: d.conditions.join('\n'), warranty: d.warranty, deliveryTime: d.deliveryTime,
  deliveryPlace: d.deliveryPlace, acceptancePlace: d.acceptancePlace,
})

export default function ContractDraft() {
  const { id = '' } = useParams()
  const { data: doc, isLoading, isError } = useContractDocument(id)
  if (isLoading) return <div style={{ minHeight: '50vh', display: 'grid', placeItems: 'center' }}><Spin size="large" /></div>
  if (isError || !doc) return <Alert type="error" showIcon title={`Không tìm thấy hợp đồng ${id}`} />
  return <Editor key={doc.draftedAt ?? 'new'} doc={doc} />
}

/* ô nhập: vàng = kế toán nhập · đỏ = tự điền */
const Y = ({ children, wide }: { children: ReactNode; wide?: boolean }) => <span className={'fy' + (wide ? ' wide' : '')}>{children}</span>
const R = ({ children, wide, onReset }: { children: ReactNode; wide?: boolean; onReset?: () => void }) => (
  <span className={'fr' + (wide ? ' wide' : '')}>
    {children}
    {onReset && <Tooltip title="Lấy lại dữ liệu tự động"><button type="button" className="fr-reset" onClick={onReset}><RotateCcw size={11} /></button></Tooltip>}
  </span>
)

function Editor({ doc }: { doc: ContractDocument }) {
  const navigate = useNavigate()
  const { message } = App.useApp()
  const { can, hasRole } = useAuth()
  const { data: agg } = useContract(doc.contractId)
  const save = useSaveContractDocument()
  const flow = useContractFlow()
  const [s, setS] = useState<State>(() => fromDoc(doc))
  const [saved, setSaved] = useState<State>(() => fromDoc(doc))
  const [sellerOpen, setSellerOpen] = useState(false)
  const [custOpen, setCustOpen] = useState(false)
  const { data: customers = [] } = useCustomers()
  const customer = customers.find((x) => x.id === doc.customerId)
  /* Bên A "sống" theo danh mục khách hàng: khi thông tin khách được bổ sung, ô chưa sửa tay tự cập nhật theo */
  const prevAuto = useRef(doc.buyerAuto)
  useEffect(() => {
    const old = prevAuto.current
    prevAuto.current = doc.buyerAuto
    if (samePerson(old, doc.buyerAuto)) return
    setS((p) => (samePerson(p.buyer, old) ? { ...p, buyer: doc.buyerAuto } : p))
    setSaved((p) => (samePerson(p.buyer, old) ? { ...p, buyer: doc.buyerAuto } : p))
  }, [doc.buyerAuto])
  const missing = ([['address', 'địa chỉ'], ['phone', 'điện thoại'], ['taxCode', 'mã số thuế'], ['representative', 'người đại diện'],
    ['title', 'chức vụ'], ['banks', 'tài khoản']] as const).filter(([k]) => (k === 'banks' ? !doc.buyerAuto.banks.length : !doc.buyerAuto[k])).map(([, l]) => l)
  const set = <K extends keyof State>(k: K, v: State[K]) => setS((p) => ({ ...p, [k]: v }))
  const setBuyer = (k: keyof Party, v: string | string[]) => setS((p) => ({ ...p, buyer: { ...p.buyer, [k]: v } }))
  const ro = doc.locked || !can('hop-dong', 'edit')
  const dirty = JSON.stringify(s) !== JSON.stringify(saved)

  /* ---- tính lại như backend ---- */
  const calc = useMemo(() => {
    const ls = doc.lines.map((l) => {
      const own = s.prices[String(l.itemId)]
      return { ...l, unitPrice: own || l.defaultUnitPrice, custom: !!own, amount: own ? Math.round(l.qty * own) : Math.round(l.kg * l.pricePerKg) }
    })
    const total = ls.reduce((a, l) => a + l.amount, 0)
    const vat = Math.round(total * (s.vatPct || 0) / 100)
    return { ls, total, vat, grand: total + vat, wordsAuto: numberWords(total + vat) }
  }, [doc.lines, s.prices, s.vatPct])

  const payload = (): ContractDraftInput => ({
    number: s.number.trim(), date: s.date ?? dayjs().format('YYYY-MM-DD'), basis: lines(s.basis), scope: s.scope,
    buyer: samePerson(s.buyer, doc.buyerAuto) ? null : { ...s.buyer, banks: s.buyer.banks.filter((b) => b.trim()) },
    prices: s.prices, vatPct: s.vatPct, words: s.words?.trim() || null, priceIncludes: lines(s.priceIncludes),
    paymentMethod: s.paymentMethod, advances: s.advances.filter((a): a is number => !!a && a > 0),
    paymentRest: lines(s.paymentRest), conditions: lines(s.conditions), warranty: s.warranty,
    deliveryTime: s.deliveryTime, deliveryPlace: s.deliveryPlace, acceptancePlace: s.acceptancePlace,
  })
  const doSave = async () => {
    if (!s.number.trim()) { message.error('Chưa nhập số hợp đồng'); return false }
    await save.mutateAsync({ id: doc.contractId, ...payload() })
    setSaved(s)
    return true
  }
  const word = async () => {
    if (!ro && (dirty || !doc.draftedAt) && !(await doSave())) return
    try { await downloadFile(`/contracts/${doc.contractId}/document.docx`, `Hop-dong_${doc.contractId}.docx`) }
    catch (e) { message.error(await blobError(e)) }
  }
  const c = agg?.contract
  const seller = doc.seller
  const sellerEmpty = !seller.name

  return (
    <>
      <PageHeader title={`Soạn thảo hợp đồng — ${doc.contractId}`}
        desc={<>Theo mẫu hợp đồng kinh tế của công ty · đơn hàng <b className="mono">{doc.orderId}</b>{c && <> · {c.customer}</>}</>}
        extra={<>
          <Button icon={<ArrowLeft size={14} />} onClick={() => navigate('/hop-dong')}>Danh sách</Button>
          <Button icon={<Download size={14} />} onClick={word}>Tải Word</Button>
          {!ro && <Button type="primary" icon={<Save size={14} />} loading={save.isPending} onClick={doSave} disabled={!dirty && !!doc.draftedAt}>
            {doc.draftedAt ? 'Lưu' : 'Lưu bản soạn thảo'}</Button>}
          {c && c.status === 'Đã soạn thảo' && can('hop-dong', 'edit') && (
            <Button icon={<Send size={14} />} disabled={dirty} onClick={() => flow.askReturned(c)}>Đã gửi khách hàng</Button>
          )}
        </>} />

      <div className="hdd-layout">
        <div className="hdd-main">
          <div className="hdd-legend">
            <span><i className="sw y" />Kế toán nhập</span>
            <span><i className="sw r" />Hệ thống tự điền (từ đơn hàng / khách hàng) — sửa được nếu cần</span>
            {dirty && <b className="hdd-dirty">● Chưa lưu</b>}
          </div>
          {doc.locked && <Alert type="info" showIcon style={{ marginBottom: 12 }}
            title={`Hợp đồng đã ở bước "${doc.status}" — bản soạn thảo đã khóa, chỉ xem / tải Word.`} />}

          <div className={'hdd-paper' + (ro ? ' ro' : '')}>
            <div className="c b">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
            <div className="c b">Độc lập – Tự do – Hạnh phúc</div>
            <div className="c b">-----*****-----</div>
            <div className="c b title">HỢP ĐỒNG KINH TẾ</div>
            <div className="c">Số: <R onReset={s.number !== doc.orderId ? () => set('number', doc.orderId) : undefined}>
              <Input size="small" variant="borderless" value={s.number} disabled={ro} onChange={(e) => set('number', e.target.value)} style={{ width: 220, textAlign: 'center' }} />
            </R></div>

            <p className="i">- Căn cứ Bộ Luật Dân sự số 91/2015/QH13 của nước CHXHCN Việt Nam năm 2015 được Quốc Hội khóa XIII thông qua và có hiệu lực từ ngày 24/11/2015.</p>
            <p className="i">- Căn cứ Luật Thương mại số 36/2005/QH11 của nước CHXHCN Việt Nam năm 2005 được Quốc Hội khóa XI thông qua và có hiệu lực từ ngày 14/06/2005.</p>
            <Y wide><Input.TextArea variant="borderless" autoSize={{ minRows: 1 }} disabled={ro} value={s.basis}
              placeholder="(Căn cứ khác — mỗi dòng một căn cứ, có thể bỏ trống)" onChange={(e) => set('basis', e.target.value)} /></Y>
            <div className="i">Hôm nay, <Y><DatePicker size="small" variant="borderless" format="[ngày] DD [tháng] MM [năm] YYYY" disabled={ro} allowClear={false}
              value={s.date ? dayjs(s.date) : dayjs()} onChange={(d) => set('date', d ? d.format('YYYY-MM-DD') : null)} style={{ width: 245 }} /></Y>, chúng tôi gồm có:</div>

            {/* Bên A — từ danh mục khách hàng */}
            <div className="party">
              <div className="b">BÊN MUA (BÊN A): <R onReset={!samePerson(s.buyer, doc.buyerAuto) ? () => set('buyer', doc.buyerAuto) : undefined}>
                <Input size="small" variant="borderless" className="b" disabled={ro} value={s.buyer.name} onChange={(e) => setBuyer('name', e.target.value)} style={{ width: 380 }} />
              </R></div>
              <Row label="Địa chỉ"><R wide><Input size="small" variant="borderless" disabled={ro} value={s.buyer.address} onChange={(e) => setBuyer('address', e.target.value)} /></R></Row>
              <Row label="Điện thoại"><R><Input size="small" variant="borderless" disabled={ro} value={s.buyer.phone} onChange={(e) => setBuyer('phone', e.target.value)} style={{ width: 200 }} /></R></Row>
              <Row label="Tài khoản"><R wide><Input.TextArea variant="borderless" autoSize={{ minRows: 1 }} disabled={ro} value={s.buyer.banks.join('\n')}
                placeholder="Số TK tại Ngân hàng — mỗi dòng 1 tài khoản (dòng sau in là “Hoặc …”)" onChange={(e) => setBuyer('banks', e.target.value.split('\n'))} /></R></Row>
              <Row label="Mã số thuế"><R><Input size="small" variant="borderless" disabled={ro} value={s.buyer.taxCode} onChange={(e) => setBuyer('taxCode', e.target.value)} style={{ width: 200 }} /></R></Row>
              <Row label="Đại diện là">
                <R><Input size="small" variant="borderless" className="b" disabled={ro} value={s.buyer.representative} onChange={(e) => setBuyer('representative', e.target.value)} style={{ width: 220 }} /></R>
                <span style={{ marginLeft: 18 }}>Chức vụ: </span>
                <R><Input size="small" variant="borderless" className="b" disabled={ro} value={s.buyer.title} onChange={(e) => setBuyer('title', e.target.value)} style={{ width: 140 }} /></R>
              </Row>
              {!doc.customerId && <div className="hint">Đơn hàng chưa gắn khách trong danh mục — nhập tay thông tin Bên A.</div>}
              {customer && (
                <div className="hint" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  {missing.length
                    ? <span style={{ color: 'var(--amber)' }}>Khách “{customer.name}” trong tab Khách hàng chưa có: <b>{missing.join(', ')}</b>.</span>
                    : <span>Tự điền từ tab Khách hàng — “{customer.name}”.</span>}
                  {!ro && can('khach-hang', 'full') && (
                    <Button size="small" type={missing.length ? 'primary' : 'link'} icon={<UserPen size={12} />} onClick={() => setCustOpen(true)}>
                      {missing.length ? 'Bổ sung thông tin khách hàng' : 'Sửa thông tin khách hàng'}</Button>
                  )}
                </div>
              )}
            </div>

            {/* Bên B — thông tin công ty */}
            <div className="party">
              <div className="b">BÊN BÁN (BÊN B): <R>{seller.name || <i className="text-ash">(chưa khai báo)</i>}</R>
                {hasRole('admin') && <Button size="small" type="link" icon={<Settings2 size={12} />} onClick={() => setSellerOpen(true)}>Sửa thông tin công ty</Button>}
              </div>
              {sellerEmpty ? <Alert type="warning" showIcon style={{ margin: '6px 0' }}
                title="Chưa khai báo thông tin công ty (Bên B)" description={hasRole('admin') ? 'Bấm "Sửa thông tin công ty" để nhập một lần, dùng cho mọi hợp đồng.' : 'Nhờ Quản lý nhập thông tin công ty.'} /> : (
                <>
                  <Row label="Địa chỉ"><R wide>{seller.address}</R></Row>
                  <Row label="Điện thoại"><R>{seller.phone}</R></Row>
                  {seller.banks.map((b) => <Row key={b} label="Tài khoản số"><R wide>{b}</R></Row>)}
                  <Row label="Mã số thuế"><R>{seller.taxCode}</R></Row>
                  <Row label="Người đại diện"><R>{seller.representative}</R><span style={{ marginLeft: 18 }}>Chức vụ: </span><R><b>{seller.title}</b></R></Row>
                </>
              )}
            </div>
            <p>Hai bên cùng thoả thuận và thống nhất ký Hợp đồng với các điều khoản sau:</p>

            <div className="b art">Điều 1: Phạm vi cung cấp, giá trị hợp đồng:</div>
            <div className="b">- Phạm vi cung cấp: <Y wide><Input.TextArea variant="borderless" autoSize={{ minRows: 1 }} disabled={ro} value={s.scope} onChange={(e) => set('scope', e.target.value)} /></Y></div>

            <div className="hdd-tblwrap">
              <table className="hdd-tbl">
                <thead>
                  <tr><th>STT</th><th>Tên hàng hóa</th><th>ĐVT</th><th>Số lượng</th><th>Khối lượng (kg)</th><th>Đơn giá</th><th>Thành tiền</th></tr>
                  <tr className="cap"><td colSpan={5}><span className="tag r">Tự điền từ đơn hàng</span></td><td><span className="tag y">KT nhập</span></td><td><span className="tag r">Tự tính</span></td></tr>
                </thead>
                <tbody>
                  {calc.ls.map((l) => (
                    <tr key={l.itemId}>
                      <td className="c auto">{l.stt}</td>
                      <td className="auto">{l.name}</td>
                      <td className="c auto">{l.unit}</td>
                      <td className="r auto">{fmtNum(l.qty)}</td>
                      <td className="r auto">{fmtNum(l.kg)}</td>
                      <td className="r yel">
                        <InputNumber<number> size="small" variant="borderless" min={0} disabled={ro} style={{ width: '100%' }}
                          value={s.prices[String(l.itemId)] ?? null} placeholder={fmtNum(l.defaultUnitPrice)}
                          formatter={numFormatter} parser={numParser}
                          onChange={(v) => set('prices', { ...s.prices, [String(l.itemId)]: v || null })} />
                      </td>
                      <td className="r auto b">{fmtNum(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={6} className="c b">TỔNG CỘNG TRƯỚC THUẾ</td><td className="r b">{fmtNum(calc.total)}</td></tr>
                  <tr><td colSpan={6} className="c b">THUẾ VAT <Y><InputNumber<number> size="small" variant="borderless" min={0} max={100} disabled={ro}
                    value={s.vatPct} onChange={(v) => set('vatPct', v ?? 0)} style={{ width: 54 }} /></Y>%</td><td className="r b">{fmtNum(calc.vat)}</td></tr>
                  <tr><td colSpan={6} className="c b">TỔNG CỘNG SAU THUẾ</td><td className="r b">{fmtNum(calc.grand)}</td></tr>
                </tfoot>
              </table>
            </div>
            <div className="prow i"><span className="pl">(Bằng chữ:</span> <R wide onReset={s.words ? () => set('words', null) : undefined}>
              <Input.TextArea variant="borderless" autoSize={{ minRows: 1 }} disabled={ro} value={s.words ?? calc.wordsAuto}
                onChange={(e) => set('words', e.target.value === calc.wordsAuto ? null : e.target.value)} /></R><span>.)</span></div>
            <div className="hint">Đơn giá để trống = lấy theo đơn hàng (KL/1 bộ × đơn giá/kg); thành tiền khi đó = tổng KL × đơn giá/kg như trên đơn.</div>

            <p>Đơn giá trên đã bao gồm:</p>
            <Y wide><Input.TextArea variant="borderless" autoSize={{ minRows: 3 }} disabled={ro} value={s.priceIncludes} onChange={(e) => set('priceIncludes', e.target.value)} /></Y>

            <div className="b art">Điều 2: Thanh toán</div>
            <div><b>2.1 Phương thức thanh toán:</b> <Y wide><Input.TextArea variant="borderless" autoSize={{ minRows: 2 }} disabled={ro} value={s.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)} /></Y></div>
            <div className="b">2.2 Tiến độ thanh toán:</div>
            {s.advances.map((a, k) => (
              <div key={k} className="adv">
                + Tạm ứng lần {k + 1}: <Y><InputNumber<number> size="small" variant="borderless" min={0} disabled={ro} value={a} style={{ width: 160 }}
                  formatter={numFormatter} parser={numParser} onChange={(v) => set('advances', s.advances.map((x, i) => (i === k ? v : x)))} /></Y> VND
                <span className="i"> (Bằng chữ: {numberWords(a || 0)}.)</span>
                {!ro && <Button type="text" size="small" danger icon={<Trash2 size={12} />} onClick={() => set('advances', s.advances.filter((_, i) => i !== k))} />}
                {k === 0 && calc.total > 0 && <span className="hint"> ≈ {fmtNum(Math.round(((a || 0) / calc.total) * 1000) / 10)}% giá trị trước thuế · hệ thống theo dõi tạm ứng lần 1</span>}
              </div>
            ))}
            {!ro && <Button size="small" type="dashed" icon={<Plus size={12} />} onClick={() => set('advances', [...s.advances, null])} style={{ margin: '4px 0 6px' }}>Thêm lần tạm ứng</Button>}
            <Y wide><Input.TextArea variant="borderless" autoSize={{ minRows: 1 }} disabled={ro} value={s.paymentRest}
              placeholder="+ Thanh toán giá trị còn lại… (mỗi dòng một ý)" onChange={(e) => set('paymentRest', e.target.value)} /></Y>
            <div className="b">2.3 Điều kiện thanh toán:</div>
            <Y wide><Input.TextArea variant="borderless" autoSize={{ minRows: 2 }} disabled={ro} value={s.conditions} onChange={(e) => set('conditions', e.target.value)} /></Y>
            <div><b>2.4 Đồng tiền thanh toán:</b> Việt Nam Đồng</div>

            <div className="b art">Điều 3: Yêu cầu kỹ thuật và bảo hành</div>
            <p>3.1 Hàng hóa mới 100%, chưa qua sử dụng, đạt tiêu chuẩn chất lượng của nhà sản xuất và TCVN.</p>
            <div>3.2 Bảo hành: Hàng hóa do bên B cấp được bảo hành trong vòng <Y><Input size="small" variant="borderless" disabled={ro} value={s.warranty} onChange={(e) => set('warranty', e.target.value)} style={{ width: 110 }} /></Y> kể từ khi hai bên giao nhận hàng hóa.</div>

            <div className="b art">Điều 4: Thời gian giao nhận và nghiệm thu hàng hoá.</div>
            <div className="prow"><span className="pl">4.1 Thời gian giao hàng:</span> <Y wide><Input size="small" variant="borderless" disabled={ro} value={s.deliveryTime} onChange={(e) => set('deliveryTime', e.target.value)} /></Y></div>
            {doc.completeBy && <div className="hint">Ngày hoàn thành đơn (Quản lý nhập khi chuyển kế toán): <b>{fmtD(doc.completeBy)}</b></div>}
            <div>4.2 Địa điểm giao hàng: <Y><Input size="small" variant="borderless" disabled={ro} value={s.deliveryPlace} onChange={(e) => set('deliveryPlace', e.target.value)} style={{ width: 260 }} /></Y></div>
            <div>4.3 Nghiệm thu: <Y><Input size="small" variant="borderless" disabled={ro} value={s.acceptancePlace} onChange={(e) => set('acceptancePlace', e.target.value)} style={{ width: 260 }} /></Y>.</div>

            <div className="fixed-note">Điều 4 (thời gian nghiệm thu) và Điều 5 – 13 (đóng gói, quyền &amp; trách nhiệm hai bên, bất khả kháng, thay đổi – tạm dừng,
              phạt, sửa đổi, tranh chấp, điều khoản khác) <b>giữ nguyên theo hợp đồng mẫu</b> — xem đầy đủ trong file Word.</div>
            <div className="sign"><b>ĐẠI DIỆN BÊN A</b><b>ĐẠI DIỆN BÊN B</b></div>
          </div>
        </div>

        <aside className="hdd-side">
          <div className="hdd-card">
            <div className="lbl">Trạng thái</div>
            <StatusTag status={doc.status} />
            {agg && <><div className="lbl" style={{ marginTop: 10 }}>Ngày hoàn thành</div><CompleteChip info={agg.complete} /></>}
          </div>
          <div className="hdd-card">
            <div className="kv"><span>Trước thuế</span><b className="num">{fmtNum(calc.total)}</b></div>
            <div className="kv"><span>VAT {fmtNum(s.vatPct)}%</span><b className="num">{fmtNum(calc.vat)}</b></div>
            <div className="kv big"><span>Sau thuế</span><b className="num">{fmtNum(calc.grand)}</b></div>
            <div className="kv"><span>Tạm ứng lần 1</span><b className="num">{fmtNum(s.advances[0] || 0)}</b></div>
            <p className="hint" style={{ marginTop: 8 }}>Khi lưu, giá trị hợp đồng = tổng trước thuế; tạm ứng theo dõi = tạm ứng lần 1.</p>
          </div>
          <div className="hdd-card">
            <div className="lbl">Các bước</div>
            <ol className="steps">
              <li className={doc.draftedAt ? 'done' : 'cur'}>Soạn thảo &amp; lưu (màn này)</li>
              <li className={['Đã gửi khách hàng', 'Đã nhận về', 'Đã hoàn thành'].includes(doc.status) ? 'done' : doc.draftedAt ? 'cur' : ''}>Tải Word, gửi khách → bấm <b>Đã gửi khách hàng</b> (báo Quản lý)</li>
              <li className={['Đã nhận về', 'Đã hoàn thành'].includes(doc.status) ? 'done' : ''}>Khách ký gửi lại → <b>Đã nhận về</b> (được phát lệnh SX)</li>
              <li className={doc.status === 'Đã hoàn thành' ? 'done' : ''}><b>Đã hoàn thành</b></li>
            </ol>
          </div>
        </aside>
      </div>

      {sellerOpen && <SellerModal seller={seller} onClose={() => setSellerOpen(false)} />}
      {custOpen && customer && <CustomerFormModal customer={customer} onClose={() => setCustOpen(false)} />}
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="prow"><span className="pl">{label}:</span> {children}</div>
}

function SellerModal({ seller, onClose }: { seller: Party; onClose: () => void }) {
  const [v, setV] = useState<Party>(seller)
  const saveSeller = useSaveSeller()
  const f = (k: keyof Party, label: string, ph?: string) => (
    <label className="sm-row"><span>{label}</span>
      <Input value={v[k] as string} placeholder={ph} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>
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
      </div>
      <p className="caption" style={{ margin: '8px 0 0' }}>Nhập một lần, dùng cho mọi hợp đồng (Bên B). Chỉ Quản lý sửa được.</p>
    </Modal>
  )
}
