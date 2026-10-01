"""Đăng nhập, hồ sơ cá nhân, quản lý người dùng (Quản lý), nhật ký thao tác."""
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import PERMISSIONS, ROLES
from .db import get_db, utcnow
from .models import AuditLog, User
from .schemas import In
from .security import create_token, get_current_user, hash_password, level_of, require_roles, verify_password
from .utils import iso

ROLE_IDS = {r["id"] for r in ROLES}
PAGES = sorted({p for m in PERMISSIONS.values() for p in m} | {"nguoi-dung"})

public = APIRouter(prefix="/api/auth")
router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)])
DB = Depends(get_db)


def user_out(u: User) -> dict:
    return {
        "id": u.id, "name": u.name, "dept": u.dept, "phone": u.phone, "roles": u.role_list, "active": u.active,
        "mustChangePassword": u.must_change_password, "createdAt": iso(u.created_at), "lastLoginAt": iso(u.last_login_at),
        # quyền theo trang đã tính sẵn (nhiều vai trò → mức cao nhất) để FE ẩn/hiện menu, nút
        "permissions": {p: lv for p in PAGES if (lv := level_of(u, p) if p != "nguoi-dung" else
                                                  ("full" if "admin" in u.role_list else None))},
    }


def _norm_phone(phone: str) -> str:
    p = re.sub(r"[\s.\-]", "", phone or "")
    if not re.fullmatch(r"\+?\d{9,12}", p):
        raise HTTPException(400, "Số điện thoại không hợp lệ")
    return p


def _check_roles(roles: list[str]) -> str:
    if not roles or not set(roles) <= ROLE_IDS:
        raise HTTPException(400, "Vai trò không hợp lệ")
    return ",".join(dict.fromkeys(roles))


def _check_password(pw: str) -> None:
    if len(pw) < 6:
        raise HTTPException(400, "Mật khẩu tối thiểu 6 ký tự")


# ---------------------------------------------------------------- đăng nhập
class LoginIn(In):
    phone: str
    password: str


@public.post("/login")
def login(body: LoginIn, db: Session = DB):
    u = db.scalar(select(User).where(User.phone == re.sub(r"[\s.\-]", "", body.phone or "")))
    if not u or not verify_password(body.password, u.password_hash):
        raise HTTPException(401, "Sai số điện thoại hoặc mật khẩu")
    if not u.active:
        raise HTTPException(403, "Tài khoản đã bị khóa, liên hệ Quản lý")
    u.last_login_at = utcnow()
    db.commit()
    return {"token": create_token(u), "user": user_out(u)}


@router.get("/auth/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


class ChangePasswordIn(In):
    old_password: str
    new_password: str


@router.post("/auth/change-password")
def change_password(body: ChangePasswordIn, db: Session = DB, user: User = Depends(get_current_user)):
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(400, "Mật khẩu hiện tại không đúng")
    _check_password(body.new_password)
    u = db.get(User, user.id)
    u.password_hash, u.must_change_password = hash_password(body.new_password), False
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- quản lý người dùng (chỉ Quản lý)
ADMIN = [Depends(require_roles("admin"))]


class UserCreate(In):
    name: str = Field(min_length=1)
    phone: str
    dept: str = ""
    roles: list[str]
    password: str


class UserUpdate(In):
    name: str | None = None
    phone: str | None = None
    dept: str | None = None
    roles: list[str] | None = None
    active: bool | None = None


class ResetPasswordIn(In):
    password: str


@router.get("/users", dependencies=ADMIN)
def list_users(db: Session = DB):
    return [user_out(u) for u in db.scalars(select(User).order_by(User.created_at))]


@router.post("/users", dependencies=ADMIN)
def create_user(body: UserCreate, db: Session = DB):
    phone = _norm_phone(body.phone)
    if db.scalar(select(User).where(User.phone == phone)):
        raise HTTPException(400, "Số điện thoại đã được dùng cho tài khoản khác")
    _check_password(body.password)
    u = User(id=f"u-{uuid.uuid4().hex[:8]}", name=body.name.strip(), dept=body.dept.strip(), phone=phone,
             roles=_check_roles(body.roles), password_hash=hash_password(body.password), active=True,
             must_change_password=True, created_at=utcnow())
    db.add(u)
    db.commit()
    return user_out(u)


@router.patch("/users/{uid}", dependencies=ADMIN)
def update_user(uid: str, body: UserUpdate, db: Session = DB, me_: User = Depends(get_current_user)):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Không tìm thấy người dùng")
    if body.phone is not None:
        phone = _norm_phone(body.phone)
        if db.scalar(select(User).where(User.phone == phone, User.id != uid)):
            raise HTTPException(400, "Số điện thoại đã được dùng cho tài khoản khác")
        u.phone = phone
    if body.name is not None:
        u.name = body.name.strip()
    if body.dept is not None:
        u.dept = body.dept.strip()
    if body.roles is not None:
        roles = _check_roles(body.roles)
        if uid == me_.id and "admin" not in roles.split(","):
            raise HTTPException(400, "Không thể tự bỏ quyền Quản lý của chính mình")
        u.roles = roles
    if body.active is not None:
        if uid == me_.id and not body.active:
            raise HTTPException(400, "Không thể tự khóa tài khoản của chính mình")
        u.active = body.active
    db.commit()
    return user_out(u)


@router.post("/users/{uid}/reset-password", dependencies=ADMIN)
def reset_password(uid: str, body: ResetPasswordIn, db: Session = DB):
    u = db.get(User, uid)
    if not u:
        raise HTTPException(404, "Không tìm thấy người dùng")
    _check_password(body.password)
    u.password_hash, u.must_change_password = hash_password(body.password), True
    db.commit()
    return {"ok": True}


@router.get("/audit-logs", dependencies=ADMIN)
def audit_logs(limit: int = 200, user_id: str | None = None, db: Session = DB):
    q = select(AuditLog).order_by(AuditLog.at.desc()).limit(min(limit, 1000))
    if user_id:
        q = q.where(AuditLog.user_id == user_id)
    return [{"id": a.id, "at": iso(a.at), "userId": a.user_id, "userName": a.user_name, "method": a.method,
             "path": a.path, "status": a.status} for a in db.scalars(q)]
