"""REST API — /api/...  Danh sách → GET collection, chi tiết → GET /{id}, thao tác nghiệp vụ → POST /{id}/<action>."""
import uuid
from datetime import datetime
from pathlib import Path

from urllib.parse import quote

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from . import config as C
from . import schemas as SC
from . import serializers as S
from . import contract_doc as CD
from . import services as svc
from .db import get_db
from .history import contract_snapshot, order_snapshot, track
from .security import can, get_current_user, require, require_roles
from .models import (Contract, Lsx, Mismatch, Notification, Order, Receipt, Task, User, VLoss, Weighing)
from .alerts import visible_to
from .seed import reset_db
from .files import sign_photo
from .ticket import ticket_img
from .utils import fmt_kg
from .order_excel import order_excel, parse_order_excel

# Mọi route dưới đây bắt buộc đăng nhập.
# ĐỌC (GET): mọi người đã đăng nhập đều đọc được — giống bản demo, menu ẩn theo vai trò; một màn hình
#   thường cần dữ liệu liên đới (vd Đối ứng mạ cần hợp đồng). Ẩn số tiền với vai trò hiện trường: chờ khách chốt.
# GHI (POST/PUT/PATCH): kiểm quyền chặt theo PERMISSIONS + quy tắc riêng (security.require / require_roles).
# Xuất Excel & quản trị người dùng vẫn giới hạn theo quyền trang.
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
        "toleranceKg": C.TOLERANCE_KG, "pcTolerancePct": C.PC_TOLERANCE_PCT, "fillHours": C.FILL_HOURS, "contractDays": C.CONTRACT_DAYS,
        "pcFillHours": C.PC_FILL_HOURS,
    }


@router.post("/admin/reset", dependencies=[Depends(require_roles("admin"))])
def admin_reset(db: Session = DB):
    if not C.ALLOW_DEMO_RESET:
        raise HTTPException(403, "Chức năng khôi phục dữ liệu demo đã tắt trên môi trường này")
    reset_db(db)
    return {"ok": True}


@router.get("/dashboard")
def dashboard(tag: int | None = None, segment: str | None = None, db: Session = DB):
    return svc.dashboard(db, tag, segment)


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
@router.get("/orders")
def list_orders(tag: int | None = None, segment: str | None = None, db: Session = DB):
    rows = _list(db, Order, Order.date, S.order)
    if tag:  # lọc theo thẻ khách hàng
        cus = svc.customer_ids_for_tag(db, tag)
        rows = [o for o in rows if o["customerId"] in cus]
    if segment:  # lọc theo phân loại khách: Thân thiết / Đơn lẻ
        cus = svc.customer_ids_for_segment(db, segment)
        rows = [o for o in rows if o["customerId"] in cus]
    return rows


XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def _xlsx(data: bytes, filename: str) -> Response:
    cd = f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
    return Response(content=data, media_type=XLSX, headers={"Content-Disposition": cd})


@router.post("/orders/import-excel", dependencies=[Depends(require("don-hang", "full"))])
async def import_order_excel(file: UploadFile = File(...), db: Session = DB):
    """Đọc file Excel đặt hàng (mẫu của khách) → dòng hàng để điền form. Chưa lưu gì."""
    data = await file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(400, "File Excel tối đa 5MB")
    out = parse_order_excel(data, file.filename or "")
    cu = svc.find_customer(db, out["customer"]) if out["customer"] else None
    out["customerId"] = cu.id if cu else None
    out["fileName"] = file.filename or ""
    return out


@router.get("/orders/excel-template")
def order_excel_template():
    return _xlsx(order_excel(), "Mau-don-hang.xlsx")


@router.get("/orders/{oid}/excel")
def order_excel_file(oid: str, db: Session = DB):
    o = svc.get_or_404(db, Order, oid)
    return _xlsx(order_excel(o), f"Don-hang_{o.id}.xlsx")


@router.get("/orders/{oid}")
def get_order(oid: str, db: Session = DB):
    return S.order(svc.get_or_404(db, Order, oid))


@router.post("/orders", dependencies=[Depends(require("don-hang", "full"))])
def create_order(body: SC.OrderCreate, db: Session = DB):
    o = svc.create_order(db, body.customer, [i.model_dump() for i in body.items], body.file, body.note, body.code,
                         body.customer_id, body.vat_pct)
    return S.order(o)


@router.patch("/orders/{oid}", dependencies=[Depends(require("don-hang", "full"))])
def update_order(oid: str, body: SC.OrderUpdate, db: Session = DB):
    data = body.model_dump(exclude_none=True)
    with track(db, "dh", oid, lambda: order_snapshot(svc.get_or_404(db, Order, oid))):  # lưu lịch sử sửa
        o = svc.update_order(db, oid, data)
    return S.order(o)


