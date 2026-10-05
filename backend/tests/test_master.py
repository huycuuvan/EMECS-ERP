"""Danh mục (khách hàng + thẻ, xe, xưởng mạ), nguyên liệu mua vào, số tấn theo xe, cảnh báo cuối ngày."""
import os
import tempfile

os.environ.setdefault("DATABASE_URL", os.environ.get("TEST_DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/test.db"))
os.environ.setdefault("PBKDF2_ITER", "1000")
os.environ.setdefault("ALERTS_ENABLED", "0")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402

PW = "steel123"
PHONES = {"ql": "0900000001", "kt": "0900000002", "sx": "0900000003", "kho": "0900000004", "lx1": "0900000005",
          "lx2": "0900000006"}


def login(client, who="ql"):
    r = client.post("/api/auth/login", json={"phone": PHONES[who], "password": PW})
    assert r.status_code == 200, r.text
    client.headers["Authorization"] = f"Bearer {r.json()['token']}"
    return r.json()["user"]


@pytest.fixture()
def c():
    with TestClient(app) as client:
        login(client)
        client.post("/api/admin/reset")
        login(client)
        yield client


def tag_id(c, name):
    return next(t["id"] for t in c.get("/api/tags").json() if t["name"] == name)


# ---------------------------------------------------------------- khách hàng & thẻ
def test_seed_customers_and_tag_filters(c):
    custs = {x["name"]: x for x in c.get("/api/customers").json()}
    assert len(custs) == 8
    fecon = custs["Cty CP Kết cấu thép FECON"]
    assert fecon["orderCount"] == 2 and "Khách thân thiết" in [t["name"] for t in fecon["tags"]]
    loyal, retail = tag_id(c, "Khách thân thiết"), tag_id(c, "Khách lẻ")
    orders = c.get("/api/orders", params={"tag": loyal}).json()
    assert {o["id"] for o in orders} == {"DH-2609-01", "DH-2608-11", "DH-2609-02", "DH-2609-04", "DH-2608-15"}
    assert all(o["customerId"] for o in orders)
    assert {o["id"] for o in c.get("/api/orders", params={"tag": retail}).json()} == {"DH-2609-03", "DH-2609-05"}
    hds = c.get("/api/contracts", params={"tag": retail}).json()
    assert [h["id"] for h in hds] == ["HD-2609-03"] and hds[0]["customerId"]
    d = c.get("/api/dashboard", params={"tag": loyal}).json()
    assert d["activeContracts"] == 2 and d["deliveredKgTotal"] == 103880 and len(d["contracts"]) == 5
    assert [x["id"] for x in d["overdueDocs"]] == ["VC-0006"]
    assert all(a["contract"]["id"] != "HD-2609-03" for a in d["contractAlerts"])
    # không lọc → giữ nguyên số liệu dashboard gốc
    assert c.get("/api/dashboard").json()["activeContracts"] == 4


def test_customer_and_tag_crud(c):
    t = c.post("/api/tags", json={"name": "VIP", "color": "#c5400a"}).json()
    assert c.post("/api/tags", json={"name": "vip"}).status_code == 400  # trùng tên
    cu = c.post("/api/customers", json={"name": "Cty Thép Mới", "shortCode": "TM", "phone": "0912 000 111",
                                        "tagIds": [t["id"]]}).json()
    assert [x["name"] for x in cu["tags"]] == ["VIP"]
    assert c.post("/api/customers", json={"name": "cty thép mới"}).status_code == 400
    loyal = tag_id(c, "Khách thân thiết")
    cu = c.post(f"/api/customers/{cu['id']}/tags/{loyal}").json()
    assert {x["name"] for x in cu["tags"]} == {"VIP", "Khách thân thiết"}
    cu = c.delete(f"/api/customers/{cu['id']}/tags/{t['id']}").json()
    assert [x["name"] for x in cu["tags"]] == ["Khách thân thiết"]
    t = c.patch(f"/api/tags/{t['id']}", json={"name": "Khách VIP"}).json()
    assert t["name"] == "Khách VIP"

    # đơn hàng: chọn khách có sẵn theo id; gõ tên khách mới → tự tạo khách
    o = c.post("/api/orders", json={"customer": "x", "customerId": cu["id"], "items": [
        {"name": "Dầm", "qty": 1, "kg": 1000, "price": 50000}]}).json()
    assert o["customer"] == "Cty Thép Mới" and o["customerId"] == cu["id"]
    assert o["id"] in {x["id"] for x in c.get("/api/orders", params={"tag": loyal}).json()}
    o2 = c.post("/api/orders", json={"customer": "  Cty Khách Lạ  ", "items": [
        {"name": "Xà gồ", "qty": 1, "kg": 500, "price": 48000}]}).json()
    new = next(x for x in c.get("/api/customers", params={"q": "khách lạ"}).json())
    assert o2["customerId"] == new["id"] and new["name"] == "Cty Khách Lạ"

    # đổi tên khách → tên trên đơn đổi theo; khách có đơn không xóa được
    c.patch(f"/api/customers/{cu['id']}", json={"name": "Cty Thép Mới Đổi Tên"})
    assert c.get(f"/api/orders/{o['id']}").json()["customer"] == "Cty Thép Mới Đổi Tên"
    assert c.delete(f"/api/customers/{cu['id']}").status_code == 400
    empty = c.post("/api/customers", json={"name": "Khách chưa có đơn"}).json()
    assert c.delete(f"/api/customers/{empty['id']}").status_code == 200

    # xóa thẻ → gỡ khỏi mọi khách
    assert c.delete(f"/api/tags/{loyal}").status_code == 200
    assert all("Khách thân thiết" not in [t["name"] for t in x["tags"]] for x in c.get("/api/customers").json())


