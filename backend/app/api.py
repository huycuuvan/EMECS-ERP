"""REST API — /api/...  Danh sách → GET collection, chi tiết → GET /{id}, thao tác nghiệp vụ → POST /{id}/<action>."""
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config as C
from . import schemas as SC
from . import serializers as S
from . import services as svc
from .db import get_db
from .security import can, get_current_user, require, require_roles
from .models import (Contract, Lsx, Mismatch, Notification, Order, Receipt, Task, User, VLoss, Weighing)
from .seed import reset_db
from .files import sign_photo
from .ticket import ticket_img
from .utils import fmt_kg

# Mọi route dưới đây bắt buộc đăng nhập; quyền chi tiết khai báo ở từng route (xem security.require*).
router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])
DB = Depends(get_db)


def own_task(tid: str, db: Session = DB, user: User = Depends(get_current_user)) -> User:
    """Thao tác trên thẻ công việc: admin, hoặc đúng lái xe được giao thẻ."""
    if "admin" in user.role_list:
        return user
    t = svc.get_or_404(db, Task, tid)
    if "lx" not in user.role_list or t.driver != user.name:
        raise HTTPException(403, "Chỉ lái xe được giao thẻ mới thao tác được")
    return user


def _list(db: Session, model, order_col, ser, **filters):
    q = select(model)
    for k, v in filters.items():
        if v is not None:
            q = q.where(getattr(model, k) == v)
    return [ser(x) for x in db.scalars(q.order_by(order_col.desc()))]


# ---------------------------------------------------------------- meta
@router.get("/meta")
def meta(db: Session = DB):
    return {
        "people": {u.id: {"name": u.name, "dept": u.dept, "role": (u.role_list or [""])[0], "roles": u.role_list}
                   for u in db.scalars(select(User))},
        "drivers": [u.name for u in db.scalars(select(User).where(User.active.is_(True))) if "lx" in u.role_list]
        or C.DRIVERS, "roles": C.ROLES, "permissions": C.PERMISSIONS,
        "reasonsCan": C.REASONS_CAN, "reasonsTuChoiSx": C.REASONS_TU_CHOI_SX,
        "reasonsTuChoiLx": C.REASONS_TU_CHOI_LX, "vlossResolutions": C.VLOSS_RESOLUTIONS,
        "toleranceKg": C.TOLERANCE_KG, "fillHours": C.FILL_HOURS, "contractDays": C.CONTRACT_DAYS,
        "pcFillHours": C.PC_FILL_HOURS,
    }


@router.post("/admin/reset", dependencies=[Depends(require_roles("admin"))])
def admin_reset(db: Session = DB):
    if not C.ALLOW_DEMO_RESET:
        raise HTTPException(403, "Chức năng khôi phục dữ liệu demo đã tắt trên môi trường này")
    reset_db(db)
    return {"ok": True}


@router.get("/dashboard", dependencies=[Depends(require("dashboard"))])
def dashboard(db: Session = DB):
    return svc.dashboard(db)


@router.get("/demo-ticket")
def demo_ticket(label: str, kg: float = 0):
    """Ảnh phiếu demo (nút 'Ảnh demo' trên UI)."""
    return {"photo": ticket_img(label, f"{fmt_kg(kg)} · ký tay 3 bên")}


# ---------------------------------------------------------------- upload ảnh
@router.post("/uploads")
async def upload(file: UploadFile = File(...)):
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(400, "Chỉ nhận file ảnh")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Ảnh tối đa 10MB")
    name = f"{uuid.uuid4().hex}{Path(file.filename or '').suffix.lower() or '.jpg'}"
    (C.UPLOAD_DIR / name).write_bytes(data)
    return {"url": sign_photo(f"/uploads/{name}")}  # link ký để xem trước ngay; khi lưu sẽ bỏ phần ký


# ---------------------------------------------------------------- đơn hàng
@router.get("/orders", dependencies=[Depends(require("don-hang"))])
def list_orders(db: Session = DB):
    return _list(db, Order, Order.date, S.order)


