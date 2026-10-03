"""Dữ liệu demo — port nguyên kịch bản từ bản demo HTML (thời gian tính tương đối theo lúc seed).

- HD-2609-01 (FECON): 100 tấn, SX 68%, 7 phiếu cân (PC-0007 lệch −120 kg → SL-0002 chờ ký),
  VC-0006 quá hạn điền phiếu, VC-0007 chờ tài xế xác nhận, VC-0104 lệch −40 kg (SL-0003 chờ ký).
- HD-2609-02 (Việt Ý) còn 1 ngày hạn trả · HD-2609-03 (Delta) quá hạn 4 ngày.
- HD-2609-04 (Hòa Bình) tạm ứng chưa về, LSX-HB04A chờ nhận, LSX-HB04B bị từ chối.
- HD-2608-15 (PEB) hoàn thành, đối ứng khớp 100%.
- DH-2609-05 (Cầu đường 5) vừa chốt, chưa chuyển kế toán.
Danh mục (_seed_master): khách hàng + thẻ (Khách thân thiết / Khách lẻ…), 3 xe (gán theo tài xế), xưởng mạ Việt Đức,
6 phiếu nguyên liệu mua vào trong 30 ngày.
"""
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from .config import CONTRACT_DAYS, CT_DONE, CT_RECEIVED, CT_SENT, CT_WAIT, DEMO_PASSWORD, PEOPLE
from .db import Base, engine, utcnow
from .security import hash_password
from .models import (Contract, LsxDaily, LsxLog, Lsx, Mismatch, Notification, Order, OrderItem, Payment,
                     Receipt, Sequence, Task, User, VLoss, Weighing)
from .ticket import ticket_img
from .utils import VN_TZ, add_days, add_hours, ago, ahead, fmt_d, fmt_kg

QL, KT, SX, KHO = (PEOPLE[k]["name"] for k in ("ql", "kt", "sx", "kho"))
LX1, LX2 = PEOPLE["lx1"]["name"], PEOPLE["lx2"]["name"]


def _orders():
    rows = [
        ("DH-2609-01", "Cty CP Kết cấu thép FECON", "FE01", ago(21), "don-hang-FE01-ky-chot.pdf",
         ("Dầm thép I-500 tổ hợp (mạ kẽm nhúng nóng)", 100, "cấu kiện", 100000, 48500),
         "Đã có hợp đồng", "HD-2609-01",
         f"Khách ký chốt đơn kèm bản vẽ shopdrawing. Giá chốt theo giá thép thị trường ngày {fmt_d(ago(21))}."),
        ("DH-2609-02", "Nhà máy Thép Việt Ý", "VY02", ago(4), "don-hang-VY02.pdf",
         ("Xà gồ Z200 dập nguội (mạ kẽm)", 40, "bó", 25000, 48000), "Đã chuyển kế toán", "HD-2609-02", ""),
        ("DH-2609-03", "Cty TNHH Cơ điện Delta", "DT03", ago(9), "don-hang-DT03.pdf",
         ("Khung giàn không gian D76 (mạ kẽm)", 60, "cụm", 30000, 49000), "Đã chuyển kế toán", "HD-2609-03",
         "Khách yêu cầu HĐ song ngữ."),
        ("DH-2609-04", "Tổng thầu Hòa Bình", "HB04", ago(6), "don-hang-HB04.pdf",
         ("Cột thép H-400 + bản mã (mạ kẽm)", 55, "cấu kiện", 32000, 50000), "Đã có hợp đồng", "HD-2609-04", ""),
        ("DH-2608-15", "Cty Nhà thép PEB Việt Nam", "PEB15", ago(45), "don-hang-PEB15.pdf",
         ("Vì kèo thép V-250 (mạ kẽm nhúng nóng)", 50, "bộ", 40000, 52000), "Đã có hợp đồng", "HD-2608-15", ""),
        ("DH-2609-05", "Ban QLDA Cầu đường 5", "CD05", ago(0, 3), "don-hang-CD05-ky-chot.pdf",
         ("Lan can cầu thép ống (mạ kẽm)", 120, "md", 18000, 51000), "Chốt đơn", None,
         "Vừa ký chốt sáng nay — Quản lý chưa chuyển kế toán làm hợp đồng."),
        ("DH-2608-11", "Cty CP Kết cấu thép FECON", "FE11", ago(41), "don-hang-FE11.pdf",
         ("Dầm cầu trục I-350 (mạ kẽm nhúng nóng)", 30, "cấu kiện", 24000, 47500), "Đã có hợp đồng", "HD-2608-11",
         "Đơn thứ 2 trong năm của FECON — đối tác lâu năm."),
        ("DH-2609-06", "Cty Xây lắp Sông Đà 9", "SD06", ago(12), "don-hang-SD06-ky-chot.pdf",
         ("Khung thép nhà xưởng K-24m (mạ kẽm)", 45, "cấu kiện", 28000, 49500), "Đã có hợp đồng", "HD-2609-06", ""),
        ("DH-2609-07", "Cầu trục Doosan Vina", "DS07", ago(8), "don-hang-DS07.pdf",
         ("Dầm ray cầu trục H-300 (mạ kẽm)", 60, "dầm", 36000, 50500), "Đã có hợp đồng", "HD-2609-07",
         "Khách mới — yêu cầu tạm ứng 40% trước khi sản xuất."),
    ]
    out = []
    for oid, cust, code, date, file, (name, qty, unit, kg, price), status, cid, note in rows:
        o = Order(id=oid, customer=cust, code=code, date=date, file=file, total_kg=kg, value=kg * price,
                  status=status, contract_id=cid, note=note, vat_pct=8)
        o.items = [OrderItem(name=name, qty=qty, unit=unit, kg_per_unit=kg / qty if qty else None, kg=kg, price=price)]
        out.append(o)
    return out