def test_master_permissions(c):
    login(c, "kt")
    assert c.get("/api/customers").status_code == 200  # đơn hàng: xem
    assert c.get("/api/tags").status_code == 200
    assert c.post("/api/customers", json={"name": "X"}).status_code == 200  # kế toán: bổ sung khách (Bên A) khi soạn HĐ
    assert c.get("/api/material-receipts").status_code == 200  # đọc: mọi người đăng nhập
    assert c.post("/api/material-receipts", json={"supplier": "X", "kg": 1}).status_code == 403  # kế toán không ghi nguyên liệu
    assert c.get("/api/vehicles").status_code == 200  # đọc: mọi người đăng nhập
    assert c.post("/api/alerts/run-end-of-day").status_code == 403
    login(c, "lx1")
    assert c.get("/api/customers").status_code == 200  # đọc: mọi người đăng nhập
    assert c.post("/api/customers", json={"name": "Y"}).status_code == 403  # lái xe không sửa danh mục khách
    assert c.post("/api/tags", json={"name": "Y"}).status_code == 403
    me = c.get("/api/auth/me").json()
    assert set(me["permissions"]) == {"van-chuyen"}  # lái xe chỉ thấy màn Thẻ công việc
    assert c.get("/api/vehicles").status_code == 200 and c.get("/api/galvanizers").status_code == 200
    assert c.post("/api/vehicles", json={"plate": "30A-000.00"}).status_code == 403
    assert c.get("/api/reports/vehicle-tonnage").status_code == 200  # đọc: mọi người đăng nhập
    login(c, "sx")
    assert c.get("/api/material-receipts").status_code == 200
    assert c.post("/api/material-receipts", json={"supplier": "A", "kg": 100}).status_code == 403
    login(c, "kho")
    u = c.get("/api/auth/me").json()
    assert set(u["permissions"]) == {"tiep-nhan", "phieu-can", "nguyen-lieu"}  # kho chỉ thấy màn của kho
    assert c.post("/api/galvanizers", json={"name": "Mạ B"}).status_code == 403


# ---------------------------------------------------------------- xe, xưởng mạ, số tấn theo xe
def test_vehicle_tonnage_seed(c):
    rows = {r["plate"]: r for r in c.get("/api/reports/vehicle-tonnage").json()}
    assert set(rows) == {"29H-123.45", "29H-678.90", "29C-246.80"}
    a, b, h = rows["29H-123.45"], rows["29H-678.90"], rows["29C-246.80"]
    assert (a["tripCount"], a["kgToGalv"], a["kgPicked"], a["kgDelivered"], a["mismatchKg"]) == (11, 49940, 61940, 61860, 140)
    assert (b["tripCount"], b["kgToGalv"], b["kgPicked"], b["kgDelivered"], b["mismatchKg"]) == (10, 39980, 41980, 42020, 40)
    assert (h["tripCount"], h["kgToGalv"], h["kind"], h["capacityKg"]) == (3, 24000, "thuê", 8000)
    assert a["drivers"] == ["Phạm Văn Tài"] and a["lastTrip"] and len(a["trips"]) == 11
    # kỳ lọc: chỉ 7 ngày gần nhất
    from datetime import datetime, timedelta
    frm = (datetime.now() - timedelta(days=7)).date().isoformat()
    recent = {r["plate"]: r for r in c.get("/api/reports/vehicle-tonnage", params={"from": frm}).json()}
    assert recent["29C-246.80"]["tripCount"] == 0 and recent["29H-123.45"]["tripCount"] < 11


