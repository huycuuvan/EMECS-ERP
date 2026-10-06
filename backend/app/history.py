"""Lịch sử chỉnh sửa từng trường (bảng field_changes).

- `apply_changes`: so sánh rồi gán từng giá trị mới vào bản ghi ORM, mỗi trường thực sự đổi ghi 1 dòng FieldChange.
- `record_diff` / `track`: so 2 ảnh chụp (dict) trước–sau một thao tác sẵn có (vd PATCH đơn hàng / hợp đồng).
Người sửa lấy từ security.current_user_var (người đang đăng nhập).
"""
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .db import utcnow
from .models import FieldChange
from .security import current_user_var
from .utils import iso

ENTITY_TYPES = ("dh", "hd", "lsx", "ptn", "pc", "vc", "sl")


def fmt_value(v: Any) -> str | None:
    """Giá trị → chuỗi lưu trong lịch sử (số không kèm .0, ngày dạng ISO UTC)."""
    if v is None:
        return None
    if isinstance(v, bool):
        return "Có" if v else "Không"
    if isinstance(v, float):
        return str(int(v)) if v == int(v) else f"{v:g}"
    if isinstance(v, datetime):
        return iso((v if v.tzinfo else v.replace(tzinfo=timezone.utc)).astimezone(timezone.utc))
    return str(v)


def same_value(a: Any, b: Any) -> bool:
    if isinstance(a, (int, float)) and isinstance(b, (int, float)) and not isinstance(a, bool):
        return abs(float(a) - float(b)) < 1e-9
    return fmt_value(a) == fmt_value(b)


def add_change(db: Session, entity_type: str, entity_id: str, field: str, old: Any, new: Any,
               reason: str | None = "") -> FieldChange:
    u = current_user_var.get()
    fc = FieldChange(at=utcnow(), entity_type=entity_type, entity_id=entity_id, field=field,
                     old_value=fmt_value(old), new_value=fmt_value(new),
                     user_id=getattr(u, "id", None), user_name=getattr(u, "name", None) or "Hệ thống",
                     reason=(reason or "").strip())
    db.add(fc)
    return fc


def apply_changes(db: Session, obj: Any, entity_type: str, entity_id: str, changes: dict[str, tuple[str, Any]],
                  reason: str | None = "") -> list[str]:
    """changes = {tên trường API: (thuộc tính ORM, giá trị mới)}. Gán giá trị + ghi lịch sử cho trường đổi.
    Trả về danh sách tên trường đã đổi (chưa commit)."""
    changed = []
    for field, (attr, new) in changes.items():
        old = getattr(obj, attr)
        if same_value(old, new):
            continue
        setattr(obj, attr, new)
        add_change(db, entity_type, entity_id, field, old, new, reason)
        changed.append(field)
    return changed


def record_diff(db: Session, entity_type: str, entity_id: str, before: dict, after: dict,
                reason: str | None = "") -> list[str]:
    changed = []
    for k in dict.fromkeys([*before, *after]):
        if not same_value(before.get(k), after.get(k)):
            add_change(db, entity_type, entity_id, k, before.get(k), after.get(k), reason)
            changed.append(k)
    return changed


@contextmanager
def track(db: Session, entity_type: str, entity_id: str, snapshot: Callable[[], dict],
          reason: str | None = "") -> Iterator[None]:
    """Bọc một thao tác cập nhật sẵn có: chụp trước → chạy → chụp sau → ghi các trường đổi rồi commit."""
    before = snapshot()
    yield
    if record_diff(db, entity_type, entity_id, before, snapshot(), reason):
        db.commit()


def list_history(db: Session, entity_type: str, entity_id: str) -> list[dict]:
    q = (select(FieldChange).where(FieldChange.entity_type == entity_type, FieldChange.entity_id == entity_id)
         .order_by(FieldChange.at.desc(), FieldChange.id.desc()))
    return [{"id": f.id, "at": iso(f.at), "entityType": f.entity_type, "entityId": f.entity_id, "field": f.field,
             "oldValue": f.old_value, "newValue": f.new_value, "userId": f.user_id, "userName": f.user_name,
             "reason": f.reason} for f in db.scalars(q)]


# ---------------------------------------------------------------- ảnh chụp để so trước–sau
def order_snapshot(o) -> dict:
    items = "; ".join(f"{i.name}: {i.qty:g} {i.unit}" + (f" × {i.kg_per_unit:g} kg/{i.unit}" if i.kg_per_unit else "")
                      + f" · {i.kg:g} kg · {i.price:g} đ/kg" + (f" ({i.note})" if i.note else "") for i in o.items)
    return {"customer": o.customer, "code": o.code, "file": o.file, "note": o.note, "items": items,
            "totalKg": o.total_kg, "value": o.value, "vatPct": o.vat_pct}


def contract_snapshot(c) -> dict:
    return {"owner": c.owner, "note": c.note, "completeBy": c.complete_by, "deliverBy": c.deliver_by, "signedFile": c.signed_file, "unitPrice": c.unit_price, "value": c.value,
            "advancePct": c.advance_pct, "advanceRequired": c.advance_required}