@router.post("/orders/{oid}/send-to-kt", dependencies=[Depends(require("don-hang", "full"))])
def send_to_kt(oid: str, body: SC.SendToKtIn, db: Session = DB):
    return S.contract(svc.send_order_to_kt(db, oid, body.complete_by))


# ---------------------------------------------------------------- hợp đồng
@router.get("/contracts")
def list_contracts(tag: int | None = None, segment: str | None = None, db: Session = DB):
    out = []
    cust_of = {o.id: o.customer_id for o in db.scalars(select(Order))}
    keep = svc.contract_ids_for_tag(db, tag) if tag else None
    if segment:
        seg = svc.contract_ids_for_customers(db, svc.customer_ids_for_segment(db, segment))
        keep = seg if keep is None else keep & seg
    delivered: dict[str, float] = {}
    for t in db.scalars(select(Task).where(Task.type == "giao_khach")):
        delivered[t.contract_id] = delivered.get(t.contract_id, 0) + (t.kg_delivered or 0)
    for c in db.scalars(select(Contract).order_by(Contract.sent_to_kt_at.desc())):
        if keep is not None and c.id not in keep:
            continue
        d = S.contract(c)
        d["customerId"] = cust_of.get(c.order_id)
        d["due"], d["adv"] = svc.contract_due_info(c), svc.advance_info(c)
        d["complete"] = svc.complete_info(c, delivered.get(c.id, 0))
        d["billedKg"], d["billPendingKg"] = svc.billed_kg(db, c.id)  # công nợ theo cân xuất đã duyệt
        out.append(d)
    return out


@router.get("/contracts/{cid}")
def get_contract(cid: str, db: Session = DB):
    return svc.contract_agg(db, cid)


@router.get("/contracts/{cid}/ledger")
def contract_ledger(cid: str, db: Session = DB):
    return svc.contract_flow_ledger(db, cid)


@router.patch("/contracts/{cid}", dependencies=[Depends(require("hop-dong", "edit"))])
def update_contract(cid: str, body: SC.ContractUpdate, db: Session = DB):
    with track(db, "hd", cid, lambda: contract_snapshot(svc.get_or_404(db, Contract, cid))):  # lưu lịch sử sửa
        c = svc.update_contract(db, cid, body.model_dump(by_alias=True, exclude_none=True))
    return S.contract(c)


@router.post("/contracts/{cid}/returned", dependencies=[Depends(require("hop-dong", "edit"))])
def contract_returned(cid: str, db: Session = DB):
    """Bước 2: Đã gửi khách hàng."""
    return S.contract(svc.mark_contract_returned(db, cid))


@router.post("/contracts/{cid}/signed", dependencies=[Depends(require("hop-dong", "edit"))])
def contract_signed(cid: str, db: Session = DB):
    """Bước 3: Đã nhận về (khách đã ký)."""
    return S.contract(svc.mark_contract_signed(db, cid))


@router.post("/contracts/{cid}/completed", dependencies=[Depends(require("hop-dong", "edit"))])
def contract_completed(cid: str, db: Session = DB):
    """Bước 4: Đã hoàn thành."""
    return S.contract(svc.mark_contract_completed(db, cid))


# ---------------------------------------------------------------- soạn thảo hợp đồng theo mẫu
@router.get("/contracts/{cid}/document")
def contract_document(cid: str, db: Session = DB):
    return CD.document(db, svc.get_or_404(db, Contract, cid))


@router.put("/contracts/{cid}/document", dependencies=[Depends(require("hop-dong", "edit"))])
def save_contract_document(cid: str, body: dict, db: Session = DB):
    c = svc.get_or_404(db, Contract, cid)
    with track(db, "hd", cid, lambda: contract_snapshot(c)):
        return CD.save_draft(db, c, body)


