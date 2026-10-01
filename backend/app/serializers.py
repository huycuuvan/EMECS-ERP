"""ORM → JSON camelCase, giữ đúng shape bản demo để FE dùng thẳng."""
from .models import (Contract, Lsx, Mismatch, Notification, Order, Receipt, Task, VLoss, Weighing)
from .files import sign_photo
from .utils import iso


def order(o: Order) -> dict:
    return {
        "id": o.id, "customer": o.customer, "code": o.code, "date": iso(o.date), "file": o.file,
        "items": [{"id": i.id, "name": i.name, "qty": i.qty, "unit": i.unit, "kg": i.kg, "price": i.price}
                  for i in o.items],
        "totalKg": o.total_kg, "value": o.value, "status": o.status, "contractId": o.contract_id, "note": o.note,
    }


def contract(c: Contract) -> dict:
    return {
        "id": c.id, "orderId": c.order_id, "code": c.code, "customer": c.customer,
        "sentToKtAt": iso(c.sent_to_kt_at), "dueAt": iso(c.due_at), "returnedAt": iso(c.returned_at),
        "signDate": iso(c.sign_date), "status": c.status, "owner": c.owner, "totalQty": c.total_qty,
        "unit": c.unit, "totalKg": c.total_kg, "unitPrice": c.unit_price, "value": c.value, "vatPct": c.vat_pct,
        "advance": {"pct": c.advance_pct, "required": c.advance_required, "received": c.advance_received,
                    "receivedAt": iso(c.advance_received_at)},
        "payments": [{"id": p.id, "date": iso(p.date), "amount": p.amount, "type": p.type, "note": p.note}
                     for p in c.payments],
        "note": c.note,
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
    }


def receipt(r: Receipt) -> dict:
    return {"id": r.id, "lsxId": r.lsx_id, "contractId": r.contract_id, "date": iso(r.date), "qty": r.qty,
            "kg": r.kg, "by": r.by, "note": r.note}


def weighing(p: Weighing, photo: bool = True) -> dict:
    return {
        "id": p.id, "contractId": p.contract_id, "lsxId": p.lsx_id, "date": iso(p.date),
        "kgExpected": p.kg_expected, "kgActual": p.kg_actual, "photo": sign_photo(p.photo) if photo else None,
        "hasPhoto": bool(p.photo),
        "signers": {"bocXep": p.signer_boc_xep, "kho": p.signer_kho, "laiXe": p.signer_lai_xe},
        "by": p.by, "mismatchId": p.mismatch_id, "status": p.status, "lossAccepted": p.loss_accepted,
    }


def task(t: Task, photo: bool = True) -> dict:
    return {
        "id": t.id, "type": t.type, "driver": t.driver, "contractId": t.contract_id, "refId": t.ref_id,
        "assignedAt": iso(t.assigned_at), "status": t.status, "acceptedAt": iso(t.accepted_at),
        "departedAt": iso(t.departed_at), "fillDeadline": iso(t.fill_deadline), "kgRequired": t.kg_required,
        "kgAtGalv": t.kg_at_galv, "kgPicked": t.kg_picked, "kgDelivered": t.kg_delivered,
        "filledAt": iso(t.filled_at), "photo": sign_photo(t.photo) if photo else None, "hasPhoto": bool(t.photo), "rejectReason": t.reject_reason,
        "mismatchId": t.mismatch_id, "note": t.note, "lossAccepted": t.loss_accepted,
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
