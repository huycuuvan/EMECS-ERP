"""Ảnh phiếu tải lên: lưu trong UPLOAD_DIR, DB chỉ lưu đường dẫn gốc `/uploads/<tên>`.

Khi trả ra API, đường dẫn được ký HMAC + hạn dùng (`?exp=…&sig=…`) để thẻ <img> xem được mà không cần
header đăng nhập, nhưng người ngoài không đoán/dùng lại link lâu dài. Khi client gửi ảnh ngược lên
(link đã ký) thì bỏ phần ký trước khi lưu.
"""
import hashlib
import hmac
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from .config import SECRET_KEY, UPLOAD_DIR

LINK_TTL = 12 * 3600  # giây
PREFIX = "/uploads/"

router = APIRouter()


def _sig(name: str, exp: int) -> str:
    return hmac.new(SECRET_KEY.encode(), f"{name}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]


def sign_photo(photo: str | None) -> str | None:
    """`/uploads/x.jpg` → `/uploads/x.jpg?exp=…&sig=…`; data URL / None giữ nguyên."""
    if not photo or not photo.startswith(PREFIX):
        return photo
    name = normalize_photo(photo)[len(PREFIX):]
    exp = int(time.time()) + LINK_TTL
    return f"{PREFIX}{name}?exp={exp}&sig={_sig(name, exp)}"


def normalize_photo(photo: str | None) -> str | None:
    """Bỏ phần ký (query string) để lưu DB đường dẫn gốc."""
    if not photo or not photo.startswith(PREFIX):
        return photo
    return urlparse(photo).path


@router.get("/uploads/{name}")
def get_upload(name: str, exp: int = 0, sig: str = ""):
    if not exp or exp < time.time() or not hmac.compare_digest(sig, _sig(name, exp)):
        raise HTTPException(403, "Link ảnh không hợp lệ hoặc đã hết hạn — mở lại bản ghi để lấy link mới")
    path = (UPLOAD_DIR / name).resolve()
    if path.parent != Path(UPLOAD_DIR).resolve() or not path.is_file():
        raise HTTPException(404, "Không tìm thấy ảnh")
    return FileResponse(path, headers={"Cache-Control": "private, max-age=3600"})


def _qs(photo: str) -> dict:  # dùng trong test
    return {k: v[0] for k, v in parse_qs(urlparse(photo).query).items()}
