"""API sửa chứng từ có lịch sử, giao lại / phát lại, xem lịch sử chỉnh sửa, xuất Excel.

PATCH trả về bản ghi (shape như GET) + `editOutcome` {changed, mismatchAction, mismatchId, message}.
mismatchAction: created (lập biên bản mới) | updated (cập nhật số trên biên bản chờ ký) | noted (về dung sai,
giữ biên bản + ghi chú) | null.
"""
from datetime import datetime
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import Field
from sqlalchemy.orm import Session

from . import edit_services as es
from . import serializers as S
from .db import get_db
from .export import SHEETS, Filters, export
from .history import list_history
from .models import User
from .schemas import In
from .security import can, get_current_user, require, require_roles

router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])
DB = Depends(get_db)
ADMIN = [Depends(require_roles("admin"))]

# loại bản ghi → trang phân quyền (xem lịch sử = có quyền xem trang đó)
PAGE_OF = {"dh": "don-hang", "hd": "hop-dong", "lsx": "lsx", "ptn": "tiep-nhan", "pc": "phieu-can",
           "vc": "van-chuyen", "sl": "sai-lech"}


def _with(rec: dict, outcome: dict) -> dict:
    return {**rec, "editOutcome": outcome}


# ---------------------------------------------------------------- request body
class SignersIn(In):
    boc_xep: str | None = None
    kho: str | None = None
    lai_xe: str | None = None


class WeighingEdit(In):
    kg_expected: float | None = Field(default=None, gt=0)
    kg_actual: float | None = Field(default=None, ge=0)
    signers: SignersIn | None = None
    reason: str | None = None          # lý do sửa (bắt buộc khi đổi số kg)
    mismatch_reason: str | None = None  # lý do sai lệch (danh mục) nếu phải lập biên bản mới
    reason_note: str | None = None      # diễn giải cho biên bản mới


class ReceiptEdit(In):
    qty: float | None = Field(default=None, gt=0)
    kg: float | None = Field(default=None, gt=0)
    note: str | None = None
    reason: str | None = None


class TaskEdit(In):
    driver: str | None = None
    kg_required: float | None = Field(default=None, gt=0)
    ref_id: str | None = None
    note: str | None = None
    kg_at_galv: float | None = Field(default=None, ge=0)
    kg_picked: float | None = Field(default=None, ge=0)
    kg_delivered: float | None = Field(default=None, ge=0)
    reason: str | None = None
    mismatch_reason: str | None = None
    reason_note: str | None = None


class MismatchEdit(In):
    reason: str | None = None       # lý do sai lệch (danh mục)
    reason_note: str | None = None  # diễn giải
    edit_note: str | None = None    # ghi chú vì sao sửa (tùy chọn)


class LsxEdit(In):
    name: str | None = None
    qty_plan: float | None = Field(default=None, gt=0)
    kg_plan: float | None = Field(default=None, gt=0)
    lead_days: int | None = Field(default=None, ge=1)
    deadline: datetime | None = None
    reason: str | None = None


class TaskReassign(In):
    driver: str = Field(min_length=1)
    kg_required: float | None = Field(default=None, gt=0)
    note: str | None = None


class LsxReissue(In):
    lead_days: int | None = Field(default=None, ge=1)
    qty_plan: float | None = Field(default=None, gt=0)
    kg_plan: float | None = Field(default=None, gt=0)
    note: str | None = None


# ---------------------------------------------------------------- sửa có lịch sử
@router.patch("/weighings/{pid}", dependencies=[Depends(require("phieu-can", "edit"))])
def edit_weighing(pid: str, body: WeighingEdit, db: Session = DB):
    p, out = es.edit_weighing(db, pid, body.model_dump(exclude_none=True))
    return _with(S.weighing(p), out)


@router.patch("/receipts/{rid}", dependencies=[Depends(require("tiep-nhan", "edit"))])
def edit_receipt(rid: str, body: ReceiptEdit, db: Session = DB):
    r, out = es.edit_receipt(db, rid, body.model_dump(exclude_none=True))
    return _with(S.receipt(r), out)


@router.patch("/tasks/{tid}", dependencies=ADMIN)
def edit_task(tid: str, body: TaskEdit, db: Session = DB):
    t, out = es.edit_task(db, tid, body.model_dump(exclude_none=True))
    return _with(S.task(t), out)


@router.patch("/mismatches/{mid}", dependencies=[Depends(require_roles("kho", "lx"))])
def edit_mismatch(mid: str, body: MismatchEdit, db: Session = DB, user: User = Depends(get_current_user)):
    m, out = es.edit_mismatch(db, mid, body.model_dump(exclude_none=True), user)
    return _with(S.mismatch(m), out)


@router.patch("/lsx/{lid}", dependencies=ADMIN)
def edit_lsx(lid: str, body: LsxEdit, db: Session = DB):
    x, out = es.edit_lsx(db, lid, body.model_dump(exclude_none=True))
    return _with(S.lsx(x), out)


# ---------------------------------------------------------------- giao lại / phát lại
@router.post("/tasks/{tid}/reassign", dependencies=ADMIN)
def reassign_task(tid: str, body: TaskReassign, db: Session = DB):
    t, out = es.reassign_task(db, tid, body.driver, body.kg_required, body.note)
    return _with(S.task(t), out)


@router.post("/lsx/{lid}/reissue", dependencies=ADMIN)
def reissue_lsx(lid: str, body: LsxReissue, db: Session = DB):
    x, out = es.reissue_lsx(db, lid, body.model_dump(exclude_none=True))
    return _with(S.lsx(x), out)


# ---------------------------------------------------------------- lịch sử
@router.get("/history/{entity_type}/{entity_id}")
def history(entity_type: str, entity_id: str, db: Session = DB, user: User = Depends(get_current_user)):
    page = PAGE_OF.get(entity_type)
    if not page:
        raise HTTPException(404, "Loại bản ghi không hợp lệ")
    if not can(user, page):
        raise HTTPException(403, "Bạn không có quyền xem bản ghi này")
    return list_history(db, entity_type, entity_id)


# ---------------------------------------------------------------- xuất Excel
XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.get("/export/{sheet}.xlsx", response_class=Response,
            responses={200: {"content": {XLSX: {}}, "description": "File Excel"}})
def export_xlsx(sheet: str, contract_id: str | None = None, lsx_id: str | None = None, status: str | None = None,
                type: str | None = None, driver: str | None = None, source: str | None = None,
                due: str | None = None, kind: str | None = None, date_from: datetime | None = None,
                date_to: datetime | None = None, q: str | None = None, ids: str | None = None,
                db: Session = DB, user: User = Depends(get_current_user)):
    s = SHEETS.get(sheet)
    if not s:
        raise HTTPException(404, f"Không có sổ '{sheet}' để xuất")
    if not can(user, s.page):
        raise HTTPException(403, "Bạn không có quyền xuất sổ này")
    f = Filters(contract_id=contract_id or None, lsx_id=lsx_id or None, status=status or None, type=type or None,
                driver=driver or None, source=source or None, due=due or None, kind=kind or None,
                date_from=date_from, date_to=date_to, q=(q or "").strip() or None,
                ids=[x.strip() for x in (ids or "").split(",") if x.strip()])
    data, filename = export(db, sheet, user, f)
    cd = f"attachment; filename=\"{filename}\"; filename*=UTF-8''{quote(filename)}"
    return Response(content=data, media_type=XLSX, headers={"Content-Disposition": cd})
