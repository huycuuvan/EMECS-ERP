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


def _produce(c, lid, kg):
    """Xưởng nhận lệnh + báo sản lượng hôm nay (phải báo xong mới chuẩn bị giao hàng được), rồi về Quản lý."""
    login(c, "sx")
    c.post(f"/api/lsx/{lid}/accept")
    assert c.post(f"/api/lsx/{lid}/daily", json={"kg": kg}).status_code == 200
    login(c, "ql")


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
    lid = _new_lsx(c)
    _produce(c, lid, 1000)
    login(c, "kho")
    r = c.post("/api/receipts", json={"lsxId": lid, "kg": 1000})  # không cần số lượng SP
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
    g = c.post("/api/tasks", json={"type": "giao_khach", "driver": "Lê Đức Vận", "contractId": "HD-2609-01",
                                   "arriveAt": "2099-01-02T08:00:00+07:00",
                                   "deliverName": "Cty CP Kết cấu thép FECON", "deliverAddress": "Công trường KCN Yên Phong",
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
    _produce(c, x["id"], 12000)
    ids = [i["id"] for i in c.get(f"/api/orders/{o['id']}").json()["items"]]
    login(c, "kho")
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": ids[0], "qty": 4}, {"itemId": ids[1], "qty": 30}]}).json()
    assert r["kg"] == 4 * 250 + 30 * 10 and r["qty"] == 34
    assert [(i["name"], i["qty"], i["kg"]) for i in r["items"]] == [("Cột", 4, 1000), ("Bản mã", 30, 300)]
    assert c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": 999999, "qty": 1}]}).status_code == 400
    assert c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": ids[0], "qty": 0}]}).status_code == 400


def test_prepare_goods_to_warehouse_weigh_5pct_and_billing(c):
    o = c.post("/api/orders", json={"customer": "Cty Test Cân", "items": [
        {"name": "Cột", "qty": 40, "unit": "Bộ", "kgPerUnit": 250, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 10000}).json()
    _produce(c, x["id"], 10000)
    item = c.get(f"/api/orders/{o['id']}").json()["items"][0]["id"]
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": item, "qty": 8}]}).json()  # QL giao 2.000 kg
    pcs = [p for p in c.get("/api/weighings").json() if p["receiptId"] == r["id"]]
    assert len(pcs) == 1 and pcs[0]["status"] == "Chờ cân" and pcs[0]["kgExpected"] == 2000  # kho thấy phiếu chờ cân
    pid = pcs[0]["id"]
    login(c, "kho")
    assert c.post(f"/api/weighings/{pid}/fill", json={"grossKg": 9000, "tareKg": 9500}).status_code == 400
    body = {"grossKg": 9200, "tareKg": 7000, "weighInAt": "2099-01-01T08:00:00+07:00",
            "weighOutAt": "2099-01-01T08:40:00+07:00", "vehiclePlate": "29c-12345"}  # hàng 2.200 kg = +10%
    assert c.post(f"/api/weighings/{pid}/fill", json=body).status_code == 400  # thiếu lý do
    p = c.post(f"/api/weighings/{pid}/fill", json={**body, "reason": "Bổ sung bản mã"}).json()
    assert p["kgActual"] == 2200 and p["status"] == "Chờ QL duyệt" and not p["approved"] and p["vehiclePlate"] == "29C-12345"
    assert p["mismatchId"] is None and p["reason"] == "Bổ sung bản mã"  # không tạo biên bản sai lệch
    assert c.post(f"/api/weighings/{pid}/approve").status_code == 403  # kho không tự duyệt
    login(c, "ql")
    assert all(d["id"] != pid for d in c.get("/api/vloss/pending-deltas").json())  # không đưa vào kho ảo
    g = c.get(f"/api/contracts/{hd['id']}").json()
    assert g["billedKg"] == 0 and g["billPendingKg"] == 2200 and g["deliveredValue"] == 0  # chưa duyệt → chưa tính nợ
    p = c.post(f"/api/weighings/{pid}/reject", json={"reason": "Cân lại, số xe sai"}).json()
    assert p["status"] == "QL từ chối" and p["rejectReason"] == "Cân lại, số xe sai"
    login(c, "kho")
    p = c.post(f"/api/weighings/{pid}/fill", json={**body, "reason": "Bổ sung bản mã (cân lại)"}).json()
    assert p["status"] == "Chờ QL duyệt" and p["rejectReason"] is None
    login(c, "ql")
    c.post(f"/api/weighings/{pid}/approve")
    g = c.get(f"/api/contracts/{hd['id']}").json()
    pre = round(2200 * g["contract"]["unitPrice"])  # 1 mặt hàng → giá mặt hàng = giá bình quân
    assert g["billedKg"] == 2200 and g["deliveredValuePre"] == pre and g["deliveredValue"] == pre + round(pre * g["contract"]["vatPct"] / 100)


def test_prepare_goods_assigns_driver_task(c):
    o = c.post("/api/orders", json={"customer": "Cty Test Tài xế", "items": [
        {"name": "Cột", "qty": 10, "unit": "Bộ", "kgPerUnit": 100, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 1000}).json()
    _produce(c, x["id"], 1000)
    item = c.get(f"/api/orders/{o['id']}").json()["items"][0]["id"]
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": item, "qty": 5}], "driver": "Lê Đức Vận",
                                      "vehiclePlate": "29c-999.99", "arriveAt": "2099-01-01T08:00:00+07:00"}).json()
    w = next(p for p in c.get("/api/weighings").json() if p["receiptId"] == r["id"])
    assert w["signers"]["laiXe"] == "Lê Đức Vận" and w["vehiclePlate"] == "29C-999.99"
    t = next(t for t in c.get("/api/tasks").json() if t["refId"] == w["id"])
    assert t["driver"] == "Lê Đức Vận" and t["type"] == "di_ma" and t["status"] == "Chờ xác nhận" and t["kgRequired"] == 500
    login(c, "kho")
    c.post(f"/api/weighings/{w['id']}/fill", json={"grossKg": 8490, "tareKg": 8000})  # 490 kg (thiếu 2%)
    login(c, "ql")
    assert c.get(f"/api/tasks/{t['id']}").json()["kgRequired"] == 490  # cập nhật theo cân thực


def test_prepare_goods_deviation_not_tracked_as_stock(c):
    o = c.post("/api/orders", json={"customer": "Cty Test Tồn", "items": [
        {"name": "Cột", "qty": 70, "unit": "Bộ", "kgPerUnit": 100, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 7000}).json()
    _produce(c, x["id"], 7000)
    item = c.get(f"/api/orders/{o['id']}").json()["items"][0]["id"]
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": item, "qty": 70}]}).json()  # giao 7.000
    w = next(p for p in c.get("/api/weighings").json() if p["receiptId"] == r["id"])
    c.post(f"/api/weighings/{w['id']}/fill", json={"grossKg": 15500, "tareKg": 8000, "reason": "Dư bản mã"})  # cân 7.500
    g = c.get(f"/api/contracts/{hd['id']}").json()
    assert g["stockKg"] == 0 and g["receivedKg"] == 7000  # kho nhận = số QL giao; lệch 500 kg không thành tồn kho
    assert next(x for x in c.get("/api/receipts").json() if x["id"] == r["id"])["kgStock"] == 7500


def test_kho_ao_records_all_deviations_including_prep(c):
    o = c.post("/api/orders", json={"customer": "Cty Test Kho ảo", "items": [
        {"name": "Cột", "qty": 100, "unit": "Bộ", "kgPerUnit": 100, "price": 20000}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 10000}).json()
    _produce(c, x["id"], 10000)
    item = c.get(f"/api/orders/{o['id']}").json()["items"][0]["id"]
    r1 = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": item, "qty": 70}]}).json()  # 7.000
    r2 = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": item, "qty": 20}]}).json()  # 2.000
    ws = {p["receiptId"]: p["id"] for p in c.get("/api/weighings").json() if p["receiptId"]}
    c.post(f"/api/weighings/{ws[r1['id']]}/fill", json={"grossKg": 15500, "tareKg": 8000, "reason": "Dư bản mã"})  # 7.500 → duyệt
    c.post(f"/api/weighings/{ws[r1['id']]}/approve")
    c.post(f"/api/weighings/{ws[r2['id']]}/fill", json={"grossKg": 9950, "tareKg": 8000})  # 1.950 (thiếu 2,5%) → tự đạt
    vk = {e["refId"]: e for e in c.get("/api/vloss").json()}
    a = vk[ws[r1["id"]]]
    assert ws[r2["id"]] not in vk  # trong dung sai → không thống kê vào kho ảo
    assert a["source"] == "Cân xuất (chuẩn bị hàng)" and a["kg"] == -500 and a["reason"] == "Dư bản mã"
    assert "= 500 kg dư" in a["formula"]["text"]
    assert c.get(f"/api/contracts/{hd['id']}").json()["stockKg"] == 0  # vẫn không thành tồn kho


def test_galvanizer_stock_per_customer(c):
    """Hàng tại mạ theo từng hợp đồng / khách: không giao HĐ hết hàng, không giao cho khách khác, không lấy quá phần còn lại."""
    base = {"type": "giao_khach", "driver": "Lê Đức Vận", "arriveAt": "2099-01-02T08:00:00+07:00", "deliverAddress": "CT"}
    r = c.post("/api/tasks", json={**base, "contractId": "HD-2609-06"})  # Sông Đà 9 không còn hàng tại mạ
    assert r.status_code == 400 and "không còn hàng tại xưởng mạ" in r.json()["detail"]
    other = next(x["id"] for x in c.get("/api/customers").json() if x["name"] != "Cty CP Kết cấu thép FECON")
    r = c.post("/api/tasks", json={**base, "contractId": "HD-2609-01", "deliverCustomerId": other})
    assert r.status_code == 400 and "không giao cho khách khác" in r.json()["detail"]
    left = c.get("/api/contracts/HD-2609-01").json()["atGalvKg"]
    t = c.post("/api/tasks", json={**base, "contractId": "HD-2609-01"}).json()
    assert t["deliver"]["customerId"]  # tự gán khách của hợp đồng
    login(c, "lx1" if t["driver"] != "Lê Đức Vận" else "lx2")
    c.post(f"/api/tasks/{t['id']}/accept"); c.post(f"/api/tasks/{t['id']}/depart")
    photo = "data:image/png;base64,iVBORw0KGgo="
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgPicked": left + 1000, "kgDelivered": left + 1000, "photo": photo})
    assert r.status_code == 400 and "không lấy hàng của khách khác" in r.json()["detail"]
    r = c.post(f"/api/tasks/{t['id']}/fill-delivery", json={"kgPicked": left, "kgDelivered": left, "photo": photo})
    assert r.status_code == 200 and r.json()["status"] == "Hoàn thành"  # không còn đối chiếu với kg yêu cầu = 0
    login(c, "ql")
    assert c.get("/api/contracts/HD-2609-01").json()["atGalvKg"] == 0


def test_missed_yesterday_flag(c):
    """Hôm qua xưởng không nhập sản lượng → cờ missedYesterday + danh sách trên dashboard; nhập bù (kể cả 0) thì hết."""
    from datetime import timedelta
    from app.db import SessionLocal, utcnow
    from app.models import Lsx
    lid = next(x["id"] for x in c.get("/api/lsx").json() if x["status"] == "Đang SX")
    with SessionLocal() as db:  # lệnh nhận từ 3 ngày trước
        x = db.get(Lsx, lid)
        x.accepted_at = utcnow() - timedelta(days=3)
        x.daily.clear()
        db.commit()
    x = c.get(f"/api/lsx/{lid}").json()
    assert x["missedYesterday"] and len(x["missedDays"]) >= 2 and x["yesterday"] is None
    assert lid in [d["id"] for d in c.get("/api/dashboard").json()["lsxMissedYesterday"]]
    login(c, "sx")
    yday = x["missedDays"][0]
    assert c.post(f"/api/lsx/{lid}/daily", json={"day": yday, "kg": 0}).status_code == 200
    x = c.get(f"/api/lsx/{lid}").json()
    assert not x["missedYesterday"] and x["yesterday"]["kg"] == 0 and yday not in x["missedDays"]


def test_receipt_cannot_exceed_reported_output(c):
    """Không chuẩn bị giao hàng xưởng chưa báo làm xong của lệnh."""
    x = next(l for l in c.get("/api/lsx").json() if l["status"] == "Đang SX")
    left = x["kgDone"] - sum(r["kg"] for r in c.get("/api/receipts").json() if r["lsxId"] == x["id"])
    login(c, "kho")
    r = c.post("/api/receipts", json={"lsxId": x["id"], "kg": left + 1000})
    assert r.status_code == 400 and "chỉ còn chuẩn bị được" in r.json()["detail"]
    if left > 1:
        assert c.post("/api/receipts", json={"lsxId": x["id"], "kg": left}).status_code == 200


def test_lsx_cannot_exceed_contract_kg(c):
    o = c.post("/api/orders", json={"customer": "Cty LSX vượt", "items": [{"name": "Cột", "qty": 10, "unit": "Bộ", "kg": 1000, "price": 1}]}).json()
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()
    assert c.post("/api/lsx", json={"contractId": hd["id"], "kg": 800}).status_code == 200
    r = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 300})
    assert r.status_code == 400 and "còn 200 kg chưa phát lệnh" in r.json()["detail"]


def test_billing_per_item_price_vat_and_delivery_threshold(c):
    """Công nợ theo đơn giá TỪNG MẶT HÀNG của phiếu chuẩn bị hàng + VAT; giao ≥95% là giao đủ; cân thiếu không chuẩn bị bù."""
    o = c.post("/api/orders", json={"customer": "Cty Công nợ", "vatPct": 10, "items": [
        {"name": "Cột", "qty": 20, "unit": "Bộ", "kgPerUnit": 250, "price": 24000},
        {"name": "Xà", "qty": 50, "unit": "Bộ", "kgPerUnit": 40, "price": 26000}]}).json()
    assert o["code"] == ""  # không còn mã mặc định "MOI"
    hd = c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01", "deliverBy": "2099-02-01"}).json()
    x = c.post("/api/lsx", json={"contractId": hd["id"], "kg": 7000}).json()
    assert x["name"].endswith(hd["number"])
    _produce(c, x["id"], 7000)
    ids = {i["name"]: i["id"] for i in c.get(f"/api/orders/{o['id']}").json()["items"]}
    r = c.post("/api/receipts", json={"lsxId": x["id"], "items": [{"itemId": ids["Xà"], "qty": 50}]}).json()  # 2.000 kg xà
    w = next(p for p in c.get("/api/weighings").json() if p["receiptId"] == r["id"])
    c.post(f"/api/weighings/{w['id']}/fill", json={"kgActual": 1950})  # thiếu 2.5% → đạt
    g = c.get(f"/api/contracts/{hd['id']}").json()
    assert g["billedValues"][w["id"]] == 1950 * 26000  # giá xà 26.000, không phải bình quân 24.571
    assert g["deliveredValuePre"] == 50_700_000 and g["deliveredVat"] == 5_070_000 and g["deliveredValue"] == 55_770_000
    assert g["contract"]["valueAfterVat"] == 189_200_000
    # cân thiếu 50 kg không thành "còn chuẩn bị được": đã chuẩn bị 2.000 theo số giao → còn 5.000
    assert c.post("/api/receipts", json={"lsxId": x["id"], "kg": 5050}).status_code == 400
    assert c.post("/api/receipts", json={"lsxId": x["id"], "kg": 5000}).status_code == 200