# trạng thái cũ trong dữ liệu mẫu → 4 bước kế toán
SEED_STATUS = {"Soạn thảo": CT_WAIT, "Đã trả khách": CT_SENT, "Đã ký": CT_RECEIVED, "Đang triển khai": CT_RECEIVED,
               "Hoàn thành": CT_DONE}


def _contract(cid, oid, code, cust, sent_days, returned, signed, status, qty, unit, kg, price,
              adv_pct, adv_received, adv_received_at, payments, note, complete_days=30):
    sent = ago(sent_days)
    value = kg * price
    status = SEED_STATUS.get(status, status)
    c = Contract(id=cid, order_id=oid, code=code, customer=cust, sent_to_kt_at=sent, number=oid,
                 complete_by=add_days(sent, complete_days), completed_at=ago(10) if status == CT_DONE else None,
                 due_at=add_days(sent, CONTRACT_DAYS), returned_at=returned, sign_date=signed, status=status,
                 owner=KT, total_qty=qty, unit=unit, total_kg=kg, unit_price=price, value=value, vat_pct=8,
                 advance_pct=adv_pct, advance_required=round(value * adv_pct / 100),
                 advance_received=adv_received, advance_received_at=adv_received_at, note=note)
    c.payments = [Payment(date=d, amount=a, type=t, note=n, status="Đã duyệt", created_by=KT, approved_by=QL, approved_at=d)
                  for d, a, t, n in payments]
    return c


