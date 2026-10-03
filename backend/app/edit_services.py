"""Sửa chứng từ CÓ LƯU LỊCH SỬ + giao lại thẻ bị từ chối / phát lại lệnh SX bị từ chối.

Quy tắc chung:
- Mỗi trường thực sự đổi ghi 1 dòng FieldChange (ai, lúc nào, cũ → mới, lý do) — xem history.py.
- Đổi số kg / số lượng bắt buộc có lý do sửa.
- Sửa số cân → chạy lại quy tắc dung sai (giống fill_weighing / task_fill_galv / task_fill_delivery):
  vượt dung sai mà chưa có biên bản chờ ký → lập biên bản mới; đã có biên bản chờ ký → cập nhật số trên biên bản;
  về lại trong dung sai mà còn biên bản chờ ký → GIỮ biên bản, ghi thêm vào diễn giải (không tự xóa).
"""
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import services as svc
from .config import DRIVERS, REASONS_CAN, TOLERANCE_KG
from .db import utcnow
from .history import add_change, apply_changes, same_value
from .models import Lsx, Mismatch, Receipt, Task, User, Weighing
from .security import actor
from .utils import VN_TZ, add_days, fmt_d, fmt_kg, fmt_num

OTHER = "Khác (ghi rõ)"
PENDING = "Chờ QL ký"


# ---------------------------------------------------------------- tiện ích
def _would_change(obj: Any, ch: dict[str, tuple[str, Any]]) -> list[str]:
    return [f for f, (attr, v) in ch.items() if not same_value(getattr(obj, attr), v)]


def _require_reason(reason: str, fields: list[str], numeric: set[str]) -> None:
    if set(fields) & numeric and not reason:
        raise HTTPException(400, "Sửa số kg / số lượng bắt buộc nhập lý do sửa")


def _outcome(changed: list[str], message: str, action: str | None = None, mismatch_id: str | None = None) -> dict:
    return {"changed": changed, "mismatchAction": action, "mismatchId": mismatch_id, "message": message}


def _pending_mismatch(db: Session, rec: Weighing | Task) -> Mismatch | None:
    m = db.get(Mismatch, rec.mismatch_id) if rec.mismatch_id else None
    return m if m and m.status == PENDING else None


def driver_names(db: Session) -> list[str]:
    names = [u.name for u in db.scalars(select(User).where(User.active.is_(True))) if "lx" in u.role_list]
    return names or DRIVERS


def _check_driver(db: Session, driver: str) -> None:
    if driver not in driver_names(db):
        raise HTTPException(400, f"Không có lái xe '{driver}' trong danh sách tài xế đang hoạt động")


def _reconcile(db: Session, rec: Weighing | Task, etype: str, out: bool, source: str, expected: float,
               actual: float, mreason: str | None, rnote: str | None, reported_by: str, dept: str,
               reason: str) -> tuple[str | None, str | None, str]:
    """Chạy lại quy tắc dung sai sau khi sửa số cân → (hành động, mã biên bản, thông điệp)."""
    pending = _pending_mismatch(db, rec)
    delta = actual - expected
    if out and not pending:
        if mreason and mreason not in REASONS_CAN:
            raise HTTPException(400, "Lý do sai lệch phải chọn trong danh mục")
        m = svc.create_mismatch(db, source, etype, rec.id, rec.contract_id, expected, actual, mreason or OTHER,
                                rnote or f"Lập khi sửa số cân: {reason}", reported_by, dept)
        add_change(db, etype, rec.id, "mismatchId", rec.mismatch_id, m.id, reason)
        rec.mismatch_id = m.id
        db.flush()  # session autoflush=False → flush để db.get thấy biên bản mới
        sign = "+" if delta > 0 else "−"
        return "created", m.id, f"LỆCH {sign}{fmt_num(abs(delta))} kg vượt dung sai — đã lập biên bản {m.id} chờ Quản lý ký"
    if out and pending:
        ch = apply_changes(db, pending, "sl", pending.id, {
            "expected": ("expected", expected), "actual": ("actual", actual), "delta": ("delta", delta)}, reason)
        return ("updated" if ch else None), pending.id, \
            f"Vẫn lệch vượt dung sai — đã cập nhật số trên biên bản {pending.id} (chờ Quản lý ký)"
    if not out and pending:
        stamp = utcnow().astimezone(VN_TZ).strftime("%d/%m/%Y %H:%M")
        line = (f"[{stamp} · {actor()}] Số cân đã sửa về trong dung sai: {fmt_kg(expected)} → {fmt_kg(actual)}"
                + (f" — {reason}" if reason else ""))
        note = f"{pending.reason_note}\n{line}" if pending.reason_note else line
        apply_changes(db, pending, "sl", pending.id, {"reasonNote": ("reason_note", note)}, reason)
        return "noted", pending.id, \
            f"Số cân đã về trong dung sai — biên bản {pending.id} vẫn chờ Quản lý ký (đã ghi chú việc sửa số)"
    return None, rec.mismatch_id, "Số cân trong dung sai"


