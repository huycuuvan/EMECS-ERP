"""Soạn thảo hợp đồng kinh tế theo mẫu của khách (templates/hop-dong.docx).

Trong mẫu: ô bôi VÀNG = kế toán nhập (lưu ở Contract.draft, JSON); chữ ĐỎ = hệ thống tự điền từ bước trước:
  - Số HĐ ← mã đơn hàng · Bên A ← danh mục Khách hàng · bảng hàng hóa (tên, ĐVT, số lượng, khối lượng) ← đơn hàng
  - Bên B ← Cài đặt "Thông tin công ty" (Setting "seller") · Thành tiền / tổng / VAT / bằng chữ ← tự tính.
`document(db, c)` trả về toàn bộ dữ liệu đã tính (FE hiển thị + xuất Word); `save_draft` lưu phần KT nhập
và cập nhật giá trị hợp đồng / tạm ứng; `render_docx` xuất file Word.
"""
import json
import re
from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from .config import CT_DONE, CT_DRAFTED, CT_RECEIVED, CT_WAIT
from .db import utcnow
from .models import Contract, Customer, Order, Setting
from .utils import VN_TZ

TEMPLATE = Path(__file__).parent / "templates" / "hop-dong.docx"

# ---------------------------------------------------------------- số → chữ (tiếng Việt)
_D = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
_GROUPS = ["", "nghìn", "triệu", "tỉ", "nghìn tỉ", "triệu tỉ"]


def _three(n: int, full: bool) -> str:
    """Đọc 3 chữ số; full=True khi không phải nhóm đầu (đọc cả "không trăm", "linh")."""
    h, t, u = n // 100, n // 10 % 10, n % 10
    out = []
    if h or full:
        out += [_D[h], "trăm"]
    if t == 0:
        if u and (h or full):
            out.append("linh")
    elif t == 1:
        out.append("mười")
    else:
        out += [_D[t], "mươi"]
    if u:
        if u == 1 and t >= 2:
            out.append("mốt")
        elif u == 5 and t >= 1:
            out.append("lăm")
        elif u == 4 and t >= 2:
            out.append("tư")
        else:
            out.append(_D[u])
    return " ".join(out)


def number_words(n: float | int) -> str:
    """1186827681 → "Một tỉ, một trăm tám mươi sáu triệu, tám trăm hai mươi bảy nghìn, sáu trăm tám mươi mốt đồng"."""
    n = int(round(n or 0))
    if n == 0:
        return "Không đồng"
    parts, groups = [], []
    while n:
        groups.append(n % 1000)
        n //= 1000
    for i in range(len(groups) - 1, -1, -1):
        if groups[i]:
            parts.append(f"{_three(groups[i], full=i != len(groups) - 1)} {_GROUPS[i]}".strip())
    s = ", ".join(parts) + " đồng"
    return s[0].upper() + s[1:]


# ---------------------------------------------------------------- định dạng số
def fmt_int(v: float | int | None) -> str:
    return f"{int(round(v or 0)):,}".replace(",", ".")


def fmt_num(v: float | int | None) -> str:
    v = float(v or 0)
    if v == int(v):
        return fmt_int(v)
    whole, frac = f"{v:.3f}".rstrip("0").split(".")
    return f"{fmt_int(int(whole))},{frac}"


def date_text(d: datetime | None) -> str:
    d = (d or utcnow()).astimezone(VN_TZ)
    return f"ngày {d.day:02d} tháng {d.month:02d} năm {d.year}"


# ---------------------------------------------------------------- Bên B (công ty mình)
SELLER_KEYS = ("name", "address", "phone", "banks", "taxCode", "representative", "title")


def get_seller(db: Session) -> dict:
    s = db.get(Setting, "seller")
    data = json.loads(s.value) if s and s.value else {}
    out = {k: data.get(k, [] if k == "banks" else "") for k in SELLER_KEYS}
    out["banks"] = [b for b in (out["banks"] or []) if str(b).strip()]
    return out


def set_seller(db: Session, data: dict) -> dict:
    clean = {k: data.get(k, [] if k == "banks" else "") for k in SELLER_KEYS}
    clean["banks"] = [str(b).strip() for b in (clean["banks"] or []) if str(b).strip()]
    for k in SELLER_KEYS:
        if k != "banks":
            clean[k] = str(clean[k] or "").strip()
    s = db.get(Setting, "seller") or Setting(key="seller")
    s.value = json.dumps(clean, ensure_ascii=False)
    db.add(s)
    db.commit()
    return get_seller(db)


# ---------------------------------------------------------------- mặc định cho ô vàng (lấy theo hợp đồng mẫu)
PRICE_INCLUDES = [
    "Chủng loại vật tư: sắt NSX An Khánh, Hòa Phát",
    "Độ dày lớp mạ trung bình: 85µm.",
    "Vận chuyển: Đơn giá trên không bao gồm vận chuyển. Nếu bên A thuê bên B vận chuyển, chi phí vận chuyển thỏa thuận theo thời giá.",
    "Gia công, khối lượng theo thiết kế: Đáp ứng",
    "Chủng loại Bulong: Bulong mạ điện phân.",
]
PAYMENT_METHOD = ("Bên A thanh toán tiền theo Hợp đồng này cho Bên B bằng hình thức chuyển khoản vào tài khoản của Bên B. "
                  "Trong trường hợp có sự thay đổi về phương thức thanh toán, thông tin tài khoản, Bên B phải gửi thông báo "
                  "về sự thay đổi đó cho Bên A ít nhất là 05 ngày làm việc trước ngày đến hạn thanh toán.")