def _contracts():
    return [
        _contract("HD-2609-01", "DH-2609-01", "FE01", "Cty CP Kết cấu thép FECON", 21, ago(19), ago(20),
                  "Đang triển khai", 100, "cấu kiện", 100000, 48500, 30, 1455000000, ago(18),
                  [(ago(18), 1455000000, "Tạm ứng 30%", "UNC BIDV về TK công ty"),
                   (ago(6), 500000000, "Thanh toán đợt 1", "Theo khối lượng giao đợt 1–2")],
                  "HĐ 100 cấu kiện / 100 tấn. Xe 10 tấn/chuyến → giao nhiều đợt, theo dõi lũy kế hàng–tiền."),
        _contract("HD-2609-02", "DH-2609-02", "VY02", "Nhà máy Thép Việt Ý", 4, None, None, "Soạn thảo",
                  40, "bó", 25000, 48000, 30, 0, None, [], "Giá tính theo giá thép thị trường tại ngày chốt đơn."),
        _contract("HD-2609-03", "DH-2609-03", "DT03", "Cty TNHH Cơ điện Delta", 9, None, None, "Soạn thảo",
                  60, "cụm", 30000, 49000, 20, 0, None, [], "HĐ song ngữ Anh–Việt nên soạn lâu hơn — ĐÃ QUÁ HẠN TRẢ."),
        _contract("HD-2609-04", "DH-2609-04", "HB04", "Tổng thầu Hòa Bình", 6, ago(3), ago(2), "Đã ký",
                  55, "cấu kiện", 32000, 50000, 30, 0, None, [],
                  "Đã ký 2 ngày — TẠM ỨNG 30% CHƯA VỀ, cần đòi trước khi phát lệnh SX chính thức."),
        _contract("HD-2608-15", "DH-2608-15", "PEB15", "Cty Nhà thép PEB Việt Nam", 45, ago(43), ago(42),
                  "Hoàn thành", 50, "bộ", 40000, 52000, 40, 832000000, ago(41),
                  [(ago(41), 832000000, "Tạm ứng 40%", ""),
                   (ago(12), 1248000000, "Thanh toán tất toán", "Đã đối chiếu biên bản giao nhận")],
                  "Hợp đồng mẫu: đối ứng khớp 100% cả 3 điểm cân — dùng làm hồ sơ chuẩn cho khách xem."),
        _contract("HD-2608-11", "DH-2608-11", "FE11", "Cty CP Kết cấu thép FECON", 40, ago(39), ago(38),
                  "Hoàn thành", 30, "cấu kiện", 24000, 47500, 30, 342000000, ago(36),
                  [(ago(36), 342000000, "Tạm ứng 30%", ""),
                   (ago(15), 798000000, "Thanh toán tất toán", "Đối chiếu đủ biên bản giao nhận 2 chuyến")],
                  "Từng chuyến giao có lệch ±40 kg (đã ký biên bản) nhưng LŨY KẾ khớp 100% — ví dụ giao bù chuyến sau."),
        _contract("HD-2609-06", "DH-2609-06", "SD06", "Cty Xây lắp Sông Đà 9", 12, ago(10), ago(9),
                  "Đang triển khai", 45, "cấu kiện", 28000, 49500, 30, 415800000, ago(8),
                  [(ago(8), 415800000, "Tạm ứng 30%", "UNC Vietcombank")],
                  "Mới vào sản xuất — chưa gửi mạ chuyến nào, 1 phiếu cân đang chờ nhập kết quả.", complete_days=16),
        _contract("HD-2609-07", "DH-2609-07", "DS07", "Cầu trục Doosan Vina", 8, ago(6), ago(5), "Đã ký",
                  60, "dầm", 36000, 50500, 40, 400000000, ago(4),
                  [(ago(4), 400000000, "Tạm ứng đợt 1", "Khách xin chia tạm ứng 2 đợt")],
                  "TẠM ỨNG MỚI VỀ MỘT PHẦN (400tr/727tr) — chưa đủ 40% theo hợp đồng, cần đòi nốt trước khi cân xuất."),
    ]


def _lsx(lid, cid, name, assigned, lead, status, accepted, qty_plan, kg_plan, qty_done, kg_done, logs,
         reject=None, ext=None):
    x = Lsx(id=lid, contract_id=cid, name=name, assigned_at=assigned, assigned_by=QL, lead_days=lead,
            deadline=add_days(assigned, lead), status=status, accepted_at=accepted,
            accepted_by=SX if accepted else None, reject_reason=reject, qty_plan=qty_plan, kg_plan=kg_plan,
            qty_done=qty_done, kg_done=kg_done)
    if ext:
        x.ext_to, x.ext_reason, x.ext_approved_by, x.ext_at = ext
    x.logs = [LsxLog(at=a, text=t) for a, t in logs]
    x.daily = _daily(accepted, kg_done, status)
    return x


def _daily(accepted, kg_done, status):
    """Sản lượng theo ngày cho dữ liệu mẫu: chia lũy kế ra tối đa 5 ngày gần nhất (hôm nay để trống → demo cảnh báo 20h)."""
    if not accepted or not kg_done:
        return []
    start = accepted.astimezone(VN_TZ).date()
    end = utcnow().astimezone(VN_TZ).date() - timedelta(days=1)
    if end < start:
        end = start
    days = [end - timedelta(days=i) for i in range(min(5, (end - start).days + 1))][::-1]
    each = round(kg_done / len(days), 0)
    out = []
    for i, d in enumerate(days):
        kg = kg_done - each * (len(days) - 1) if i == len(days) - 1 else each
        at = datetime(d.year, d.month, d.day, 17, 30, tzinfo=VN_TZ)
        out.append(LsxDaily(day=d, kg=kg, note="", created_at=at, created_by=SX))
    return out


