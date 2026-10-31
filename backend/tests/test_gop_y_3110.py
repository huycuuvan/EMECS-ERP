"""Góp ý anh Thắng 31/10: tên đơn hàng nhập tay · xưởng xin gia hạn lệnh SX · kho ảo ghi cả chênh trong dung sai ·
nhật ký phiếu có trạng thái từng chặng (chưa chốt thì không cộng vào tổng tầng)."""
from test_lsx_daily import _new_lsx
from test_master import c, login  # noqa: F401


def test_order_name(c):
    o = c.post("/api/orders", json={"customer": "Cty Tên Đơn", "name": "Cột điện 110kV — Bắc Ninh", "items": [
        {"name": "Cột", "qty": 2, "unit": "Bộ", "kgPerUnit": 500, "price": 20000}]}).json()
    assert o["name"] == "Cột điện 110kV — Bắc Ninh"
    o = c.patch(f"/api/orders/{o['id']}", json={"name": "  Cột 110kV  ", "reason": "đổi tên"}).json()
    assert o["name"] == "Cột 110kV"
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    assert c.get(f"/api/contracts/{hd['id']}").json()["contract"]["orderName"] == "Cột 110kV"
    assert next(x for x in c.get("/api/contracts").json() if x["id"] == hd["id"])["orderName"] == "Cột 110kV"
    login(c, "kho")  # vai trò chỉ thấy hợp đồng rút gọn vẫn thấy tên đơn
    assert next(x for x in c.get("/api/contracts").json() if x["id"] == hd["id"])["orderName"] == "Cột 110kV"


def test_lsx_extension_request_by_workshop(c):
    lid = _new_lsx(c)  # đang đăng nhập xưởng, lệnh đã nhận
    x = c.post(f"/api/lsx/{lid}/extend-request", json={"days": 3, "reason": "Chờ thép tấm 12ly"}).json()
    assert x["extRequest"]["days"] == 3 and x["extRequest"]["reason"] == "Chờ thép tấm 12ly" and x["extension"] is None
    assert c.post(f"/api/lsx/{lid}/extend-request", json={"days": 1, "reason": "x"}).status_code == 400  # đang chờ duyệt
    assert c.post(f"/api/lsx/{lid}/extend", json={"days": 3, "reason": "ok"}).status_code == 403  # xưởng không tự duyệt
    login(c, "ql")
    assert [e["id"] for e in c.get("/api/dashboard").json()["lsxExtRequests"]] == [lid]
    x = c.post(f"/api/lsx/{lid}/extend-reject", json={"reason": "Đã có thép, làm tiếp"}).json()
    assert x["extRequest"] is None and x["extension"] is None and "KHÔNG duyệt" in x["log"][-1]["text"]
    login(c, "sx")
    c.post(f"/api/lsx/{lid}/extend-request", json={"days": 4, "reason": "Máy chấn hỏng"})
    login(c, "ql")
    dl = c.get(f"/api/lsx/{lid}").json()["deadline"]
    x = c.post(f"/api/lsx/{lid}/extend", json={"days": 2, "reason": "Duyệt 2 ngày"}).json()  # QL sửa số ngày khi duyệt
    assert x["extRequest"] is None and x["extension"]["to"] > dl and not c.get("/api/dashboard").json()["lsxExtRequests"]
    login(c, "sx")
    assert any("Quản lý duyệt gia hạn" in n["title"] for n in c.get("/api/notifications").json())


def _galv_task(c, kg_required=10000):
    t = c.post("/api/tasks", json={"type": "di_ma", "driver": "Lê Đức Vận", "contractId": "HD-2609-06",
                                   "arriveAt": "2099-01-01T08:00:00+07:00", "kgRequired": kg_required}).json()
    c.post(f"/api/tasks/{t['id']}/accept")
    c.post(f"/api/tasks/{t['id']}/depart")
    return t["id"]


def test_kho_ao_records_in_tolerance_task_and_follows_edits(c):
    tid = _galv_task(c)
    rows = {r["id"]: r for r in c.get("/api/reports/movement-log").json()}
    assert rows[tid]["state"] == "Đang trên xe" and rows[tid]["kg"] is None and rows[tid]["kgPlan"] == 10000
    t = c.post(f"/api/tasks/{tid}/fill-galv", json={"kg": 9980}).json()  # hụt 20 kg — trong dung sai ±30
    assert t["status"] == "Hoàn thành"
    vk = next(e for e in c.get("/api/vloss").json() if e["refId"] == tid)
    assert vk["status"] == "Trong dung sai" and vk["kg"] == 20 and vk["source"] == "Cân tại xưởng mạ"
    assert {r["id"]: r for r in c.get("/api/reports/movement-log").json()}[tid]["state"] == "Đã chốt"
    # sửa số cân mạ → kho ảo theo số mới; sửa về khớp → bỏ dòng
    c.patch(f"/api/tasks/{tid}", json={"kgAtGalv": 9990, "reason": "đọc lại phiếu mạ"})
    assert next(e for e in c.get("/api/vloss").json() if e["refId"] == tid)["kg"] == 10
    c.patch(f"/api/tasks/{tid}", json={"kgAtGalv": 10000, "reason": "đọc lại phiếu mạ"})
    assert all(e["refId"] != tid for e in c.get("/api/vloss").json())


def test_movement_pending_states_not_counted(c):
    tid = _galv_task(c)
    c.post(f"/api/tasks/{tid}/fill-galv", json={"kg": 9900, "reason": "Sai số thiết bị cân"})  # lệch → chờ QL duyệt
    r = {x["id"]: x for x in c.get("/api/reports/movement-log").json()}[tid]
    assert r["state"] == "Chờ QL duyệt" and r["kg"] == 9900
    assert all(e["refId"] != tid for e in c.get("/api/vloss").json())  # chưa duyệt → chưa vào kho ảo
    c.post(f"/api/tasks/{tid}/reject-fill", json={"reason": "Chụp lại phiếu"})
    assert {x["id"]: x for x in c.get("/api/reports/movement-log").json()}[tid]["state"] == "QL từ chối — điền lại"
    c.post(f"/api/tasks/{tid}/fill-galv", json={"kg": 9900, "reason": "Sai số thiết bị cân"})
    c.post(f"/api/tasks/{tid}/approve")
    assert {x["id"]: x for x in c.get("/api/reports/movement-log").json()}[tid]["state"] == "Đã chốt"
    vk = next(e for e in c.get("/api/vloss").json() if e["refId"] == tid)
    assert vk["status"] == "Đã ghi nhận" and vk["kg"] == 100


def test_kho_ao_records_refill_in_tolerance_after_rejection(c):
    """Quản lý từ chối phiếu lệch → lái xe / kho điền lại trong dung sai → vẫn tự ghi kho ảo "Trong dung sai"."""
    tid = _galv_task(c)
    c.post(f"/api/tasks/{tid}/fill-galv", json={"kg": 9900, "reason": "Sai số thiết bị cân"})
    c.post(f"/api/tasks/{tid}/reject-fill", json={"reason": "Cân lại"})
    t = c.post(f"/api/tasks/{tid}/fill-galv", json={"kg": 9980}).json()
    assert t["status"] == "Hoàn thành"
    vk = next(e for e in c.get("/api/vloss").json() if e["refId"] == tid)
    assert vk["status"] == "Trong dung sai" and vk["kg"] == 20