@router.get("/orders/{oid}", dependencies=[Depends(require("don-hang"))])
def get_order(oid: str, db: Session = DB):
    return S.order(svc.get_or_404(db, Order, oid))


@router.post("/orders", dependencies=[Depends(require("don-hang", "full"))])
def create_order(body: SC.OrderCreate, db: Session = DB):
    o = svc.create_order(db, body.customer, [i.model_dump() for i in body.items], body.file, body.note, body.code)
    return S.order(o)


@router.patch("/orders/{oid}", dependencies=[Depends(require("don-hang", "full"))])
def update_order(oid: str, body: SC.OrderUpdate, db: Session = DB):
    data = body.model_dump(exclude_none=True)
    return S.order(svc.update_order(db, oid, data))


@router.post("/orders/{oid}/send-to-kt", dependencies=[Depends(require("don-hang", "full"))])
def send_to_kt(oid: str, db: Session = DB):
    return S.contract(svc.send_order_to_kt(db, oid))


# ---------------------------------------------------------------- hợp đồng
@router.get("/contracts", dependencies=[Depends(require("hop-dong"))])
def list_contracts(db: Session = DB):
    out = []
    for c in db.scalars(select(Contract).order_by(Contract.sent_to_kt_at.desc())):
        d = S.contract(c)
        d["due"], d["adv"] = svc.contract_due_info(c), svc.advance_info(c)
        out.append(d)
    return out


@router.get("/contracts/{cid}", dependencies=[Depends(require("hop-dong"))])
def get_contract(cid: str, db: Session = DB):
    return svc.contract_agg(db, cid)


@router.get("/contracts/{cid}/ledger", dependencies=[Depends(require("hop-dong"))])
def contract_ledger(cid: str, db: Session = DB):
    return svc.contract_flow_ledger(db, cid)


@router.patch("/contracts/{cid}", dependencies=[Depends(require("hop-dong", "edit"))])
def update_contract(cid: str, body: SC.ContractUpdate, db: Session = DB):
    return S.contract(svc.update_contract(db, cid, body.model_dump(by_alias=True, exclude_none=True)))


@router.post("/contracts/{cid}/returned", dependencies=[Depends(require("hop-dong", "edit"))])
def contract_returned(cid: str, db: Session = DB):
    return S.contract(svc.mark_contract_returned(db, cid))


@router.post("/contracts/{cid}/signed", dependencies=[Depends(require("hop-dong", "edit"))])
def contract_signed(cid: str, db: Session = DB):
    return S.contract(svc.mark_contract_signed(db, cid))


@router.post("/contracts/{cid}/payments", dependencies=[Depends(require("hop-dong", "edit"))])
def contract_payment(cid: str, body: SC.PaymentIn, db: Session = DB):
    return S.contract(svc.record_payment(db, cid, body.amount, body.type, body.note))


# ---------------------------------------------------------------- lệnh sản xuất
@router.get("/lsx", dependencies=[Depends(require("lsx"))])
def list_lsx(contract_id: str | None = None, db: Session = DB):
    return _list(db, Lsx, Lsx.assigned_at, S.lsx, contract_id=contract_id)


@router.get("/lsx/{lid}", dependencies=[Depends(require("lsx"))])
def get_lsx(lid: str, db: Session = DB):
    return S.lsx(svc.get_or_404(db, Lsx, lid))


@router.post("/lsx", dependencies=[Depends(require_roles("admin"))])
def create_lsx(body: SC.LsxCreate, db: Session = DB):
    return S.lsx(svc.create_lsx(db, body.contract_id, body.name, body.qty, body.kg, body.lead_days))


@router.post("/lsx/{lid}/accept", dependencies=[Depends(require_roles("sx"))])
def lsx_accept(lid: str, db: Session = DB):
    return S.lsx(svc.lsx_accept(db, lid))


@router.post("/lsx/{lid}/reject", dependencies=[Depends(require_roles("sx"))])
def lsx_reject(lid: str, body: SC.ReasonIn, db: Session = DB):
    return S.lsx(svc.lsx_reject(db, lid, body.reason))