def _lsxs():
    return [
        _lsx("LSX-FE01", "HD-2609-01", "Lệnh SX đơn hàng FE01", ago(19), 7, "Đang SX", add_hours(ago(19), 2),
             100, 100000, 68, 68000,
             [(ago(19), "Quản lý A phát lệnh — tiến độ 07 ngày"),
              (add_hours(ago(19), 2), "Xưởng nhận lệnh (Lê Văn Xưởng)"),
              (ago(12), "Đến hạn nhưng mới đạt 45% — xưởng trình lý do"),
              (ago(11), f"Quản lý A duyệt gia hạn tiến độ đến {fmt_d(ahead(2))}")],
             ext=(ahead(2), "Chờ thép tấm SS400 bổ sung từ NCC (về chậm 4 ngày)", QL, ago(11))),
        _lsx("LSX-PEB15", "HD-2608-15", "Lệnh SX đơn hàng PEB15", ago(41), 10, "Hoàn thành", add_hours(ago(41), 1),
             50, 40000, 50, 40000,
             [(ago(41), "Quản lý A phát lệnh — tiến độ 10 ngày"), (ago(31), "Hoàn thành 50/50 bộ, đủ 40 tấn — đúng hạn")]),
        _lsx("LSX-HB04A", "HD-2609-04", "Lệnh SX HB04 — đợt 1 (cột H-400)", ago(0, 5), 7, "Chờ nhận", None,
             30, 17000, 0, 0, [(ago(0, 5), "Quản lý A phát lệnh — chờ xưởng xác nhận")]),
        _lsx("LSX-HB04B", "HD-2609-04", "Lệnh SX HB04 — đợt 2 (bản mã)", ago(1), 5, "Từ chối", None,
             25, 15000, 0, 0,
             [(ago(1), "Quản lý A phát lệnh — tiến độ 05 ngày"),
              (add_hours(ago(1), 3), "Xưởng TỪ CHỐI: trùng lịch bảo trì máy chấn 400T")],
             reject=f"Trùng lịch bảo trì máy — máy chấn 400T bảo trì đến {fmt_d(ahead(1))}, đề nghị lùi 2 ngày"),
        _lsx("LSX-FE11", "HD-2608-11", "Lệnh SX đơn hàng FE11", ago(37), 7, "Hoàn thành", add_hours(ago(37), 1),
             30, 24000, 30, 24000,
             [(ago(37), "Quản lý A phát lệnh — tiến độ 07 ngày"), (ago(30), "Hoàn thành 30/30 cấu kiện, đủ 24 tấn — đúng hạn")]),
        _lsx("LSX-SD06", "HD-2609-06", "Lệnh SX đơn hàng SD06 — khung K-24m", ago(9), 10, "Đang SX",
             add_hours(ago(9), 2), 45, 28000, 18, 11200,
             [(ago(9), "Quản lý A phát lệnh — tiến độ 10 ngày"),
              (add_hours(ago(9), 2), "Xưởng nhận lệnh (Lê Văn Xưởng)"),
              (ago(2), "Cập nhật tiến độ: 18/45 SP · 11.200 kg")]),
        _lsx("LSX-DS07A", "HD-2609-07", "Lệnh SX DS07 — đợt 1 (dầm ray H-300)", ago(0, 8), 8, "Chờ nhận", None,
             30, 18000, 0, 0,
             [(ago(0, 8), "Quản lý A phát lệnh — chờ xưởng xác nhận (tạm ứng chưa về đủ, cân nhắc tiến độ)")]),
    ]


def _receipts():
    rows = [
        ("PTN-0001", "LSX-FE01", "HD-2609-01", ago(12), 20, 20000, "Đợt 1 — dầm I-500 số 001–020"),
        ("PTN-0002", "LSX-FE01", "HD-2609-01", ago(8), 20, 20000, "Đợt 2 — số 021–040"),
        ("PTN-0003", "LSX-FE01", "HD-2609-01", ago(4), 15, 15000, "Đợt 3 — số 041–055"),
        ("PTN-0004", "LSX-FE01", "HD-2609-01", ago(1), 13, 13000, "Đợt 4 — số 056–068"),
        ("PTN-0005", "LSX-PEB15", "HD-2608-15", ago(31), 50, 40000, "Toàn bộ 50 bộ vì kèo"),
        ("PTN-0101", "LSX-FE11", "HD-2608-11", ago(29), 30, 24000, "Toàn bộ 30 dầm cầu trục I-350"),
        ("PTN-0201", "LSX-SD06", "HD-2609-06", ago(5), 10, 6200, "Đợt 1 — khung K-24m số 01–10"),
        ("PTN-0202", "LSX-SD06", "HD-2609-06", ago(2), 8, 5000, "Đợt 2 — số 11–18"),
    ]
    return [Receipt(id=i, lsx_id=l, contract_id=c, date=d, qty=q, kg=k, by=KHO, note=n) for i, l, c, d, q, k, n in rows]


def _pc(pid, cid, lid, date, exp, act, label, boc, lx, mismatch_id=None, loss=False):
    return Weighing(id=pid, contract_id=cid, lsx_id=lid, date=date, kg_expected=exp, kg_actual=act,
                    photo=ticket_img(label, f"{fmt_kg(act)} · ký 3 bên") if act is not None else None,
                    signer_boc_xep=boc, signer_kho=KHO, signer_lai_xe=lx, by=KHO, mismatch_id=mismatch_id,
                    status="Lệch — chờ ký" if mismatch_id else ("Đã cân" if act is not None else "Chờ cân"),
                    loss_accepted=loss)


