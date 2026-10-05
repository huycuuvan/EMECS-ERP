"""Danh mục & báo cáo bổ sung (theo báo giá): khách hàng + thẻ (M01/M06), xe & xưởng mạ (M06),
nguyên liệu mua vào (M04), giám sát số tấn theo xe (M06), cảnh báo cuối ngày (M03)."""
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import Field
from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from . import services as svc
from .alerts import run_end_of_day
from .config import PEOPLE
from .db import get_db, utcnow
from .models import (Contract, Customer, Galvanizer, MaterialReceipt, Order, Receipt, Tag, Task, Vehicle,
                     customer_tags)
from .schemas import In
from .security import actor, get_current_user, require, require_roles
from .utils import VN_TZ, iso

router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])
DB = Depends(get_db)
ADMIN = [Depends(require_roles("admin"))]
CUST_VIEW, CUST_EDIT = [Depends(require("don-hang"))], [Depends(require("don-hang", "full"))]
FLEET_VIEW = [Depends(require("van-chuyen"))]
NL_VIEW, NL_EDIT = [Depends(require("nguyen-lieu"))], [Depends(require("nguyen-lieu", "edit"))]


def _clean(s: str | None) -> str:
    return (s or "").strip()


def _period(frm: datetime | None, to: datetime | None) -> tuple[datetime | None, datetime | None]:
    """Ngày không kèm múi giờ hiểu theo giờ Việt Nam; `to` dạng ngày (00:00) tính hết ngày đó."""
    if frm and frm.tzinfo is None:
        frm = frm.replace(tzinfo=VN_TZ)
    if to and to.tzinfo is None:
        to = to.replace(tzinfo=VN_TZ)
        if (to.hour, to.minute, to.second) == (0, 0, 0):
            to = to + timedelta(days=1) - timedelta(microseconds=1)
    return frm, to


def _in(d: datetime | None, frm, to) -> bool:
    return bool(d) and (not frm or d >= frm) and (not to or d <= to)


# ================================================================ thẻ khách hàng
class TagIn(In):
    name: str = Field(min_length=1, max_length=60)
    color: str = Field(default="#4a5560", max_length=16)


class TagPatch(In):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    color: str | None = Field(default=None, max_length=16)


def tag_out(t: Tag, count: int | None = None) -> dict:
    d = {"id": t.id, "name": t.name, "color": t.color}
    if count is not None:
        d["customerCount"] = count
    return d


def _tag_name_free(db: Session, name: str, except_id: int | None = None) -> str:
    name = _clean(name)
    if not name:
        raise HTTPException(400, "Chưa nhập tên thẻ")
    if any(t.name.lower() == name.lower() and t.id != except_id for t in db.scalars(select(Tag))):
        raise HTTPException(400, f"Thẻ \"{name}\" đã có")
    return name


@router.get("/tags")
def list_tags(db: Session = DB):
    """Mọi người dùng đăng nhập đọc được (dùng cho bộ lọc Khách thân thiết / Khách lẻ)."""
    counts = defaultdict(int)
    for tid in db.scalars(select(customer_tags.c.tag_id)):
        counts[tid] += 1
    return [tag_out(t, counts[t.id]) for t in db.scalars(select(Tag).order_by(Tag.name))]


@router.post("/tags", dependencies=CUST_EDIT)
def create_tag(body: TagIn, db: Session = DB):
    t = Tag(name=_tag_name_free(db, body.name), color=_clean(body.color) or "#4a5560")
    db.add(t)
    db.commit()
    return tag_out(t, 0)


@router.patch("/tags/{tid}", dependencies=CUST_EDIT)
def update_tag(tid: int, body: TagPatch, db: Session = DB):
    t = db.get(Tag, tid) or _404("thẻ")
    if body.name is not None:
        t.name = _tag_name_free(db, body.name, tid)
    if body.color is not None:
        t.color = _clean(body.color) or t.color
    db.commit()
    return tag_out(t)


