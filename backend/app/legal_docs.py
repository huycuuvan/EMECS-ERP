"""Bộ hồ sơ pháp lý gửi khách kèm hợp đồng: biên bản giao nhận, chứng chỉ xuất xưởng (mẫu Word của khách,
templates/*.docx, ô {{ }} do hệ thống tự điền).

- Bảng hàng (tên, ĐVT, số lượng), Bên mua, số HĐ lấy theo bản soạn thảo hợp đồng (`contract_doc.document`).
- Người ký phía công ty lấy từ "Thông tin công ty" (giám đốc = người đại diện; quản đốc / QLSX = bên giao hàng).
- Phần riêng từng hợp đồng (ngày lập, công trình, người nhận hàng…) lưu ở Contract.draft["legal"], sửa được cả khi
  hợp đồng đã nhận về / hoàn thành (biên bản giao nhận lập sau khi giao hàng).
- Mẫu mới (vd. chứng nhận bảo hành) chỉ cần thêm file vào templates/ và 1 dòng trong FORMS.
"""
import json
import zipfile
from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import contract_doc as CD
from .db import utcnow
from .models import Contract
from .utils import VN_TZ

TEMPLATES = Path(__file__).parent / "templates"
# key → (tên hiển thị, file mẫu, tên file tải về)
FORMS = {
    "bien-ban-giao-nhan": ("Biên bản giao nhận", "bien-ban-giao-nhan.docx", "Bien-ban-giao-nhan"),
    "chung-chi-xuat-xuong": ("Chứng chỉ xuất xưởng", "chung-chi-xuat-xuong.docx", "Chung-chi-xuat-xuong"),
}
LEGAL_KEYS = ("date", "project", "giverName", "giverTitle", "giverHonorific",
              "receiverName", "receiverTitle", "receiverHonorific")
BLANK = "……………………"


def _legal(c: Contract) -> dict:
    try:
        return (json.loads(c.draft) if c.draft else {}).get("legal") or {}
    except ValueError:
        return {}


def legal_data(db: Session, c: Contract) -> dict:
    """Giá trị đang dùng cho các mẫu: phần đã lưu của hợp đồng, thiếu thì lấy mặc định (công ty / bên mua)."""
    s, saved = CD.get_seller(db), _legal(c)
    doc = CD.document(db, c)
    a = doc["buyer"]
    defaults = {
        "date": None, "project": "",
        "giverName": s["workshopRep"], "giverTitle": s["workshopTitle"], "giverHonorific": s["workshopHonorific"],
        "receiverName": a["representative"], "receiverTitle": a["title"], "receiverHonorific": "",
    }
    data = {k: saved.get(k) if saved.get(k) not in (None, "") else defaults[k] for k in LEGAL_KEYS}
    forms = [{"key": k, "title": t, "ready": (TEMPLATES / f).exists()} for k, (t, f, _) in FORMS.items()]
    return {"data": data, "forms": forms, "number": doc["number"], "buyer": a["name"], "seller": s,
            "lines": [{"stt": x["stt"], "name": x["name"], "unit": x["unit"], "qty": x["qty"]} for x in doc["lines"]]}


def save_legal(db: Session, c: Contract, body: dict) -> dict:
    d = {k: str(body.get(k) or "").strip() for k in LEGAL_KEYS if k in body}
    if d.get("date"):
        try:
            datetime.fromisoformat(d["date"])
        except ValueError:
            raise HTTPException(400, "Ngày lập không hợp lệ")
    draft = json.loads(c.draft) if c.draft else {}
    draft["legal"] = {**(draft.get("legal") or {}), **d}
    c.draft = json.dumps(draft, ensure_ascii=False)
    db.commit()
    return legal_data(db, c)


def _date_text(iso: str | None) -> str:
    if iso:
        return CD.date_text(datetime.fromisoformat(iso))
    return f"ngày …… tháng …… năm {utcnow().astimezone(VN_TZ).year}"  # để trống → ký tay ngày


def context(db: Session, c: Contract) -> dict:
    L = legal_data(db, c)
    v, s = L["data"], L["seller"]
    hon = lambda h: (h or "ông/bà").strip().lower()  # noqa: E731
    return {
        "number": L["number"], "a_name": L["buyer"], "b_name": s["name"], "project": v["project"] or BLANK,
        "place_date": f"{s['city'] or 'Hà Nội'}, {_date_text(v['date'])}", "date_text": _date_text(v["date"]),
        "giver_name": v["giverName"] or BLANK, "giver_title": v["giverTitle"] or BLANK, "giver_hon": hon(v["giverHonorific"]),
        "receiver_name": v["receiverName"] or BLANK, "receiver_title": v["receiverTitle"] or BLANK,
        "receiver_hon": hon(v["receiverHonorific"]), "receiver_sign": v["receiverName"],
        "director_name": s["representative"], "director_title": s["title"], "director_title_upper": s["title"].upper(),
        "director_hon": s["representativeHonorific"] or "Ông/Bà",
        "workshop_name": v["giverName"], "workshop_title": v["giverTitle"], "workshop_hon": v["giverHonorific"] or "Ông/Bà",
        "lines": [{**x, "qty": CD.fmt_num(x["qty"])} for x in L["lines"]],
    }


def _form(key: str) -> tuple[str, Path, str]:
    if key not in FORMS:
        raise HTTPException(404, "Không có mẫu này")
    title, file, name = FORMS[key]
    path = TEMPLATES / file
    if not path.exists():
        raise HTTPException(404, f"Chưa có file mẫu {title}")
    return title, path, name


def render(db: Session, c: Contract, key: str) -> tuple[bytes, str]:
    from docxtpl import DocxTemplate  # import muộn: chỉ cần khi xuất file

    _, path, name = _form(key)
    tpl = DocxTemplate(str(path))
    tpl.render(context(db, c), autoescape=True)
    buf = BytesIO()
    tpl.save(buf)
    return buf.getvalue(), f"{name}_{_safe(c)}.docx"


def _safe(c: Contract) -> str:
    return CD.ascii_name(c.number or c.id) or c.id


def render_pack(db: Session, c: Contract) -> tuple[bytes, str]:
    """Cả bộ hồ sơ gửi khách (.zip): hợp đồng + các mẫu đã có file."""
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        doc = CD.document(db, c)
        z.writestr(CD.docx_filename(doc), CD.render_docx(doc))
        for key, (_, file, _) in FORMS.items():
            if (TEMPLATES / file).exists():
                data, name = render(db, c, key)
                z.writestr(name, data)
    return buf.getvalue(), f"Ho-so_{_safe(c)}.zip"
