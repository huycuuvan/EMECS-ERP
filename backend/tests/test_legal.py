"""Bộ hồ sơ gửi khách kèm hợp đồng: biên bản giao nhận + chứng chỉ xuất xưởng theo mẫu Word của khách."""
import io
import zipfile

from docx import Document

from test_master import c, login  # noqa: F401


def _text(data: bytes) -> str:
    d = Document(io.BytesIO(data))
    parts = [p.text for p in d.paragraphs]
    for t in d.tables:
        for row in t.rows:
            parts += [cell.text for cell in row.cells]
    return "\n".join(parts)


def _contract(c):
    c.put("/api/settings/seller", json={**c.get("/api/settings/seller").json(), "name": "CÔNG TY TNHH EMECS VIỆT NAM",
                                       "representative": "Trần Ngọc Anh", "title": "Giám đốc", "representativeHonorific": "Bà",
                                       "workshopRep": "Lê Văn Dũng", "workshopTitle": "QLSX", "workshopHonorific": "Ông"})
    o = c.post("/api/orders", json={"customer": "Cty Hồ Sơ", "items": [
        {"name": "Xà đỡ X-TU", "qty": 6, "unit": "Bộ", "kgPerUnit": 50, "price": 20000},
        {"name": "Tiếp địa RC-2", "qty": 269, "unit": "Bộ", "kgPerUnit": 10, "price": 20000}]}).json()
    return c.post(f"/api/orders/{o['id']}/send-to-kt", json={"completeBy": "2099-01-01"}).json()


def test_legal_forms_fill_from_contract(c):
    hd = _contract(c)
    g = c.get(f"/api/contracts/{hd['id']}/legal").json()
    assert [f["key"] for f in g["forms"] if f["ready"]] == ["bien-ban-giao-nhan", "chung-chi-xuat-xuong"]
    assert g["data"]["giverName"] == "Lê Văn Dũng"  # mặc định bên giao = quản đốc / QLSX trong Thông tin công ty

    bb = _text(c.get(f"/api/contracts/{hd['id']}/legal/bien-ban-giao-nhan.docx").content)
    assert "{{" not in bb and "{%" not in bb
    assert "Cty Hồ Sơ" in bb and "Xà đỡ X-TU" in bb and "269" in bb and "Lê Văn Dũng" in bb
    assert "Đại diện là ông/bà" in bb  # chưa có người nhận → để chấm điền tay

    login(c, "kt")
    r = c.put(f"/api/contracts/{hd['id']}/legal", json={"date": "2026-10-16", "project": "Đường dây 375E10.4",
                                                       "receiverName": "Nguyễn Văn Nam", "receiverTitle": "Chỉ huy trưởng",
                                                       "receiverHonorific": "Ông"})
    assert r.status_code == 200 and r.json()["data"]["project"] == "Đường dây 375E10.4"
    bb = _text(c.get(f"/api/contracts/{hd['id']}/legal/bien-ban-giao-nhan.docx").content)
    assert "Hà Nội, ngày 16 tháng 10 năm 2026" in bb and "Đại diện là ông: Nguyễn Văn Nam" in bb
    cc = _text(c.get(f"/api/contracts/{hd['id']}/legal/chung-chi-xuat-xuong.docx").content)
    assert "{{" not in cc and "Đường dây 375E10.4" in cc and "Bà: Trần Ngọc Anh" in cc and "GIÁM ĐỐC" in cc
    assert "Tiếp địa RC-2" in cc

    z = zipfile.ZipFile(io.BytesIO(c.get(f"/api/contracts/{hd['id']}/legal.zip").content))
    names = z.namelist()
    assert len(names) == 3 and any(n.startswith("Hop-dong_") for n in names)
    assert c.get(f"/api/contracts/{hd['id']}/legal/khong-co.docx").status_code == 404


def test_legal_permissions(c):
    hd = _contract(c)
    login(c, "kho")
    assert c.get(f"/api/contracts/{hd['id']}/legal.zip").status_code == 403
    assert c.put(f"/api/contracts/{hd['id']}/legal", json={"project": "x"}).status_code == 403
