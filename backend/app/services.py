"""Logic nghiệp vụ — port từ steel-data.js (contractAgg, contractFlowLedger, mutations...).

ĐỐI ỨNG 3 SỐ CÂN: kg cân xuất tại công ty = kg cân đến xưởng mạ = kg lấy từ mạ đi giao khách.
Mọi sai lệch vượt dung sai phải có lý do và Quản lý ký xác nhận.
"""
from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import serializers as S
from .config import (PC_TOLERANCE_PCT, COMPLETE_WARN_DAYS, CONTRACT_DAYS, CT_DONE, CT_RECEIVED, CT_SENT, CT_WAIT, FILL_HOURS, PAY_OK,
                     PAY_PENDING, PAY_REJECTED, PC_FILL_HOURS, PEOPLE, TOLERANCE_KG)
from .db import utcnow
from .security import actor
from .models import (Contract, Customer, Lsx, LsxDaily, LsxLog, Mismatch, Notification, Order, OrderItem, Payment, Receipt,
                     Sequence, Task, VLoss, Weighing, customer_tags)
from .utils import VN_TZ, add_days, add_hours, fmt_d, fmt_kg, money, money_short

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


def notify(db: Session, title: str, sub: str = "", type_: str = "warning", roles: str | None = None) -> None:
    """roles: vai trò nhận ("admin", "kt,admin"…); None = mọi người."""
    db.add(Notification(at=utcnow(), title=title, sub=sub, type=type_, roles=roles))


def approved(payments) -> list:
    """Chỉ tiền về đã được Quản lý duyệt mới tính vào tiền đã về / công nợ."""
    return [p for p in payments if (p.status or PAY_OK) == PAY_OK]


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
    eff = stock_kg_of_receipts(db, rcs)
    received_kg = _sum(rcs, lambda x: eff[x.id])
    weighed_kg = _sum([p for p in pcs if p.kg_actual is not None], lambda p: p.kg_actual)
    sent_galv_kg = _sum([t for t in di_ma if t.kg_at_galv is not None], lambda t: t.kg_at_galv)
    in_transit_kg = _sum([t for t in di_ma if t.kg_at_galv is None and t.status != "Từ chối"], lambda t: t.kg_required)
    picked_kg = _sum([t for t in giao if t.kg_picked is not None], lambda t: t.kg_picked)
    delivered_kg = _sum([t for t in giao if t.kg_delivered is not None], lambda t: t.kg_delivered)
    at_galv_kg = sent_galv_kg - picked_kg
    stock_kg = received_kg - weighed_kg
    bill_kg, bill_pending = billed_kg(db, cid)
    # công nợ theo KG CÂN XUẤT đã đạt (±5%) / đã được Quản lý duyệt
    delivered_value = round(bill_kg * (c.unit_price or 0))
    paid_total = _sum(approved(c.payments), lambda p: p.amount)
    pending_pay = _sum([p for p in c.payments if p.status == PAY_PENDING], lambda p: p.amount)
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
        "deliveredValue": delivered_value, "paidTotal": paid_total, "debt": debt, "pendingPayment": pending_pay,
        "billedKg": bill_kg, "billPendingKg": bill_pending,
        "complete": complete_info(c, delivered_kg),
        "pctProduced": round(produced_kg / tk * 100) if tk else 0,
        "pctDelivered": round(delivered_kg / tk * 100) if tk else 0,
        "pctPaid": round(paid_total / c.value * 100) if c.value else 0,
        "checks": checks_out,
        "mismatches": [S.mismatch(m) for m in db.scalars(select(Mismatch).where(Mismatch.contract_id == cid))],
        "due": contract_due_info(c), "adv": advance_info(c),
    }


def stock_kg_of_receipts(db: Session, receipts) -> dict[str, float]:
    """KG tính tồn kho của phiếu chuẩn bị hàng: đã cân → = số cân (chênh với số QL giao do Quản lý tự xử lý,
    phần mềm không theo dõi thành tồn kho / sai lệch); chưa cân → số QL giao."""
    ids = [r.id for r in receipts]
    weighed = {p.receipt_id: p.kg_actual for p in db.scalars(select(Weighing).where(Weighing.receipt_id.in_(ids)))
               if p.kg_actual is not None} if ids else {}
    return {r.id: weighed.get(r.id, r.kg) for r in receipts}