@router.delete("/tags/{tid}", dependencies=CUST_EDIT)
def delete_tag(tid: int, db: Session = DB):
    t = db.get(Tag, tid) or _404("thẻ")
    db.execute(delete(customer_tags).where(customer_tags.c.tag_id == tid))  # gỡ thẻ khỏi mọi khách
    db.delete(t)
    db.commit()
    return {"ok": True}


def _404(what: str):
    raise HTTPException(404, f"Không tìm thấy {what}")


# ================================================================ khách hàng
SEGMENTS = ("Thân thiết", "Đơn lẻ")


class CustomerIn(In):
    name: str = Field(min_length=1, max_length=200)
    short_code: str = ""
    tax_code: str = ""
    address: str = ""
    contact_name: str = ""
    phone: str = ""
    representative: str = ""
    representative_title: str = ""
    bank_account: str = ""
    bank_name: str = ""
    segment: str = ""
    note: str = ""
    active: bool = True
    tag_ids: list[int] = []


class CustomerPatch(In):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    short_code: str | None = None
    tax_code: str | None = None
    address: str | None = None
    contact_name: str | None = None
    phone: str | None = None
    representative: str | None = None
    representative_title: str | None = None
    bank_account: str | None = None
    bank_name: str | None = None
    segment: str | None = None
    note: str | None = None
    active: bool | None = None
    tag_ids: list[int] | None = None


def _segment(v: str) -> str:
    v = _clean(v)
    if v and v not in SEGMENTS:
        raise HTTPException(400, "Phân loại khách hàng phải là Thân thiết hoặc Đơn lẻ")
    return v


def customer_out(c: Customer, orders: list[Order] | None = None) -> dict:
    d = {"id": c.id, "name": c.name, "shortCode": c.short_code, "taxCode": c.tax_code, "address": c.address,
         "contactName": c.contact_name, "phone": c.phone, "representative": c.representative,
         "representativeTitle": c.representative_title, "bankAccount": c.bank_account, "bankName": c.bank_name,
         "segment": c.segment, "note": c.note, "active": c.active,
         "createdAt": iso(c.created_at), "tags": [tag_out(t) for t in c.tags]}
    if orders is not None:
        d.update(orderCount=len(orders), orderValue=sum(o.value or 0 for o in orders),
                 orderKg=sum(o.total_kg or 0 for o in orders),
                 lastOrderAt=iso(max((o.date for o in orders if o.date), default=None)))
    return d


def _orders_by_customer(db: Session) -> dict[int, list[Order]]:
    out = defaultdict(list)
    for o in db.scalars(select(Order).where(Order.customer_id.is_not(None))):
        out[o.customer_id].append(o)
    return out


def _cust_name_free(db: Session, name: str, except_id: int | None = None) -> str:
    name = _clean(name)
    if any(c.name.strip().lower() == name.lower() and c.id != except_id for c in db.scalars(select(Customer))):
        raise HTTPException(400, f"Khách hàng \"{name}\" đã có trong danh mục")
    return name


def _tags(db: Session, ids: list[int]) -> list[Tag]:
    tags = [db.get(Tag, i) for i in dict.fromkeys(ids)]
    if any(t is None for t in tags):
        raise HTTPException(400, "Thẻ không hợp lệ")
    return tags


@router.get("/customers")
def list_customers(tag: int | None = None, q: str | None = None, segment: str | None = None, db: Session = DB):
    by_cust = _orders_by_customer(db)
    s = _clean(q).lower()
    out = []
    for c in db.scalars(select(Customer).order_by(Customer.name)):
        if tag and tag not in {t.id for t in c.tags}:
            continue
        if segment is not None and c.segment != segment:  # segment="" → chưa phân loại
            continue
        if s and s not in " ".join([c.name, c.short_code, c.tax_code, c.contact_name, c.phone, c.representative,
                                    c.bank_account]).lower():
            continue
        out.append(customer_out(c, by_cust.get(c.id, [])))
    return out


