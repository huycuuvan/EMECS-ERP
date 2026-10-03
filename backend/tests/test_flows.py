import os
import tempfile

# Mặc định chạy trên SQLite tạm; đặt TEST_DATABASE_URL để chạy trên PostgreSQL (DB riêng, KHÔNG dùng DB dev):
#   TEST_DATABASE_URL=postgresql+psycopg://steel:steel_dev_pw@localhost:5432/steel_one_test pytest -q tests
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{tempfile.mkdtemp()}/test.db")
os.environ["PBKDF2_ITER"] = "1000"

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
        login(client)  # reset tạo lại tài khoản → đăng nhập lại
        yield client


def test_seed_dashboard_matches_demo(c):
    d = c.get("/api/dashboard").json()
    assert d["activeContracts"] == 4
    assert d["deliveredKgTotal"] == 103880
    assert len(d["contractAlerts"]) == 5
    sd06 = next(a for a in d["contractAlerts"] if a["contract"]["id"] == "HD-2609-06")
    assert sd06["complete"]["state"] == "soon"  # còn ≤ 7 ngày tới ngày hoàn thành mà chưa giao đủ
    assert [x["id"] for x in d["overdueDocs"]] == ["VC-0006"]
    assert d["pendingMismatchKg"] == 160


def test_order_to_contract(c):
    o = c.post("/api/orders", json={"customer": "Cty Test", "items": [
        {"name": "Dầm I-300", "qty": 10, "unit": "cấu kiện", "kg": 5000, "price": 50000}]}).json()
    assert o["status"] == "Chốt đơn" and o["value"] == 250_000_000
    assert c.post(f"/api/orders/{o['id']}/send-to-kt", json={}).status_code == 400  # thiếu ngày hoàn thành
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-12-31T00:00:00+07:00"}).json()
    assert hd["status"] == "Chờ soạn thảo" and hd["advance"]["required"] == 75_000_000
    assert hd["number"] == o["id"] and hd["completeBy"].startswith("2099-12-31")
    assert c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-12-31"}).status_code == 400
    hd = c.post(f"/api/contracts/{hd['id']}/payments", json={"amount": 75_000_000, "type": "Tạm ứng 30%"}).json()
    assert hd["advance"]["received"] == 0 and hd["payments"][0]["status"] == "Chờ duyệt"  # chờ Quản lý duyệt
    hd = c.post(f"/api/payments/{hd['payments'][0]['id']}/approve").json()
    assert hd["advance"]["received"] == 75_000_000


def test_weighing_over_tolerance_creates_mismatch_and_sign_clears(c):
    p = c.post("/api/weighings", json={"sourceId": "LSX-SD06", "kgExpected": 5000}).json()
    p = c.post(f"/api/weighings/{p['id']}/fill", json={"kgActual": 4950, "reason": "Sai số thiết bị cân"}).json()
    assert p["status"] == "Lệch — chờ ký" and p["mismatchId"]
    m = c.post(f"/api/mismatches/{p['mismatchId']}/sign").json()
    assert m["status"] == "Đã ký xác nhận"
    assert c.get(f"/api/weighings/{p['id']}").json()["status"] == "Đã cân"


def test_weighing_within_tolerance_no_mismatch(c):
    p = c.post("/api/weighings", json={"sourceId": "LSX-SD06", "kgExpected": 5000}).json()
    p = c.post(f"/api/weighings/{p['id']}/fill", json={"kgActual": 4980}).json()
    assert p["status"] == "Đã cân" and p["mismatchId"] is None


def test_task_galv_flow(c):
    t = c.post("/api/tasks", json={"type": "di_ma", "driver": "Lê Đức Vận", "contractId": "HD-2609-06",
                                   "refId": "PC-0201", "kgRequired": 10000}).json()
    assert c.post(f"/api/tasks/{t['id']}/depart").status_code == 400  # chưa nhận
    c.post(f"/api/tasks/{t['id']}/accept")
    t = c.post(f"/api/tasks/{t['id']}/depart").json()
    assert t["status"] == "Đang chạy" and t["fillDeadline"]
    t = c.post(f"/api/tasks/{t['id']}/fill-galv", json={"kg": 9950, "reason": "Sai số thiết bị cân"}).json()
    assert t["status"] == "Hoàn thành" and t["mismatchId"]


def test_delivery_mismatch_and_accept_loss(c):
    t = c.post("/api/tasks/VC-0105/accept")  # đã nhận sẵn → 400 vì không ở Chờ xác nhận
    assert t.status_code == 400
    c.post("/api/tasks/VC-0105/depart")
    t = c.post("/api/tasks/VC-0105/fill-delivery", json={"kgPicked": 10000, "kgDelivered": 9960}).json()
    assert t["mismatchId"]
    e = c.post("/api/vloss/accept-loss", json={"refType": "vc", "refId": "VC-0105"}).json()
    assert e["kg"] == 40 and e["status"] == "Đang treo"
    assert c.get(f"/api/mismatches/{t['mismatchId']}").json()["status"] == "Đã ký xác nhận"
    assert all(x["id"] != "VC-0105" for x in c.get("/api/vloss/pending-deltas").json())
    e = c.post(f"/api/vloss/{e['id']}/resolve", json={"resolution": "Chấp nhận chi phí"}).json()
    assert e["status"] == "Đã xử lý"


def test_peb_ledger_balanced(c):
    L = c.get("/api/contracts/HD-2608-15/ledger").json()
    assert L["balanced"] and L["final"]["kho"] == 0 and L["final"]["ma"] == 0 and L["final"]["giao"] == 40000


