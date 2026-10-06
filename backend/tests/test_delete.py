"""Xóa các module: chỉ Quản lý, bắt buộc lý do, chặn khi còn chứng từ phía sau (xóa từ cuối chuỗi ngược lên)."""
from test_master import c, login  # noqa: F401

R = {"reason": "Nhập nhầm khi test"}


def _chain(c):
    """Đơn → HĐ → LSX (xưởng báo 1.000) → chuẩn bị hàng (phiếu cân + thẻ đi mạ) → tiền về."""
    o = c.post("/api/orders", json={"customer": "Cty Xóa", "items": [
        {"name": "Cột", "qty": 10, "unit": "Bộ", "kgPerUnit": 100, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 1000}).json()
    login(c, "sx")
    c.post(f"/api/lsx/{x['id']}/accept")
    c.post(f"/api/lsx/{x['id']}/daily", json={"kg": 1000})
    login(c, "ql")
    item = c.get(f"/api/orders/{o['id']}").json()["items"][0]["id"]
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": item, "qty": 5}], "driver": "Lê Đức Vận",
                                      "arriveAt": "2099-01-01T08:00:00+07:00"}).json()
    w = next(p for p in c.get("/api/weighings").json() if p["receiptId"] == r["id"])
    t = next(t for t in c.get("/api/tasks").json() if t["refId"] == w["id"])
    return o, hd, x, r, w, t


def test_delete_chain_backwards(c):
    o, hd, x, r, w, t = _chain(c)
    login(c, "kt")
    assert c.request("DELETE", f"/api/orders/{o['id']}", json=R).status_code == 403  # chỉ Quản lý
    login(c, "ql")
    assert c.request("DELETE", f"/api/orders/{o['id']}", json={"reason": ""}).status_code == 422  # bắt lý do
    # còn chứng từ phía sau → chặn, báo cần xóa gì trước
    for url, need in [(f"/api/orders/{o['id']}", "lệnh SX"), (f"/api/contracts/{hd['id']}", "lệnh SX"),
                      (f"/api/lsx/{x['id']}", "phiếu chuẩn bị hàng"), (f"/api/receipts/{r['id']}", "thẻ lái xe"),
                      (f"/api/weighings/{w['id']}", "phiếu chuẩn bị hàng")]:
        res = c.request("DELETE", url, json=R)
        assert res.status_code == 400 and need in res.json()["detail"], (url, res.json())
    # xóa từ cuối chuỗi ngược lên
    assert c.request("DELETE", f"/api/tasks/{t['id']}", json=R).status_code == 200
    assert c.request("DELETE", f"/api/receipts/{r['id']}", json=R).status_code == 200
    assert all(p["id"] != w["id"] for p in c.get("/api/weighings").json())  # phiếu cân đi kèm bị xóa theo
    assert c.request("DELETE", f"/api/lsx/{x['id']}", json=R).status_code == 200
    login(c, "kt")
    c.post(f"/api/contracts/{hd['id']}/payments", json={"amount": 1_000_000, "type": "Tạm ứng", "note": ""})
    login(c, "ql")
    pv = c.get(f"/api/delete-preview/hd/{hd['id']}").json()
    assert pv["block"] is None and any("khoản tiền về" in x for x in pv["cascade"])  # tiền về xóa kèm, không bắt xóa trước
    assert c.request("DELETE", f"/api/contracts/{hd['id']}", json=R).status_code == 200
    od = c.get(f"/api/orders/{o['id']}").json()
    assert od["contractId"] is None and od["status"] == "Chốt đơn"  # đơn quay về, chuyển kế toán lại được
    assert c.request("DELETE", f"/api/orders/{o['id']}", json=R).status_code == 200
    assert c.get(f"/api/orders/{o['id']}").status_code == 404
    assert any(n["title"] == f"Đã xóa đơn hàng {o['id']}" for n in c.get("/api/notifications").json())


def test_delete_galv_task_blocked_by_delivery(c):
    giao = next(t for t in c.get("/api/tasks").json() if t["type"] == "giao_khach" and t["refId"])
    res = c.request("DELETE", f"/api/tasks/{giao['refId']}", json=R)
    assert res.status_code == 400 and "thẻ giao khách" in res.json()["detail"]


def test_delete_order_takes_contract_and_payments(c):
    """Xóa đơn (chưa có hàng đi) → xóa kèm hợp đồng + tiền về, không phải xóa từng cái."""
    o = c.post("/api/orders", json={"customer": "Cty Xóa Đơn", "items": [
        {"name": "Cột", "qty": 1, "unit": "Bộ", "kg": 100, "price": 1000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    login(c, "kt")
    c.post(f"/api/contracts/{hd['id']}/payments", json={"amount": 50_000, "type": "Tạm ứng", "note": ""})
    login(c, "ql")
    pv = c.get(f"/api/delete-preview/dh/{o['id']}").json()
    assert pv["block"] is None and pv["cascade"][0] == f"hợp đồng {hd['id']}"
    assert c.request("DELETE", f"/api/orders/{o['id']}", json=R).status_code == 200
    assert c.get(f"/api/contracts/{hd['id']}").status_code == 404 and c.get(f"/api/orders/{o['id']}").status_code == 404
    pv = c.get("/api/delete-preview/dh/DH-2609-01").json()  # đơn có hàng đi thật → báo trước lý do chặn
    assert pv["block"] and "lệnh SX" in pv["block"]