@router.get("/customers/{cid}")
def get_customer(cid: int, db: Session = DB):
    c = db.get(Customer, cid) or _404("khách hàng")
    return customer_out(c, _orders_by_customer(db).get(cid, []))


@router.post("/customers", dependencies=CUST_EDIT)
def create_customer(body: CustomerIn, db: Session = DB):
    c = Customer(name=_cust_name_free(db, body.name), short_code=_clean(body.short_code),
                 tax_code=_clean(body.tax_code), address=_clean(body.address), contact_name=_clean(body.contact_name),
                 phone=_clean(body.phone), representative=_clean(body.representative),
                 representative_title=_clean(body.representative_title), bank_account=_clean(body.bank_account),
                 bank_name=_clean(body.bank_name), segment=_segment(body.segment), note=body.note or "",
                 active=body.active, created_at=utcnow())
    c.tags = _tags(db, body.tag_ids)
    db.add(c)
    db.commit()
    return customer_out(c, [])


@router.patch("/customers/{cid}", dependencies=CUST_EDIT)
def update_customer(cid: int, body: CustomerPatch, db: Session = DB):
    c = db.get(Customer, cid) or _404("khách hàng")
    if body.name is not None and _clean(body.name) != c.name:
        c.name = _cust_name_free(db, body.name, cid)
        # tên hiển thị trên đơn hàng / hợp đồng của khách này đổi theo
        oids = [o.id for o in db.scalars(select(Order).where(Order.customer_id == cid))]
        if oids:
            db.execute(update(Order).where(Order.id.in_(oids)).values(customer=c.name))
            db.execute(update(Contract).where(Contract.order_id.in_(oids)).values(customer=c.name))
    for f in ("short_code", "tax_code", "address", "contact_name", "phone", "representative", "representative_title",
              "bank_account", "bank_name"):
        if getattr(body, f) is not None:
            setattr(c, f, _clean(getattr(body, f)))
    if body.segment is not None:
        c.segment = _segment(body.segment)
    if body.note is not None:
        c.note = body.note
    if body.active is not None:
        c.active = body.active
    if body.tag_ids is not None:
        c.tags = _tags(db, body.tag_ids)
    db.commit()
    return customer_out(c, _orders_by_customer(db).get(cid, []))


@router.delete("/customers/{cid}", dependencies=CUST_EDIT)
def delete_customer(cid: int, db: Session = DB):
    c = db.get(Customer, cid) or _404("khách hàng")
    if db.scalar(select(Order.id).where(Order.customer_id == cid).limit(1)):
        raise HTTPException(400, "Khách đã có đơn hàng — không xóa được, hãy chuyển sang ngừng giao dịch")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.post("/customers/{cid}/tags/{tid}", dependencies=CUST_EDIT)
def attach_tag(cid: int, tid: int, db: Session = DB):
    c = db.get(Customer, cid) or _404("khách hàng")
    t = db.get(Tag, tid) or _404("thẻ")
    if t not in c.tags:
        c.tags.append(t)
    db.commit()
    return customer_out(c)


@router.delete("/customers/{cid}/tags/{tid}", dependencies=CUST_EDIT)
def detach_tag(cid: int, tid: int, db: Session = DB):
    c = db.get(Customer, cid) or _404("khách hàng")
    c.tags = [t for t in c.tags if t.id != tid]
    db.commit()
    return customer_out(c)


# ================================================================ xe
class VehicleIn(In):
    plate: str = Field(min_length=4, max_length=20)
    capacity_kg: float = Field(default=0, ge=0)
    kind: str = "nhà"
    default_driver: str = ""
    note: str = ""
    active: bool = True


