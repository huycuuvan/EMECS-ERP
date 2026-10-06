"""Xóa bản ghi các module — chỉ Quản lý, bắt buộc lý do (ghi vào thông báo cho Quản lý + nhật ký thao tác).

Giấy tờ thương mại (đơn hàng + hợp đồng + tiền về + gia hạn) xóa cùng nhau: xóa đơn → xóa kèm hợp đồng; xóa hợp đồng
→ xóa kèm tiền về, đơn quay về "Chốt đơn". Hàng đi thật thì nối thành chuỗi: Lệnh SX → Chuẩn bị hàng (+ phiếu cân tự tạo)
→ Thẻ đi mạ → Thẻ giao khách — bản ghi đã có chứng từ phía sau thì KHÔNG xóa được, báo rõ cần xóa cái nào trước
(xóa từ cuối chuỗi ngược lên) để số liệu đối ứng không bị lệch. Khoản lệch kho ảo / biên bản sai lệch của bản ghi
bị xóa được xóa theo.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import schemas as SC
from . import services as svc
from .db import get_db
from .models import (Contract, ContractExtension, Lsx, MaterialReceipt, Mismatch, Order, Payment, Receipt, Task, VLoss,
                     Weighing)
from .security import actor, require_roles

router = APIRouter(prefix="/api", dependencies=[Depends(require_roles("admin"))])
DB = Depends(get_db)


def _ids(rows) -> str:
    ids = [r.id for r in rows]
    return ", ".join(ids[:5]) + (f" … (+{len(ids) - 5})" if len(ids) > 5 else "")


def _block(rows, what: str, rec: str) -> None:
    if rows:
        raise HTTPException(400, f"{rec} đã có {what} {_ids(rows)} — xóa {what} trước (xóa từ cuối chuỗi ngược lên)")


def _drop_derived(db: Session, ref_type: str, ref_id: str) -> None:
    """Khoản kho ảo + biên bản sai lệch sinh ra từ bản ghi bị xóa."""
    for m in db.scalars(select(Mismatch).where(Mismatch.ref_type == ref_type, Mismatch.ref_id == ref_id)):
        db.delete(m)
    for v in db.scalars(select(VLoss).where(VLoss.ref_type == ref_type, VLoss.ref_id == ref_id)):
        db.delete(v)


def _done(db: Session, what: str, rid: str, reason: str) -> dict:
    svc.notify(db, f"Đã xóa {what} {rid}", f"{actor('Quản lý')} · lý do: {reason}", "warning", roles="admin", ref="")
    db.commit()
    return {"ok": True}


def _contract_blockers(db: Session, cid: str) -> str | None:
    """Hợp đồng đã có hàng đi thật (sản xuất / kho / xe) → không xóa (số đối ứng sẽ sai)."""
    for model, col, what in ((Lsx, Lsx.contract_id, "lệnh SX"), (Receipt, Receipt.contract_id, "phiếu chuẩn bị hàng"),
                             (Weighing, Weighing.contract_id, "phiếu cân"), (Task, Task.contract_id, "thẻ lái xe")):
        rows = db.scalars(select(model).where(col == cid)).all()
        if rows:
            return f"Hợp đồng {cid} đã có {what} {_ids(rows)} — xóa {what} trước (xóa từ cuối chuỗi ngược lên)"
    return None


def _contract_cascade(db: Session, c: Contract) -> list[str]:
    out = [f"hợp đồng {c.id}"]
    if c.payments:
        out.append(f"{len(c.payments)} khoản tiền về ({svc.money(sum(p.amount for p in c.payments))})")
    n_ext = len(db.scalars(select(ContractExtension.id).where(ContractExtension.contract_id == c.id)).all())
    if n_ext:
        out.append(f"{n_ext} lần xin gia hạn")
    return out


def _drop_contract(db: Session, c: Contract) -> None:
    """Hợp đồng + tiền về + gia hạn là 1 bộ giấy tờ → xóa cùng nhau."""
    for e in db.scalars(select(ContractExtension).where(ContractExtension.contract_id == c.id)):
        db.delete(e)
    db.delete(c)  # tiền về xóa theo (cascade)


def plan(db: Session, kind: str, rid: str) -> dict:
    """Xem trước khi xóa: {block: lý do không xóa được | None, cascade: [những gì bị xóa kèm]}."""
    if kind == "dh":
        o = svc.get_or_404(db, Order, rid)
        c = db.get(Contract, o.contract_id) if o.contract_id else None
        if c:
            return {"block": _contract_blockers(db, c.id), "cascade": _contract_cascade(db, c)}
        return {"block": None, "cascade": []}
    if kind == "hd":
        c = svc.get_or_404(db, Contract, rid)
        return {"block": _contract_blockers(db, rid), "cascade": _contract_cascade(db, c)[1:] + ["đơn hàng quay về \"Chốt đơn\""]}
    return {"block": None, "cascade": []}


@router.get("/delete-preview/{kind}/{rid}")
def delete_preview(kind: str, rid: str, db: Session = DB):
    return plan(db, kind, rid)


@router.delete("/orders/{oid}")
def delete_order(oid: str, body: SC.ReasonIn, db: Session = DB):
    """Xóa đơn → xóa kèm hợp đồng của đơn (+ tiền về, gia hạn) nếu chưa có hàng đi thật."""
    o = svc.get_or_404(db, Order, oid)
    c = db.get(Contract, o.contract_id) if o.contract_id else None
    if c:
        if (b := _contract_blockers(db, c.id)):
            raise HTTPException(400, b)
        _drop_contract(db, c)
    db.delete(o)
    return _done(db, "đơn hàng", oid + (f" (kèm hợp đồng {c.id})" if c else ""), body.reason)


@router.delete("/contracts/{cid}")
def delete_contract(cid: str, body: SC.ReasonIn, db: Session = DB):
    """Xóa hợp đồng (+ tiền về, gia hạn) → đơn hàng quay về "Chốt đơn" (chuyển kế toán lại được)."""
    c = svc.get_or_404(db, Contract, cid)
    if (b := _contract_blockers(db, cid)):
        raise HTTPException(400, b)
    o = db.get(Order, c.order_id)
    if o and o.contract_id == cid:
        o.contract_id, o.status = None, "Chốt đơn"
    _drop_contract(db, c)
    return _done(db, "hợp đồng", cid, body.reason)


@router.delete("/payments/{pid}")
def delete_payment(pid: int, body: SC.ReasonIn, db: Session = DB):
    """Xóa khoản tiền về nhập sai. Khoản tạm ứng đã duyệt → trừ lại số tạm ứng đã về."""
    p = svc.get_or_404(db, Payment, pid)
    c = p.contract
    if p.status == svc.PAY_OK and "tạm ứng" in (p.type or "").lower():
        c.advance_received = max(0, (c.advance_received or 0) - p.amount)
    db.delete(p)
    return _done(db, f"khoản tiền về {svc.money(p.amount)} của HĐ", c.id, body.reason)


@router.delete("/lsx/{lid}")
def delete_lsx(lid: str, body: SC.ReasonIn, db: Session = DB):
    x = svc.get_or_404(db, Lsx, lid)
    _block(db.scalars(select(Receipt).where(Receipt.lsx_id == lid)).all(), "phiếu chuẩn bị hàng", f"Lệnh {lid}")
    _block(db.scalars(select(Weighing).where(Weighing.lsx_id == lid)).all(), "phiếu cân", f"Lệnh {lid}")
    db.delete(x)  # kèm sản lượng theo ngày + nhật ký lệnh
    return _done(db, "lệnh sản xuất", lid, body.reason)


def _tasks_of_weighings(db: Session, pcs) -> list[Task]:
    ids = [p.id for p in pcs]
    return db.scalars(select(Task).where(Task.ref_id.in_(ids))).all() if ids else []


@router.delete("/receipts/{rid}")
def delete_receipt(rid: str, body: SC.ReasonIn, db: Session = DB):
    """Xóa phiếu chuẩn bị hàng + phiếu cân tự tạo của nó (chưa có thẻ lái xe nào chở)."""
    r = svc.get_or_404(db, Receipt, rid)
    pcs = db.scalars(select(Weighing).where(Weighing.receipt_id == rid)).all()
    _block(_tasks_of_weighings(db, pcs), "thẻ lái xe", f"Phiếu {rid} (phiếu cân {_ids(pcs)})")
    for p in pcs:
        _drop_derived(db, "pc", p.id)
        db.delete(p)
    db.delete(r)
    return _done(db, "phiếu chuẩn bị hàng", rid, body.reason)


@router.delete("/weighings/{pid}")
def delete_weighing(pid: str, body: SC.ReasonIn, db: Session = DB):
    p = svc.get_or_404(db, Weighing, pid)
    if p.receipt_id and db.get(Receipt, p.receipt_id):
        raise HTTPException(400, f"Phiếu cân {pid} đi kèm phiếu chuẩn bị hàng {p.receipt_id} — xóa phiếu chuẩn bị hàng (xóa cả phiếu cân)")
    _block(_tasks_of_weighings(db, [p]), "thẻ lái xe", f"Phiếu cân {pid}")
    _drop_derived(db, "pc", pid)
    db.delete(p)
    return _done(db, "phiếu cân", pid, body.reason)


@router.delete("/tasks/{tid}")
def delete_task(tid: str, body: SC.ReasonIn, db: Session = DB):
    """Xóa thẻ lái xe (hàng tại mạ / đã giao tự tính lại). Thẻ đi mạ đã có thẻ giao khách lấy hàng từ nó → xóa thẻ đó trước."""
    t = svc.get_or_404(db, Task, tid)
    _block(db.scalars(select(Task).where(Task.ref_id == tid)).all(), "thẻ giao khách", f"Thẻ {tid}")
    _drop_derived(db, "vc", tid)
    db.delete(t)
    return _done(db, "thẻ lái xe", tid, body.reason)


@router.delete("/material-receipts/{mid}")
def delete_material(mid: str, body: SC.ReasonIn, db: Session = DB):
    m = svc.get_or_404(db, MaterialReceipt, mid)
    _drop_derived(db, "nl", mid)
    db.delete(m)
    return _done(db, "phiếu nhập nguyên liệu", mid, body.reason)
