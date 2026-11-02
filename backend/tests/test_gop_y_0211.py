"""Góp ý anh Thắng 02/11: tên đơn hàng bắt buộc · số ngày còn lại theo ngày lịch · "trên xe tới mạ" chỉ tính khi đã
cân tại xưởng · tồn kho chờ cân xuất = lệnh chuẩn bị hàng chưa cân (phần lệch đã vào kho ảo không tính)."""
from datetime import timedelta

from app import services as svc
from app.db import utcnow
from app.utils import VN_TZ

from test_lsx_daily import _produce
from test_master import c, login  # noqa: F401


def test_order_name_required(c):
    item = {"name": "Cột", "qty": 1, "unit": "Bộ", "kgPerUnit": 100, "price": 20000}
    r = c.post("/api/orders", json={"customer": "Cty A", "items": [item]})
    assert r.status_code == 400 and r.json()["detail"] == "Chưa nhập tên đơn hàng"
    assert c.post("/api/orders", json={"customer": "Cty A", "name": "  ", "items": [item]}).status_code == 400
    o = c.post("/api/orders", json={"customer": "Cty A", "name": "Đơn 01", "items": [item]}).json()
    assert c.patch(f"/api/orders/{o['id']}", json={"name": " ", "reason": "x"}).status_code == 400


def test_days_left_by_calendar_day():
    """Hạn 2 ngày lịch nữa (giờ nào cũng vậy) → còn 2 ngày; qua 0h thì tự giảm, không chờ đủ 24 giờ."""
    today = utcnow().astimezone(VN_TZ).replace(hour=0, minute=30, second=0, microsecond=0)
    assert svc._days_left(today + timedelta(days=2)) == 2
    assert svc._days_left(today + timedelta(days=2, hours=23)) == 2
    assert svc._days_left(today - timedelta(days=1)) == -1


def test_on_truck_only_after_weighing_at_factory(c):
    o = c.post("/api/orders", json={"customer": "Cty Trên Xe", "name": "Đơn trên xe", "items": [
        {"name": "Cột", "qty": 100, "unit": "Bộ", "kgPerUnit": 100, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 10000}).json()
    _produce(c, x["id"], 10000)
    item = c.get(f"/api/orders/{o['id']}").json()["items"][0]["id"]
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": item, "qty": 40}],  # 4.000 kg, giao luôn tài xế
                                      "driver": "Lê Đức Vận", "arriveAt": "2099-01-01T08:00:00+07:00"}).json()
    g = c.get(f"/api/contracts/{hd['id']}").json()
    assert g["inTransitToGalvKg"] == 0 and g["stockKg"] == 4000  # xe chưa đóng hàng, chưa cân → chưa trên xe
    task = next(t for t in g["tasksDiMa"])
    row = next(m for m in c.get("/api/reports/movement-log").json() if m["id"] == task["id"])
    assert row["state"] == "Chờ cân tại xưởng" and row["kgPlan"] is None
    assert c.get("/api/reports/stock-snapshot", params={"contract_id": hd["id"]}).json()["stockKg"] == 4000
    pc = next(p for p in c.get("/api/weighings").json() if p["receiptId"] == r["id"])
    c.post(f"/api/weighings/{pc['id']}/fill", json={"grossKg": 11851, "tareKg": 8000})  # 3.851 — hụt 149 kg (≤ 5%)
    snap = c.get("/api/reports/stock-snapshot", params={"contract_id": hd["id"]}).json()
    assert snap["stockKg"] == 0 and snap["inTransitToGalvKg"] == 3851  # 149 kg đã vào kho ảo, không còn tồn kho
    assert next(e for e in c.get("/api/vloss").json() if e["refId"] == pc["id"])["kg"] == 149