class VehiclePatch(In):
    plate: str | None = Field(default=None, min_length=4, max_length=20)
    capacity_kg: float | None = Field(default=None, ge=0)
    kind: str | None = None
    default_driver: str | None = None
    note: str | None = None
    active: bool | None = None


def vehicle_out(v: Vehicle) -> dict:
    return {"id": v.id, "plate": v.plate, "capacityKg": v.capacity_kg, "kind": v.kind,
            "defaultDriver": v.default_driver, "note": v.note, "active": v.active}


def _plate(db: Session, plate: str, except_id: int | None = None) -> str:
    p = _clean(plate).upper()
    if db.scalar(select(Vehicle.id).where(Vehicle.plate == p, Vehicle.id != (except_id or 0))):
        raise HTTPException(400, f"Biển số {p} đã có trong danh mục")
    return p


def _kind(k: str) -> str:
    if k not in ("nhà", "thuê"):
        raise HTTPException(400, "Loại xe phải là 'nhà' hoặc 'thuê'")
    return k


@router.get("/vehicles")
def list_vehicles(db: Session = DB):
    return [vehicle_out(v) for v in db.scalars(select(Vehicle).order_by(Vehicle.plate))]


@router.post("/vehicles", dependencies=ADMIN)
def create_vehicle(body: VehicleIn, db: Session = DB):
    v = Vehicle(plate=_plate(db, body.plate), capacity_kg=body.capacity_kg, kind=_kind(body.kind),
                default_driver=_clean(body.default_driver), note=body.note or "", active=body.active)
    db.add(v)
    db.commit()
    return vehicle_out(v)


@router.patch("/vehicles/{vid}", dependencies=ADMIN)
def update_vehicle(vid: int, body: VehiclePatch, db: Session = DB):
    v = db.get(Vehicle, vid) or _404("xe")
    if body.plate is not None:
        p = _plate(db, body.plate, vid)
        if p != v.plate:  # đổi biển số → thẻ công việc cũ đổi theo
            db.execute(update(Task).where(Task.vehicle_plate == v.plate).values(vehicle_plate=p))
            v.plate = p
    if body.capacity_kg is not None:
        v.capacity_kg = body.capacity_kg
    if body.kind is not None:
        v.kind = _kind(body.kind)
    if body.default_driver is not None:
        v.default_driver = _clean(body.default_driver)
    if body.note is not None:
        v.note = body.note
    if body.active is not None:
        v.active = body.active
    db.commit()
    return vehicle_out(v)


@router.delete("/vehicles/{vid}", dependencies=ADMIN)
def delete_vehicle(vid: int, db: Session = DB):
    v = db.get(Vehicle, vid) or _404("xe")
    if db.scalar(select(Task.id).where(Task.vehicle_plate == v.plate).limit(1)):
        raise HTTPException(400, "Xe đã chạy chuyến — không xóa được, hãy chuyển sang ngừng sử dụng")
    db.delete(v)
    db.commit()
    return {"ok": True}


# ================================================================ xưởng mạ
class GalvanizerIn(In):
    name: str = Field(min_length=1, max_length=200)
    address: str = ""
    phone: str = ""
    note: str = ""
    active: bool = True


class GalvanizerPatch(In):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = None
    phone: str | None = None
    note: str | None = None
    active: bool | None = None


def galvanizer_out(g: Galvanizer) -> dict:
    return {"id": g.id, "name": g.name, "address": g.address, "phone": g.phone, "note": g.note, "active": g.active}


def _galv_name(db: Session, name: str, except_id: int | None = None) -> str:
    n = _clean(name)
    if db.scalar(select(Galvanizer.id).where(Galvanizer.name == n, Galvanizer.id != (except_id or 0))):
        raise HTTPException(400, f"Xưởng mạ \"{n}\" đã có")
    return n


@router.get("/galvanizers")
def list_galvanizers(db: Session = DB):
    return [galvanizer_out(g) for g in db.scalars(select(Galvanizer).order_by(Galvanizer.name))]