CONDITIONS = ["Hóa đơn hợp pháp do Bên B phát hành.", "Biên bản giao nhận hàng hoá", "Đề nghị thanh toán"]


def _buyer_from_customer(cu: Customer | None, name: str) -> dict:
    if not cu:
        return {"name": name, "address": "", "phone": "", "banks": [], "taxCode": "", "representative": "", "title": ""}
    bank = " tại ".join(x for x in (cu.bank_account, cu.bank_name) if x)
    return {"name": cu.name, "address": cu.address or "", "phone": cu.phone or "", "banks": [bank] if bank else [],
            "taxCode": cu.tax_code or "", "representative": cu.representative or "", "title": cu.representative_title or ""}


def _defaults(c: Contract, o: Order | None) -> dict:
    by = c.deliver_by or (o.deliver_by if o else None)  # "Thời gian giao hàng: trước ngày …" = hạn giao hàng
    return {
        "number": c.number or c.order_id, "date": None, "basis": [], "buyer": None,
        "scope": "Bên B cung cấp cho Bên A các hàng hóa theo bảng dưới đây:", "prices": {},
        "vatPct": c.vat_pct if c.vat_pct is not None else 10, "words": None, "priceIncludes": PRICE_INCLUDES,
        "paymentMethod": PAYMENT_METHOD, "advances": [round((c.value or 0) * 0.3)],
        "paymentRest": ["Thanh toán giá trị còn lại trong vòng 05 ngày kể từ ngày hai bên ký biên bản giao nhận hàng hóa."],
        "conditions": CONDITIONS, "warranty": "12 tháng",
        "deliveryTime": (f"trước ngày {by.astimezone(VN_TZ):%d/%m/%Y}." if by
                         else "30-35 ngày kể từ ngày bên Mua tạm ứng đơn hàng."),
        "deliveryPlace": "tại kho bên B.", "acceptancePlace": "tại kho bên B",
    }


def _draft(c: Contract) -> dict:
    try:
        return json.loads(c.draft) if c.draft else {}
    except ValueError:
        return {}


def document(db: Session, c: Contract) -> dict:
    """Bản hợp đồng đầy đủ: phần KT đã nhập (hoặc mặc định) + dữ liệu tự điền + số tiền đã tính."""
    o = db.get(Order, c.order_id)
    cu = db.get(Customer, o.customer_id) if o and o.customer_id else None
    d = {**_defaults(c, o), **{k: v for k, v in _draft(c).items() if v is not None}}
    auto_buyer = _buyer_from_customer(cu, c.customer)
    buyer = {**auto_buyer, **(d.get("buyer") or {})}
    prices = {str(k): v for k, v in (d.get("prices") or {}).items()}

    lines = []
    for k, i in enumerate(o.items if o else [], start=1):
        default_price = round(i.kg * i.price / i.qty) if i.qty else 0
        own = prices.get(str(i.id))
        amount = round(i.qty * own) if own else round(i.kg * i.price)
        lines.append({"itemId": i.id, "stt": k, "name": i.name, "unit": i.unit, "qty": i.qty, "kg": i.kg,
                      "pricePerKg": i.price, "defaultUnitPrice": default_price, "unitPrice": own or default_price,
                      "custom": bool(own), "amount": amount})
    total = sum(x["amount"] for x in lines)
    vat_pct = float(d.get("vatPct") or 0)
    vat = round(total * vat_pct / 100)
    grand = total + vat
    advances = [int(a) for a in (d.get("advances") or []) if a]
    date = d.get("date")
    return {
        "contractId": c.id, "orderId": c.order_id, "status": c.status, "locked": c.status in (CT_RECEIVED, CT_DONE),
        "draftedAt": c.drafted_at.isoformat() if c.drafted_at else None,
        "number": d["number"], "date": date, "dateText": date_text(datetime.fromisoformat(date) if date else None),
        "basis": d["basis"], "buyer": buyer, "buyerAuto": auto_buyer, "buyerCustom": bool(d.get("buyer")),
        "customerId": cu.id if cu else None, "seller": get_seller(db), "scope": d["scope"],
        "lines": lines, "total": total, "vatPct": vat_pct, "vat": vat, "grandTotal": grand,
        "words": d.get("words") or number_words(grand), "wordsAuto": number_words(grand),
        "priceIncludes": d["priceIncludes"], "paymentMethod": d["paymentMethod"],
        "advances": [{"amount": a, "words": number_words(a)} for a in advances], "paymentRest": d["paymentRest"],
        "conditions": d["conditions"], "warranty": d["warranty"], "deliveryTime": d["deliveryTime"],
        "deliveryPlace": d["deliveryPlace"], "acceptancePlace": d["acceptancePlace"],
        "completeBy": (c.deliver_by or (o.deliver_by if o else None)).isoformat() if (c.deliver_by or (o and o.deliver_by)) else None,
    }


