"""Sản xuất: chỉ khối lượng, xưởng nhập sản lượng theo từng ngày (0 nếu không làm), giờ nhập/sửa, cảnh báo 20h."""
from datetime import date, datetime, timedelta, timezone

from app import alerts
from app.db import SessionLocal

from test_master import c, login  # noqa: F401

VN = timezone(timedelta(hours=7))


def _new_lsx(c, kg=10_000):
    hd = c.post("/api/orders", json={"customer": "Cty Test SX", "items": [
        {"name": "Cột", "qty": 10, "unit": "Bộ", "kgPerUnit": kg / 10, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{hd['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": kg, "leadDays": 7}).json()  # không cần số lượng SP
    assert x["qtyPlan"] == 0 and x["kgPlan"] == kg
    login(c, "sx")
    assert c.post(f"/api/lsx/{x['id']}/daily", json={"kg": 100}).status_code == 400  # chưa nhận lệnh
    c.post(f"/api/lsx/{x['id']}/accept")
    return x["id"]


def test_daily_entries_sum_and_edit_time(c):
    lid = _new_lsx(c)
    today = datetime.now(VN).date()
    x = c.post(f"/api/lsx/{lid}/daily", json={"kg": 0, "note": "Nghỉ chờ vật tư"}).json()  # không làm → 0
    assert x["kgDone"] == 0 and x["today"]["kg"] == 0 and not x["today"]["edited"]
    x = c.post(f"/api/lsx/{lid}/daily", json={"kg": 3000}).json()  # nhập lại cùng ngày = sửa, giữ số cũ + giờ sửa
    assert x["kgDone"] == 3000 and x["today"]["edited"]
    row = x["daily"][0]
    assert row["day"] == today.isoformat() and row["prevKg"] == 0 and row["updatedAt"] and row["createdAt"]
    assert x["lastUpdateAt"] == row["updatedAt"]
    assert c.post(f"/api/lsx/{lid}/daily", json={"day": (today + timedelta(days=1)).isoformat(), "kg": 1}).status_code == 400
    assert c.post(f"/api/lsx/{lid}/daily", json={"kg": -1}).status_code == 422
    login(c, "ql")  # Quản lý được báo mỗi lần nhập / sửa, kèm giờ
    titles = [n["title"] for n in c.get("/api/notifications").json()]
    assert any(f"{lid}: xưởng sửa sản lượng" in t for t in titles) and any(f"{lid}: xưởng báo sản lượng" in t for t in titles)


def test_daily_completes_lsx(c):
    lid = _new_lsx(c, kg=5000)
    x = c.post(f"/api/lsx/{lid}/daily", json={"kg": 5000}).json()
    assert x["status"] == "Hoàn thành"
    x = c.post(f"/api/lsx/{lid}/daily", json={"kg": 4000}).json()  # sửa giảm → quay lại Đang SX
    assert x["status"] == "Đang SX" and x["kgDone"] == 4000


def test_8pm_alert_lists_lsx_without_today_entry(c):
    lid = _new_lsx(c)
    with SessionLocal() as db:
        now = datetime.now(VN).replace(hour=20, minute=5)
        items = alerts.collect(db, now=now.astimezone(timezone.utc))
    stale = next(i for i in items if "chưa nhập sản lượng hôm nay" in i["title"])
    assert lid in stale["sub"]
    c.post(f"/api/lsx/{lid}/daily", json={"kg": 0})
    with SessionLocal() as db:
        items = alerts.collect(db, now=now.astimezone(timezone.utc))
    stale = next((i for i in items if "chưa nhập sản lượng hôm nay" in i["title"]), {"sub": ""})
    assert lid not in stale["sub"]


def test_receipt_kg_only_and_task_auto_kg_arrival_delivery(c):
    login(c, "kho")
    r = c.post("/api/receipts", json={"lsxId": "LSX-SD06", "kg": 1000})  # không cần số lượng SP
    assert r.status_code == 200 and r.json()["kg"] == 1000
    login(c, "ql")
    base = {"type": "di_ma", "driver": "Lê Đức Vận", "contractId": "HD-2609-06", "refId": "PC-0201"}
    assert c.post("/api/tasks", json=base).status_code == 400  # thiếu giờ có mặt
    assert c.post("/api/tasks", json={**base, "arriveAt": "2099-01-01T07:30:00+07:00",
                                      "fillDeadline": "2099-01-01T07:00:00+07:00"}).status_code == 400  # hạn trước giờ có mặt
    t = c.post("/api/tasks", json={**base, "arriveAt": "2099-01-01T07:30:00+07:00", "fillDeadline": "2099-01-01T18:00:00+07:00"}).json()
    assert t["fillDeadline"].startswith("2099-01-01T18:00")
    d = c.post("/api/tasks", json={**base, "refId": None, "arriveAt": "2099-01-01T07:30:00+07:00"}).json()
    assert d["fillDeadline"].startswith("2099-01-02T07:30")  # mặc định có mặt + 24h
    assert t["kgRequired"] > 0 and t["arriveAt"].startswith("2099-01-01") and t["deliver"] is None  # KG lấy từ phiếu cân
    g = c.post("/api/tasks", json={"type": "giao_khach", "driver": "Lê Đức Vận", "contractId": "HD-2609-06",
                                   "arriveAt": "2099-01-02T08:00:00+07:00", "deliverCustomerId": 1,
                                   "deliverName": "Cty Xây lắp Sông Đà 9", "deliverAddress": "Công trường KCN Yên Phong",
                                   "receiverName": "Anh Hùng", "receiverPhone": "0912000111",
                                   "contactName": "Chị Lan", "contactPhone": "0913000222"}).json()
    assert g["deliver"]["receiverName"] == "Anh Hùng" and g["deliver"]["address"] == "Công trường KCN Yên Phong"
    assert g["kgRequired"] == 0  # không gắn chứng từ → không bắt nhập kg


def test_receipt_items_sum_to_kg(c):
    o = c.post("/api/orders", json={"customer": "Cty Test CBH", "items": [
        {"name": "Cột", "qty": 40, "unit": "Bộ", "kgPerUnit": 250, "price": 20000},
        {"name": "Bản mã", "qty": 200, "unit": "Bộ", "kgPerUnit": 10, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 12000}).json()
    ids = [i["id"] for i in c.get(f"/api/orders/{o['id']}").json()["items"]]
    login(c, "kho")
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": ids[0], "qty": 4}, {"itemId": ids[1], "qty": 30}]}).json()
    assert r["kg"] == 4 * 250 + 30 * 10 and r["qty"] == 34
    assert [(i["name"], i["qty"], i["kg"]) for i in r["items"]] == [("Cột", 4, 1000), ("Bản mã", 30, 300)]
    assert c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": 999999, "qty": 1}]}).status_code == 400
    assert c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": ids[0], "qty": 0}]}).status_code == 400