@router.post("/lsx/{lid}/progress", dependencies=[Depends(require_roles("sx"))])
def lsx_progress(lid: str, body: SC.LsxProgressIn, db: Session = DB):
    return S.lsx(svc.lsx_progress(db, lid, body.qty_done, body.kg_done))


@router.post("/lsx/{lid}/extend", dependencies=[Depends(require_roles("admin"))])
def lsx_extend(lid: str, body: SC.LsxExtendIn, db: Session = DB):
    return S.lsx(svc.lsx_extend(db, lid, body.to, body.reason))


# ---------------------------------------------------------------- phiếu tiếp nhận
@router.get("/receipts", dependencies=[Depends(require("tiep-nhan"))])
def list_receipts(contract_id: str | None = None, lsx_id: str | None = None, db: Session = DB):
    return _list(db, Receipt, Receipt.date, S.receipt, contract_id=contract_id, lsx_id=lsx_id)


@router.get("/receipts/{rid}", dependencies=[Depends(require("tiep-nhan"))])
def get_receipt(rid: str, db: Session = DB):
    return S.receipt(svc.get_or_404(db, Receipt, rid))


@router.post("/receipts", dependencies=[Depends(require("tiep-nhan", "edit"))])
def create_receipt(body: SC.ReceiptCreate, db: Session = DB):
    return S.receipt(svc.create_receipt(db, body.lsx_id, body.qty, body.kg, body.note))


# ---------------------------------------------------------------- phiếu cân
@router.get("/weighings", dependencies=[Depends(require("phieu-can"))])
def list_weighings(contract_id: str | None = None, db: Session = DB):
    return _list(db, Weighing, Weighing.date, lambda p: S.weighing(p, photo=False), contract_id=contract_id)


@router.get("/weighings/{pid}", dependencies=[Depends(require("phieu-can"))])
def get_weighing(pid: str, db: Session = DB):
    return S.weighing(svc.get_or_404(db, Weighing, pid))


@router.post("/weighings", dependencies=[Depends(require("phieu-can", "edit"))])
def create_weighing(body: SC.WeighingCreate, db: Session = DB):
    return S.weighing(svc.create_weighing(db, body.source_id, body.kg_expected))


@router.post("/weighings/{pid}/fill", dependencies=[Depends(require("phieu-can", "edit"))])
def fill_weighing(pid: str, body: SC.WeighingFill, db: Session = DB):
    return S.weighing(svc.fill_weighing(db, pid, body.kg_actual, body.photo, body.reason, body.reason_note,
                                        body.signer_lai_xe))


@router.put("/weighings/{pid}/photo", dependencies=[Depends(require("phieu-can", "edit"))])
def weighing_photo(pid: str, body: SC.PhotoIn, db: Session = DB):
    p = svc.get_or_404(db, Weighing, pid)
    p.photo = body.photo
    db.commit()
    return S.weighing(p)


# ---------------------------------------------------------------- thẻ công việc lái xe
@router.get("/tasks", dependencies=[Depends(require("van-chuyen"))])
def list_tasks(contract_id: str | None = None, type: str | None = None, driver: str | None = None,
               db: Session = DB, user: User = Depends(get_current_user)):
    if user.role_list == ["lx"]:  # lái xe thuần: chỉ thấy thẻ của mình
        driver = user.name
    return _list(db, Task, Task.assigned_at, lambda t: S.task(t, photo=False), contract_id=contract_id, type=type,
                 driver=driver)


@router.get("/tasks/{tid}", dependencies=[Depends(require("van-chuyen"))])
def get_task(tid: str, db: Session = DB):
    return S.task(svc.get_or_404(db, Task, tid))


@router.post("/tasks", dependencies=[Depends(require_roles("admin"))])
def create_task(body: SC.TaskCreate, db: Session = DB):
    return S.task(svc.create_task(db, body.type, body.driver, body.contract_id, body.ref_id, body.kg_required,
                                  body.note))


@router.post("/tasks/{tid}/accept", dependencies=[Depends(own_task)])
def task_accept(tid: str, db: Session = DB):
    return S.task(svc.task_accept(db, tid))


