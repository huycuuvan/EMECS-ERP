/* Bản in biên bản (tương đương printDoc của ERPPeek): mở cửa sổ mới chứa chứng từ dạng giấy + ô ký 2 bên, rồi gọi print(). */
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

export function printDoc(opts: { title: string; id: string; docSub?: string; pairs: [string, string][]; signL: string; signR: string }) {
  const w = window.open('', '_blank', 'width=820,height=900')
  if (!w) return false
  const rows = opts.pairs.filter(([, v]) => v !== '' && v != null).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')
  w.document.write(`<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(opts.title)} ${esc(opts.id)}</title>
<style>
  body{font-family:'Times New Roman',serif;color:#17181c;margin:40px 56px;font-size:15px}
  .co{display:flex;justify-content:space-between;font-size:13px;border-bottom:1.5px solid #17181c;padding-bottom:8px}
  .co b{letter-spacing:.06em}
  h1{text-align:center;font-size:21px;margin:28px 0 4px;letter-spacing:.04em}
  .sub{text-align:center;font-style:italic;margin-bottom:22px;font-size:13.5px}
  table{width:100%;border-collapse:collapse}
  td{border:1px solid #b5b7bd;padding:8px 12px;vertical-align:top}
  td:first-child{width:34%;background:#f6f6f5;font-weight:600}
  .note{margin-top:18px;font-size:12.5px;font-style:italic;color:#555}
  .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:36px;text-align:center}
  .sign i{display:block;font-size:12.5px;margin-top:2px}
  .sp{height:90px}
  @media print{body{margin:16mm}}
</style></head><body>
<div class="co"><div><b>CÔNG TY TNHH EMECS VIỆT NAM</b><br>Cơ khí kết cấu thép</div><div style="text-align:right">Ngày in: ${esc(new Date().toLocaleString('vi-VN'))}</div></div>
<h1>${esc(opts.title)}</h1>
<div class="sub">Số: ${esc(opts.id)}${opts.docSub ? ' · ' + esc(opts.docSub) : ''}</div>
<table>${rows}</table>
<div class="note">Chứng từ khởi tạo từ hệ thống ERP EMECS Việt Nam — chuỗi đối ứng: Sản xuất → Cân xuất → Gửi mạ → Nhận mạ → Giao khách.</div>
<div class="sign"><div><b>${esc(opts.signL)}</b><i>(Ký, ghi rõ họ tên)</i><div class="sp"></div></div><div><b>${esc(opts.signR)}</b><i>(Ký, ghi rõ họ tên)</i><div class="sp"></div></div></div>
<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>
</body></html>`)
  w.document.close()
  return true
}
