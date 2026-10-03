"""Cảnh báo cuối ngày (M03): sau END_OF_DAY_HOUR giờ Việt Nam, hệ thống tự tạo thông báo tổng hợp 1 lần/ngày,
nhắm đúng vai trò cần xử lý (Notification.roles):

- LSX "Đang SX" hôm nay chưa nhập sản lượng ngày (20h) · LSX quá hạn tiến độ (cả gia hạn) → xưởng + Quản lý
- Hợp đồng đến hạn / quá hạn trả khách                                                 → kế toán + Quản lý
- Thẻ lái xe quá hạn điền số cân + ảnh phiếu                                           → lái xe + Quản lý
- Phiếu cân trạm quá hạn nhập số / ảnh                                                  → thủ kho + Quản lý

Chống trùng: ngày đã chạy lưu ở bảng sequences (key "eod", value = yyyymmdd).
Vòng lặp nền là asyncio task khởi động trong lifespan (main.py), hủy được khi tắt ứng dụng.
"""
import asyncio
import logging
from datetime import datetime

from sqlalchemy import String, literal, or_, select
from sqlalchemy.orm import Session

from . import services as svc
from .config import END_OF_DAY_HOUR
from .db import SessionLocal, utcnow
from .models import Contract, Lsx, LsxDaily, Notification, Sequence, User
from .utils import VN_TZ, fmt_d

log = logging.getLogger("steel.alerts")
STATE_KEY = "eod"
CHECK_EVERY_S = 300


def visible_to(q, user: User):
    """Lọc câu truy vấn Notification: roles rỗng (mọi người) hoặc giao với vai trò của người dùng; Quản lý thấy hết."""
    roles = user.role_list
    if "admin" in roles:
        return q
    padded = literal(",", String) + Notification.roles + literal(",", String)
    return q.where(or_(Notification.roles.is_(None), *[padded.like(f"%,{r},%") for r in roles]))


def _ids(items: list[str], limit: int = 6) -> str:
    return ", ".join(items[:limit]) + (f" … (+{len(items) - limit})" if len(items) > limit else "")


def collect(db: Session, now: datetime | None = None) -> list[dict]:
    """Danh sách thông báo cuối ngày cần tạo (chưa ghi DB)."""
    now = now or utcnow()
    day_start = now.astimezone(VN_TZ).replace(hour=0, minute=0, second=0, microsecond=0)
    out: list[dict] = []

    running = db.scalars(select(Lsx).where(Lsx.status == "Đang SX").order_by(Lsx.id)).all()
    reported = set(db.scalars(select(LsxDaily.lsx_id).where(LsxDaily.day == day_start.date())))
    stale = [x.id for x in running if x.id not in reported]
    if stale:
        out.append({"title": f"Cuối ngày ({END_OF_DAY_HOUR}h): {len(stale)} lệnh SX chưa nhập sản lượng hôm nay",
                    "sub": f"{_ids(stale)} — xưởng nhập số kg làm được hôm nay (không làm thì nhập 0)", "type": "warning",
                    "roles": "sx,admin"})

    late = []
    for x in db.scalars(select(Lsx).where(Lsx.status.in_(("Chờ nhận", "Đang SX"))).order_by(Lsx.id)):
        due = x.ext_to or x.deadline
        if due and due < now:
            late.append(f"{x.id} (hạn {fmt_d(due)})")
    if late:
        out.append({"title": f"Cuối ngày: {len(late)} lệnh SX quá hạn tiến độ", "sub": _ids(late), "type": "error",
                    "roles": "sx,admin"})

    hd = []
    for c in db.scalars(select(Contract).order_by(Contract.id)):
        due = svc.contract_due_info(c)
        if due["state"] in ("overdue", "due"):
            hd.append((due["days"], f"{c.id} {due['label'].lower()}"))
    if hd:
        hd.sort()
        out.append({"title": f"Cuối ngày: {len(hd)} hợp đồng đến hạn / quá hạn trả khách",
                    "sub": _ids([t for _, t in hd]), "type": "error" if hd[0][0] < 0 else "warning",
                    "roles": "kt,admin"})

    docs = svc.overdue_docs(db)
    vc = [f"{d['id']} ({d['person']}, quá {d['hoursOver']}h)" for d in docs if d["type"] == "vc"]
    if vc:
        out.append({"title": f"Cuối ngày: {len(vc)} thẻ lái xe quá hạn điền phiếu",
                    "sub": f"{_ids(vc)} — điền số cân + tải ảnh phiếu", "type": "error", "roles": "lx,admin"})
    pc = [f"{d['id']} (thiếu {d['missing']})" for d in docs if d["type"] == "pc"]
    if pc:
        out.append({"title": f"Cuối ngày: {len(pc)} phiếu cân trạm quá hạn nhập số liệu", "sub": _ids(pc),
                    "type": "error", "roles": "kho,admin"})
    return out


def run_end_of_day(db: Session, force: bool = False, now: datetime | None = None) -> dict:
    """Tạo thông báo cuối ngày. Mỗi ngày (giờ VN) chỉ chạy 1 lần, trừ khi force=True."""
    now = now or utcnow()
    today = now.astimezone(VN_TZ)
    stamp = int(today.strftime("%Y%m%d"))
    state = db.get(Sequence, STATE_KEY, with_for_update=True) or Sequence(key=STATE_KEY, value=0)
    if state.value == stamp and not force:
        db.rollback()
        return {"ran": False, "date": today.date().isoformat(), "created": 0, "titles": []}
    items = collect(db, now)
    for it in items:
        db.add(Notification(at=now, title=it["title"], sub=it["sub"], type=it["type"], roles=it["roles"]))
    state.value = stamp
    db.add(state)
    db.commit()
    return {"ran": True, "date": today.date().isoformat(), "created": len(items), "titles": [i["title"] for i in items]}


def run_if_due(now: datetime | None = None) -> dict | None:
    """Gọi định kỳ từ vòng lặp nền: chỉ chạy khi đã qua giờ cuối ngày (giờ VN)."""
    now = now or utcnow()
    if now.astimezone(VN_TZ).hour < END_OF_DAY_HOUR:
        return None
    with SessionLocal() as db:
        return run_end_of_day(db, now=now)


async def end_of_day_loop(interval: float = CHECK_EVERY_S) -> None:
    while True:
        try:
            res = await asyncio.to_thread(run_if_due)
            if res and res["ran"]:
                log.info("Cảnh báo cuối ngày %s: tạo %s thông báo", res["date"], res["created"])
        except asyncio.CancelledError:
            raise
        except Exception:  # lỗi DB tạm thời không được làm chết vòng lặp
            log.exception("Lỗi chạy cảnh báo cuối ngày")
        await asyncio.sleep(interval)