def _weighings():
    fe = lambda pid, d, e, a, n, m=None, loss=False: _pc(pid, "HD-2609-01", "LSX-FE01", d, e, a,
                                                         f"{pid} · FE01 chuyến {n}", "Tổ bốc xếp 1", LX1, m, loss)
    return [
        fe("PC-0001", ago(11), 10000, 10000, 1), fe("PC-0002", ago(10), 10000, 10000, 2),
        fe("PC-0003", ago(7), 10000, 9980, 3, loss=True), fe("PC-0004", ago(6), 10000, 10000, 4),
        fe("PC-0005", ago(3), 10000, 10000, 5), fe("PC-0006", ago(1, 4), 10000, 10000, 6),
        fe("PC-0007", ago(0, 1), 8000, 7880, 7, "SL-0002"),
        *[_pc(f"PC-010{i}", "HD-2608-15", "LSX-PEB15", ago(31 - i), 10000, 10000, f"PC-010{i} · PEB15 chuyến {i}",
              "Tổ bốc xếp 2", LX2) for i in range(1, 5)],
        *[_pc(f"PC-030{i}", "HD-2608-11", "LSX-FE11", ago(28 - i), 8000, 8000, f"PC-030{i} · FE11 chuyến {i}",
              "Tổ bốc xếp 1", LX2 if i == 2 else LX1) for i in range(1, 4)],
        _pc("PC-0201", "HD-2609-06", "LSX-SD06", ago(1, 6), 10000, 10000, "PC-0201 · SD06 chuyến 1", "Tổ bốc xếp 2", LX2),
        _pc("PC-0202", "HD-2609-06", "LSX-SD06", ago(0, 3), 1200, None, "", "Tổ bốc xếp 2", ""),
    ]


def _vc(**kw):
    base = dict(reject_reason=None, photo=None, mismatch_id=None, note="", kg_at_galv=None, kg_picked=None,
                kg_delivered=None, filled_at=None, accepted_at=None, departed_at=None, fill_deadline=None)
    base.update(kw)
    return Task(**base)


def _di_ma(tid, cid, ref, driver, day, kg_req, kg_galv, fill_h, photo_sub=None, mismatch_id=None):
    a = ago(day)
    return _vc(id=tid, type="di_ma", driver=driver, contract_id=cid, ref_id=ref, assigned_at=a, status="Hoàn thành",
               accepted_at=a, departed_at=add_hours(a, 1), fill_deadline=add_hours(a, 25), kg_required=kg_req,
               kg_at_galv=kg_galv, filled_at=add_hours(a, fill_h), mismatch_id=mismatch_id,
               photo=ticket_img(f"Phiếu cân xưởng mạ · {tid}", photo_sub or f"{fmt_kg(kg_galv)} — Mạ kẽm Việt Đức"))


def _giao(tid, cid, ref, driver, assigned, departed, kg_req, picked, delivered, filled, photo_sub,
          mismatch_id=None, note=""):
    return _vc(id=tid, type="giao_khach", driver=driver, contract_id=cid, ref_id=ref, assigned_at=assigned,
               status="Hoàn thành", accepted_at=assigned, departed_at=departed, fill_deadline=add_hours(departed, 24),
               kg_required=kg_req, kg_picked=picked, kg_delivered=delivered, filled_at=filled,
               mismatch_id=mismatch_id, note=note, photo=ticket_img(f"Phiếu giao nhận · {tid}", photo_sub))