def test_lsx_reject_requires_reason(c):
    assert c.post("/api/lsx/LSX-HB04A/reject", json={"reason": ""}).status_code == 422
    x = c.post("/api/lsx/LSX-HB04A/accept").json()
    assert x["status"] == "Đang SX"
    x = c.post("/api/lsx/LSX-HB04A/progress", json={"qtyDone": 30, "kgDone": 17000}).json()
    assert x["status"] == "Hoàn thành"


def test_movement_log_accepts_plain_dates(c):
    r = c.get("/api/reports/movement-log", params={"date_from": "2020-01-01", "date_to": "2099-12-31"})
    assert r.status_code == 200 and len(r.json()) > 0
    assert c.get("/api/reports/movement-log", params={"date_from": "2099-01-01"}).json() == []


def test_sign_contract_updates_order_status(c):
    assert c.post("/api/contracts/HD-2609-02/signed").status_code == 400  # chưa gửi khách
    c.put("/api/contracts/HD-2609-02/document", json={})
    c.post("/api/contracts/HD-2609-02/returned")
    assert c.post("/api/contracts/HD-2609-02/signed").json()["status"] == "Đã nhận về"
    assert c.get("/api/orders/DH-2609-02").json()["status"] == "Đã có hợp đồng"


# ---------------------------------------------------------------- đăng nhập & phân quyền
def test_requires_login():
    with TestClient(app) as anon:
        assert anon.get("/api/orders").status_code == 401
        assert anon.post("/api/auth/login", json={"phone": "0900000001", "password": "sai"}).status_code == 401


def test_role_permissions(c):
    login(c, "kt")
    assert c.get("/api/contracts").status_code == 200
    assert c.post("/api/contracts/HD-2609-02/returned").status_code == 400  # chưa soạn thảo
    assert c.put("/api/contracts/HD-2609-02/document", json={"warranty": "18 tháng"}).status_code == 200
    assert c.post("/api/contracts/HD-2609-02/returned").status_code == 200  # kế toán: full hợp đồng
    assert c.post("/api/payments/1/approve").status_code == 403  # chỉ Quản lý duyệt tiền về
    assert c.post("/api/mismatches/SL-0002/sign").status_code == 403  # chỉ Quản lý ký
    assert c.get("/api/weighings").status_code == 200  # đọc: mọi người đăng nhập
    assert c.post("/api/weighings", json={"sourceId": "LSX-SD06", "kgExpected": 1}).status_code == 403  # kế toán không ghi trạm cân
    login(c, "kho")
    assert c.post("/api/lsx/LSX-HB04A/accept").status_code == 403  # kho không nhận lệnh SX
    p = c.post("/api/weighings", json={"sourceId": "LSX-SD06", "kgExpected": 1000}).json()
    assert p["by"] == "Ngô Minh Kho"  # ghi đúng người thao tác
    login(c, "sx")
    x = c.post("/api/lsx/LSX-HB04A/accept").json()
    assert x["acceptedBy"] == "Lê Văn Xưởng"


def test_driver_sees_and_acts_on_own_tasks_only(c):
    login(c, "lx1")  # Phạm Văn Tài
    tasks = c.get("/api/tasks").json()
    assert tasks and all(t["driver"] == "Phạm Văn Tài" for t in tasks)
    assert c.post("/api/tasks/VC-0007/accept").status_code == 403  # thẻ của Lê Đức Vận
    login(c, "lx2")
    assert c.post("/api/tasks/VC-0007/accept").status_code == 200


def test_user_management_and_audit(c):
    u = c.post("/api/users", json={"name": "Nguyễn Văn Kiêm", "phone": "0911 222 333", "dept": "Kho",
                                   "roles": ["kho", "lx"], "password": "abc123"}).json()
    assert u["roles"] == ["kho", "lx"] and u["mustChangePassword"]
    assert u["permissions"]["van-chuyen"] == "full" and u["permissions"]["phieu-can"] == "full"
    r = c.post("/api/auth/login", json={"phone": "0911222333", "password": "abc123"})
    assert r.status_code == 200
    c.patch(f"/api/users/{u['id']}", json={"active": False})
    assert c.post("/api/auth/login", json={"phone": "0911222333", "password": "abc123"}).status_code == 403
    login(c, "kt")
    assert c.get("/api/users").status_code == 403
    login(c, "ql")
    logs = c.get("/api/audit-logs").json()
    assert any(a["path"] == "/api/users" and a["userName"] == "Quản lý A" for a in logs)


def test_uploaded_photo_requires_signed_link(c):
    from app.files import _qs
    up = c.post("/api/uploads", files={"file": ("phieu.png", b"\x89PNG\r\n\x1a\nfake", "image/png")}).json()
    assert up["url"].startswith("/uploads/") and "sig=" in up["url"]  # xem trước được ngay
    raw = up["url"].split("?")[0]
    with TestClient(app) as anon:
        assert anon.get(raw).status_code == 403  # không có chữ ký
    p = c.put("/api/weighings/PC-0202/photo", json={"photo": up["url"]}).json()
    signed = p["photo"]
    assert "sig=" in signed and c.get(signed).status_code == 200
    with TestClient(app) as anon:
        assert anon.get(signed).status_code == 200  # thẻ <img> xem được bằng link ký
        q = _qs(signed)
        assert anon.get(raw + f"?exp={q['exp']}&sig=sai").status_code == 403
    # gửi lại link đã ký → DB lưu đường dẫn gốc
    p = c.put("/api/weighings/PC-0202/photo", json={"photo": signed}).json()
    from app.db import SessionLocal
    from app.models import Weighing
    with SessionLocal() as db:
        assert db.get(Weighing, "PC-0202").photo == raw
