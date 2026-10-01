from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .db import utcnow

VN_TZ = ZoneInfo("Asia/Ho_Chi_Minh")


def ago(days: float = 0, hours: float = 0) -> datetime:
    return utcnow() - timedelta(days=days, hours=hours)


def ahead(days: float = 0, hours: float = 0) -> datetime:
    return utcnow() + timedelta(days=days, hours=hours)


def add_hours(d: datetime, h: float) -> datetime:
    return d + timedelta(hours=h)


def add_days(d: datetime, n: float) -> datetime:
    return d + timedelta(days=n)


def _vn_num(n: float, decimals: int = 0) -> str:
    s = f"{n:,.{decimals}f}"
    return s.replace(",", "_").replace(".", ",").replace("_", ".")


def fmt_num(n) -> str:
    n = float(n or 0)
    return _vn_num(n, 0) if n == int(n) else _vn_num(n, 2).rstrip("0").rstrip(",")


def fmt_kg(n) -> str:
    return f"{fmt_num(n)} kg"


def fmt_d(d: datetime | None) -> str:
    return d.astimezone(VN_TZ).strftime("%d/%m/%Y") if d else "—"


def money(n) -> str:
    return f"{_vn_num(round(float(n or 0)))}₫"


def money_short(n) -> str:
    n = float(n or 0)
    if abs(n) >= 1e9:
        return f"{fmt_num(round(n / 1e9, 2))} tỷ"
    if abs(n) >= 1e6:
        return f"{_vn_num(round(n / 1e6))} tr"
    return money(n)


def iso(d: datetime | None) -> str | None:
    return d.isoformat().replace("+00:00", "Z") if d else None
