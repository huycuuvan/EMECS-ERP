"""Xóa bản ghi các module — chỉ Quản lý, bắt buộc lý do (ghi vào thông báo cho Quản lý + nhật ký thao tác).

Dữ liệu nối thành chuỗi: Đơn hàng → Hợp đồng (+ tiền về, gia hạn) → Lệnh SX → Chuẩn bị hàng (+ phiếu cân tự tạo)
→ Thẻ đi mạ → Thẻ giao khách. Bản ghi đã có chứng từ phía sau thì KHÔNG xóa được — báo rõ cần xóa cái nào trước
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


@router.delete("/orders/{oid}")
def delete_order(oid: str, body: SC.ReasonIn, db: Session = DB):
    o = svc.get_or_404(db, Order, oid)
    if o.contract_id and db.get(Contract, o.contract_id):
        raise HTTPException(400, f"Đơn {oid} đã chuyển kế toán thành hợp đồng {o.contract_id} — xóa hợp đồng trước")
    db.delete(o)
    return _done(db, "đơn hàng", oid, body.reason)


@router.delete("/contracts/{cid}")
def delete_contract(cid: str, body: SC.ReasonIn, db: Session = DB):
    """Xóa hợp đồng → đơn hàng quay về "Chốt đơn" (chuyển kế toán lại được)."""
    c = svc.get_or_404(db, Contract, cid)
    rec = f"Hợp đồng {cid}"
    _block(db.scalars(select(Lsx).where(Lsx.contract_id == cid)).all(), "lệnh SX", rec)
    _block(db.scalars(select(Receipt).where(Receipt.contract_id == cid)).all(), "phiếu chuẩn bị hàng", rec)
    _block(db.scalars(select(Weighing).where(Weighing.contract_id == cid)).all(), "phiếu cân", rec)
    _block(db.scalars(select(Task).where(Task.contract_id == cid)).all(), "thẻ lái xe", rec)
    if c.payments:
        raise HTTPException(400, f"{rec} đã có {len(c.payments)} khoản tiền về — xóa các khoản tiền về trước")
    for e in db.scalars(select(ContractExtension).where(ContractExtension.contract_id == cid)):
        db.delete(e)
    o = db.get(Order, c.order_id)
    if o and o.contract_id == cid:
        o.contract_id, o.status = None, "Chốt đơn"
    db.delete(c)
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