def contract_flow_ledger(db: Session, cid: str) -> dict:
    """Sổ cân đối luân chuyển thép: NGUỒN (kho tiếp nhận) = PHÂN BỔ (tồn kho + đang tới mạ + tại mạ
    + đã giao + lệch). Hợp đồng xong thì các vị trí trung gian phải về 0."""
    c = get_or_404(db, Contract, cid)
    ev = []
    rcs = db.scalars(select(Receipt).where(Receipt.contract_id == cid)).all()
    eff = stock_kg_of_receipts(db, rcs)
    for r in rcs:
        ev.append({"date": r.date, "id": r.id, "type": "ptn", "kg": eff[r.id], "label": "SX bàn giao — kho tiếp nhận",
                   "delta": {"kho": eff[r.id]}, "source": True})
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
        out.append({"kind": "Chuẩn bị hàng", "type": "ptn", "id": r.id, "contractId": r.contract_id, "date": r.date,
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


def complete_info(c: Contract, delivered_kg: float | None = None) -> dict:
    """Cảnh báo theo NGÀY HOÀN THÀNH đơn (QL nhập khi chuyển kế toán): quá hạn / sắp tới hạn mà chưa giao đủ."""
    if not c.complete_by:
        return {"state": "none", "label": "Chưa có ngày hoàn thành", "days": None}
    done = c.status == CT_DONE or (delivered_kg is not None and c.total_kg and delivered_kg >= c.total_kg - 0.5)
    if done:
        return {"state": "ok", "label": f"Đã hoàn thành · hạn {fmt_d(c.complete_by)}", "days": None}
    dl = _days_left(c.complete_by)
    if dl < 0:
        return {"state": "overdue", "label": f"QUÁ HẠN HOÀN THÀNH {abs(dl)} ngày ({fmt_d(c.complete_by)})", "days": dl}
    if dl <= COMPLETE_WARN_DAYS:
        return {"state": "soon", "label": f"Còn {dl} ngày tới hạn hoàn thành ({fmt_d(c.complete_by)})", "days": dl}
    return {"state": "fine", "label": f"Hoàn thành trước {fmt_d(c.complete_by)} · còn {dl} ngày", "days": dl}


def advance_info(c: Contract) -> dict:
    if not c.advance_required:
        return {"state": "none", "label": "Không yêu cầu"}
    if (c.advance_received or 0) >= c.advance_required:
        return {"state": "ok", "label": f"Đã về đủ {money_short(c.advance_received)}"}
    if not c.sign_date:
        got = c.advance_received or 0  # tiền về độc lập với bước hợp đồng — có thể về trước khi HĐ nhận về
        return {"state": "wait", "label": (f"Đã về {money_short(got)} / {money_short(c.advance_required)} · HĐ chưa nhận về" if got
                                           else f"Chờ HĐ nhận về ({c.advance_pct:g}% = {money_short(c.advance_required)})")}
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
        delivered = _sum(db.scalars(select(Task).where(Task.contract_id == c.id, Task.type == "giao_khach")).all(),
                         lambda t: t.kg_delivered)
        comp = complete_info(c, delivered)
        if due["state"] in ("overdue", "due") or adv["state"] == "missing" or comp["state"] in ("overdue", "soon"):
            out.append({"contract": S.contract(c), "due": due, "adv": adv, "complete": comp})
    return out


def pending_payments(db: Session) -> list[dict]:
    return [{**S.payment(p), "contractId": p.contract_id, "customer": p.contract.customer}
            for p in db.scalars(select(Payment).where(Payment.status == PAY_PENDING).order_by(Payment.date))]


def pending_deltas(db: Session) -> list[dict]:
    """Mọi chênh lệch trên toàn hệ thống CHƯA được đưa vào kho ảo."""
    out = []
    for p in db.scalars(select(Weighing)):
        if p.receipt_id:  # phiếu từ Chuẩn bị hàng: lệch do Quản lý duyệt / từ chối, không đưa vào kho ảo
            continue
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


def dashboard(db: Session, tag: int | None = None, segment: str | None = None) -> dict:
    # tag / segment: chỉ lấy các khối gắn với hợp đồng của khách mang thẻ / thuộc phân loại này (vd Thân thiết)
    cids = contract_ids_for_tag(db, tag) if tag else None
    if segment:
        seg = contract_ids_for_customers(db, customer_ids_for_segment(db, segment))
        cids = seg if cids is None else cids & seg
    keep = (lambda cid: cid in cids) if cids is not None else (lambda cid: True)
    contracts = [c for c in db.scalars(select(Contract)).all() if keep(c.id)]
    active = [c for c in contracts if c.status == CT_RECEIVED]
    pending_sl = [m for m in db.scalars(select(Mismatch).where(Mismatch.status == "Chờ QL ký")).all() if keep(m.contract_id)]
    delivered_total = _sum([t for t in db.scalars(select(Task).where(Task.type == "giao_khach")).all() if keep(t.contract_id)],
                           lambda t: t.kg_delivered)
    return {
        "activeContracts": len(active), "deliveredKgTotal": delivered_total,
        "contractAlerts": [a for a in contract_alerts(db) if keep(a["contract"]["id"])],
        "pendingPayments": [p for p in pending_payments(db) if keep(p["contractId"])],
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
def _order_items(items: list[dict]) -> list[OrderItem]:
    """Dòng hàng theo file đặt hàng của khách: tổng KL = SL × KL/1 bộ (khi có KL/1 bộ), thành tiền = tổng KL × đơn giá."""
    out = []
    for i in items:
        per = i.get("kg_per_unit")
        kg = float(i["qty"]) * float(per) if per else float(i.get("kg") or 0)
        if kg <= 0:
            raise HTTPException(400, f"Hạng mục \"{i['name']}\" chưa có khối lượng (KL/1 bộ hoặc tổng KL)")
        out.append(OrderItem(name=i["name"].strip(), qty=i["qty"], unit=i.get("unit") or "cấu kiện",
                             kg_per_unit=float(per) if per else None, kg=round(kg, 3), price=i["price"],
                             note=(i.get("note") or "").strip()))
    return out


def _set_items(o: Order, items: list[dict]) -> None:
    o.items = _order_items(items)
    o.total_kg = round(sum(i.kg for i in o.items), 3)
    o.value = round(sum(i.kg * i.price for i in o.items))


def create_order(db: Session, customer: str, items: list[dict], file: str | None, note: str, code: str | None,
                 customer_id: int | None = None, vat_pct: float = 10) -> Order:
    cu = ensure_customer(db, customer, customer_id)
    customer = cu.name
    o = Order(id=next_id(db, "DH", "dh", month_code=True), customer=customer, code=code or "MOI", date=utcnow(),
              file=file or "don-hang-ky-chot.pdf", status="Chốt đơn", vat_pct=vat_pct,
              contract_id=None, note=note or "", customer_id=cu.id)
    _set_items(o, items)
    db.add(o)
    notify(db, f"Đơn hàng mới {o.id}", f"{customer} — chờ chuyển kế toán làm hợp đồng", "info")
    db.commit()
    return o


def update_order(db: Session, oid: str, data: dict) -> Order:
    o = get_or_404(db, Order, oid)
    if data.get("customer") is not None or data.get("customer_id") is not None:
        cu = ensure_customer(db, data.get("customer") or o.customer, data.get("customer_id"))
        data["customer"], o.customer_id = cu.name, cu.id
    for k in ("customer", "file", "note", "code", "vat_pct"):
        if data.get(k) is not None:
            setattr(o, k, data[k])
    if data.get("items"):
        _set_items(o, data["items"])
    db.commit()
    return o


def send_order_to_kt(db: Session, oid: str, complete_by: datetime | None) -> Contract:
    o = get_or_404(db, Order, oid)
    if o.contract_id:
        raise HTTPException(400, f"Đơn {oid} đã có hợp đồng {o.contract_id}")
    if not complete_by:
        raise HTTPException(400, "Chưa nhập ngày hoàn thành đơn hàng")
    now = utcnow()
    if complete_by.tzinfo is None:
        from .utils import VN_TZ
        complete_by = complete_by.replace(tzinfo=VN_TZ)
    if complete_by < now:
        raise HTTPException(400, "Ngày hoàn thành phải sau hôm nay")
    o.complete_by = complete_by
    first = o.items[0] if o.items else None
    c = Contract(id=next_id(db, "HD", "hd", month_code=True), order_id=o.id, code=o.code, customer=o.customer,
                 sent_to_kt_at=now, due_at=add_days(now, CONTRACT_DAYS), status=CT_WAIT, owner=KT,
                 number=o.id, complete_by=complete_by,
                 total_qty=sum(i.qty for i in o.items), unit=first.unit if first else "cấu kiện",
                 total_kg=o.total_kg, unit_price=round(o.value / o.total_kg) if o.total_kg else 0, value=o.value,
                 vat_pct=o.vat_pct if o.vat_pct is not None else 10, advance_pct=30, advance_required=round(o.value * 0.3), advance_received=0,
                 note=f"Tạo từ đơn {o.id} — giá theo giá thị trường ngày chốt.")
    db.add(c)
    o.contract_id, o.status = c.id, "Đã chuyển kế toán"
    notify(db, f"Đơn {o.id} đã chuyển kế toán — soạn hợp đồng {c.id}",
           f"Hạn gửi hợp đồng cho khách: {fmt_d(c.due_at)} (05 ngày) · ngày hoàn thành đơn {fmt_d(complete_by)}", "info",
           roles="kt,admin")
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
    """Bước 2 — đã gửi hợp đồng cho khách hàng (sau khi soạn thảo) → báo Quản lý."""
    c = get_or_404(db, Contract, cid)
    if c.status == CT_WAIT or not c.drafted_at and c.status not in (CT_SENT, CT_RECEIVED, CT_DONE):
        raise HTTPException(400, "Chưa soạn thảo hợp đồng — vào Soạn thảo hợp đồng trước khi gửi khách")
    if c.status in (CT_RECEIVED, CT_DONE):
        raise HTTPException(400, f"Hợp đồng đang ở bước \"{c.status}\"")
    c.returned_at = utcnow()
    c.status = CT_SENT
    notify(db, f"HĐ {c.id} đã gửi khách hàng", f"{c.customer} · số {c.number or c.order_id} — kế toán đã soạn và gửi khách",
           "info", roles="admin")
    db.commit()
    return c


def mark_contract_signed(db: Session, cid: str) -> Contract:
    """Bước 3 — đã nhận về hợp đồng khách ký (phát lệnh SX không phụ thuộc bước này)."""
    c = get_or_404(db, Contract, cid)
    if c.status not in (CT_SENT,) and not c.returned_at:
        raise HTTPException(400, "Hợp đồng chưa gửi khách hàng")
    if c.status in (CT_RECEIVED, CT_DONE):
        raise HTTPException(400, f"Hợp đồng đã ở bước \"{c.status}\"")
    c.sign_date = utcnow()
    c.returned_at = c.returned_at or c.sign_date
    c.status = CT_RECEIVED
    o = db.get(Order, c.order_id)
    if o:
        o.status = "Đã có hợp đồng"
    notify(db, f"HĐ {c.id} đã nhận về (khách đã ký)", f"{c.customer} — hợp đồng khách đã ký", "success", roles="admin,kt")
    db.commit()
    return c


def mark_contract_completed(db: Session, cid: str) -> Contract:
    """Bước 4 — hoàn thành hợp đồng."""
    c = get_or_404(db, Contract, cid)
    if c.status != CT_RECEIVED:
        raise HTTPException(400, "Chỉ hoàn thành hợp đồng đã nhận về")
    c.status, c.completed_at = CT_DONE, utcnow()
    notify(db, f"HĐ {c.id} đã hoàn thành", c.customer, "success", roles="admin,kt")
    db.commit()
    return c


def record_payment(db: Session, cid: str, amount: float, type_: str, note: str) -> Contract:
    """Kế toán nhập tay tiền về → chờ Quản lý duyệt (chưa tính vào tiền đã về / tạm ứng)."""
    c = get_or_404(db, Contract, cid)
    if not amount or amount <= 0:
        raise HTTPException(400, "Số tiền phải lớn hơn 0")
    c.payments.append(Payment(date=utcnow(), amount=amount, type=type_ or "Thanh toán", note=note or "",
                              status=PAY_PENDING, created_by=actor(KT)))
    notify(db, f"Tiền về chờ duyệt — HĐ {cid}", f"{type_ or 'Thanh toán'}: {money(amount)} · {actor(KT)} nhập",
           "warning", roles="admin")
    db.commit()
    return c


def _payment(db: Session, pid: int) -> Payment:
    p = db.get(Payment, pid)
    if not p:
        raise HTTPException(404, f"Không tìm thấy khoản tiền về #{pid}")
    if p.status != PAY_PENDING:
        raise HTTPException(400, f"Khoản tiền này đã {p.status.lower()}")
    return p


def approve_payment(db: Session, pid: int) -> Contract:
    p = _payment(db, pid)
    c = p.contract
    p.status, p.approved_by, p.approved_at = PAY_OK, actor(QL), utcnow()
    if "tạm ứng" in (p.type or "").lower():
        c.advance_received = (c.advance_received or 0) + p.amount
        c.advance_received_at = c.advance_received_at or utcnow()
    notify(db, f"Đã duyệt tiền về HĐ {c.id}", f"{p.type}: {money(p.amount)}", "success", roles="kt,admin")
    db.commit()
    return c


def reject_payment(db: Session, pid: int, reason: str) -> Contract:
    p = _payment(db, pid)
    p.status, p.approved_by, p.approved_at, p.reject_reason = PAY_REJECTED, actor(QL), utcnow(), reason
    notify(db, f"Từ chối tiền về HĐ {p.contract_id}", f"{p.type}: {money(p.amount)} — {reason}", "error", roles="kt,admin")
    db.commit()
    return p.contract


# ---------------------------------------------------------------- lệnh sản xuất
def _log(x: Lsx, text: str) -> None:
    x.logs.append(LsxLog(at=utcnow(), text=text))


def create_lsx(db: Session, cid: str, name: str | None, qty: float | None, kg: float, lead_days: int) -> Lsx:
    c = get_or_404(db, Contract, cid)
    lead = lead_days or 7
    now = utcnow()
    x = Lsx(id=next_id(db, "LSX", "lsx"), contract_id=cid, name=name or f"Lệnh SX {c.code}", assigned_at=now,
            assigned_by=actor(QL), lead_days=lead, deadline=add_days(now, lead), status="Chờ nhận", qty_plan=qty or 0,
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


def vn_today():
    return utcnow().astimezone(VN_TZ).date()


def lsx_daily(db: Session, lid: str, day, kg: float, note: str) -> Lsx:
    """Xưởng báo sản lượng 1 ngày (kg; không làm thì 0). Nhập lại cùng ngày = sửa (lưu số cũ + giờ sửa).
    Lũy kế lệnh = tổng các ngày; mỗi lần nhập / sửa đều báo Quản lý kèm giờ để biết số liệu mới nhất."""
    x = get_or_404(db, Lsx, lid)
    if x.status not in ("Đang SX", "Hoàn thành"):
        raise HTTPException(400, f"Lệnh {lid} đang \"{x.status}\" — xưởng nhận lệnh trước khi báo sản lượng")
    if kg is None or kg < 0:
        raise HTTPException(400, "Khối lượng phải ≥ 0 (không làm thì nhập 0)")
    day = day or vn_today()
    if day > vn_today():
        raise HTTPException(400, "Không nhập sản lượng cho ngày tương lai")
    start = (x.accepted_at or x.assigned_at).astimezone(VN_TZ).date()
    if day < start:
        raise HTTPException(400, f"Lệnh nhận ngày {start:%d/%m/%Y} — không nhập cho ngày trước đó")
    now, who = utcnow(), actor(SX)
    row = next((d for d in x.daily if d.day == day), None)
    if row is None:
        x.daily.append(LsxDaily(day=day, kg=kg, note=note or "", created_at=now, created_by=who))
        verb = "báo"
    else:
        if row.kg == kg and (note or "") == (row.note or ""):
            return x
        row.prev_kg, row.kg, row.note, row.updated_at, row.updated_by = row.kg, kg, note or "", now, who
        verb = f"sửa ({fmt_kg(row.prev_kg)} → {fmt_kg(kg)})"
    db.flush()
    x.kg_done = round(sum(d.kg for d in x.daily), 3)
    if x.kg_plan and x.kg_done >= x.kg_plan - 0.5:
        x.status = "Hoàn thành"
    elif x.status == "Hoàn thành":
        x.status = "Đang SX"
    at = now.astimezone(VN_TZ).strftime("%H:%M %d/%m")
    _log(x, f"{who} {verb} sản lượng ngày {day:%d/%m}: {fmt_kg(kg)} — lũy kế {fmt_kg(x.kg_done)}/{fmt_kg(x.kg_plan)}")
    notify(db, f"{lid}: xưởng {verb.split(' ')[0]} sản lượng ngày {day:%d/%m} — {fmt_kg(kg)}",
           f"Lũy kế {fmt_kg(x.kg_done)} / {fmt_kg(x.kg_plan)} · {who} lúc {at}" + (f" · {note}" if note else ""),
           "info", roles="admin")
    db.commit()
    return x


def lsx_extend(db: Session, lid: str, to: datetime, reason: str) -> Lsx:
    x = get_or_404(db, Lsx, lid)
    x.ext_to, x.ext_reason, x.ext_approved_by, x.ext_at = to, reason, actor(QL), utcnow()
    _log(x, f"{actor(QL)} duyệt gia hạn đến {fmt_d(to)} — {reason}")
    db.commit()
    return x


# ---------------------------------------------------------------- kho & trạm cân
def create_receipt(db: Session, lsx_id: str, qty: float | None, kg: float | None, note: str,
                   items: list[dict] | None = None, dispatch: dict | None = None) -> Receipt:
    """Phiếu chuẩn bị hàng. Có `items` (SL từng mặt hàng của đơn) → tổng KL = Σ SL × KL/1 bộ, tổng SL = Σ SL."""
    import json
    x = get_or_404(db, Lsx, lsx_id)
    lines = []
    if items:
        c = db.get(Contract, x.contract_id)
        o = db.get(Order, c.order_id) if c else None
        by_id = {i.id: i for i in (o.items if o else [])}
        for it in items:
            if not it.get("qty"):
                continue
            oi = by_id.get(it["item_id"])
            if not oi:
                raise HTTPException(400, f"Mặt hàng #{it['item_id']} không thuộc đơn hàng của hợp đồng {x.contract_id}")
            per = oi.kg_per_unit if oi.kg_per_unit else (oi.kg / oi.qty if oi.qty else 0)
            lines.append({"itemId": oi.id, "name": oi.name, "unit": oi.unit, "qty": it["qty"], "kgPerUnit": per,
                          "kg": round(it["qty"] * per, 3)})
        if lines:
            qty = sum(l["qty"] for l in lines)
            kg = round(sum(l["kg"] for l in lines), 3)
    if not kg or kg <= 0:
        raise HTTPException(400, "Nhập số lượng từng mặt hàng (hoặc khối lượng) lớn hơn 0")
    r = Receipt(id=next_id(db, "PTN", "ptn"), lsx_id=lsx_id, contract_id=x.contract_id, date=utcnow(),
                qty=qty or 0, kg=kg, by=actor(KHO), note=note or "",
                items=json.dumps(lines, ensure_ascii=False) if lines else None)
    db.add(r)
    db.flush()
    # Quản lý giao xuống kho → kho thấy phiếu cân "Chờ cân" với số lượng được giao
    w = Weighing(id=next_id(db, "PC", "pc"), contract_id=x.contract_id, lsx_id=x.id, receipt_id=r.id, date=utcnow(),
                 kg_expected=r.kg, kg_actual=None, photo=None, signer_boc_xep="", signer_kho="", signer_lai_xe="",
                 by=actor(KHO), status="Chờ cân")
    db.add(w)
    what = "; ".join(f"{l['name']}: {l['qty']:g} {l['unit']}" for l in lines) or fmt_kg(r.kg)
    if dispatch and dispatch.get("driver"):
        w.signer_lai_xe = dispatch["driver"]
        w.vehicle_plate = (dispatch.get("vehicle_plate") or "").strip().upper() or None
    notify(db, f"Giao kho chuẩn bị hàng {r.id} → cân xuất {w.id}",
           f"HĐ {x.contract_id} · {what} · ~{fmt_kg(r.kg)}" + (f" · tài xế {dispatch['driver']}" if dispatch else ""),
           "info", roles="kho,admin")
    db.commit()
    if dispatch and dispatch.get("driver"):
        # thẻ đi mạ cho tài xế được chỉ định, gắn phiếu cân (KG cập nhật theo số cân thực khi kho cân xong)
        create_task(db, "di_ma", dispatch["driver"], x.contract_id, w.id, None, f"Chuyến hàng {r.id}",
                    dispatch.get("vehicle_plate"), dispatch.get("galvanizer_id"), dispatch.get("arrive_at"),
                    dispatch.get("fill_deadline"))
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


def fill_weighing(db: Session, pid: str, kg_actual: float | None, photo: str | None, reason: str | None,
                  reason_note: str | None, signer_lai_xe: str | None = None, gross: float | None = None,
                  tare: float | None = None, weigh_in=None, weigh_out=None, plate: str | None = None) -> Weighing:
    """Kho cân xe: hàng = (xe + hàng) − xe. So với số Quản lý giao (kg_expected): thiếu trong PC_TOLERANCE_PCT% → đạt;
    thiếu quá PC_TOLERANCE_PCT% hoặc LỚN HƠN số giao → bắt buộc lý do + biên bản chờ Quản lý duyệt.
    Chỉ phiếu đạt / đã duyệt mới tính vào công nợ."""
    p = get_or_404(db, Weighing, pid)
    if gross is not None or tare is not None:
        if gross is None or tare is None:
            raise HTTPException(400, "Nhập đủ trọng lượng xe + hàng và trọng lượng xe")
        if tare > gross:
            raise HTTPException(400, "Trọng lượng xe không được lớn hơn tổng xe + hàng")
        kg_actual = round(gross - tare, 3)
        p.gross_kg, p.tare_kg = gross, tare
    if kg_actual is None:
        raise HTTPException(400, "Chưa nhập số cân")
    if weigh_in is not None:
        p.weigh_in_at = weigh_in if weigh_in.tzinfo else weigh_in.replace(tzinfo=VN_TZ)
    if weigh_out is not None:
        p.weigh_out_at = weigh_out if weigh_out.tzinfo else weigh_out.replace(tzinfo=VN_TZ)
    if p.weigh_in_at and p.weigh_out_at and p.weigh_out_at < p.weigh_in_at:
        raise HTTPException(400, "Giờ cân ra phải sau giờ cân vào")
    if plate:
        p.vehicle_plate = plate.strip().upper()
    p.kg_actual = kg_actual or 0
    for t in db.scalars(select(Task).where(Task.ref_id == p.id, Task.type == "di_ma", Task.kg_at_galv.is_(None))):
        t.kg_required = p.kg_actual  # thẻ đi mạ đã giao trước khi cân → KG theo số cân thực
    if photo:
        p.photo = photo
    if signer_lai_xe:
        p.signer_lai_xe = signer_lai_xe
    exp = p.kg_expected or 0
    over = exp and p.kg_actual > exp + 0.001  # cân LỚN HƠN số giao (bất kỳ) → lý do + duyệt
    short = exp and exp - p.kg_actual > exp * PC_TOLERANCE_PCT / 100  # cân NHỎ HƠN quá 5% → lý do + duyệt
    if over or short:
        if not (reason or "").strip():
            raise HTTPException(400, ("Cân lớn hơn số Quản lý giao" if over else f"Cân thiếu quá {PC_TOLERANCE_PCT:g}% so với số Quản lý giao")
                                + " — bắt buộc nhập lý do")
        if p.receipt_id:  # Chuẩn bị hàng: chỉ cần Quản lý duyệt / từ chối, chưa đưa vào sai lệch / kho ảo
            p.status, p.reason, p.reason_note, p.reject_reason = "Chờ QL duyệt", reason, reason_note or "", None
            p.approved_by = p.approved_at = None
        else:
            m = create_mismatch(db, "Trạm cân công ty", "pc", p.id, p.contract_id, exp, p.kg_actual,
                                reason, reason_note, actor(KHO), "Kho")
            p.mismatch_id, p.status = m.id, "Lệch — chờ ký"
        notify(db, f"{p.id}: cân xuất {'dư' if over else 'thiếu'} {(p.kg_actual - exp) / exp * 100:+.1f}% — chờ Quản lý duyệt",
               f"{p.receipt_id or ''} · giao {fmt_kg(exp)} · cân {fmt_kg(p.kg_actual)} · {reason}", "warning", roles="admin")
    else:
        p.mismatch_id, p.status, p.reason, p.reason_note, p.reject_reason = None, "Đã cân", None, None, None
        _billed_notify(db, p)
    db.commit()
    return p


def approve_weighing(db: Session, pid: str) -> Weighing:
    """Quản lý duyệt phiếu cân lệch (Chuẩn bị hàng) → tính vào công nợ."""
    p = get_or_404(db, Weighing, pid)
    if p.status != "Chờ QL duyệt":
        raise HTTPException(400, f"Phiếu {pid} không ở trạng thái chờ duyệt")
    p.status, p.approved_by, p.approved_at = "Đã cân", actor(QL), utcnow()
    _billed_notify(db, p)
    notify(db, f"Quản lý đã duyệt phiếu cân {pid}", f"{fmt_kg(p.kg_actual)} — {p.reason}", "success", roles="kho,admin")
    db.commit()
    return p


def reject_weighing(db: Session, pid: str, reason: str) -> Weighing:
    """Quản lý từ chối → kho cân lại."""
    p = get_or_404(db, Weighing, pid)
    if p.status != "Chờ QL duyệt":
        raise HTTPException(400, f"Phiếu {pid} không ở trạng thái chờ duyệt")
    p.status, p.reject_reason, p.approved_by, p.approved_at = "QL từ chối", reason, actor(QL), utcnow()
    notify(db, f"Quản lý từ chối phiếu cân {pid} — cân lại", reason, "error", roles="kho,admin")
    db.commit()
    return p


def _billed_notify(db: Session, p: Weighing) -> None:
    c = db.get(Contract, p.contract_id)
    if c:
        notify(db, f"{p.id}: cân xuất {fmt_kg(p.kg_actual)} — đã tính vào công nợ HĐ {c.id}",
               f"Ghi tăng {money_short((p.kg_actual or 0) * (c.unit_price or 0))}", "success", roles="admin,kt")


def billed_kg(db: Session, cid: str) -> tuple[float, float]:
    """(kg cân xuất đã tính công nợ, kg đang chờ Quản lý duyệt) của hợp đồng."""
    ok = pend = 0.0
    for p in db.scalars(select(Weighing).where(Weighing.contract_id == cid)):
        if p.kg_actual is None:
            continue
        if p.status == "Đã cân":
            ok += p.kg_actual
        elif p.status in ("Lệch — chờ ký", "Chờ QL duyệt"):
            pend += p.kg_actual
    return ok, pend


# ---------------------------------------------------------------- thẻ công việc lái xe
def _kg_from_ref(db: Session, type_: str, ref_id: str | None) -> float:
    """KG yêu cầu tự lấy từ chứng từ gốc: đi mạ ← phiếu cân xuất (PC); giao khách ← thẻ đi mạ (mạ đã cân nhận)."""
    if not ref_id:
        return 0
    if type_ == "di_ma":
        p = db.get(Weighing, ref_id)
        return (p.kg_actual if p and p.kg_actual is not None else (p.kg_expected if p else 0)) or 0
    t = db.get(Task, ref_id)
    return (t.kg_at_galv if t and t.kg_at_galv is not None else (t.kg_required if t else 0)) or 0


def _galv_of_ref(db: Session, ref_id: str | None) -> int | None:
    """Giao khách: điểm lấy hàng = xưởng mạ của thẻ đi mạ gốc."""
    t = db.get(Task, ref_id) if ref_id else None
    return t.galvanizer_id if t else None


def create_task(db: Session, type_: str, driver: str, cid: str, ref_id: str | None, kg_required: float | None,
                note: str, vehicle_plate: str | None = None, galvanizer_id: int | None = None, arrive_at=None,
                fill_deadline=None, **deliver) -> Task:
    if type_ not in ("di_ma", "giao_khach"):
        raise HTTPException(400, "Loại thẻ phải là di_ma hoặc giao_khach")
    get_or_404(db, Contract, cid)
    if not arrive_at:
        raise HTTPException(400, "Chưa nhập ngày giờ lái xe phải có mặt")
    if arrive_at.tzinfo is None:
        arrive_at = arrive_at.replace(tzinfo=VN_TZ)
    if fill_deadline is not None and fill_deadline.tzinfo is None:
        fill_deadline = fill_deadline.replace(tzinfo=VN_TZ)
    fill_deadline = fill_deadline or add_hours(arrive_at, FILL_HOURS)  # hạn trả phiếu do Quản lý đặt khi giao việc
    if fill_deadline <= arrive_at:
        raise HTTPException(400, "Hạn trả phiếu phải sau giờ lái xe có mặt")
    kg = kg_required if kg_required else _kg_from_ref(db, type_, ref_id)
    t = Task(id=next_id(db, "VC", "vc"), type=type_, driver=driver, contract_id=cid, ref_id=ref_id,
             assigned_at=utcnow(), status="Chờ xác nhận", kg_required=kg or 0, note=note or "",
             vehicle_plate=(vehicle_plate or "").strip().upper() or None,
             galvanizer_id=galvanizer_id if type_ == "di_ma" else _galv_of_ref(db, ref_id),
             arrive_at=arrive_at, fill_deadline=fill_deadline)
    if type_ == "giao_khach":
        t.deliver_customer_id = deliver.get("deliver_customer_id")
        for k in ("deliver_name", "deliver_address", "receiver_name", "receiver_phone", "contact_name", "contact_phone"):
            setattr(t, k, (deliver.get(k) or "").strip())
    db.add(t)
    where = (t.deliver_address or t.deliver_name) if type_ == "giao_khach" else "xưởng mạ"
    notify(db, f"Thẻ công việc mới {t.id}",
           f"{'Chở hàng đi mạ' if type_ == 'di_ma' else 'Lấy hàng mạ giao khách'} — gán {driver} · có mặt "
           f"{arrive_at.astimezone(VN_TZ):%H:%M %d/%m} · trả phiếu trước {fill_deadline.astimezone(VN_TZ):%H:%M %d/%m}"
           + (f" · {where}" if where else ""), "info")
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
    t.status, t.departed_at = "Đang chạy", now
    t.fill_deadline = t.fill_deadline or add_hours(now, FILL_HOURS)  # giữ hạn trả phiếu Quản lý đã đặt khi giao việc
    db.commit()
    return t


def _task_result(db: Session, t: Task, off: bool, what: str, reason: str | None, reason_note: str | None) -> None:
    """Có lệch → bắt lý do, thẻ chờ Quản lý duyệt (không tạo biên bản sai lệch; kho ảo chỉ thống kê). Không lệch → xong."""
    t.filled_at = utcnow()
    if off:
        if not (reason or "").strip():
            raise HTTPException(400, f"{what} — bắt buộc chọn lý do")
        t.status, t.reason, t.reason_note, t.reject_reason_ql = "Chờ QL duyệt", reason, reason_note or "", None
        t.approved_by = t.approved_at = None
        notify(db, f"{t.id}: {what} — chờ Quản lý duyệt", f"{t.driver} · {reason}" + (f" — {reason_note}" if reason_note else ""),
               "warning", roles="admin")
    else:
        t.status, t.reason, t.reason_note, t.reject_reason_ql = "Hoàn thành", None, None, None


def task_fill_galv(db: Session, tid: str, kg: float, photo: str | None, reason: str | None,
                   reason_note: str | None) -> Task:
    t = get_or_404(db, Task, tid)
    if t.type != "di_ma":
        raise HTTPException(400, "Thẻ này không phải thẻ đi mạ")
    if t.status not in ("Đang chạy", "Chờ QL duyệt"):
        raise HTTPException(400, f"Thẻ đang \"{t.status}\" — xuất phát trước khi điền phiếu")
    t.kg_at_galv = kg or 0
    if photo:
        t.photo = photo
    d = t.kg_at_galv - (t.kg_required or 0)
    _task_result(db, t, bool(t.kg_required) and abs(d) > TOLERANCE_KG, f"Mạ cân lệch {d:+g} kg", reason, reason_note)
    db.commit()
    return t


def task_fill_delivery(db: Session, tid: str, kg_picked: float, kg_delivered: float, photo: str | None,
                       reason: str | None, reason_note: str | None) -> Task:
    t = get_or_404(db, Task, tid)
    if t.type != "giao_khach":
        raise HTTPException(400, "Thẻ này không phải thẻ giao khách")
    if t.status not in ("Đang chạy", "Chờ QL duyệt"):
        raise HTTPException(400, f"Thẻ đang \"{t.status}\" — xuất phát trước khi điền phiếu")
    t.kg_picked, t.kg_delivered = kg_picked or 0, kg_delivered or 0
    if photo:
        t.photo = photo
    delta = t.kg_delivered - t.kg_picked
    off_req = bool(t.kg_required) and abs(t.kg_picked - t.kg_required) > TOLERANCE_KG
    what = f"Khách ký lệch {delta:+g} kg" if abs(delta) > 0.5 else f"Lấy từ mạ lệch {t.kg_picked - t.kg_required:+g} kg"
    _task_result(db, t, abs(delta) > 0.5 or off_req, what, reason, reason_note)
    if t.status == "Hoàn thành":
        c = db.get(Contract, t.contract_id)
        notify(db, f"Đã giao {fmt_kg(t.kg_delivered)} cho khách", f"HĐ {t.contract_id}" + (f" · {c.customer}" if c else ""),
               "success")
    db.commit()
    return t


def approve_task(db: Session, tid: str) -> Task:
    t = get_or_404(db, Task, tid)
    if t.status != "Chờ QL duyệt":
        raise HTTPException(400, f"Thẻ {tid} không ở trạng thái chờ duyệt")
    t.status, t.approved_by, t.approved_at = "Hoàn thành", actor(QL), utcnow()
    notify(db, f"Quản lý chấp nhận phiếu {tid}", f"{t.driver} · {t.reason}", "success", roles="lx,admin")
    db.commit()
    return t


def reject_task(db: Session, tid: str, reason: str) -> Task:
    """Không chấp nhận → thẻ về Đang chạy, lái xe điền lại phiếu."""
    t = get_or_404(db, Task, tid)
    if t.status != "Chờ QL duyệt":
        raise HTTPException(400, f"Thẻ {tid} không ở trạng thái chờ duyệt")
    t.status, t.reject_reason_ql, t.approved_by, t.approved_at = "Đang chạy", reason, actor(QL), utcnow()
    notify(db, f"Quản lý không chấp nhận phiếu {tid} — điền lại", f"{t.driver}: {reason}", "error", roles="lx,admin")
    db.commit()
    return t


# ---------------------------------------------------------------- sai lệch & kho ảo
def sign_mismatch(db: Session, mid: str) -> Mismatch:
    m = get_or_404(db, Mismatch, mid)
    m.status, m.signed_by, m.signed_at = "Đã ký xác nhận", actor(QL), utcnow()
    ref = db.get(Weighing if m.ref_type == "pc" else Task, m.ref_id)
    if ref is not None and getattr(ref, "status", None) == "Lệch — chờ ký":
        ref.status = "Đã cân"
        if m.ref_type == "pc":
            _billed_notify(db, ref)  # Quản lý duyệt → tính vào công nợ
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
def find_customer(db: Session, name: str) -> Customer | None:
    """Khách theo tên (không phân biệt hoa thường) hoặc mã viết tắt."""
    key = (name or "").strip().lower()
    if not key:
        return None
    cus = list(db.scalars(select(Customer)))
    return next((c for c in cus if c.name.strip().lower() == key), None) \
        or next((c for c in cus if c.short_code and c.short_code.strip().lower() == key), None)


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
    cu = find_customer(db, name)
    if cu is None:
        cu = Customer(name=name, active=True, created_at=utcnow())
        db.add(cu)
        db.flush()
    return cu


def customer_ids_for_tag(db: Session, tag: int) -> set[int]:
    return set(db.scalars(select(customer_tags.c.customer_id).where(customer_tags.c.tag_id == tag)))


def customer_ids_for_segment(db: Session, segment: str) -> set[int]:
    from .models import Customer
    return set(db.scalars(select(Customer.id).where(Customer.segment == segment)))


def contract_ids_for_customers(db: Session, cus: set[int]) -> set[str]:
    return set(db.scalars(select(Order.contract_id).where(Order.customer_id.in_(cus), Order.contract_id.is_not(None))))


def contract_ids_for_tag(db: Session, tag: int) -> set[str]:
    """Hợp đồng thuộc khách mang thẻ `tag` (qua đơn hàng gốc → khách hàng)."""
    cus = customer_ids_for_tag(db, tag)
    return {o.contract_id for o in db.scalars(select(Order).where(Order.customer_id.in_(cus))) if o.contract_id}
