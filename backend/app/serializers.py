"""ORM → JSON camelCase, giữ đúng shape bản demo để FE dùng thẳng."""
from datetime import timedelta

from .models import (Contract, Lsx, Mismatch, Notification, Order, Receipt, Task, VLoss, Weighing)
from .files import sign_photo
from .utils import iso


def vat_amount(o: Order) -> int:
    return round((o.value or 0) * (o.vat_pct if o.vat_pct is not None else 10) / 100)


def order(o: Order) -> dict:
    return {
        "id": o.id, "customer": o.customer, "code": o.code, "date": iso(o.date), "file": sign_photo(o.file),
        "items": [{"id": i.id, "name": i.name, "qty": i.qty, "unit": i.unit,
                   "kgPerUnit": i.kg_per_unit if i.kg_per_unit is not None else (i.kg / i.qty if i.qty else 0),
                   "kg": i.kg, "price": i.price, "amount": round(i.kg * i.price), "note": i.note or ""}
                  for i in o.items],
        "totalKg": o.total_kg, "value": o.value, "vatPct": o.vat_pct, "vatAmount": vat_amount(o),
        "valueAfterVat": o.value + vat_amount(o),
        "status": o.status, "contractId": o.contract_id, "note": o.note, "customerId": o.customer_id,
        "completeBy": iso(o.complete_by),
    }


def payment(p) -> dict:
    return {"id": p.id, "date": iso(p.date), "amount": p.amount, "type": p.type, "note": p.note,
            "status": p.status or "Đã duyệt", "createdBy": p.created_by or "", "approvedBy": p.approved_by,
            "approvedAt": iso(p.approved_at), "rejectReason": p.reject_reason}


def contract(c: Contract) -> dict:
    return {
        "id": c.id, "orderId": c.order_id, "code": c.code, "customer": c.customer,
        "sentToKtAt": iso(c.sent_to_kt_at), "dueAt": iso(c.due_at), "returnedAt": iso(c.returned_at),
        "signDate": iso(c.sign_date), "status": c.status, "owner": c.owner, "totalQty": c.total_qty,
        "unit": c.unit, "totalKg": c.total_kg, "unitPrice": c.unit_price, "value": c.value, "vatPct": c.vat_pct,
        "advance": {"pct": c.advance_pct, "required": c.advance_required, "received": c.advance_received,
                    "receivedAt": iso(c.advance_received_at)},
        "payments": [payment(p) for p in c.payments],
        "pendingPayment": sum(p.amount for p in c.payments if p.status == "Chờ duyệt"),
        "note": c.note, "number": c.number or c.order_id, "signedFile": sign_photo(c.signed_file), "completeBy": iso(c.complete_by),
        "draftedAt": iso(c.drafted_at), "completedAt": iso(c.completed_at),
    }


def lsx(x: Lsx) -> dict:
    return {
        "id": x.id, "contractId": x.contract_id, "name": x.name, "assignedAt": iso(x.assigned_at),
        "assignedBy": x.assigned_by, "leadDays": x.lead_days, "deadline": iso(x.deadline), "status": x.status,
        "acceptedAt": iso(x.accepted_at), "acceptedBy": x.accepted_by, "rejectReason": x.reject_reason,
        "qtyPlan": x.qty_plan, "kgPlan": x.kg_plan, "qtyDone": x.qty_done, "kgDone": x.kg_done,
        "extension": ({"to": iso(x.ext_to), "reason": x.ext_reason, "approvedBy": x.ext_approved_by,
                       "at": iso(x.ext_at)} if x.ext_to else None),
        "log": [{"at": iso(lg.at), "text": lg.text} for lg in x.logs],
        **daily_info(x),
    }


def daily_info(x: Lsx) -> dict:
    """Sản lượng theo ngày + giờ cập nhật gần nhất (để Quản lý biết số liệu mới tới đâu)."""
    from .db import utcnow
    from .utils import VN_TZ
    today = utcnow().astimezone(VN_TZ).date()
    rows = sorted(x.daily, key=lambda d: d.day)
    out, run = [], 0.0
    for d in rows:
        run += d.kg or 0
        out.append({"id": d.id, "day": d.day.isoformat(), "kg": d.kg, "cumKg": round(run, 3), "note": d.note or "",
                    "createdAt": iso(d.created_at), "createdBy": d.created_by, "updatedAt": iso(d.updated_at),
                    "updatedBy": d.updated_by, "prevKg": d.prev_kg})
    last = max((d.updated_at or d.created_at for d in rows if d.created_at), default=None)
    t = next((d for d in rows if d.day == today), None)
    yday = today - timedelta(days=1)
    y = next((d for d in rows if d.day == yday), None)
    # ngày đã qua tới hôm qua mà xưởng KHÔNG nhập sản lượng (kể cả 0 cũng phải nhập). Đếm từ lần nhập đầu tiên
    # (trước đó là số dư chuyển sang khi chưa có nhập theo ngày); chưa nhập lần nào → từ ngày nhận lệnh.
    missed = []
    if x.status == "Đang SX" and (x.accepted_at or x.assigned_at):
        start = rows[0].day if rows else (x.accepted_at or x.assigned_at).astimezone(VN_TZ).date()
        have = {d.day for d in rows}
        day = yday
        while day >= start and len(missed) < 30:
            if day not in have:
                missed.append(day.isoformat())
            day -= timedelta(days=1)
    entry = lambda d: {"kg": d.kg, "at": iso(d.updated_at or d.created_at), "edited": bool(d.updated_at)}  # noqa: E731
    return {"daily": out[::-1], "lastUpdateAt": iso(last), "today": entry(t) if t else None,
            "yesterday": entry(y) if y else None, "missedYesterday": yday.isoformat() in missed, "missedDays": missed}


