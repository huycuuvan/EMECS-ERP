"""Góp ý anh Thắng 03/11: phiếu giao nhận — KG lấy từ mạ không bắt buộc; hàng sau khi mạ nặng thêm ~3% so với hàng đen
gửi vào mạ (lấy ra quy về hàng đen để trừ tồn tại mạ, giới hạn lấy = hàng đen còn tại mạ + 3%)."""
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


def test_meta_galv_gain(c):
    login(c, "ql")
    assert c.get("/api/meta").json()["galvGainPct"] == 3


def test_kg_picked_optional_defaults_to_delivered(c):
    login(c, "ql")
    left = c.get(f"/api/contracts/{CID}").json()["atGalvKg"]
    t = _giao(c)
    assert t["kgRequired"] == 0  # Quản lý không nhập KG lấy chuyến này
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgDelivered": 1030}).json()
    assert r["kgPicked"] == 1030 and r["kgDelivered"] == 1030 and r["status"] == "Hoàn thành"
    login(c, "ql")
    after = c.get(f"/api/contracts/{CID}").json()["atGalvKg"]
    assert abs((left - after) - 1000) < 0.01  # 1.030 kg hàng mạ = 1.000 kg hàng đen


def test_pick_all_galvanized_weight_allowed(c):
    login(c, "ql")
    left = c.get(f"/api/contracts/{CID}").json()["atGalvKg"]
    t = _giao(c)
    full = round(left * 1.03)
    assert c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgPicked": full + 200, "kgDelivered": full + 200}).status_code == 400
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgPicked": full, "kgDelivered": full})
    assert r.status_code == 200, r.text
    login(c, "ql")
    g = c.get(f"/api/contracts/{CID}").json()
    assert abs(g["atGalvKg"]) < 1  # lấy hết: hàng đen +3% → tồn tại mạ về 0
    ck = next(k for k in g["checks"] if k["label"].startswith("GỬI MẠ"))
    assert ck["ok"]