def test_task_with_vehicle_and_galvanizer(c):
    g = c.get("/api/galvanizers").json()
    assert [x["name"] for x in g] == ["Mạ kẽm Việt Đức"]
    assert c.get("/api/tasks/VC-0001").json()["galvanizerId"] == g[0]["id"]
    assert c.get("/api/tasks/VC-0001").json()["vehiclePlate"] == "29H-123.45"
    v = c.post("/api/vehicles", json={"plate": "29h-555.55", "capacityKg": 15000, "kind": "thuê"}).json()
    assert v["plate"] == "29H-555.55"
    assert c.post("/api/vehicles", json={"plate": "29H-555.55"}).status_code == 400
    assert c.post("/api/vehicles", json={"plate": "29H-555.56", "kind": "xe"}).status_code == 400
    t = c.post("/api/tasks", json={"type": "di_ma", "driver": "Lê Đức Vận", "contractId": "HD-2609-06", "arriveAt": "2099-01-01T08:00:00+07:00",
                                   "refId": "PC-0201", "kgRequired": 10000, "vehiclePlate": "29H-555.55",
                                   "galvanizerId": g[0]["id"]}).json()
    assert t["vehiclePlate"] == "29H-555.55" and t["galvanizerId"] == g[0]["id"]
    row = next(r for r in c.get("/api/reports/vehicle-tonnage").json() if r["plate"] == "29H-555.55")
    assert row["tripCount"] == 1 and row["openTrips"] == 1
    # đổi biển số → thẻ đổi theo; xe đã chạy không xóa được
    c.patch(f"/api/vehicles/{v['id']}", json={"plate": "29H-555.57"})
    assert c.get(f"/api/tasks/{t['id']}").json()["vehiclePlate"] == "29H-555.57"
    assert c.delete(f"/api/vehicles/{v['id']}").status_code == 400
    assert c.delete(f"/api/galvanizers/{g[0]['id']}").status_code == 400
    g2 = c.post("/api/galvanizers", json={"name": "Mạ kẽm Bắc Ninh"}).json()
    assert c.delete(f"/api/galvanizers/{g2['id']}").status_code == 200


# ---------------------------------------------------------------- nguyên liệu mua vào
def test_material_receipts_and_stats(c):
    rows = c.get("/api/material-receipts").json()
    assert len(rows) == 6 and rows[0]["id"] == "NL-0006"
    s = c.get("/api/reports/material-stats").json()
    assert s["totalKg"] == 133107 and s["count"] == 6
    assert s["byGrade"][0] == {"key": "SS400", "kg": 91731, "count": 4}
    assert s["bySupplier"][0]["key"] == "Cty TNHH Thép Minh Khang"
    login(c, "kho")
    m = c.post("/api/material-receipts", json={"supplier": "Cty CP Thép Á Châu", "steelGrade": "ss400",
                                               "spec": "Thép tấm 8×1500×6000", "qty": 10, "unit": "tấm",
                                               "kg": 5652}).json()
    assert m["id"] == "NL-0007" and m["steelGrade"] == "SS400" and m["by"] == "Ngô Minh Kho"
    m = c.patch(f"/api/material-receipts/{m['id']}", json={"kg": 5700, "note": "Cân lại"}).json()
    assert m["kg"] == 5700 and m["note"] == "Cân lại"
    s2 = c.get("/api/reports/material-stats").json()
    assert s2["totalKg"] == 133107 + 5700
    assert next(g for g in s2["byGrade"] if g["key"] == "SS400")["count"] == 5
    assert c.get("/api/reports/material-stats", params={"from": "2099-01-01"}).json()["totalKg"] == 0
    # SX hoàn thành (PTN) trong kỳ lọc theo ngày
    assert s2["producedKg"] == 143200 and s2["producedPct"] == round(143200 / (133107 + 5700) * 100)


# ---------------------------------------------------------------- cảnh báo cuối ngày
def test_end_of_day_alerts_role_targeted_once_per_day(c):
    r = c.post("/api/alerts/run-end-of-day").json()
    assert r["ran"] and r["created"] == 3
    assert c.post("/api/alerts/run-end-of-day").json() == {**r, "ran": False, "created": 0, "titles": []}
    titles_ql = [n["title"] for n in c.get("/api/notifications").json()]
    assert sum(t.startswith("Cuối ngày") for t in titles_ql) == 3
    login(c, "kt")
    titles = [n["title"] for n in c.get("/api/notifications").json()]
    assert any("hợp đồng đến hạn" in t for t in titles)
    assert not any("lệnh SX" in t or "thẻ lái xe" in t for t in titles)
    assert "Đơn hàng mới DH-2609-05" in titles  # thông báo chung (roles rỗng) vẫn thấy
    login(c, "sx")
    titles = [n["title"] for n in c.get("/api/notifications").json()]
    assert any("lệnh SX chưa nhập sản lượng" in t for t in titles) and not any("hợp đồng đến hạn" in t for t in titles)
    login(c, "lx1")
    assert any("thẻ lái xe" in n["title"] for n in c.get("/api/notifications").json())
    # đánh dấu đã đọc chỉ tác động thông báo người đó thấy
    c.post("/api/notifications/read-all")
    login(c, "ql")
    ns = {n["title"]: n["read"] for n in c.get("/api/notifications").json()}
    assert ns["Cuối ngày: 1 thẻ lái xe quá hạn điền phiếu"] is True
    assert ns["Cuối ngày: 2 hợp đồng đến hạn / quá hạn trả khách"] is False
    # force=1 chạy lại trong ngày
    assert c.post("/api/alerts/run-end-of-day", params={"force": 1}).json()["created"] == 3