def receipt(r: Receipt) -> dict:
    return {"id": r.id, "lsxId": r.lsx_id, "contractId": r.contract_id, "date": iso(r.date), "qty": r.qty,
            "kg": r.kg, "by": r.by, "note": r.note, "items": _json_list(r.items)}


def _json_list(v) -> list:
    import json
    try:
        return json.loads(v) if v else []
    except ValueError:
        return []


def weighing(p: Weighing, photo: bool = True) -> dict:
    return {
        "id": p.id, "contractId": p.contract_id, "lsxId": p.lsx_id, "date": iso(p.date),
        "kgExpected": p.kg_expected, "kgActual": p.kg_actual, "photo": sign_photo(p.photo) if photo else None,
        "hasPhoto": bool(p.photo),
        "signers": {"bocXep": p.signer_boc_xep, "kho": p.signer_kho, "laiXe": p.signer_lai_xe},
        "by": p.by, "mismatchId": p.mismatch_id, "status": p.status, "lossAccepted": p.loss_accepted,
        "receiptId": p.receipt_id, "grossKg": p.gross_kg, "tareKg": p.tare_kg, "weighInAt": iso(p.weigh_in_at),
        "weighOutAt": iso(p.weigh_out_at), "vehiclePlate": p.vehicle_plate,
        "approved": p.kg_actual is not None and p.status == "Đã cân",  # tính vào công nợ
        "reason": p.reason, "reasonNote": p.reason_note, "approvedBy": p.approved_by, "approvedAt": iso(p.approved_at),
        "rejectReason": p.reject_reason,
    }


def task(t: Task, photo: bool = True) -> dict:
    return {
        "id": t.id, "type": t.type, "driver": t.driver, "contractId": t.contract_id, "refId": t.ref_id,
        "assignedAt": iso(t.assigned_at), "status": t.status, "acceptedAt": iso(t.accepted_at),
        "departedAt": iso(t.departed_at), "fillDeadline": iso(t.fill_deadline), "kgRequired": t.kg_required,
        "kgAtGalv": t.kg_at_galv, "kgPicked": t.kg_picked, "kgDelivered": t.kg_delivered,
        "filledAt": iso(t.filled_at), "photo": sign_photo(t.photo) if photo else None, "hasPhoto": bool(t.photo), "rejectReason": t.reject_reason,
        "mismatchId": t.mismatch_id, "note": t.note, "lossAccepted": t.loss_accepted,
        "vehiclePlate": t.vehicle_plate, "galvanizerId": t.galvanizer_id, "arriveAt": iso(t.arrive_at),
        "reason": t.reason, "reasonNote": t.reason_note, "approvedBy": t.approved_by, "approvedAt": iso(t.approved_at),
        "qlRejectReason": t.reject_reason_ql,
        "deliver": ({"customerId": t.deliver_customer_id, "name": t.deliver_name or "", "address": t.deliver_address or "",
                     "receiverName": t.receiver_name or "", "receiverPhone": t.receiver_phone or "",
                     "contactName": t.contact_name or "", "contactPhone": t.contact_phone or ""}
                    if t.type == "giao_khach" else None),
    }


def mismatch(m: Mismatch) -> dict:
    return {
        "id": m.id, "source": m.source, "refType": m.ref_type, "refId": m.ref_id, "contractId": m.contract_id,
        "date": iso(m.date), "expected": m.expected, "actual": m.actual, "delta": m.delta, "reason": m.reason,
        "reasonNote": m.reason_note, "reportedBy": m.reported_by, "dept": m.dept, "status": m.status,
        "signedBy": m.signed_by, "signedAt": iso(m.signed_at),
    }


def vloss(e: VLoss) -> dict:
    return {
        "id": e.id, "date": iso(e.date), "refType": e.ref_type, "refId": e.ref_id, "contractId": e.contract_id,
        "source": e.source, "kg": e.kg, "approvedBy": e.approved_by, "note": e.note, "status": e.status,
        "resolution": e.resolution, "resolvedAt": iso(e.resolved_at), "resolvedNote": e.resolved_note,
    }


def notification(n: Notification) -> dict:
    return {"id": n.id, "at": iso(n.at), "title": n.title, "sub": n.sub, "type": n.type, "read": n.read}
