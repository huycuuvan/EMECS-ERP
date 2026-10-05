"""Đăng nhập & phân quyền phía server.

- Mật khẩu: PBKDF2-SHA256 (thư viện chuẩn), 260k vòng, salt ngẫu nhiên.
- Token: JWT HS256, hết hạn sau TOKEN_HOURS giờ, gửi qua header `Authorization: Bearer <token>`.
- Phân quyền: bảng PERMISSIONS (theo trang, giống bản demo) — người nhiều vai trò lấy mức cao nhất.
  Một số thao tác chỉ dành cho vai trò cụ thể (vd ký sai lệch = admin) → `require_roles`.
- Người thao tác hiện tại lưu ở contextvar để services ghi đúng tên (người cân, người duyệt…).
"""
import base64
import hashlib
import hmac
import os
from contextvars import ContextVar
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import PERMISSIONS, SECRET_KEY, TOKEN_HOURS
from .db import get_db, utcnow
from .models import User

_ITER = int(os.getenv("PBKDF2_ITER", "260000"))  # test đặt thấp cho nhanh
LEVEL_RANK = {"view": 1, "limited": 2, "full": 3}

current_user_var: ContextVar[User | None] = ContextVar("current_user", default=None)


# ---------------------------------------------------------------- mật khẩu
def hash_password(pw: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, _ITER)
    return f"pbkdf2_sha256${_ITER}${base64.b64encode(salt).decode()}${base64.b64encode(dk).decode()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, it, salt, dk = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), base64.b64decode(salt), int(it))
        return hmac.compare_digest(calc, base64.b64decode(dk))
    except Exception:
        return False


# ---------------------------------------------------------------- token
def create_token(user: User) -> str:
    now = utcnow()
    return jwt.encode({"sub": user.id, "iat": now, "exp": now + timedelta(hours=TOKEN_HOURS)}, SECRET_KEY, "HS256")


async def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    # async: chạy trong context của request để contextvar truyền xuống endpoint (sync, threadpool)
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(401, "Chưa đăng nhập")
    try:
        payload = jwt.decode(auth[7:], SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại")
    except jwt.PyJWTError:
        raise HTTPException(401, "Token không hợp lệ")
    user = db.get(User, payload.get("sub"))
    if not user or not user.active:
        raise HTTPException(401, "Tài khoản không tồn tại hoặc đã bị khóa")
    request.state.user = user
    current_user_var.set(user)
    return user


# ---------------------------------------------------------------- phân quyền
def level_of(user: User, page: str) -> str | None:
    if "admin" in user.role_list:
        return "full"
    best = None
    for r in user.role_list:
        lv = PERMISSIONS.get(r, {}).get(page)
        if lv and (best is None or LEVEL_RANK[lv] > LEVEL_RANK[best]):
            best = lv
    return best


def can(user: User, page: str, need: str = "view") -> bool:
    lv = level_of(user, page)
    if not lv:
        return False
    if need == "full":
        return lv == "full"
    if need == "edit":
        return lv in ("full", "limited")
    return True


def require(page: str, need: str = "view"):
    """Dependency: người dùng phải có quyền `need` (view|edit|full) trên trang `page`."""
    def dep(user: User = Depends(get_current_user)) -> User:
        if not can(user, page, need):
            raise HTTPException(403, "Bạn không có quyền thực hiện thao tác này")
        return user
    return dep


def require_any(*pages: str):
    """Dependency ĐỌC dữ liệu: người dùng phải xem được ít nhất một màn trong `pages` (Quản lý luôn qua)."""
    def dep(user: User = Depends(get_current_user)) -> User:
        if any(can(user, p) for p in pages):
            return user
        raise HTTPException(403, "Vai trò của bạn không được xem dữ liệu này")
    return dep


# Ai được ĐỌC dữ liệu gì — theo màn của vai trò cần tới dữ liệu đó (mỗi vai trò chỉ thấy dữ liệu màn của mình)
R_ORDERS = ("don-hang", "hop-dong", "khach-hang", "tiep-nhan")
R_CONTRACTS = ("hop-dong", "don-hang", "khach-hang", "tiep-nhan", "phieu-can", "van-chuyen", "lsx")  # ngoài hop-dong: bản rút gọn, không tiền
R_CONTRACT_FULL = ("hop-dong",)
R_LSX = ("lsx", "tiep-nhan", "phieu-can", "hop-dong")
R_RECEIPTS = ("tiep-nhan", "phieu-can", "lsx", "hop-dong")
R_WEIGHINGS = ("phieu-can", "tiep-nhan", "lsx", "hop-dong", "van-chuyen")
R_TASKS = ("van-chuyen", "phieu-can", "hop-dong", "lsx", "tiep-nhan")
R_MISMATCHES = ("sai-lech", "phieu-can", "van-chuyen")
R_VLOSS = ("kho-ao", "bao-cao")
R_REPORTS = ("dashboard", "bao-cao")
R_OVERDUE = ("dashboard", "bao-cao", "phieu-can", "van-chuyen", "lsx", "tiep-nhan")
R_CUSTOMERS = ("don-hang", "hop-dong", "khach-hang")
R_FLEET = ("van-chuyen", "xe", "xuong-ma", "tiep-nhan", "phieu-can", "doi-ung-ma")
R_MATERIALS = ("nguyen-lieu", "bao-cao")
R_TONNAGE = ("xe", "bao-cao", "dashboard")


def require_roles(*roles: str):
    """Dependency: người dùng phải giữ ít nhất một vai trò trong `roles` (admin luôn qua)."""
    def dep(user: User = Depends(get_current_user)) -> User:
        if "admin" in user.role_list or set(roles) & set(user.role_list):
            return user
        raise HTTPException(403, "Bạn không có quyền thực hiện thao tác này")
    return dep


def actor(default: str = "Hệ thống") -> str:
    """Tên người đang thao tác (dùng trong services để ghi 'người lập/người ký')."""
    u = current_user_var.get()
    return u.name if u else default
