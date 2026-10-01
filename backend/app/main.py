from contextlib import asynccontextmanager

from alembic import command
from alembic.config import Config

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select

from .api import router
from .auth_api import public as auth_public
from .auth_api import router as auth_router
from .config import BASE_DIR, CORS_ORIGINS, UPLOAD_DIR
from .db import SessionLocal, utcnow
from .models import AuditLog, User
from .seed import seed


def migrate() -> None:
    """Cập nhật schema DB lên phiên bản mới nhất (Alembic) mỗi lần khởi động."""
    cfg = Config(str(BASE_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BASE_DIR / "migrations"))
    cfg.attributes["skip_logging"] = True
    command.upgrade(cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    migrate()
    with SessionLocal() as db:
        if db.scalar(select(User).limit(1)) is None:
            seed(db)
    yield


app = FastAPI(title="STEEL ONE — ERP Cơ khí thép", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])
app.include_router(auth_public)
app.include_router(auth_router)
app.include_router(router)


@app.middleware("http")
async def audit(request: Request, call_next):
    """Ghi nhật ký mọi thao tác ghi dữ liệu (ai, lúc nào, API nào, kết quả)."""
    response = await call_next(request)
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.url.path.startswith("/api") \
            and request.url.path != "/api/auth/login":
        user = getattr(request.state, "user", None)
        with SessionLocal() as db:
            db.add(AuditLog(at=utcnow(), user_id=getattr(user, "id", None), user_name=getattr(user, "name", None),
                            method=request.method, path=request.url.path[:255], status=response.status_code))
            db.commit()
    return response


app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/health")
def health():
    return {"ok": True}