# ---------------------------------------------------------------- phiếu cân
def edit_weighing(db: Session, pid: str, data: dict) -> tuple[Weighing, dict]:
    p = svc.get_or_404(db, Weighing, pid)
    reason = (data.get("reason") or "").strip()
    ch: dict[str, tuple[str, Any]] = {}
    if data.get("kg_expected") is not None:
        ch["kgExpected"] = ("kg_expected", float(data["kg_expected"]))
    if data.get("kg_actual") is not None:
        ch["kgActual"] = ("kg_actual", float(data["kg_actual"]))
    sg = data.get("signers") or {}
    for key, field, attr in (("boc_xep", "bocXep", "signer_boc_xep"), ("kho", "kho", "signer_kho"),
                             ("lai_xe", "laiXe", "signer_lai_xe")):
        if sg.get(key) is not None:
            ch[f"signers.{field}"] = (attr, sg[key].strip())
    fields = _would_change(p, ch)
    if not fields:
        return p, _outcome([], "Không có thay đổi")
    kg_fields = {"kgExpected", "kgActual"}
    _require_reason(reason, fields, kg_fields)
    if "kgActual" in fields and p.kg_actual is None:
        raise HTTPException(400, "Phiếu chưa cân — dùng chức năng Nhập kết quả cân")
    if set(fields) & kg_fields and p.loss_accepted:
        raise HTTPException(400, f"{pid} đã chuyển phần lệch vào kho ảo — không sửa số cân được")
    changed = apply_changes(db, p, "pc", p.id, ch, reason)

    action, mid, msg = None, p.mismatch_id, ""
    if set(changed) & kg_fields and p.kg_actual is not None:
        out = abs(p.kg_actual - p.kg_expected) > TOLERANCE_KG
        action, mid, msg = _reconcile(db, p, "pc", out, "Trạm cân công ty", p.kg_expected, p.kg_actual,
                                      data.get("mismatch_reason"), data.get("reason_note"), actor(svc.KHO), "Kho",
                                      reason)
        status = "Lệch — chờ ký" if _pending_mismatch(db, p) else "Đã cân"
        apply_changes(db, p, "pc", p.id, {"status": ("status", status)}, reason)
    db.commit()
    return p, _outcome(changed, f"Đã lưu {p.id}" + (f" — {msg}" if msg else ""), action, mid)


# ---------------------------------------------------------------- phiếu chuẩn bị hàng
def edit_receipt(db: Session, rid: str, data: dict) -> tuple[Receipt, dict]:
    r = svc.get_or_404(db, Receipt, rid)
    reason = (data.get("reason") or "").strip()
    ch: dict[str, tuple[str, Any]] = {}
    if data.get("qty") is not None:
        ch["qty"] = ("qty", float(data["qty"]))
    if data.get("kg") is not None:
        ch["kg"] = ("kg", float(data["kg"]))
    if data.get("note") is not None:
        ch["note"] = ("note", data["note"].strip())
    fields = _would_change(r, ch)
    if not fields:
        return r, _outcome([], "Không có thay đổi")
    _require_reason(reason, fields, {"qty", "kg"})
    changed = apply_changes(db, r, "ptn", r.id, ch, reason)
    db.commit()
    return r, _outcome(changed, f"Đã lưu {r.id}")