DRAFT_KEYS = ("number", "date", "basis", "buyer", "scope", "prices", "vatPct", "words", "priceIncludes", "paymentMethod",
              "advances", "paymentRest", "conditions", "warranty", "deliveryTime", "deliveryPlace", "acceptancePlace")


def _lines(v) -> list[str]:
    return [str(x).strip() for x in (v or []) if str(x).strip()]


def save_draft(db: Session, c: Contract, data: dict) -> dict:
    if c.status in (CT_RECEIVED, CT_DONE):
        raise HTTPException(400, "Hợp đồng đã nhận về — không sửa bản soạn thảo nữa")
    d = {k: data.get(k) for k in DRAFT_KEYS if k in data}
    for k in ("basis", "priceIncludes", "paymentRest", "conditions"):
        if k in d:
            d[k] = _lines(d[k])
    if "advances" in d:
        d["advances"] = [int(round(float(a))) for a in (d["advances"] or []) if a and float(a) > 0]
    if "prices" in d:
        d["prices"] = {str(k): float(v) for k, v in (d["prices"] or {}).items() if v not in (None, "") and float(v) > 0}
    if d.get("buyer") is not None:
        b = d["buyer"]
        d["buyer"] = {k: (_lines(b.get(k)) if k == "banks" else str(b.get(k) or "").strip())
                      for k in ("name", "address", "phone", "banks", "taxCode", "representative", "title")}
    if "number" in d and not str(d["number"] or "").strip():
        raise HTTPException(400, "Chưa nhập số hợp đồng")
    if d.get("date"):
        try:
            datetime.fromisoformat(d["date"])
        except ValueError:
            raise HTTPException(400, "Ngày hợp đồng không hợp lệ")
    c.draft = json.dumps({**_draft(c), **d}, ensure_ascii=False)
    doc = document(db, c)
    # hợp đồng = theo bản soạn thảo (giá trị trước thuế, VAT, tạm ứng lần 1)
    c.number = doc["number"].strip()
    c.value = doc["total"]
    c.vat_pct = doc["vatPct"]
    c.unit_price = round(c.value / c.total_kg) if c.total_kg else 0
    first = doc["advances"][0]["amount"] if doc["advances"] else 0
    c.advance_required = first
    c.advance_pct = round(first / c.value * 100, 1) if c.value else 0
    c.drafted_at = utcnow()
    if c.status == CT_WAIT:
        c.status = CT_DRAFTED
    db.commit()
    return document(db, c)


# ---------------------------------------------------------------- xuất Word
def render_docx(doc: dict) -> bytes:
    from docxtpl import DocxTemplate  # import muộn: chỉ cần khi xuất file

    b, a = doc["seller"], doc["buyer"]
    a_banks = [("Tài khoản: " if k == 0 else "Hoặc ") + x for k, x in enumerate(a["banks"])]
    schedule = [f"+ Tạm ứng lần {k}: {fmt_int(x['amount'])} VND (Bằng chữ: {x['words']}.)"
                for k, x in enumerate(doc["advances"], start=1)] + [f"+ {x}" for x in doc["paymentRest"]]
    ctx = {
        "number": doc["number"], "basis": doc["basis"], "date_text": doc["dateText"],
        "a": {"name": a["name"], "address": a["address"], "phone": a["phone"], "tax_code": a["taxCode"],
              "representative": a["representative"], "title": a["title"]},
        "a_banks": a_banks,
        "b": {"name": b["name"], "address": b["address"], "phone": b["phone"], "tax_code": b["taxCode"],
              "representative": b["representative"], "title": b["title"]},
        "b_banks": b["banks"],
        "scope": doc["scope"],
        "lines": [{"stt": x["stt"], "name": x["name"], "unit": x["unit"], "qty": fmt_num(x["qty"]),
                   "kg": fmt_num(x["kg"]), "unit_price": fmt_int(x["unitPrice"]), "amount": fmt_int(x["amount"])}
                  for x in doc["lines"]],
        "total": fmt_int(doc["total"]), "vat_pct": fmt_num(doc["vatPct"]), "vat": fmt_int(doc["vat"]),
        "grand_total": fmt_int(doc["grandTotal"]), "words": doc["words"],
        "price_includes": doc["priceIncludes"], "payment_method": doc["paymentMethod"], "schedule": schedule,
        "conditions": doc["conditions"], "warranty": doc["warranty"], "delivery_time": doc["deliveryTime"],
        "delivery_place": doc["deliveryPlace"], "acceptance_place": doc["acceptancePlace"],
    }
    tpl = DocxTemplate(str(TEMPLATE))
    tpl.render(ctx, autoescape=True)
    buf = BytesIO()
    tpl.save(buf)
    return buf.getvalue()


def docx_filename(doc: dict) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", doc["number"]).strip("-") or doc["contractId"]
    return f"Hop-dong_{safe}.docx"