@router.post("/galvanizers", dependencies=ADMIN)
def create_galvanizer(body: GalvanizerIn, db: Session = DB):
    g = Galvanizer(name=_galv_name(db, body.name), address=_clean(body.address), phone=_clean(body.phone),
                   note=body.note or "", active=body.active)
    db.add(g)
    db.commit()
    return galvanizer_out(g)


@router.patch("/galvanizers/{gid}", dependencies=ADMIN)
def update_galvanizer(gid: int, body: GalvanizerPatch, db: Session = DB):
    g = db.get(Galvanizer, gid) or _404("xưởng mạ")
    if body.name is not None:
        g.name = _galv_name(db, body.name, gid)
    for f in ("address", "phone"):
        if getattr(body, f) is not None:
            setattr(g, f, _clean(getattr(body, f)))
    if body.note is not None:
        g.note = body.note
    if body.active is not None:
        g.active = body.active
    db.commit()
    return galvanizer_out(g)


@router.delete("/galvanizers/{gid}", dependencies=ADMIN)
def delete_galvanizer(gid: int, db: Session = DB):
    g = db.get(Galvanizer, gid) or _404("xưởng mạ")
    if db.scalar(select(Task.id).where(Task.galvanizer_id == gid).limit(1)):
        raise HTTPException(400, "Xưởng mạ đã có chuyến gửi mạ — không xóa được, hãy chuyển sang ngừng hợp tác")
    db.delete(g)
    db.commit()
    return {"ok": True}


# ================================================================ nguyên liệu mua vào
class MaterialIn(In):
    date: datetime | None = None
    supplier: str = Field(min_length=1, max_length=200)
    steel_grade: str = ""
    spec: str = ""
    qty: float = Field(default=0, ge=0)
    unit: str = "tấm"
    kg: float = Field(gt=0)  # KG cân thực tế tại xưởng
    kg_supplier: float | None = Field(default=None, ge=0)  # KG theo bên cung cấp
    photo: str | None = None  # ảnh chứng từ
    note: str = ""


class MaterialPatch(In):
    date: datetime | None = None
    supplier: str | None = Field(default=None, min_length=1, max_length=200)
    steel_grade: str | None = None
    spec: str | None = None
    qty: float | None = Field(default=None, ge=0)
    unit: str | None = None
    kg: float | None = Field(default=None, gt=0)
    kg_supplier: float | None = Field(default=None, ge=0)
    photo: str | None = None
    note: str | None = None


def material_out(m: MaterialReceipt) -> dict:
    from .files import sign_photo
    return {"id": m.id, "date": iso(m.date), "supplier": m.supplier, "steelGrade": m.steel_grade, "spec": m.spec,
            "qty": m.qty, "unit": m.unit, "kg": m.kg, "note": m.note, "by": m.by, "kgSupplier": m.kg_supplier,
            "delta": (m.kg - m.kg_supplier) if m.kg_supplier is not None else None,  # thực tế − NCC
            "photo": sign_photo(m.photo) if m.photo else None}


NVL_SOURCE = "Nhập nguyên liệu"


def _sync_vloss_material(db: Session, m: MaterialReceipt) -> None:
    """Kho ảo gồm cả chênh lệch nhập nguyên liệu: kg = NCC − cân thực tế (dương = thiếu, âm = thừa). Lệch bao nhiêu ghi bấy nhiêu."""
    from .models import VLoss
    e = db.scalar(select(VLoss).where(VLoss.ref_type == "nl", VLoss.ref_id == m.id))
    d = (m.kg_supplier - m.kg) if m.kg_supplier is not None else 0
    if abs(d) <= 0.5:
        if e:
            db.delete(e)
        return
    note = f"{'Thiếu' if d > 0 else 'Thừa'} {abs(d):,.0f} kg so với bên cung cấp {m.supplier}".replace(",", ".") \
        + (f" — {m.note}" if m.note else "")
    if e is None:
        db.add(VLoss(id=svc.next_id(db, "VK", "vk"), date=utcnow(), ref_type="nl", ref_id=m.id, contract_id="",
                     source=NVL_SOURCE, kg=d, approved_by=m.by or "Kho", status="Đã ghi nhận", note=note))
    else:
        e.kg, e.note = d, note


