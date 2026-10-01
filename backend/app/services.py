"""Logic nghiệp vụ — port từ steel-data.js (contractAgg, contractFlowLedger, mutations...).

ĐỐI ỨNG 3 SỐ CÂN: kg cân xuất tại công ty = kg cân đến xưởng mạ = kg lấy từ mạ đi giao khách.
Mọi sai lệch vượt dung sai phải có lý do và Quản lý ký xác nhận.
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import serializers as S
from .config import CONTRACT_DAYS, FILL_HOURS, PC_FILL_HOURS, PEOPLE, TOLERANCE_KG
from .db import utcnow
from .security import actor
from .models import (Contract, Customer, Lsx, LsxLog, Mismatch, Notification, Order, OrderItem, Payment, Receipt,
                     Sequence, Task, VLoss, Weighing, customer_tags)
from .utils import add_days, add_hours, fmt_d, fmt_kg, money, money_short

QL, KT, SX, KHO = (PEOPLE[k]["name"] for k in ("ql", "kt", "sx", "kho"))


# ---------------------------------------------------------------- helpers
def get_or_404(db: Session, model, id_: str):
    obj = db.get(model, id_)
    if not obj:
        raise HTTPException(404, f"Không tìm thấy {id_}")
    return obj


def next_id(db: Session, prefix: str, key: str, month_code: bool = False) -> str:
    # khóa dòng (SELECT … FOR UPDATE) để 2 người tạo chứng từ cùng lúc không bị trùng mã
    seq = db.get(Sequence, key, with_for_update=True) or Sequence(key=key, value=0)
    seq.value += 1
    db.add(seq)
    if month_code:
        return f"{prefix}-{utcnow():%y%m}-{seq.value:04d}"
    return f"{prefix}-{seq.value:04d}"


def notify(db: Session, title: str, sub: str = "", type_: str = "warning") -> None:
    db.add(Notification(at=utcnow(), title=title, sub=sub, type=type_))


def _sum(items, f) -> float:
    return sum(float(f(x) or 0) for x in items)


def _hours_over(d: datetime) -> int:
    return max(0, round((utcnow() - d).total_seconds() / 3600))


def _days_left(d: datetime) -> int:
    import math
    return math.ceil((d - utcnow()).total_seconds() / 86400)


# ---------------------------------------------------------------- tổng hợp theo hợp đồng
def contract_agg(db: Session, cid: str, detail: bool = True) -> dict:
    c = get_or_404(db, Contract, cid)
    lsxs = db.scalars(select(Lsx).where(Lsx.contract_id == cid)).all()
    rcs = db.scalars(select(Receipt).where(Receipt.contract_id == cid)).all()
    pcs = db.scalars(select(Weighing).where(Weighing.contract_id == cid)).all()
    vcs = db.scalars(select(Task).where(Task.contract_id == cid)).all()
    di_ma = [t for t in vcs if t.type == "di_ma"]
    giao = [t for t in vcs if t.type == "giao_khach"]

    produced_kg = _sum(lsxs, lambda x: x.kg_done)
    produced_qty = _sum(lsxs, lambda x: x.qty_done)
    received_kg = _sum(rcs, lambda x: x.kg)
    weighed_kg = _sum([p for p in pcs if p.kg_actual is not None], lambda p: p.kg_actual)
    sent_galv_kg = _sum([t for t in di_ma if t.kg_at_galv is not None], lambda t: t.kg_at_galv)
    in_transit_kg = _sum([t for t in di_ma if t.kg_at_galv is None and t.status != "Từ chối"], lambda t: t.kg_required)
    picked_kg = _sum([t for t in giao if t.kg_picked is not None], lambda t: t.kg_picked)
    delivered_kg = _sum([t for t in giao if t.kg_delivered is not None], lambda t: t.kg_delivered)
    at_galv_kg = sent_galv_kg - picked_kg
    stock_kg = received_kg - weighed_kg
    delivered_value = round(delivered_kg * (c.unit_price or 0))
    paid_total = _sum(c.payments, lambda p: p.amount)
    debt = delivered_value - paid_total

    checks = [
        ("SX bàn giao vs Kho tiếp nhận", produced_kg, received_kg, "SX báo hoàn thành", "Kho đã tiếp nhận",
         "Chênh = hàng còn ở xưởng chưa bàn giao", False),
        ("Kho tiếp nhận vs Cân xuất đi mạ", received_kg, weighed_kg, "Kho tiếp nhận", "Đã cân xuất",
         "Chênh = tồn kho chờ cân", False),
        ("CÂN XUẤT CÔNG TY vs CÂN ĐẾN XƯỞNG MẠ", weighed_kg, sent_galv_kg + in_transit_kg, "Cân xuất tại công ty",
         "Mạ xác nhận + đang trên đường", "Số cân 2 đầu phải khớp từng chuyến", True),
        ("GỬI MẠ vs LẤY RA TỪ MẠ", sent_galv_kg, picked_kg + at_galv_kg, "Đã gửi vào mạ", "Đã lấy ra + còn tại mạ",
         "Chênh = thất thoát tại xưởng mạ", True),
        ("LẤY TỪ MẠ vs GIAO KHÁCH KÝ NHẬN", picked_kg, delivered_kg, "Ký nhận với mạ", "Khách ký nhận",
         "Chênh = hàng trên xe chưa giao đủ", True),
    ]
    checks_out = [{"label": l, "a": a, "b": b, "aLbl": al, "bLbl": bl, "note": n, "key": k,
                   "delta": b - a, "ok": abs(b - a) <= 0.5} for l, a, b, al, bl, n, k in checks]
    tk = c.total_kg or 0
    lists = {
        "lsxs": [S.lsx(x) for x in lsxs], "receipts": [S.receipt(r) for r in rcs],
        "weighings": [S.weighing(p, photo=False) for p in pcs], "tasksDiMa": [S.task(t, photo=False) for t in di_ma],
        "tasksGiao": [S.task(t, photo=False) for t in giao],
    } if detail else {}
    return {
        "contract": S.contract(c), **lists,
        "producedKg": produced_kg, "producedQty": produced_qty, "receivedKg": received_kg, "weighedKg": weighed_kg,
        "sentGalvKg": sent_galv_kg, "inTransitToGalvKg": in_transit_kg, "atGalvKg": at_galv_kg,
        "pickedKg": picked_kg, "deliveredKg": delivered_kg, "stockKg": stock_kg,
        "deliveredValue": delivered_value, "paidTotal": paid_total, "debt": debt,
        "pctProduced": round(produced_kg / tk * 100) if tk else 0,
        "pctDelivered": round(delivered_kg / tk * 100) if tk else 0,
        "pctPaid": round(paid_total / c.value * 100) if c.value else 0,
        "checks": checks_out,
        "mismatches": [S.mismatch(m) for m in db.scalars(select(Mismatch).where(Mismatch.contract_id == cid))],
        "due": contract_due_info(c), "adv": advance_info(c),
    }


def contract_flow_ledger(db: Session, cid: str) -> dict:
    """Sổ cân đối luân chuyển thép: NGUỒN (kho tiếp nhận) = PHÂN BỔ (tồn kho + đang tới mạ + tại mạ
    + đã giao + lệch). Hợp đồng xong thì các vị trí trung gian phải về 0."""
    c = get_or_404(db, Contract, cid)
    ev = []
    for r in db.scalars(select(Receipt).where(Receipt.contract_id == cid)):
        ev.append({"date": r.date, "id": r.id, "type": "ptn", "kg": r.kg, "label": "SX bàn giao — kho tiếp nhận",
                   "delta": {"kho": r.kg}, "source": True})
    for p in db.scalars(select(Weighing).where(Weighing.contract_id == cid)):
        if p.kg_actual is None:
            continue
        ev.append({"date": p.date, "id": p.id, "type": "pc", "kg": p.kg_actual,
                   "label": "Cân xuất lên xe đi mạ (ký 3 bên)", "delta": {"kho": -p.kg_actual, "duong": p.kg_actual}})
    for t in db.scalars(select(Task).where(Task.contract_id == cid)):
        if t.type == "di_ma" and t.kg_at_galv is not None:
            ev.append({"date": t.filled_at or t.departed_at, "id": t.id, "type": "vc", "kg": t.kg_at_galv,
                       "label": f"Xưởng mạ cân nhận ({t.driver})", "mismatchId": t.mismatch_id,
                       "delta": {"duong": -t.kg_required, "ma": t.kg_at_galv, "lech": t.kg_required - t.kg_at_galv}})
        if t.type == "giao_khach" and t.kg_delivered is not None:
            ev.append({"date": t.filled_at or t.departed_at, "id": t.id, "type": "vc", "kg": t.kg_delivered,
                       "label": f"Lấy từ mạ {fmt_kg(t.kg_picked)} → khách ký nhận ({t.driver})",
                       "mismatchId": t.mismatch_id,
                       "delta": {"ma": -(t.kg_picked or 0), "giao": t.kg_delivered,
                                 "lech": (t.kg_picked or 0) - t.kg_delivered}})
    ev.sort(key=lambda e: e["date"] or datetime.min)
    run = {"kho": 0.0, "duong": 0.0, "ma": 0.0, "giao": 0.0, "lech": 0.0}
    total_in = 0.0
    for e in ev:
        if e.get("source"):
            total_in += e["kg"]
        zeroed = []
        for k, v in e["delta"].items():
            before = run[k]
            run[k] = round(run[k] + v, 2)
            if before != 0 and run[k] == 0:
                zeroed.append(k)
        e["after"] = dict(run)
        e["zeroed"] = zeroed
        e["date"] = e["date"].isoformat().replace("+00:00", "Z") if e["date"] else None
    allocated = sum(run.values())
    return {"contract": S.contract(c), "rows": ev, "final": run, "totalIn": total_in, "allocated": allocated,
            "balanced": abs(total_in - allocated) < 0.5}


def movement_log(db: Session, cid: str | None, frm: datetime | None, to: datetime | None) -> list[dict]:
    out = []
    q = lambda m: select(m).where(m.contract_id == cid) if cid else select(m)
    for r in db.scalars(q(Receipt)):
        out.append({"kind": "Tiếp nhận TP", "type": "ptn", "id": r.id, "contractId": r.contract_id, "date": r.date,
                    "kg": r.kg, "desc": f"SX bàn giao {r.qty:g} SP", "who": r.by})
    for p in db.scalars(q(Weighing)):
        out.append({"kind": "Cân xuất đi mạ", "type": "pc", "id": p.id, "contractId": p.contract_id, "date": p.date,
                    "kg": p.kg_actual, "who": p.by,
                    "desc": f"Cân trạm {fmt_kg(p.kg_actual)}" if p.kg_actual is not None else "Cân trạm chưa cân"})
    for t in db.scalars(q(Task)):
        d = t.filled_at or t.departed_at or t.assigned_at
        if t.type == "di_ma":
            out.append({"kind": "Nhập xưởng mạ", "type": "vc", "id": t.id, "contractId": t.contract_id, "date": d,
                        "kg": t.kg_at_galv, "who": t.driver,
                        "desc": f"Mạ xác nhận {fmt_kg(t.kg_at_galv)}" if t.kg_at_galv is not None else "Chưa có số cân mạ"})
        else:
            out.append({"kind": "Giao khách", "type": "vc", "id": t.id, "contractId": t.contract_id, "date": d,
                        "kg": t.kg_delivered, "who": t.driver,
                        "desc": f"Khách ký {fmt_kg(t.kg_delivered)}" if t.kg_delivered is not None else "Chưa giao xong"})
    from .utils import VN_TZ
    # ngày không kèm múi giờ (vd 2026-09-25) hiểu theo giờ Việt Nam
    frm = frm.replace(tzinfo=VN_TZ) if frm and frm.tzinfo is None else frm
    to = to.replace(tzinfo=VN_TZ) if to and to.tzinfo is None else to
    if frm:
        out = [x for x in out if x["date"] and x["date"] >= frm]
    if to:
        out = [x for x in out if x["date"] and x["date"] <= to]
    out.sort(key=lambda x: x["date"] or datetime.min, reverse=True)
    for x in out:
        x["date"] = x["date"].isoformat().replace("+00:00", "Z") if x["date"] else None
    return out


# ---------------------------------------------------------------- cảnh báo
def contract_due_info(c: Contract) -> dict:
    if c.returned_at:
        return {"state": "ok", "label": f"Đã trả {fmt_d(c.returned_at)}", "days": 0}
    dl = _days_left(c.due_at)
    if dl < 0:
        return {"state": "overdue", "label": f"QUÁ HẠN {abs(dl)} ngày", "days": dl}
    return {"state": "due" if dl <= 1 else "fine", "label": f"Còn {dl} ngày", "days": dl}


def advance_info(c: Contract) -> dict:
    if not c.advance_required:
        return {"state": "none", "label": "Không yêu cầu"}
    if (c.advance_received or 0) >= c.advance_required:
        return {"state": "ok", "label": f"Đã về đủ {money_short(c.advance_received)}"}
    if not c.sign_date:
        return {"state": "wait", "label": f"Chờ ký HĐ ({c.advance_pct:g}% = {money_short(c.advance_required)})"}
    return {"state": "missing",
            "label": f"CHƯA VỀ {money_short(c.advance_required - (c.advance_received or 0))} ({c.advance_pct:g}%)"}


def overdue_docs(db: Session) -> list[dict]:
    out = []
    now = utcnow()
    for t in db.scalars(select(Task)):
        if t.status in ("Từ chối", "Chờ xác nhận") or not t.fill_deadline:
            continue
        missing = (t.kg_at_galv is None or not t.photo) if t.type == "di_ma" else (t.kg_delivered is None or not t.photo)
        if missing and now > t.fill_deadline:
            no_kg = t.kg_at_galv is None and t.kg_delivered is None
            out.append({"kind": "Thẻ đi mạ" if t.type == "di_ma" else "Thẻ giao khách", "type": "vc", "id": t.id,
                        "contractId": t.contract_id, "person": t.driver, "dept": "Vận tải",
                        "deadline": S.iso(t.fill_deadline), "hoursOver": _hours_over(t.fill_deadline),
                        "missing": "số kg + ảnh phiếu" if no_kg else ("ảnh phiếu" if not t.photo else "số kg")})
    for p in db.scalars(select(Weighing)):
        if p.kg_actual is not None and p.photo:
            continue
        if _hours_over(p.date) >= PC_FILL_HOURS:
            out.append({"kind": "Phiếu cân trạm", "type": "pc", "id": p.id, "contractId": p.contract_id,
                        "person": p.by, "dept": "Kho", "deadline": S.iso(p.date), "hoursOver": _hours_over(p.date),
                        "missing": "số kg cân" if p.kg_actual is None else "ảnh phiếu ký 3 bên"})
    out.sort(key=lambda x: -x["hoursOver"])
    return out


def contract_alerts(db: Session) -> list[dict]:
    out = []
    for c in db.scalars(select(Contract)):
        due, adv = contract_due_info(c), advance_info(c)
        if due["state"] in ("overdue", "due") or adv["state"] == "missing":
            out.append({"contract": S.contract(c), "due": due, "adv": adv})
    return out


def pending_deltas(db: Session) -> list[dict]:
    """Mọi chênh lệch trên toàn hệ thống CHƯA được đưa vào kho ảo."""
    out = []
    for p in db.scalars(select(Weighing)):
        if p.kg_actual is not None and p.kg_actual != p.kg_expected and not p.loss_accepted:
            out.append({"refType": "pc", "id": p.id, "contractId": p.contract_id, "source": "Trạm cân công ty",
                        "date": p.date, "expected": p.kg_expected, "actual": p.kg_actual,
                        "delta": p.kg_actual - p.kg_expected, "mismatchId": p.mismatch_id})
    for t in db.scalars(select(Task)):
        if t.loss_accepted:
            continue
        if t.type == "di_ma" and t.kg_at_galv is not None and t.kg_at_galv != t.kg_required:
            out.append({"refType": "vc", "id": t.id, "contractId": t.contract_id, "source": "Cân tại xưởng mạ",
                        "date": t.filled_at, "expected": t.kg_required, "actual": t.kg_at_galv,
                        "delta": t.kg_at_galv - t.kg_required, "mismatchId": t.mismatch_id})
        if (t.type == "giao_khach" and t.kg_delivered is not None and t.kg_picked is not None
                and t.kg_delivered != t.kg_picked):
            out.append({"refType": "vc", "id": t.id, "contractId": t.contract_id, "source": "Giao khách",
                        "date": t.filled_at, "expected": t.kg_picked, "actual": t.kg_delivered,
                        "delta": t.kg_delivered - t.kg_picked, "mismatchId": t.mismatch_id})
    out.sort(key=lambda x: x["date"] or datetime.min, reverse=True)
    for x in out:
        x["date"] = S.iso(x["date"])
    return out


def dashboard(db: Session, tag: int | None = None) -> dict:
    # tag: chỉ lấy các khối gắn với hợp đồng của khách mang thẻ này (vd Khách thân thiết)
    cids = contract_ids_for_tag(db, tag) if tag else None
    keep = (lambda cid: cid in cids) if cids is not None else (lambda cid: True)
    contracts = [c for c in db.scalars(select(Contract)).all() if keep(c.id)]
    active = [c for c in contracts if c.status in ("Đang triển khai", "Đã ký")]
    pending_sl = [m for m in db.scalars(select(Mismatch).where(Mismatch.status == "Chờ QL ký")).all() if keep(m.contract_id)]
    delivered_total = _sum([t for t in db.scalars(select(Task).where(Task.type == "giao_khach")).all() if keep(t.contract_id)],
                           lambda t: t.kg_delivered)
    return {
        "activeContracts": len(active), "deliveredKgTotal": delivered_total,
        "contractAlerts": [a for a in contract_alerts(db) if keep(a["contract"]["id"])],
        "overdueDocs": [o for o in overdue_docs(db) if keep(o["contractId"])],
        "pendingMismatches": [S.mismatch(m) for m in pending_sl],
        "pendingMismatchKg": _sum(pending_sl, lambda m: abs(m.delta)),
        "pendingLSX": [S.lsx(x) for x in db.scalars(select(Lsx).where(Lsx.status.in_(("Chờ nhận", "Từ chối"))))
                       if keep(x.contract_id)],
        "pendingTasks": [S.task(t, photo=False) for t in db.scalars(select(Task).where(Task.status.in_(("Chờ xác nhận", "Từ chối"))))
                         if keep(t.contract_id)],
        "contracts": [contract_agg(db, c.id, detail=False) for c in contracts],
    }


# ---------------------------------------------------------------- đơn hàng & hợp đồng
def create_order(db: Session, customer: str, items: list[dict], file: str | None, note: str, code: str | None,
                 customer_id: int | None = None) -> Order:
    total_kg = sum(float(i["kg"]) for i in items)
    value = round(sum(float(i["kg"]) * float(i["price"]) for i in items))
    cu = ensure_customer(db, customer, customer_id)
    customer = cu.name
    o = Order(id=next_id(db, "DH", "dh", month_code=True), customer=customer, code=code or "MOI", date=utcnow(),
              file=file or "don-hang-ky-chot.pdf", total_kg=total_kg, value=value, status="Chốt đơn",
              contract_id=None, note=note or "", customer_id=cu.id)
    o.items = [OrderItem(name=i["name"], qty=i["qty"], unit=i.get("unit") or "cấu kiện", kg=i["kg"], price=i["price"])
               for i in items]
    db.add(o)
    notify(db, f"Đơn hàng mới {o.id}", f"{customer} — chờ chuyển kế toán làm hợp đồng", "info")
    db.commit()
    return o


def update_order(db: Session, oid: str, data: dict) -> Order:
    o = get_or_404(db, Order, oid)
    if data.get("customer") is not None or data.get("customer_id") is not None:
        cu = ensure_customer(db, data.get("customer") or o.customer, data.get("customer_id"))
        data["customer"], o.customer_id = cu.name, cu.id
    for k in ("customer", "file", "note", "code"):
        if data.get(k) is not None:
            setattr(o, k, data[k])
    if data.get("items"):
        o.items = [OrderItem(name=i["name"], qty=i["qty"], unit=i.get("unit") or "cấu kiện", kg=i["kg"],
                             price=i["price"]) for i in data["items"]]
        o.total_kg = sum(float(i["kg"]) for i in data["items"])
        o.value = round(sum(float(i["kg"]) * float(i["price"]) for i in data["items"]))
    db.commit()
    return o


def send_order_to_kt(db: Session, oid: str) -> Contract:
    o = get_or_404(db, Order, oid)
    if o.contract_id:
        raise HTTPException(400, f"Đơn {oid} đã có hợp đồng {o.contract_id}")
    now = utcnow()
    first = o.items[0] if o.items else None
    c = Contract(id=next_id(db, "HD", "hd", month_code=True), order_id=o.id, code=o.code, customer=o.customer,
                 sent_to_kt_at=now, due_at=add_days(now, CONTRACT_DAYS), status="Soạn thảo", owner=KT,
                 total_qty=sum(i.qty for i in o.items), unit=first.unit if first else "cấu kiện",
                 total_kg=o.total_kg, unit_price=round(o.value / o.total_kg) if o.total_kg else 0, value=o.value,
                 vat_pct=8, advance_pct=30, advance_required=round(o.value * 0.3), advance_received=0,
                 note=f"Tạo từ đơn {o.id} — giá theo giá thị trường ngày chốt.")
    db.add(c)
    o.contract_id, o.status = c.id, "Đã chuyển kế toán"
    notify(db, f"Đơn {o.id} đã chuyển kế toán", f"Hạn trả hợp đồng: {fmt_d(c.due_at)} (05 ngày)", "info")
    db.commit()
    return c


def update_contract(db: Session, cid: str, data: dict) -> Contract:
    c = get_or_404(db, Contract, cid)
    if data.get("owner") is not None:
        c.owner = data["owner"]
    if data.get("note") is not None:
        c.note = data["note"]
    if data.get("dueAt") is not None:
        c.due_at = data["dueAt"]
    if data.get("unitPrice") is not None:
        c.unit_price = data["unitPrice"]
        c.value = round(c.unit_price * c.total_kg)
    if data.get("advancePct") is not None:
        c.advance_pct = data["advancePct"]
    c.advance_required = round(c.value * c.advance_pct / 100)
    db.commit()
    return c


def mark_contract_returned(db: Session, cid: str) -> Contract:
    c = get_or_404(db, Contract, cid)
    c.returned_at = utcnow()
    if not c.sign_date:
        c.status = "Đã trả khách"
    db.commit()
    return c


def mark_contract_signed(db: Session, cid: str) -> Contract:
    c = get_or_404(db, Contract, cid)
    c.sign_date = utcnow()
    c.returned_at = c.returned_at or c.sign_date
    c.status = "Đã ký"
    o = db.get(Order, c.order_id)
    if o:
        o.status = "Đã có hợp đồng"
    db.commit()
    return c


def record_payment(db: Session, cid: str, amount: float, type_: str, note: str) -> Contract:
    c = get_or_404(db, Contract, cid)
    if not amount or amount <= 0:
        raise HTTPException(400, "Số tiền phải lớn hơn 0")
    c.payments.append(Payment(date=utcnow(), amount=amount, type=type_ or "Thanh toán", note=note or ""))
    if "tạm ứng" in (type_ or "").lower():
        c.advance_received = (c.advance_received or 0) + amount
        c.advance_received_at = c.advance_received_at or utcnow()
    notify(db, f"Tiền về HĐ {cid}", f"{type_ or 'Thanh toán'}: {money(amount)}", "success")
    db.commit()
    return c


# ---------------------------------------------------------------- lệnh sản xuất
def _log(x: Lsx, text: str) -> None:
    x.logs.append(LsxLog(at=utcnow(), text=text))


def create_lsx(db: Session, cid: str, name: str | None, qty: float, kg: float, lead_days: int) -> Lsx:
    c = get_or_404(db, Contract, cid)
    lead = lead_days or 7
    now = utcnow()
    x = Lsx(id=next_id(db, "LSX", "lsx"), contract_id=cid, name=name or f"Lệnh SX {c.code}", assigned_at=now,
            assigned_by=actor(QL), lead_days=lead, deadline=add_days(now, lead), status="Chờ nhận", qty_plan=qty,
            kg_plan=kg, qty_done=0, kg_done=0)
    _log(x, f"{actor(QL)} phát lệnh — tiến độ {lead:02d} ngày")
    db.add(x)
    notify(db, f"Lệnh SX mới {x.id}", f"Chờ xưởng xác nhận — hạn {fmt_d(x.deadline)}", "info")
    db.commit()
    return x


def lsx_accept(db: Session, lid: str) -> Lsx:
    x = get_or_404(db, Lsx, lid)
    if x.status not in ("Chờ nhận", "Từ chối"):
        raise HTTPException(400, f"LSX đang ở trạng thái {x.status}")
    x.status, x.accepted_at, x.accepted_by, x.reject_reason = "Đang SX", utcnow(), actor(SX), None
    _log(x, f"Xưởng nhận lệnh ({actor(SX)})")
    db.commit()
    return x


def lsx_reject(db: Session, lid: str, reason: str) -> Lsx:
    x = get_or_404(db, Lsx, lid)
    if not reason:
        raise HTTPException(400, "Bắt buộc chọn lý do từ chối")
    x.status, x.reject_reason = "Từ chối", reason
    _log(x, f"Xưởng TỪ CHỐI ({actor(SX)}): {reason}")
    notify(db, f"LSX {lid} bị từ chối", reason, "error")
    db.commit()
    return x


def lsx_progress(db: Session, lid: str, qty_done: float, kg_done: float) -> Lsx:
    x = get_or_404(db, Lsx, lid)
    x.qty_done, x.kg_done = qty_done or 0, kg_done or 0
    if x.qty_done >= x.qty_plan:
        x.status = "Hoàn thành"
    _log(x, f"Cập nhật tiến độ: {x.qty_done:g}/{x.qty_plan:g} SP · {fmt_kg(x.kg_done)}")
    db.commit()
    return x


def lsx_extend(db: Session, lid: str, to: datetime, reason: str) -> Lsx:
    x = get_or_404(db, Lsx, lid)
    x.ext_to, x.ext_reason, x.ext_approved_by, x.ext_at = to, reason, actor(QL), utcnow()
    _log(x, f"{actor(QL)} duyệt gia hạn đến {fmt_d(to)} — {reason}")
    db.commit()
    return x


# ---------------------------------------------------------------- kho & trạm cân
def create_receipt(db: Session, lsx_id: str, qty: float, kg: float, note: str) -> Receipt:
    x = get_or_404(db, Lsx, lsx_id)
    r = Receipt(id=next_id(db, "PTN", "ptn"), lsx_id=lsx_id, contract_id=x.contract_id, date=utcnow(),
                qty=qty or 0, kg=kg or 0, by=actor(KHO), note=note or "")
    db.add(r)
    db.commit()
    return r


def create_weighing(db: Session, receipt_or_lsx_id: str, kg_expected: float) -> Weighing:
    r = db.get(Receipt, receipt_or_lsx_id)
    x = get_or_404(db, Lsx, r.lsx_id if r else receipt_or_lsx_id)
    p = Weighing(id=next_id(db, "PC", "pc"), contract_id=x.contract_id, lsx_id=x.id, date=utcnow(),
                 kg_expected=kg_expected or 0, kg_actual=None, photo=None, signer_boc_xep="Tổ bốc xếp 1",
                 signer_kho=actor(KHO), signer_lai_xe="", by=actor(KHO), status="Chờ cân")
    db.add(p)
    db.commit()
    return p


def create_mismatch(db: Session, source, ref_type, ref_id, cid, expected, actual, reason, reason_note,
                    reported_by, dept) -> Mismatch:
    m = Mismatch(id=next_id(db, "SL", "sl"), source=source, ref_type=ref_type, ref_id=ref_id, contract_id=cid,
                 date=utcnow(), expected=expected, actual=actual, delta=actual - expected, reason=reason,
                 reason_note=reason_note or "", reported_by=reported_by, dept=dept, status="Chờ QL ký")
    db.add(m)
    notify(db, f"SAI LỆCH {actual - expected:+g} kg tại {source}", f"{ref_id} · {reason} — chờ Quản lý ký", "error")
    return m


def fill_weighing(db: Session, pid: str, kg_actual: float, photo: str | None, reason: str | None,
                  reason_note: str | None, signer_lai_xe: str | None = None) -> Weighing:
    p = get_or_404(db, Weighing, pid)
    p.kg_actual = kg_actual or 0
    if photo:
        p.photo = photo
    if signer_lai_xe:
        p.signer_lai_xe = signer_lai_xe
    if abs(p.kg_actual - p.kg_expected) > TOLERANCE_KG:
        m = create_mismatch(db, "Trạm cân công ty", "pc", p.id, p.contract_id, p.kg_expected, p.kg_actual,
                            reason or "Khác (ghi rõ)", reason_note, actor(KHO), "Kho")
        p.mismatch_id, p.status = m.id, "Lệch — chờ ký"
    else:
        p.status = "Đã cân"
    db.commit()
    return p


# ---------------------------------------------------------------- thẻ công việc lái xe
def create_task(db: Session, type_: str, driver: str, cid: str, ref_id: str | None, kg_required: float,
                note: str, vehicle_plate: str | None = None, galvanizer_id: int | None = None) -> Task:
    if type_ not in ("di_ma", "giao_khach"):
        raise HTTPException(400, "Loại thẻ phải là di_ma hoặc giao_khach")
    get_or_404(db, Contract, cid)
    t = Task(id=next_id(db, "VC", "vc"), type=type_, driver=driver, contract_id=cid, ref_id=ref_id,
             assigned_at=utcnow(), status="Chờ xác nhận", kg_required=kg_required or 0, note=note or "",
             vehicle_plate=(vehicle_plate or "").strip().upper() or None,
             galvanizer_id=galvanizer_id if type_ == "di_ma" else None)
    db.add(t)
    notify(db, f"Thẻ công việc mới {t.id}",
           f"{'Chở hàng đi mạ' if type_ == 'di_ma' else 'Lấy hàng mạ giao khách'} — gán {driver}", "info")
    db.commit()
    return t


def task_accept(db: Session, tid: str) -> Task:
    t = get_or_404(db, Task, tid)
    if t.status not in ("Chờ xác nhận", "Từ chối"):
        raise HTTPException(400, f"Thẻ đang ở trạng thái {t.status}")
    t.status, t.accepted_at, t.reject_reason = "Đã nhận", utcnow(), None
    db.commit()
    return t


def task_reject(db: Session, tid: str, reason: str) -> Task:
    t = get_or_404(db, Task, tid)
    if not reason:
        raise HTTPException(400, "Bắt buộc chọn lý do từ chối")
    t.status, t.reject_reason = "Từ chối", reason
    notify(db, f"Lái xe từ chối thẻ {tid}", f"{t.driver}: {reason}", "error")
    db.commit()
    return t


def task_depart(db: Session, tid: str) -> Task:
    t = get_or_404(db, Task, tid)
    if t.status != "Đã nhận":
        raise HTTPException(400, "Chỉ xuất phát được khi thẻ ở trạng thái Đã nhận")
    now = utcnow()
    t.status, t.departed_at, t.fill_deadline = "Đang chạy", now, add_hours(now, FILL_HOURS)
    db.commit()
    return t


def task_fill_galv(db: Session, tid: str, kg: float, photo: str | None, reason: str | None,
                   reason_note: str | None) -> Task:
    t = get_or_404(db, Task, tid)
    if t.type != "di_ma":
        raise HTTPException(400, "Thẻ này không phải thẻ đi mạ")
    t.kg_at_galv, t.filled_at, t.status = kg or 0, utcnow(), "Hoàn thành"
    if photo:
        t.photo = photo
    if abs(t.kg_at_galv - t.kg_required) > TOLERANCE_KG:
        m = create_mismatch(db, "Cân tại xưởng mạ", "vc", t.id, t.contract_id, t.kg_required, t.kg_at_galv,
                            reason or "Khác (ghi rõ)", reason_note, t.driver, "Vận tải")
        t.mismatch_id = m.id
    db.commit()
    return t


def task_fill_delivery(db: Session, tid: str, kg_picked: float, kg_delivered: float, photo: str | None,
                       reason: str | None, reason_note: str | None) -> Task:
    t = get_or_404(db, Task, tid)
    if t.type != "giao_khach":
        raise HTTPException(400, "Thẻ này không phải thẻ giao khách")
    t.kg_picked, t.kg_delivered, t.filled_at, t.status = kg_picked or 0, kg_delivered or 0, utcnow(), "Hoàn thành"
    if photo:
        t.photo = photo
    delta = t.kg_delivered - t.kg_picked
    if abs(delta) > 0.5 or abs(t.kg_picked - t.kg_required) > TOLERANCE_KG:
        exp, act = (t.kg_picked, t.kg_delivered) if abs(delta) > 0.5 else (t.kg_required, t.kg_picked)
        m = create_mismatch(db, "Giao khách", "vc", t.id, t.contract_id, exp, act, reason or "Khác (ghi rõ)",
                            reason_note, t.driver, "Vận tải")
        t.mismatch_id = m.id
    c = db.get(Contract, t.contract_id)
    notify(db, f"Đã giao {fmt_kg(t.kg_delivered)} cho khách",
           f"HĐ {t.contract_id}" + (f" — công nợ ghi tăng {money_short(t.kg_delivered * c.unit_price)}" if c else ""),
           "success")
    db.commit()
    return t


# ---------------------------------------------------------------- sai lệch & kho ảo
def sign_mismatch(db: Session, mid: str) -> Mismatch:
    m = get_or_404(db, Mismatch, mid)
    m.status, m.signed_by, m.signed_at = "Đã ký xác nhận", actor(QL), utcnow()
    ref = db.get(Weighing if m.ref_type == "pc" else Task, m.ref_id)
    if ref is not None and getattr(ref, "status", None) == "Lệch — chờ ký":
        ref.status = "Đã cân"
    db.commit()
    return m


def accept_loss(db: Session, ref_type: str, ref_id: str, note: str | None) -> VLoss:
    """Quản lý 'OK cho phép' phần lệch đã kiểm tra → chuyển vào kho ảo; ký luôn biên bản sai lệch gốc."""
    rec = get_or_404(db, Weighing if ref_type == "pc" else Task, ref_id)
    if rec.loss_accepted:
        raise HTTPException(400, f"{ref_id} đã được chuyển kho ảo")
    if ref_type == "pc":
        kg, source = (rec.kg_expected or 0) - (rec.kg_actual or 0), "Trạm cân công ty"
    elif rec.type == "di_ma":
        kg, source = (rec.kg_required or 0) - (rec.kg_at_galv or 0), "Cân tại xưởng mạ"
    else:
        kg, source = (rec.kg_picked or 0) - (rec.kg_delivered or 0), "Giao khách"
    e = VLoss(id=next_id(db, "VK", "vk"), date=utcnow(), ref_type=ref_type, ref_id=ref_id,
              contract_id=rec.contract_id, source=source, kg=kg, approved_by=actor(QL),
              note=note or "Quản lý cho phép rơi rớt sau kiểm tra thực tế", status="Đang treo")
    db.add(e)
    rec.loss_accepted = True
    if rec.mismatch_id:
        m = db.get(Mismatch, rec.mismatch_id)
        if m and m.status == "Chờ QL ký":
            m.status, m.signed_by, m.signed_at = "Đã ký xác nhận", actor(QL), utcnow()
            if ref_type == "pc" and rec.status == "Lệch — chờ ký":
                rec.status = "Đã cân"
    notify(db, f"Đã duyệt rơi rớt {fmt_kg(abs(kg))}", f"{ref_id} → chuyển kho ảo {e.id} — tổng cân đối hợp lý",
           "success")
    db.commit()
    return e


def resolve_vloss(db: Session, vid: str, resolution: str, note: str | None) -> VLoss:
    e = get_or_404(db, VLoss, vid)
    if e.status == "Đã xử lý":
        raise HTTPException(400, f"{vid} đã xử lý")
    e.status, e.resolution, e.resolved_at, e.resolved_note = "Đã xử lý", resolution, utcnow(), note or ""
    notify(db, f"Kho ảo: đã xử lý {e.id}", f"{fmt_kg(abs(e.kg))} — {resolution}", "success")
    db.commit()
    return e


# ---------------------------------------------------------------- khách hàng & thẻ (danh mục)
def ensure_customer(db: Session, name: str, customer_id: int | None = None) -> Customer:
    """Khách theo id; không có id thì tìm theo tên (không phân biệt hoa thường), chưa có thì tạo mới."""
    if customer_id is not None:
        cu = db.get(Customer, customer_id)
        if not cu:
            raise HTTPException(404, f"Không tìm thấy khách hàng #{customer_id}")
        return cu
    name = (name or "").strip()
    if not name:
        raise HTTPException(400, "Chưa nhập tên khách hàng")
    cu = next((c for c in db.scalars(select(Customer)) if c.name.strip().lower() == name.lower()), None)
    if cu is None:
        cu = Customer(name=name, active=True, created_at=utcnow())
        db.add(cu)
        db.flush()
    return cu


def customer_ids_for_tag(db: Session, tag: int) -> set[int]:
    return set(db.scalars(select(customer_tags.c.customer_id).where(customer_tags.c.tag_id == tag)))


def contract_ids_for_tag(db: Session, tag: int) -> set[str]:
    """Hợp đồng thuộc khách mang thẻ `tag` (qua đơn hàng gốc → khách hàng)."""
    cus = customer_ids_for_tag(db, tag)
    return {o.contract_id for o in db.scalars(select(Order).where(Order.customer_id.in_(cus))) if o.contract_id}