# ---------------------------------------------------------------- thẻ lái xe
BEFORE_DEPART = ("Chờ xác nhận", "Từ chối", "Đã nhận")


def edit_task(db: Session, tid: str, data: dict) -> tuple[Task, dict]:
    t = svc.get_or_404(db, Task, tid)
    reason = (data.get("reason") or "").strip()
    basic: dict[str, tuple[str, Any]] = {}
    if data.get("driver") is not None:
        basic["driver"] = ("driver", data["driver"].strip())
    if data.get("kg_required") is not None:
        basic["kgRequired"] = ("kg_required", float(data["kg_required"]))
    if data.get("ref_id") is not None:
        basic["refId"] = ("ref_id", data["ref_id"].strip() or None)
    if data.get("note") is not None:
        basic["note"] = ("note", data["note"].strip())
    fix: dict[str, tuple[str, Any]] = {}
    for key, field in (("kg_at_galv", "kgAtGalv"), ("kg_picked", "kgPicked"), ("kg_delivered", "kgDelivered")):
        if data.get(key) is not None:
            fix[field] = (key, float(data[key]))

    basic_f, fix_f = _would_change(t, basic), _would_change(t, fix)
    if not basic_f and not fix_f:
        return t, _outcome([], "Không có thay đổi")
    _require_reason(reason, basic_f + fix_f, {"kgRequired", "kgAtGalv", "kgPicked", "kgDelivered"})
    if basic_f and t.status not in BEFORE_DEPART:
        raise HTTPException(400, "Chỉ sửa tài xế / KG yêu cầu / chứng từ gốc / ghi chú khi thẻ chưa xuất phát "
                                 f"(thẻ đang {t.status})")
    if "driver" in basic_f:
        _check_driver(db, basic["driver"][1])
    if fix_f:
        if t.type == "di_ma" and set(fix_f) - {"kgAtGalv"} or t.type == "giao_khach" and "kgAtGalv" in fix_f:
            raise HTTPException(400, "Trường số cân không đúng loại thẻ (đi mạ: số cân mạ · giao khách: kg ký mạ / kg khách ký)")
        if t.filled_at is None:
            raise HTTPException(400, "Thẻ chưa điền số cân — chưa có gì để sửa")
        if t.loss_accepted:
            raise HTTPException(400, f"{tid} đã chuyển phần lệch vào kho ảo — không sửa số cân được")

    changed = apply_changes(db, t, "vc", t.id, {**basic, **fix}, reason)
    if "driver" in changed:
        # đổi tài xế → người mới phải xác nhận lại
        changed += apply_changes(db, t, "vc", t.id, {"status": ("status", "Chờ xác nhận"),
                                                     "acceptedAt": ("accepted_at", None),
                                                     "rejectReason": ("reject_reason", None)}, reason)
        svc.notify(db, f"Thẻ {t.id} đổi tài xế", f"Gán {t.driver} — chờ xác nhận", "info")

    action, mid, msg = None, t.mismatch_id, ""
    if set(changed) & {"kgAtGalv", "kgPicked", "kgDelivered"}:
        if t.type == "di_ma":
            out = abs((t.kg_at_galv or 0) - t.kg_required) > TOLERANCE_KG
            action, mid, msg = _reconcile(db, t, "vc", out, "Cân tại xưởng mạ", t.kg_required, t.kg_at_galv or 0,
                                          data.get("mismatch_reason"), data.get("reason_note"), t.driver, "Vận tải",
                                          reason)
        else:
            picked, delivered = t.kg_picked or 0, t.kg_delivered or 0
            delta = delivered - picked
            out = abs(delta) > 0.5 or abs(picked - t.kg_required) > TOLERANCE_KG
            exp, act = (picked, delivered) if abs(delta) > 0.5 else (t.kg_required, picked)
            action, mid, msg = _reconcile(db, t, "vc", out, "Giao khách", exp, act, data.get("mismatch_reason"),
                                          data.get("reason_note"), t.driver, "Vận tải", reason)
    db.commit()
    return t, _outcome(changed, f"Đã lưu {t.id}" + (f" — {msg}" if msg else ""), action, mid)