def test_end_of_day_time_gate():
    from datetime import datetime, timezone
    from app import alerts
    from app.db import SessionLocal
    from app.models import Notification
    with TestClient(app) as client:
        login(client)
        client.post("/api/admin/reset")
    today = datetime.now(alerts.VN_TZ)
    early = today.replace(hour=10, minute=0).astimezone(timezone.utc)
    late = today.replace(hour=alerts.END_OF_DAY_HOUR, minute=30).astimezone(timezone.utc)
    assert alerts.run_if_due(early) is None  # chưa tới giờ cuối ngày
    assert alerts.run_if_due(late)["ran"] is True
    assert alerts.run_if_due(late)["ran"] is False  # đã chạy hôm nay
    with SessionLocal() as db:
        assert db.query(Notification).filter(Notification.roles.is_not(None)).count() >= 1


def test_customer_profile_fields_and_segment_filter(c):
    body = {"name": "CÔNG TY CỔ PHẦN THÀNH HƯNG", "address": "Số 142 Hàn Thuyên, phường Nam Định, tỉnh Ninh Bình",
            "phone": "0228.3632559", "bankAccount": "2682686868", "bankName": "Ngân hàng TMCP Đông Nam Á - CN Nam Định",
            "taxCode": "0600321679", "representative": "Bà Vũ Thị Lan Anh", "representativeTitle": "Giám đốc",
            "segment": "Thân thiết"}
    cu = c.post("/api/customers", json=body).json()
    assert cu["representative"] == "Bà Vũ Thị Lan Anh" and cu["bankName"].startswith("Ngân hàng TMCP Đông Nam Á")
    assert cu["segment"] == "Thân thiết"
    assert c.post("/api/customers", json={**body, "name": "X", "segment": "VIP"}).status_code == 400
    names = [x["name"] for x in c.get("/api/customers", params={"segment": "Thân thiết"}).json()]
    assert "CÔNG TY CỔ PHẦN THÀNH HƯNG" in names and "Cty TNHH Cơ điện Delta" not in names  # seed: Delta = Đơn lẻ
    assert c.get("/api/customers", params={"q": "lan anh"}).json()[0]["id"] == cu["id"]
    # lọc đơn hàng / hợp đồng / dashboard theo phân loại
    seg_orders = c.get("/api/orders", params={"segment": "Đơn lẻ"}).json()
    assert seg_orders and {o["customer"] for o in seg_orders} <= {"Cty TNHH Cơ điện Delta", "Ban QLDA Cầu đường 5"}
    assert all(x["customer"] != "Cty TNHH Cơ điện Delta" for x in c.get("/api/contracts", params={"segment": "Thân thiết"}).json())
    assert c.get("/api/dashboard", params={"segment": "Thân thiết"}).status_code == 200


def test_material_receipt_supplier_vs_actual_notifies_manager(c):
    login(c, "kho")
    m = c.post("/api/material-receipts", json={"supplier": "Thép Minh Khang", "spec": "Thép tấm 12ly",
                                               "kgSupplier": 10000, "kg": 9950, "photo": "/uploads/x.png"}).json()
    assert m["kgSupplier"] == 10000 and m["kg"] == 9950 and m["delta"] == -50 and m["photo"]
    login(c, "ql")
    n = c.get("/api/notifications").json()[0]
    assert n["title"].startswith(f"Phiếu nhập NVL {m['id']}") and "CHÊNH -50 kg" in n["title"]
    vk = next(e for e in c.get("/api/vloss").json() if e["refId"] == m["id"])  # kho ảo gồm cả chênh nhập NVL
    assert vk["source"] == "Nhập nguyên liệu" and vk["kg"] == 50 and vk["note"].startswith("Thiếu 50 kg")
    assert "= 50 kg thiếu" in vk["formula"]["text"]
    login(c, "kho")
    c.patch(f"/api/material-receipts/{m['id']}", json={"kg": 10020})  # sửa thành thừa 20 kg → kho ảo cập nhật theo
    vk = next(e for e in c.get("/api/vloss").json() if e["refId"] == m["id"])
    assert vk["kg"] == -20 and "= 20 kg thừa" in vk["formula"]["text"]