def _notify_material(db: Session, m: MaterialReceipt) -> None:
    """Phiếu nhập NVL gửi lên Quản lý (chỉ ghi nhận / thống kê, không cần duyệt); có chênh thì ghi rõ."""
    d = (m.kg - m.kg_supplier) if m.kg_supplier is not None else 0
    lech = f" — CHÊNH {d:+,.0f} kg".replace(",", ".") if abs(d) > 0.5 else ""
    svc.notify(db, f"Phiếu nhập NVL {m.id}: {m.supplier}{lech}",
               (f"NCC {m.kg_supplier:,.0f} kg · ".replace(",", ".") if m.kg_supplier is not None else "")
               + f"cân thực tế {m.kg:,.0f} kg".replace(",", ".") + f" · {m.by}" + (f" · {m.note}" if m.note else ""),
               "warning" if lech else "info", roles="admin")


def _materials(db: Session, frm, to) -> list[MaterialReceipt]:
    frm, to = _period(frm, to)
    return [m for m in db.scalars(select(MaterialReceipt).order_by(MaterialReceipt.date.desc()))
            if (not frm and not to) or _in(m.date, frm, to)]


@router.get("/material-receipts")
def list_materials(frm: datetime | None = Query(None, alias="from"), to: datetime | None = None, db: Session = DB):
    return [material_out(m) for m in _materials(db, frm, to)]


@router.post("/material-receipts", dependencies=NL_EDIT)
def create_material(body: MaterialIn, db: Session = DB):
    m = MaterialReceipt(id=svc.next_id(db, "NL", "nl"), date=body.date or utcnow(), supplier=_clean(body.supplier),
                        steel_grade=_clean(body.steel_grade).upper(), spec=_clean(body.spec), qty=body.qty,
                        unit=_clean(body.unit) or "tấm", kg=body.kg, note=body.note or "",
                        by=actor(PEOPLE["kho"]["name"]), kg_supplier=body.kg_supplier, photo=body.photo)
    db.add(m)
    db.flush()
    _notify_material(db, m)
    _sync_vloss_material(db, m)
    db.commit()
    return material_out(m)


@router.patch("/material-receipts/{mid}", dependencies=NL_EDIT)
def update_material(mid: str, body: MaterialPatch, db: Session = DB):
    m = db.get(MaterialReceipt, mid) or _404(mid)
    data = body.model_dump(exclude_none=True)
    for f in ("supplier", "spec", "unit"):
        if f in data:
            setattr(m, f, _clean(data[f]))
    if "steel_grade" in data:
        m.steel_grade = _clean(data["steel_grade"]).upper()
    for f in ("date", "qty", "kg", "note", "kg_supplier", "photo"):
        if f in data:
            setattr(m, f, data[f])
    _sync_vloss_material(db, m)
    db.commit()
    return material_out(m)