def reassign_task(db: Session, tid: str, driver: str, kg_required: float | None, note: str | None) -> tuple[Task, dict]:
    t = svc.get_or_404(db, Task, tid)
    if t.status not in ("Từ chối", "Chờ xác nhận"):
        raise HTTPException(400, f"Chỉ giao lại thẻ đang Từ chối / Chờ xác nhận (thẻ đang {t.status})")
    driver = (driver or "").strip()
    _check_driver(db, driver)
    note = (note or "").strip()
    reason = note or (f"Giao lại sau khi bị từ chối: {t.reject_reason}" if t.reject_reason else "Giao lại thẻ")
    ch: dict[str, tuple[str, Any]] = {
        "driver": ("driver", driver), "status": ("status", "Chờ xác nhận"), "assignedAt": ("assigned_at", utcnow()),
        "acceptedAt": ("accepted_at", None), "rejectReason": ("reject_reason", None)}
    if kg_required:
        ch["kgRequired"] = ("kg_required", float(kg_required))
    changed = apply_changes(db, t, "vc", t.id, ch, reason)
    svc.notify(db, f"Giao lại thẻ {t.id} cho {t.driver}",
               f"{fmt_kg(t.kg_required)} — chờ tài xế xác nhận" + (f" · {note}" if note else ""), "info")
    db.commit()
    return t, _outcome(changed, f"Đã giao lại {t.id} cho {t.driver} — chờ xác nhận")


# ---------------------------------------------------------------- sai lệch
def edit_mismatch(db: Session, mid: str, data: dict, user: User) -> tuple[Mismatch, dict]:
    m = svc.get_or_404(db, Mismatch, mid)
    if m.status != PENDING:
        raise HTTPException(400, f"Biên bản {mid} đã ký xác nhận — không sửa được")
    roles = set(user.role_list)
    if not roles & {"admin", "kho"} and m.reported_by != user.name:
        raise HTTPException(403, "Lái xe chỉ sửa được biên bản do mình báo")
    ch: dict[str, tuple[str, Any]] = {}
    if data.get("reason") is not None:
        if data["reason"] not in REASONS_CAN:
            raise HTTPException(400, "Lý do sai lệch phải chọn trong danh mục")
        ch["reason"] = ("reason", data["reason"])
    if data.get("reason_note") is not None:
        ch["reasonNote"] = ("reason_note", data["reason_note"].strip())
    new_reason = ch.get("reason", (None, m.reason))[1]
    new_note = ch.get("reasonNote", (None, m.reason_note))[1]
    if new_reason == OTHER and not new_note:
        raise HTTPException(400, 'Chọn "Khác (ghi rõ)" thì bắt buộc diễn giải')
    changed = apply_changes(db, m, "sl", m.id, ch, (data.get("edit_note") or "").strip())
    db.commit()
    return m, _outcome(changed, f"Đã lưu {m.id}" if changed else "Không có thay đổi")


# ---------------------------------------------------------------- lệnh sản xuất
LSX_LABEL = {"name": "tên lệnh", "qtyPlan": "SL kế hoạch", "kgPlan": "KL kế hoạch", "leadDays": "tiến độ (ngày)",
             "deadline": "hạn hoàn thành"}


def _lsx_val(field: str, v: Any) -> str:
    if isinstance(v, datetime):
        return fmt_d(v)
    if field == "kgPlan":
        return fmt_kg(v)
    return fmt_num(v) if isinstance(v, (int, float)) else str(v)


def _lsx_status(db: Session, x: Lsx, reason: str) -> list[str]:
    st = x.status
    if st == "Hoàn thành" and x.kg_done < x.kg_plan - 0.5:
        st = "Đang SX"
    elif st == "Đang SX" and x.kg_plan and x.kg_done >= x.kg_plan - 0.5:
        st = "Hoàn thành"
    return apply_changes(db, x, "lsx", x.id, {"status": ("status", st)}, reason)