def _tasks():
    F = "HD-2609-01"
    return [
        _di_ma("VC-0001", F, "PC-0001", LX1, 11, 10000, 10000, 6),
        _di_ma("VC-0002", F, "PC-0002", LX1, 10, 10000, 10000, 5),
        _di_ma("VC-0003", F, "PC-0003", LX2, 7, 9980, 9980, 7),
        _di_ma("VC-0004", F, "PC-0004", LX1, 6, 10000, 9940, 8, "9.940 kg — LỆCH −60 kg", "SL-0001"),
        _di_ma("VC-0005", F, "PC-0005", LX2, 3, 10000, 10000, 4),
        _vc(id="VC-0006", type="di_ma", driver=LX1, contract_id=F, ref_id="PC-0006", assigned_at=ago(1, 4),
            status="Đang chạy", accepted_at=ago(1, 4), departed_at=ago(1, 2), fill_deadline=add_hours(ago(1, 2), 24),
            kg_required=10000, note="QUÁ HẠN: xe xuất xưởng đã hơn 24h, chưa điền số cân bên mạ & chưa tải ảnh phiếu."),
        _vc(id="VC-0007", type="di_ma", driver=LX2, contract_id=F, ref_id="PC-0007", assigned_at=ago(0, 1),
            status="Chờ xác nhận", kg_required=7880),
        _giao("VC-0101", F, "VC-0001", LX1, ago(8, 2), ago(8), 10000, 10000, 10000, add_hours(ago(8), 9),
              "Mạ ký 10.000 kg → KH ký 10.000 kg"),
        _giao("VC-0102", F, "VC-0002", LX1, ago(5, 2), ago(5), 10000, 10000, 10000, add_hours(ago(5), 8),
              "Mạ ký 10.000 kg → KH ký 10.000 kg"),
        _giao("VC-0103", F, "VC-0003", LX2, ago(2, 3), ago(2), 9980, 9980, 9980, add_hours(ago(2), 7),
              "Mạ ký 9.980 kg → KH ký 9.980 kg"),
        _giao("VC-0104", F, "VC-0004", LX1, ago(1, 6), ago(1, 4), 9940, 9940, 9900, add_hours(ago(1), 20),
              "Mạ ký 9.940 kg → KH ký 9.900 kg — LỆCH −40", "SL-0003"),
        _vc(id="VC-0105", type="giao_khach", driver=LX2, contract_id=F, ref_id="VC-0005", assigned_at=ago(0, 2),
            status="Đã nhận", accepted_at=ago(0, 1), kg_required=10000,
            note="Bên mạ báo xong 10 tấn — khách đồng ý nhận, tài xế đã nhận việc, chưa xuất phát."),
        _di_ma("VC-0201", "HD-2608-15", "PC-0101", LX2, 30, 10000, 10000, 5, "10.000 kg"),
        _di_ma("VC-0202", "HD-2608-15", "PC-0102", LX2, 29, 10000, 10000, 5, "10.000 kg"),
        _di_ma("VC-0203", "HD-2608-15", "PC-0103", LX1, 28, 10000, 10000, 5, "10.000 kg"),
        _di_ma("VC-0204", "HD-2608-15", "PC-0104", LX1, 27, 10000, 10000, 5, "10.000 kg"),
        _giao("VC-0301", "HD-2608-15", "VC-0201", LX2, ago(24), ago(24), 20000, 20000, 20000, add_hours(ago(24), 9),
              "Gộp 2 chuyến mạ · 20.000 kg"),
        _giao("VC-0302", "HD-2608-15", "VC-0203", LX1, ago(20), ago(20), 20000, 20000, 20000, add_hours(ago(20), 10),
              "Gộp 2 chuyến mạ · 20.000 kg"),
        _di_ma("VC-0501", "HD-2608-11", "PC-0301", LX1, 27, 8000, 8000, 5, "8.000 kg"),
        _di_ma("VC-0502", "HD-2608-11", "PC-0302", LX2, 26, 8000, 8000, 5, "8.000 kg"),
        _di_ma("VC-0503", "HD-2608-11", "PC-0303", LX1, 25, 8000, 8000, 5, "8.000 kg"),
        _giao("VC-0601", "HD-2608-11", "VC-0501", LX1, ago(22, 2), ago(22), 12000, 12000, 11960, add_hours(ago(22), 8),
              "Mạ ký 12.000 → KH ký 11.960 — LỆCH −40", "SL-0004",
              "2 thanh giằng để lại xe do vướng chiều dài — giao bù chuyến sau."),
        _giao("VC-0602", "HD-2608-11", "VC-0502", LX2, ago(19, 2), ago(19), 12000, 12000, 12040, add_hours(ago(19), 8),
              "Mạ ký 12.000 → KH ký 12.040 — GIAO BÙ +40", "SL-0005",
              "Giao bù 40 kg để lại từ chuyến VC-0601 — lũy kế hợp đồng khớp 100%."),
        _vc(id="VC-0401", type="di_ma", driver=LX2, contract_id="HD-2609-06", ref_id="PC-0201", assigned_at=ago(0, 5),
            status="Chờ xác nhận", kg_required=10000, note="Chuyến gửi mạ đầu tiên của hợp đồng SD06."),
    ]