@router.get("/reports/material-stats")
def material_stats(frm: datetime | None = Query(None, alias="from"), to: datetime | None = None, db: Session = DB):
    rows = _materials(db, frm, to)
    pfrm, pto = _period(frm, to)

    def group(key) -> list[dict]:
        acc: dict[str, dict] = {}
        for m in rows:
            k = key(m) or "—"
            g = acc.setdefault(k, {"key": k, "kg": 0.0, "count": 0})
            g["kg"] += m.kg or 0
            g["count"] += 1
        return list(acc.values())

    by_month = sorted(group(lambda m: m.date.astimezone(VN_TZ).strftime("%Y-%m")), key=lambda g: g["key"])
    produced = sum(r.kg or 0 for r in db.scalars(select(Receipt))
                   if (not pfrm and not pto) or _in(r.date, pfrm, pto))
    total = sum(m.kg or 0 for m in rows)
    return {
        "totalKg": total, "count": len(rows),
        "byMonth": by_month,
        "bySupplier": sorted(group(lambda m: m.supplier), key=lambda g: -g["kg"]),
        "byGrade": sorted(group(lambda m: m.steel_grade), key=lambda g: -g["kg"]),
        # SX hoàn thành = thành phẩm xưởng bàn giao kho (phiếu chuẩn bị hàng PTN) trong kỳ
        "producedKg": produced,
        "producedPct": round(produced / total * 100) if total else None,
    }


# ================================================================ giám sát số tấn theo từng xe
@router.get("/reports/vehicle-tonnage")
def vehicle_tonnage(frm: datetime | None = Query(None, alias="from"), to: datetime | None = None, db: Session = DB):
    frm, to = _period(frm, to)
    rows: dict[str, dict] = {}

    def row(plate: str, v: Vehicle | None = None) -> dict:
        return rows.setdefault(plate, {
            "plate": plate or None, "vehicleId": v.id if v else None, "capacityKg": v.capacity_kg if v else None,
            "kind": v.kind if v else None, "defaultDriver": v.default_driver if v else "",
            "active": v.active if v else None, "tripCount": 0, "diMaTrips": 0, "giaoTrips": 0, "kgToGalv": 0.0,
            "kgPicked": 0.0, "kgDelivered": 0.0, "mismatchKg": 0.0, "mismatchTrips": 0, "openTrips": 0,
            "drivers": [], "lastTrip": None, "trips": []})

    for v in db.scalars(select(Vehicle).order_by(Vehicle.plate)):
        row(v.plate, v)
    for t in db.scalars(select(Task).where(Task.status != "Từ chối")):
        d = t.departed_at or t.assigned_at
        if (frm or to) and not _in(d, frm, to):
            continue
        r = row(t.vehicle_plate or "")
        r["tripCount"] += 1
        delta, kg = None, None
        if t.type == "di_ma":
            r["diMaTrips"] += 1
            if t.kg_at_galv is not None:
                kg = t.kg_at_galv
                r["kgToGalv"] += t.kg_at_galv
                delta = t.kg_at_galv - (t.kg_required or 0)
        else:
            r["giaoTrips"] += 1
            if t.kg_picked is not None:
                r["kgPicked"] += t.kg_picked
            if t.kg_delivered is not None:
                kg = t.kg_delivered
                r["kgDelivered"] += t.kg_delivered
                delta = t.kg_delivered - (t.kg_picked or 0)
        if kg is None:
            r["openTrips"] += 1
        if delta:
            r["mismatchKg"] += abs(delta)
            r["mismatchTrips"] += 1
        if t.driver not in r["drivers"]:
            r["drivers"].append(t.driver)
        if d and (r["lastTrip"] is None or d > r["lastTrip"]):
            r["lastTrip"] = d
        r["trips"].append({"id": t.id, "type": t.type, "contractId": t.contract_id, "driver": t.driver,
                           "date": iso(d), "status": t.status, "kgRequired": t.kg_required, "kg": kg,
                           "delta": delta})
    out = []
    for r in rows.values():
        r["trips"].sort(key=lambda x: x["date"] or "", reverse=True)
        r["lastTrip"] = iso(r["lastTrip"])
        out.append(r)
    out.sort(key=lambda r: (r["plate"] is None, r["plate"] or ""))
    return out


# ================================================================ cảnh báo cuối ngày (chạy tay để demo)
@router.post("/alerts/run-end-of-day", dependencies=ADMIN)
def alerts_run(force: bool = False, db: Session = DB):
    return run_end_of_day(db, force=force)