def edit_lsx(db: Session, lid: str, data: dict) -> tuple[Lsx, dict]:
    x = svc.get_or_404(db, Lsx, lid)
    reason = (data.get("reason") or "").strip()
    ch: dict[str, tuple[str, Any]] = {}
    if data.get("name") is not None:
        if not data["name"].strip():
            raise HTTPException(400, "Tên lệnh không được để trống")
        ch["name"] = ("name", data["name"].strip())
    if data.get("qty_plan") is not None:
        if data["qty_plan"] < (x.qty_done or 0):
            raise HTTPException(400, f"SL kế hoạch không được nhỏ hơn số đã hoàn thành ({fmt_num(x.qty_done)} SP)")
        ch["qtyPlan"] = ("qty_plan", float(data["qty_plan"]))
    if data.get("kg_plan") is not None:
        if data["kg_plan"] < (x.kg_done or 0):
            raise HTTPException(400, f"KL kế hoạch không được nhỏ hơn số đã hoàn thành ({fmt_kg(x.kg_done)})")
        ch["kgPlan"] = ("kg_plan", float(data["kg_plan"]))
    if data.get("lead_days") is not None:
        ch["leadDays"] = ("lead_days", int(data["lead_days"]))
    if data.get("deadline") is not None:
        ch["deadline"] = ("deadline", data["deadline"])
    elif "leadDays" in ch and ch["leadDays"][1] != x.lead_days:  # đổi tiến độ mà không chọn hạn → hạn = ngày phát + số ngày
        ch["deadline"] = ("deadline", add_days(x.assigned_at, ch["leadDays"][1]))
    fields = _would_change(x, ch)
    if not fields:
        return x, _outcome([], "Không có thay đổi")
    _require_reason(reason, fields, {"qtyPlan", "kgPlan"})
    desc = ", ".join(f"{LSX_LABEL[f]} {_lsx_val(f, getattr(x, ch[f][0]))} → {_lsx_val(f, ch[f][1])}" for f in fields)
    changed = apply_changes(db, x, "lsx", x.id, ch, reason)
    changed += _lsx_status(db, x, reason)
    svc._log(x, f"{actor(svc.QL)} sửa lệnh: {desc}" + (f" — {reason}" if reason else ""))
    db.commit()
    return x, _outcome(changed, f"Đã lưu {x.id}")


def reissue_lsx(db: Session, lid: str, data: dict) -> tuple[Lsx, dict]:
    x = svc.get_or_404(db, Lsx, lid)
    if x.status != "Từ chối":
        raise HTTPException(400, f"Chỉ phát lại lệnh đang bị Từ chối (lệnh đang {x.status})")
    note = (data.get("note") or "").strip()
    reason = note or f"Phát lại sau khi xưởng từ chối: {x.reject_reason or '—'}"
    lead = int(data.get("lead_days") or x.lead_days or 7)
    now = utcnow()
    ch: dict[str, tuple[str, Any]] = {
        "status": ("status", "Chờ nhận"), "assignedAt": ("assigned_at", now), "assignedBy": ("assigned_by", actor(svc.QL)),
        "leadDays": ("lead_days", lead), "deadline": ("deadline", add_days(now, lead)),
        "rejectReason": ("reject_reason", None), "acceptedAt": ("accepted_at", None), "acceptedBy": ("accepted_by", None),
        "extension": ("ext_to", None)}
    if data.get("qty_plan"):
        ch["qtyPlan"] = ("qty_plan", float(data["qty_plan"]))
    if data.get("kg_plan"):
        ch["kgPlan"] = ("kg_plan", float(data["kg_plan"]))
    changed = apply_changes(db, x, "lsx", x.id, ch, reason)
    x.ext_reason = x.ext_approved_by = x.ext_at = None
    svc._log(x, f"{actor(svc.QL)} phát lại lệnh — tiến độ {lead:02d} ngày, hạn {fmt_d(x.deadline)}"
             + (f" — {note}" if note else ""))
    svc.notify(db, f"Phát lại lệnh SX {x.id}", f"Chờ xưởng xác nhận — hạn {fmt_d(x.deadline)}", "info")
    db.commit()
    return x, _outcome(changed, f"Đã phát lại lệnh {x.id} — chờ xưởng nhận")
