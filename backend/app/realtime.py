"""Thông báo realtime + thông báo đẩy (Web Push).

- Mỗi Notification ghi vào DB (qua `notify`, cảnh báo cuối ngày…) được bắt ở `after_commit` của Session rồi:
  1. đẩy ngay xuống các trình duyệt đang mở qua SSE (`GET /api/notifications/stream?token=…`) → chuông, popup,
     dữ liệu trên màn tự cập nhật, không phải chờ tải lại;
  2. gửi Web Push tới điện thoại / máy tính đã bật thông báo (kể cả khi đã đóng webapp). Web Push chỉ chạy
     khi trang mở bằng HTTPS (hoặc localhost) — giới hạn của trình duyệt.
- Ai thấy thông báo nào: `can_see` (Quản lý thấy hết; `to_user` → chỉ đúng người đó; `roles` → theo vai trò).
- Khóa VAPID tự sinh lần đầu, lưu ở bảng settings (key "vapid"); đặt env VAPID_PRIVATE_KEY/VAPID_PUBLIC_KEY để cố định.
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import threading
from dataclasses import dataclass, field

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from .db import SessionLocal, utcnow
from .models import Notification, PushSubscription, Setting, User
from .security import get_current_user, user_from_token

log = logging.getLogger("realtime")
PUSH_ENABLED = os.getenv("PUSH_ENABLED", "1") != "0"
VAPID_SUBJECT = os.getenv("VAPID_SUBJECT", "mailto:admin@emecs.vn")

router = APIRouter(prefix="/api")


# ---------------------------------------------------------------- ai thấy thông báo nào
def can_see(n: dict, roles: list[str], name: str) -> bool:
    if "admin" in roles:
        return True
    if n.get("toUser"):
        return n["toUser"] == name
    if not n.get("roles"):
        return True
    return bool(set(n["roles"].split(",")) & set(roles))


def snapshot(n: Notification) -> dict:
    from .serializers import notification as ser
    return {**ser(n), "roles": n.roles, "toUser": n.to_user}


# ---------------------------------------------------------------- SSE: người đang mở app
@dataclass(eq=False)
class _Sub:
    name: str
    roles: list[str]
    queue: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=200))


_loop: asyncio.AbstractEventLoop | None = None
_subs: set[_Sub] = set()


def bind_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _loop
    _loop = loop


def _deliver(items: list[dict]) -> None:
    if _loop is None or not _subs:
        return
    for s in list(_subs):
        for it in items:
            if can_see(it, s.roles, s.name):
                _loop.call_soon_threadsafe(_put, s, it)


def _put(s: _Sub, it: dict) -> None:
    try:
        s.queue.put_nowait(it)
    except asyncio.QueueFull:  # client treo — bỏ qua, lần tải sau vẫn thấy trong danh sách
        pass


@event.listens_for(Session, "after_flush")
def _collect(session, _ctx) -> None:
    for obj in session.new:
        if isinstance(obj, Notification):
            session.info.setdefault("_notifs", []).append(obj)


@event.listens_for(Session, "after_commit")
def _publish(session) -> None:
    ns = session.info.pop("_notifs", None)
    if not ns:
        return
    items = [snapshot(n) for n in ns]
    _deliver(items)
    if PUSH_ENABLED:
        threading.Thread(target=_send_push, args=(items,), daemon=True).start()


@event.listens_for(Session, "after_rollback")
def _drop(session) -> None:
    session.info.pop("_notifs", None)


@router.get("/notifications/stream")
async def stream(request: Request, token: str = Query(...)):
    """EventSource không gửi được header → token qua query. Ping 20s/lần để proxy không cắt kết nối."""
    with SessionLocal() as db:
        user = user_from_token(db, token)
        sub = _Sub(name=user.name, roles=user.role_list)
    _subs.add(sub)

    async def gen():
        try:
            yield "retry: 4000\nevent: hello\ndata: {}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    it = await asyncio.wait_for(sub.queue.get(), timeout=20)
                    data = {k: v for k, v in it.items() if k not in ("roles", "toUser")}
                    yield f"event: notif\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            _subs.discard(sub)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"})


# ---------------------------------------------------------------- Web Push
def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def vapid_keys(db: Session) -> tuple[str, str]:
    """(private raw base64url, public uncompressed-point base64url) — env, hoặc tự sinh 1 lần và lưu settings."""
    priv, pub = os.getenv("VAPID_PRIVATE_KEY"), os.getenv("VAPID_PUBLIC_KEY")
    if priv and pub:
        return priv, pub
    row = db.get(Setting, "vapid")
    if row:
        v = json.loads(row.value)
        return v["private"], v["public"]
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    key = ec.generate_private_key(ec.SECP256R1())
    priv = _b64(key.private_numbers().private_value.to_bytes(32, "big"))
    pub = _b64(key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint))
    db.add(Setting(key="vapid", value=json.dumps({"private": priv, "public": pub})))
    db.commit()
    return priv, pub


def _send_push(items: list[dict]) -> None:
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:  # chưa cài pywebpush → chỉ có realtime trong app
        return
    try:
        with SessionLocal() as db:
            subs = db.scalars(select(PushSubscription)).all()
            if not subs:
                return
            users = {u.id: u for u in db.scalars(select(User))}
            priv, _ = vapid_keys(db)
            dead = []
            for it in items:
                body = json.dumps({"id": it["id"], "title": it["title"], "body": it.get("sub") or "",
                                   "ref": it.get("refId"), "type": it.get("type")}, ensure_ascii=False)
                for s in subs:
                    u = users.get(s.user_id)
                    if not u or not u.active or not can_see(it, u.role_list, u.name) or s.id in dead:
                        continue
                    try:
                        webpush({"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}}, body,
                                vapid_private_key=priv, vapid_claims={"sub": VAPID_SUBJECT}, ttl=86400)
                    except WebPushException as e:
                        if e.response is not None and e.response.status_code in (404, 410):
                            dead.append(s.id)  # trình duyệt đã hủy đăng ký
                        else:
                            log.warning("web push lỗi: %s", e)
            for s in subs:
                if s.id in dead:
                    db.delete(s)
            db.commit()
    except Exception:  # không để lỗi push làm hỏng nghiệp vụ
        log.exception("gửi web push thất bại")


class PushSubIn(BaseModel):
    endpoint: str
    keys: dict[str, str]


@router.get("/push/key")
def push_key(_u: User = Depends(get_current_user)):
    with SessionLocal() as db:
        return {"publicKey": vapid_keys(db)[1]}


@router.post("/push/subscribe")
def push_subscribe(body: PushSubIn, user: User = Depends(get_current_user)):
    if not body.keys.get("p256dh") or not body.keys.get("auth"):
        raise HTTPException(400, "Đăng ký thông báo thiếu khóa")
    with SessionLocal() as db:
        for old in db.scalars(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint)):
            db.delete(old)  # cùng trình duyệt đăng nhập tài khoản khác → chuyển sang tài khoản mới
        db.add(PushSubscription(user_id=user.id, endpoint=body.endpoint, p256dh=body.keys["p256dh"],
                                auth=body.keys["auth"], created_at=utcnow()))
        db.commit()
    return {"ok": True}


@router.post("/push/unsubscribe")
def push_unsubscribe(body: PushSubIn, user: User = Depends(get_current_user)):
    with SessionLocal() as db:
        for s in db.scalars(select(PushSubscription).where(PushSubscription.endpoint == body.endpoint,
                                                           PushSubscription.user_id == user.id)):
            db.delete(s)
        db.commit()
    return {"ok": True}