def _mismatches():
    def m(i, src, rt, rid, cid, date, exp, act, reason, note, by, dept, signed_at=None):
        return Mismatch(id=i, source=src, ref_type=rt, ref_id=rid, contract_id=cid, date=date, expected=exp,
                        actual=act, delta=act - exp, reason=reason, reason_note=note, reported_by=by, dept=dept,
                        status="Đã ký xác nhận" if signed_at else "Chờ QL ký",
                        signed_by=QL if signed_at else None, signed_at=signed_at)
    return [
        m("SL-0001", "Cân tại xưởng mạ", "vc", "VC-0004", "HD-2609-01", add_hours(ago(6), 8), 10000, 9940,
          "Sai số thiết bị cân", "Cân mạ hiển thị thấp hơn trạm công ty ~0,6%", LX1, "Vận tải", ago(5)),
        m("SL-0002", "Trạm cân công ty", "pc", "PC-0007", "HD-2609-01", ago(0, 1), 8000, 7880,
          "Hao hụt bavia / cắt gọt", "Lô 13 cấu kiện cắt gọt nhiều, hao hụt vượt định mức", KHO, "Kho"),
        m("SL-0003", "Giao khách", "vc", "VC-0104", "HD-2609-01", add_hours(ago(1), 20), 9940, 9900,
          "Hàng để lại do quá tải trọng", "2 bản mã để lại xe, giao bù chuyến sau", LX1, "Vận tải"),
        m("SL-0004", "Giao khách", "vc", "VC-0601", "HD-2608-11", add_hours(ago(22), 8), 12000, 11960,
          "Hàng để lại do quá tải trọng", "2 thanh giằng vướng chiều dài thùng xe, để lại giao bù chuyến sau",
          LX1, "Vận tải", ago(21)),
        m("SL-0005", "Giao khách", "vc", "VC-0602", "HD-2608-11", add_hours(ago(19), 8), 12000, 12040,
          "Khác (ghi rõ)", "Giao bù 40 kg để lại từ chuyến VC-0601 — sau chuyến này lũy kế khớp 100%",
          LX2, "Vận tải", ago(18)),
    ]


def _vloss():
    return [VLoss(id="VK-0001", date=ago(6), ref_type="pc", ref_id="PC-0003", contract_id="HD-2609-01",
                  source="Trạm cân công ty", kg=20, approved_by=QL,
                  note="Hao hụt bavia nhỏ trong dung sai — QL cho phép, ném vào kho ảo", status="Đã xử lý",
                  resolution="Thanh lý phế liệu bavia", resolved_at=ago(4),
                  resolved_note=f"Gom cùng lô phế liệu bán ngày {fmt_d(ago(4))}")]


SEQ = {"dh": 8, "hd": 8, "lsx": 9, "ptn": 12, "pc": 15, "vc": 120, "sl": 6, "vk": 1}


def seed(db: Session) -> None:
    pw = hash_password(DEMO_PASSWORD)
    db.add_all([User(id=k, name=v["name"], dept=v["dept"], phone=v["phone"], roles=",".join(v["roles"]),
                     password_hash=pw, active=True, created_at=utcnow()) for k, v in PEOPLE.items()])
    db.add_all(Sequence(key=k, value=v) for k, v in SEQ.items())
    db.add_all(_orders() + _contracts() + _lsxs() + _receipts() + _weighings() + _tasks() + _mismatches() + _vloss())
    db.add_all([
        Notification(at=ago(0, 1), title="SAI LỆCH −120 kg tại Trạm cân công ty",
                     sub="PC-0007 · Hao hụt bavia / cắt gọt — chờ Quản lý ký", type="error"),
        Notification(at=ago(0, 2), title="Thẻ VC-0006 quá hạn điền phiếu",
                     sub="Phạm Văn Tài — chưa điền số cân bên mạ & ảnh phiếu", type="warning"),
        Notification(at=ago(0, 3), title="Đơn hàng mới DH-2609-05",
                     sub="Ban QLDA Cầu đường 5 — chờ chuyển kế toán làm hợp đồng", type="info"),
    ])
    _seed_master(db)
    db.commit()


def reset_db(db: Session) -> None:
    from .config import UPLOAD_DIR
    for f in UPLOAD_DIR.iterdir():  # ảnh thử nghiệm
        if f.is_file() and f.name != ".gitkeep":
            f.unlink()
    db.close()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed(db)


# ---------------------------------------------------------------- danh mục (khách hàng, thẻ, xe, xưởng mạ, nguyên liệu)
TAGS = {"Khách thân thiết": "#2f5d3a", "Khách lẻ": "#4a5560", "Ưu tiên": "#c5400a", "Đối tác lâu năm": "#3f6f8c",
        "Trả đúng hạn": "#2f7a6a", "Nhạy giá": "#8a1f1f", "Ưa giao nhanh": "#6b4a8a", "Cần chăm sóc": "#9c7714"}
