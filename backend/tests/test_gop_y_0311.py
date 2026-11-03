"""Góp ý anh Thắng 03/11: phiếu giao nhận — KG lấy ra từ mạ BẮT BUỘC, được nhập vượt hàng còn tại mạ (mạ có thể tăng hơn 3%);
hàng sau khi mạ nặng thêm ~3% so với hàng đen gửi vào (lấy ra quy về hàng đen để trừ tồn tại mạ). Mọi chênh lệch → lý do →
Quản lý duyệt → kho ảo."""
from test_master import c, login  # noqa: F401

CID = "HD-2609-01"


def _giao(c, **kw):
    login(c, "ql")
    t = c.post("/api/tasks", json={"type": "giao_khach", "driver": "Lê Đức Vận", "contractId": CID,
                                   "arriveAt": "2099-01-02T08:00:00+07:00", "deliverAddress": "CT", **kw})
    assert t.status_code == 200, t.text
    t = t.json()
    login(c, "lx1" if t["driver"] != "Lê Đức Vận" else "lx2")
    assert c.post(f"/api/tasks/{t['id']}/accept").status_code == 200
    assert c.post(f"/api/tasks/{t['id']}/depart").status_code == 200
    return t


def _left(c):
    login(c, "ql")
    return c.get(f"/api/contracts/{CID}").json()["atGalvKg"]


def test_meta_galv_gain(c):
    login(c, "ql")
    assert c.get("/api/meta").json()["galvGainPct"] == 3


def test_kg_picked_required_and_galv_gain(c):
    left = _left(c)
    t = _giao(c)
    assert t["kgRequired"] == 0  # Quản lý không nhập KG lấy chuyến này
    assert c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgDelivered": 1030}).status_code == 422  # bắt buộc KG lấy ra
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgPicked": 1030, "kgDelivered": 1030}).json()
    assert r["status"] == "Hoàn thành" and abs(r["kgGalvLeft"] - left * 1.03) < 0.1
    assert abs((left - _left(c)) - 1000) < 0.01  # 1.030 kg hàng mạ = 1.000 kg hàng đen


def test_pick_over_stock_goes_to_manager_then_vloss(c):
    left = _left(c)
    t = _giao(c)
    est = left * 1.03
    over = round(est * 1.02)  # mạ thực tế tăng ~5% — lấy ra vượt hàng còn tại mạ
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgPicked": over, "kgDelivered": over})
    assert r.status_code == 400 and "vượt hàng còn tại mạ" in r.json()["detail"]  # bắt chọn lý do
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgPicked": over, "kgDelivered": over, "reason": "Sai số thiết bị cân"})
    assert r.status_code == 200 and r.json()["status"] == "Chờ QL duyệt"
    login(c, "ql")
    g = c.get(f"/api/contracts/{CID}").json()
    assert g["atGalvKg"] == 0 and not next(k for k in g["checks"] if k["label"].startswith("GỬI MẠ"))["ok"]  # chờ duyệt
    assert c.post(f"/api/tasks/{t['id']}/approve").json()["status"] == "Hoàn thành"
    vk = [e for e in c.get("/api/vloss").json() if e["refId"] == t["id"]]
    assert len(vk) == 1 and vk[0]["status"] == "Đã ghi nhận" and abs(vk[0]["kg"] - (round(est, 1) - over)) < 0.01  # âm = thừa
    assert vk[0]["formula"]["a"] == round(est, 1) and vk[0]["formula"]["b"] == over
    g = c.get(f"/api/contracts/{CID}").json()
    assert next(k for k in g["checks"] if k["label"].startswith("GỬI MẠ"))["ok"]  # Quản lý đã duyệt → đối ứng đóng


def test_over_and_customer_short_combined(c):
    left = _left(c)
    t = _giao(c)
    est = round(left * 1.03, 1)
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery",
               json={"kgPicked": est + 200, "kgDelivered": est + 150, "reason": "Rơi rớt khi bốc"}).json()
    assert r["status"] == "Chờ QL duyệt"
    login(c, "ql")
    c.post(f"/api/tasks/{t['id']}/approve")
    vk = next(e for e in c.get("/api/vloss").json() if e["refId"] == t["id"])
    assert abs(vk["kg"] - (-150)) < 0.01  # còn tại mạ (+3%) − khách ký = thừa 150 (gộp: thừa 200 tại mạ, hụt 50 trên xe)
