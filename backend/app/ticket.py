"""Ảnh phiếu demo — mô phỏng ảnh chụp tờ phiếu giấy viết tay (port từ ticketImg của bản demo)."""
import re
from urllib.parse import quote

HW = "'Segoe Script','Bradley Hand','Savoye LET','Comic Sans MS',cursive"
PR = "'Helvetica Neue',Arial,sans-serif"


def _esc(s: str) -> str:
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def ticket_img(label: str, sub: str = "") -> str:
    big = (re.split(r"[·—-]", sub)[0].strip() or sub) if sub else ""
    rest = re.sub(r"^[\s·—-]+", "", sub[len(big):]) if sub else ""
    label, big, rest = _esc(label), _esc(big), _esc(rest or "hàng đủ, bạt phủ kín")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="470" viewBox="0 0 640 470">'
        '<defs>'
        '<filter id="ds" x="-10%" y="-10%" width="130%" height="130%"><feDropShadow dx="0" dy="7" stdDeviation="9" flood-color="#000" flood-opacity="0.38"/></filter>'
        '<linearGradient id="pp" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbf8f0"/><stop offset="0.55" stop-color="#f6f1e4"/><stop offset="1" stop-color="#efe8d6"/></linearGradient>'
        '</defs>'
        '<rect width="640" height="470" fill="#6e6a5e"/>'
        '<g transform="rotate(-1.8 320 235)">'
        '<rect x="42" y="26" width="556" height="416" fill="url(#pp)" stroke="#d6cdb4" filter="url(#ds)"/>'
        '<ellipse cx="140" cy="380" rx="60" ry="16" fill="#d8cba6" opacity="0.25"/>'
        f'<rect x="66" y="44" width="34" height="34" fill="#14130f"/><text x="83" y="67" font-family="{PR}" font-size="15" font-weight="bold" fill="#f5f1e8" text-anchor="middle">ST</text>'
        f'<text x="110" y="56" font-family="{PR}" font-size="11" font-weight="bold" fill="#2b2b28" letter-spacing="0.5">CÔNG TY CP CƠ KHÍ KẾT CẤU THÉP STEEL ONE</text>'
        f'<text x="110" y="71" font-family="{PR}" font-size="8.5" fill="#6b665b">KCN Quang Minh, Mê Linh, Hà Nội · ĐT: 024 3812 6xxx</text>'
        '<line x1="66" y1="86" x2="574" y2="86" stroke="#2b2b28" stroke-width="1.6"/>'
        '<line x1="66" y1="89" x2="574" y2="89" stroke="#2b2b28" stroke-width="0.6"/>'
        f'<text x="320" y="116" font-family="{PR}" font-size="20" font-weight="bold" fill="#1c1c1a" text-anchor="middle" letter-spacing="4">PHIẾU CÂN XE</text>'
        f'<text x="320" y="133" font-family="{PR}" font-size="9.5" fill="#6b665b" text-anchor="middle">Số: {label} · Liên 2: Lưu kho</text>'
        f'<text x="72" y="165" font-family="{PR}" font-size="10.5" fill="#3a3a36">Biển số xe:</text>'
        '<line x1="140" y1="168" x2="330" y2="168" stroke="#9a937f" stroke-width="0.7" stroke-dasharray="2,2"/>'
        f'<text x="160" y="164" font-family="{HW}" font-size="15" fill="#1d3d8f">29H - 123.45</text>'
        f'<text x="352" y="165" font-family="{PR}" font-size="10.5" fill="#3a3a36">Hàng:</text>'
        '<line x1="390" y1="168" x2="568" y2="168" stroke="#9a937f" stroke-width="0.7" stroke-dasharray="2,2"/>'
        f'<text x="398" y="163" font-family="{HW}" font-size="13" fill="#1d3d8f">Cấu kiện thép mạ kẽm</text>'
        f'<text x="72" y="207" font-family="{PR}" font-size="10.5" fill="#3a3a36">Khối lượng cân được:</text>'
        '<line x1="196" y1="212" x2="440" y2="212" stroke="#9a937f" stroke-width="0.7" stroke-dasharray="2,2"/>'
        f'<text x="215" y="207" font-family="{HW}" font-size="27" font-weight="bold" fill="#16337d" transform="rotate(-1 215 207)">{big}</text>'
        '<path d="M212 214 q60 5 120 1 t105 -2" stroke="#16337d" stroke-width="1.1" fill="none" opacity="0.75"/>'
        f'<text x="72" y="245" font-family="{PR}" font-size="10.5" fill="#3a3a36">Ghi chú:</text>'
        '<line x1="122" y1="248" x2="568" y2="248" stroke="#9a937f" stroke-width="0.7" stroke-dasharray="2,2"/>'
        f'<text x="132" y="243" font-family="{HW}" font-size="12.5" fill="#1d3d8f">{rest}</text>'
        '<line x1="66" y1="272" x2="574" y2="272" stroke="#c9c1a9" stroke-width="0.8"/>'
        f'<text x="140" y="292" font-family="{PR}" font-size="9.5" font-weight="bold" fill="#3a3a36" text-anchor="middle" letter-spacing="1">BỐC XẾP</text>'
        f'<text x="320" y="292" font-family="{PR}" font-size="9.5" font-weight="bold" fill="#3a3a36" text-anchor="middle" letter-spacing="1">THỦ KHO</text>'
        f'<text x="500" y="292" font-family="{PR}" font-size="9.5" font-weight="bold" fill="#3a3a36" text-anchor="middle" letter-spacing="1">LÁI XE</text>'
        '<path d="M100 348 c10 -22 18 8 28 -14 c8 -16 14 10 24 -6 c9 -13 20 6 32 -8" stroke="#1d3d8f" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.9"/>'
        '<path d="M282 346 c6 -18 14 -2 20 -16 c7 -14 12 12 22 -4 q10 -14 20 2 c6 8 14 -6 22 -2" stroke="#16337d" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.92"/>'
        '<path d="M462 350 c8 -20 16 4 26 -12 c8 -13 16 8 26 -6 c8 -11 18 4 28 -10" stroke="#24449a" stroke-width="1.7" fill="none" stroke-linecap="round" opacity="0.9"/>'
        f'<text x="140" y="372" font-family="{HW}" font-size="11" fill="#1d3d8f" text-anchor="middle">Tổ bốc xếp 1</text>'
        f'<text x="320" y="372" font-family="{HW}" font-size="11" fill="#16337d" text-anchor="middle">Ngô Minh Kho</text>'
        f'<text x="500" y="372" font-family="{HW}" font-size="11" fill="#24449a" text-anchor="middle">P.V.Tài</text>'
        '<g transform="rotate(-12 355 330)" opacity="0.72">'
        '<circle cx="355" cy="330" r="42" fill="none" stroke="#c22f2f" stroke-width="2.4"/>'
        '<circle cx="355" cy="330" r="31" fill="none" stroke="#c22f2f" stroke-width="1.1"/>'
        f'<text x="355" y="322" font-family="{PR}" font-size="8.5" font-weight="bold" fill="#c22f2f" text-anchor="middle" letter-spacing="1.5">STEEL ONE</text>'
        f'<text x="355" y="350" font-family="{PR}" font-size="6.5" fill="#c22f2f" text-anchor="middle" letter-spacing="0.5">TRẠM CÂN NHÀ MÁY</text>'
        '</g>'
        f'<text x="72" y="422" font-family="{PR}" font-size="8" fill="#8a8474">Ngày in phiếu tự động từ trạm cân 80T · Mọi tẩy xóa phải có chữ ký xác nhận</text>'
        '<path d="M598 442 L566 442 L598 410 Z" fill="#e3dbc4"/>'
        '</g></svg>'
    )
    return "data:image/svg+xml;charset=utf-8," + quote(svg)