@router.post("/tasks/{tid}/reject", dependencies=[Depends(own_task)])
def task_reject(tid: str, body: SC.ReasonIn, db: Session = DB):
    return S.task(svc.task_reject(db, tid, body.reason))


@router.post("/tasks/{tid}/depart", dependencies=[Depends(own_task)])
def task_depart(tid: str, db: Session = DB):
    return S.task(svc.task_depart(db, tid))


@router.post("/tasks/{tid}/fill-galv", dependencies=[Depends(own_task)])
def task_fill_galv(tid: str, body: SC.TaskFillGalv, db: Session = DB):
    return S.task(svc.task_fill_galv(db, tid, body.kg, body.photo, body.reason, body.reason_note))


@router.post("/tasks/{tid}/fill-delivery", dependencies=[Depends(own_task)])
def task_fill_delivery(tid: str, body: SC.TaskFillDelivery, db: Session = DB):
    return S.task(svc.task_fill_delivery(db, tid, body.kg_picked, body.kg_delivered, body.photo, body.reason,
                                         body.reason_note))


@router.put("/tasks/{tid}/photo", dependencies=[Depends(own_task)])
def task_photo(tid: str, body: SC.PhotoIn, db: Session = DB):
    t = svc.get_or_404(db, Task, tid)
    t.photo = body.photo
    db.commit()
    return S.task(t)


# ---------------------------------------------------------------- sai lệch
@router.get("/mismatches", dependencies=[Depends(require("sai-lech"))])
def list_mismatches(contract_id: str | None = None, status: str | None = None, db: Session = DB):
    return _list(db, Mismatch, Mismatch.date, S.mismatch, contract_id=contract_id, status=status)


@router.get("/mismatches/{mid}", dependencies=[Depends(require("sai-lech"))])
def get_mismatch(mid: str, db: Session = DB):
    return S.mismatch(svc.get_or_404(db, Mismatch, mid))


@router.post("/mismatches/{mid}/sign", dependencies=[Depends(require_roles("admin"))])
def sign_mismatch(mid: str, db: Session = DB):
    return S.mismatch(svc.sign_mismatch(db, mid))


# ---------------------------------------------------------------- kho ảo
@router.get("/vloss", dependencies=[Depends(require("kho-ao"))])
def list_vloss(db: Session = DB):
    return _list(db, VLoss, VLoss.date, S.vloss)


@router.get("/vloss/pending-deltas", dependencies=[Depends(require("kho-ao"))])
def vloss_pending(db: Session = DB):
    return svc.pending_deltas(db)


@router.get("/vloss/{vid}", dependencies=[Depends(require("kho-ao"))])
def get_vloss(vid: str, db: Session = DB):
    return S.vloss(svc.get_or_404(db, VLoss, vid))


@router.post("/vloss/accept-loss", dependencies=[Depends(require_roles("admin"))])
def accept_loss(body: SC.AcceptLossIn, db: Session = DB):
    return S.vloss(svc.accept_loss(db, body.ref_type, body.ref_id, body.note))


@router.post("/vloss/{vid}/resolve", dependencies=[Depends(require("kho-ao", "edit"))])
def resolve_vloss(vid: str, body: SC.ResolveVlossIn, db: Session = DB):
    return S.vloss(svc.resolve_vloss(db, vid, body.resolution, body.note))


# ---------------------------------------------------------------- báo cáo
@router.get("/reports/movement-log", dependencies=[Depends(require("bao-cao"))])
def movement_log(contract_id: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None,
                 db: Session = DB):
    return svc.movement_log(db, contract_id, date_from, date_to)


@router.get("/reports/overdue-docs", dependencies=[Depends(require("bao-cao"))])
def overdue_docs(db: Session = DB):
    return svc.overdue_docs(db)


# ---------------------------------------------------------------- thông báo
@router.get("/notifications")
def list_notifications(db: Session = DB):
    return [S.notification(n) for n in db.scalars(select(Notification).order_by(Notification.at.desc()).limit(50))]


@router.post("/notifications/read-all")
def read_all(db: Session = DB):
    for n in db.scalars(select(Notification).where(Notification.read.is_(False))):
        n.read = True
    db.commit()
    return {"ok": True}