@router.get("/contracts/{cid}/document.docx")
def contract_docx(cid: str, db: Session = DB):
    doc = CD.document(db, svc.get_or_404(db, Contract, cid))
    data = CD.render_docx(doc)
    name = CD.docx_filename(doc)
    cd = f"attachment; filename=\"{name}\"; filename*=UTF-8''{quote(name)}"
    return Response(content=data, headers={"Content-Disposition": cd},
                    media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")


@router.get("/settings/seller")
def get_seller(db: Session = DB):
    return CD.get_seller(db)


@router.put("/settings/seller", dependencies=[Depends(require_roles("admin"))])
def put_seller(body: dict, db: Session = DB):
    return CD.set_seller(db, body)


# ---------------------------------------------------------------- tiền về: Quản lý duyệt
@router.get("/payments/pending")
def pending_payments(db: Session = DB):
    return svc.pending_payments(db)


@router.post("/payments/{pid}/approve", dependencies=[Depends(require_roles("admin"))])
def approve_payment(pid: int, db: Session = DB):
    return S.contract(svc.approve_payment(db, pid))


@router.post("/payments/{pid}/reject", dependencies=[Depends(require_roles("admin"))])
def reject_payment(pid: int, body: SC.ReasonIn, db: Session = DB):
    return S.contract(svc.reject_payment(db, pid, body.reason))


@router.post("/contracts/{cid}/payments", dependencies=[Depends(require("hop-dong", "edit"))])
def contract_payment(cid: str, body: SC.PaymentIn, db: Session = DB):
    return S.contract(svc.record_payment(db, cid, body.amount, body.type, body.note))


# ---------------------------------------------------------------- lệnh sản xuất
@router.get("/lsx")
def list_lsx(contract_id: str | None = None, db: Session = DB):
    return _list(db, Lsx, Lsx.assigned_at, S.lsx, contract_id=contract_id)


@router.get("/lsx/{lid}")
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


@router.post("/lsx/{lid}/daily", dependencies=[Depends(require_roles("sx"))])
def lsx_daily(lid: str, body: SC.LsxDailyIn, db: Session = DB):
    """Xưởng báo sản lượng theo ngày (kg)."""
    return S.lsx(svc.lsx_daily(db, lid, body.day, body.kg, body.note))


@router.post("/lsx/{lid}/extend", dependencies=[Depends(require_roles("admin"))])
def lsx_extend(lid: str, body: SC.LsxExtendIn, db: Session = DB):
    return S.lsx(svc.lsx_extend(db, lid, body.to, body.reason))


# ---------------------------------------------------------------- phiếu chuẩn bị hàng
@router.get("/receipts")
def list_receipts(contract_id: str | None = None, lsx_id: str | None = None, db: Session = DB):
    rows = _list(db, Receipt, Receipt.date, S.receipt, contract_id=contract_id, lsx_id=lsx_id)
    eff = svc.stock_kg_of_receipts(db, [db.get(Receipt, r["id"]) for r in rows])
    return [{**r, "kgStock": eff[r["id"]]} for r in rows]


@router.get("/receipts/{rid}")
def get_receipt(rid: str, db: Session = DB):
    r = svc.get_or_404(db, Receipt, rid)
    return {**S.receipt(r), "kgStock": svc.stock_kg_of_receipts(db, [r])[r.id]}


@router.post("/receipts", dependencies=[Depends(require("tiep-nhan", "edit"))])
def create_receipt(body: SC.ReceiptCreate, db: Session = DB):
    items = [i.model_dump() for i in body.items] if body.items else None
    dispatch = body.model_dump(include={"driver", "vehicle_plate", "galvanizer_id", "arrive_at", "fill_deadline"}) \
        if body.driver else None
    return S.receipt(svc.create_receipt(db, body.lsx_id, body.qty, body.kg, body.note, items, dispatch))


# ---------------------------------------------------------------- phiếu cân
@router.get("/weighings")
def list_weighings(contract_id: str | None = None, db: Session = DB):
    return _list(db, Weighing, Weighing.date, lambda p: S.weighing(p, photo=False), contract_id=contract_id)


@router.get("/weighings/{pid}")
def get_weighing(pid: str, db: Session = DB):
    return S.weighing(svc.get_or_404(db, Weighing, pid))


@router.post("/weighings", dependencies=[Depends(require("phieu-can", "edit"))])
def create_weighing(body: SC.WeighingCreate, db: Session = DB):
    return S.weighing(svc.create_weighing(db, body.source_id, body.kg_expected))


@router.post("/weighings/{pid}/approve", dependencies=[Depends(require_roles("admin"))])
def approve_weighing(pid: str, db: Session = DB):
    return S.weighing(svc.approve_weighing(db, pid))


@router.post("/weighings/{pid}/reject", dependencies=[Depends(require_roles("admin"))])
def reject_weighing(pid: str, body: SC.ReasonIn, db: Session = DB):
    return S.weighing(svc.reject_weighing(db, pid, body.reason))


@router.post("/weighings/{pid}/fill", dependencies=[Depends(require("phieu-can", "edit"))])
def fill_weighing(pid: str, body: SC.WeighingFill, db: Session = DB):
    return S.weighing(svc.fill_weighing(db, pid, body.kg_actual, body.photo, body.reason, body.reason_note,
                                        body.signer_lai_xe, gross=body.gross_kg, tare=body.tare_kg,
                                        weigh_in=body.weigh_in_at, weigh_out=body.weigh_out_at,
                                        plate=body.vehicle_plate))


@router.put("/weighings/{pid}/photo", dependencies=[Depends(require("phieu-can", "edit"))])
def weighing_photo(pid: str, body: SC.PhotoIn, db: Session = DB):
    p = svc.get_or_404(db, Weighing, pid)
    p.photo = body.photo
    db.commit()
    return S.weighing(p)


# ---------------------------------------------------------------- thẻ công việc lái xe
@router.get("/tasks")
def list_tasks(contract_id: str | None = None, type: str | None = None, driver: str | None = None,
               db: Session = DB, user: User = Depends(get_current_user)):
    if user.role_list == ["lx"]:  # lái xe thuần: chỉ thấy thẻ của mình
        driver = user.name
    return _list(db, Task, Task.assigned_at, lambda t: S.task(t, photo=False), contract_id=contract_id, type=type,
                 driver=driver)


@router.get("/tasks/{tid}")
def get_task(tid: str, db: Session = DB):
    return S.task(svc.get_or_404(db, Task, tid))


@router.post("/tasks", dependencies=[Depends(require_roles("admin"))])
def create_task(body: SC.TaskCreate, db: Session = DB):
    extra = body.model_dump(include={"arrive_at", "fill_deadline", "deliver_customer_id", "deliver_name", "deliver_address", "receiver_name",
                                     "receiver_phone", "contact_name", "contact_phone"})
    return S.task(svc.create_task(db, body.type, body.driver, body.contract_id, body.ref_id, body.kg_required,
                                  body.note, body.vehicle_plate, body.galvanizer_id, **extra))


@router.post("/tasks/{tid}/approve", dependencies=[Depends(require_roles("admin"))])
def approve_task(tid: str, db: Session = DB):
    """Quản lý chấp nhận phiếu lệch của lái xe."""
    return S.task(svc.approve_task(db, tid))


@router.post("/tasks/{tid}/reject-fill", dependencies=[Depends(require_roles("admin"))])
def reject_task_fill(tid: str, body: SC.ReasonIn, db: Session = DB):
    """Quản lý không chấp nhận → lái xe điền lại."""
    return S.task(svc.reject_task(db, tid, body.reason))


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
@router.get("/mismatches")
def list_mismatches(contract_id: str | None = None, status: str | None = None, db: Session = DB):
    return _list(db, Mismatch, Mismatch.date, S.mismatch, contract_id=contract_id, status=status)


@router.get("/mismatches/{mid}")
def get_mismatch(mid: str, db: Session = DB):
    return S.mismatch(svc.get_or_404(db, Mismatch, mid))


@router.post("/mismatches/{mid}/sign", dependencies=[Depends(require_roles("admin"))])
def sign_mismatch(mid: str, db: Session = DB):
    return S.mismatch(svc.sign_mismatch(db, mid))


# ---------------------------------------------------------------- kho ảo
@router.get("/vloss")
def list_vloss(db: Session = DB):
    return _list(db, VLoss, VLoss.date, S.vloss)


@router.get("/vloss/pending-deltas")
def vloss_pending(db: Session = DB):
    return svc.pending_deltas(db)


@router.get("/vloss/{vid}")
def get_vloss(vid: str, db: Session = DB):
    return S.vloss(svc.get_or_404(db, VLoss, vid))


@router.post("/vloss/accept-loss", dependencies=[Depends(require_roles("admin"))])
def accept_loss(body: SC.AcceptLossIn, db: Session = DB):
    return S.vloss(svc.accept_loss(db, body.ref_type, body.ref_id, body.note))


@router.post("/vloss/{vid}/resolve", dependencies=[Depends(require("kho-ao", "edit"))])
def resolve_vloss(vid: str, body: SC.ResolveVlossIn, db: Session = DB):
    return S.vloss(svc.resolve_vloss(db, vid, body.resolution, body.note))


# ---------------------------------------------------------------- báo cáo
@router.get("/reports/movement-log")
def movement_log(contract_id: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None,
                 db: Session = DB):
    return svc.movement_log(db, contract_id, date_from, date_to)


@router.get("/reports/overdue-docs")
def overdue_docs(db: Session = DB):
    return svc.overdue_docs(db)


# ---------------------------------------------------------------- thông báo
@router.get("/notifications")
def list_notifications(db: Session = DB, user: User = Depends(get_current_user)):
    q = visible_to(select(Notification), user)  # thông báo nhắm theo vai trò (cảnh báo cuối ngày)
    return [S.notification(n) for n in db.scalars(q.order_by(Notification.at.desc()).limit(50))]


@router.post("/notifications/read-all")
def read_all(db: Session = DB, user: User = Depends(get_current_user)):
    for n in db.scalars(visible_to(select(Notification).where(Notification.read.is_(False)), user)):
        n.read = True
    db.commit()
    return {"ok": True}