CUSTOMERS = {  # tên (đúng như trên đơn hàng) → (mã ngắn, thẻ)
    "Cty CP Kết cấu thép FECON": ("FECON", ["Khách thân thiết", "Ưu tiên", "Đối tác lâu năm"]),
    "Nhà máy Thép Việt Ý": ("VIETY", ["Khách thân thiết", "Trả đúng hạn"]),
    "Cty TNHH Cơ điện Delta": ("DELTA", ["Khách lẻ", "Nhạy giá"]),
    "Tổng thầu Hòa Bình": ("HOABINH", ["Khách thân thiết", "Ưu tiên", "Ưa giao nhanh"]),
    "Cty Nhà thép PEB Việt Nam": ("PEB", ["Khách thân thiết", "Đối tác lâu năm"]),
    "Ban QLDA Cầu đường 5": ("CD5", ["Khách lẻ", "Cần chăm sóc"]),
    "Cty Xây lắp Sông Đà 9": ("SD9", []),
    "Cầu trục Doosan Vina": ("DOOSAN", []),
}
VEHICLES = [("29H-123.45", 10000, "nhà", LX1, ""), ("29H-678.90", 10000, "nhà", LX2, ""),
            ("29C-246.80", 8000, "thuê", "", "Xe thuê ngoài theo chuyến — chạy các chuyến 8 tấn")]
MATERIALS = [  # (ngày, NCC, mác thép, quy cách, SL, ĐVT, kg, ghi chú)
    (27, "Cty TNHH Thép Minh Khang", "SS400", "Thép tấm 12×1500×6000", 40, "tấm", 33912, ""),
    (21, "Cty CP Thép Á Châu", "Q345B", "Thép hình H-400×200×8×13 (12 m)", 30, "cây", 23760, ""),
    (15, "Cty TNHH Thép Minh Khang", "SS400", "Thép tấm 10×1500×6000", 30, "tấm", 21195, ""),
    (9, "Cty TNHH Thép Minh Khang", "SS400", "Thép tấm 16×2000×6000", 20, "tấm", 30144,
     "Lô bổ sung về chậm 4 ngày — xưởng xin gia hạn LSX-FE01"),
    (5, "Tổng kho thép Hưng Thịnh", "SS400", "Thép ống D76×3,0×6000", 200, "cây", 6480, ""),
    (2, "Cty CP Thép Á Châu", "Q345B", "Thép hình H-300×150×6,5×9 (12 m)", 40, "cây", 17616, ""),
]


def _seed_master(db: Session) -> None:
    from sqlalchemy import select

    from .models import Customer, Galvanizer, MaterialReceipt, Tag, Vehicle
    db.flush()
    tags = {n: Tag(name=n, color=c) for n, c in TAGS.items()}
    db.add_all(tags.values())
    orders = db.scalars(select(Order).order_by(Order.date)).all()
    custs = {}
    for o in orders:
        if o.customer not in custs:
            code, tg = CUSTOMERS.get(o.customer, ("", []))
            seg = "Thân thiết" if "Khách thân thiết" in tg else ("Đơn lẻ" if "Khách lẻ" in tg else "")
            custs[o.customer] = Customer(name=o.customer, short_code=code, active=True, created_at=o.date,
                                         segment=seg, tags=[tags[t] for t in tg])
    db.add_all(custs.values())
    db.add_all(Vehicle(plate=p, capacity_kg=cap, kind=k, default_driver=d, note=n, active=True)
               for p, cap, k, d, n in VEHICLES)
    galv = Galvanizer(name="Mạ kẽm Việt Đức", note="Xưởng mạ kẽm nhúng nóng — đối tác gửi mạ chính", active=True)
    db.add(galv)
    db.add_all(MaterialReceipt(id=f"NL-{i:04d}", date=ago(d), supplier=sup, steel_grade=g, spec=sp, qty=q, unit=u,
                               kg=kg, note=n, by=KHO)
               for i, (d, sup, g, sp, q, u, kg, n) in enumerate(MATERIALS, 1))
    db.add(Sequence(key="nl", value=len(MATERIALS)))
    db.flush()
    for o in orders:
        o.customer_id = custs[o.customer].id
    # xe gán theo tài xế; các chuyến đi mạ 8 tấn của HĐ FE11 chạy xe thuê 8 tấn
    by_driver = {d: p for p, _, _, d, _ in VEHICLES if d}
    for t in db.scalars(select(Task)):
        t.vehicle_plate = "29C-246.80" if (t.contract_id == "HD-2608-11" and t.type == "di_ma") else by_driver.get(t.driver)
        if t.type == "di_ma":
            t.galvanizer_id = galv.id
