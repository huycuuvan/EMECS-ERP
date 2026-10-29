"""Bôi vàng ô thay đổi trên file Word xuất ra (anh Thắng 29/10): nội dung cố định của mẫu để chữ đen, phần hệ thống
điền theo từng hợp đồng (ô {{ … }} trong mẫu) nền vàng để người gửi soát / sửa trước khi gửi khách.

Làm lúc xuất, không sửa file mẫu: bỏ mọi highlight sẵn có của mẫu, tách run "Địa chỉ: {{ a.address }}" thành
nhãn (giữ nguyên) + ô điền (nền vàng). Mẫu mới thả vào templates/ cũng tự được bôi.
"""
import re
import zipfile
from copy import deepcopy
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from lxml import etree

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
XML_SPACE = "{http://www.w3.org/XML/1998/namespace}space"
FIELD = re.compile(r"(\{\{.*?\}\})")
# phần tử đứng sau <w:highlight> trong <w:rPr> (thứ tự theo schema OOXML)
_AFTER_HL = {W + t for t in ("u", "effect", "bdr", "shd", "fitText", "vertAlign", "rtl", "cs", "em", "lang",
                             "eastAsianLayout", "specVanish", "oMath")}
PARTS = ("word/document.xml",)


def _set_highlight(r) -> None:
    rpr = r.find(W + "rPr")
    if rpr is None:
        rpr = etree.Element(W + "rPr")
        r.insert(0, rpr)
    hl = etree.Element(W + "highlight")
    hl.set(W + "val", "yellow")
    nxt = next((ch for ch in rpr if ch.tag in _AFTER_HL), None)
    if nxt is None:
        rpr.append(hl)
    else:
        nxt.addprevious(hl)


def _mark_run(r) -> None:
    texts = r.findall(W + "t")
    text = "".join(t.text or "" for t in texts)
    if "{{" not in text:
        return
    rpr = r.find(W + "rPr")

    def new_run(child, field: bool):
        nr = etree.Element(W + "r")
        if rpr is not None:
            nr.append(deepcopy(rpr))
        nr.append(child)
        if field:
            _set_highlight(nr)
        r.addprevious(nr)

    # mỗi đoạn chữ / ô {{ }} / tab / xuống dòng thành 1 run riêng, giữ định dạng gốc
    for ch in [ch for ch in r if ch.tag != W + "rPr"]:
        if ch.tag != W + "t":
            new_run(ch, False)
            continue
        for piece in (p for p in FIELD.split(ch.text or "") if p):
            t = etree.Element(W + "t")
            t.text = piece
            t.set(XML_SPACE, "preserve")
            new_run(t, bool(FIELD.fullmatch(piece)))
    r.getparent().remove(r)


def _process(xml: bytes, mark: bool) -> bytes:
    root = etree.fromstring(xml)
    for hl in list(root.iter(W + "highlight")):
        hl.getparent().remove(hl)
    if mark:
        for r in list(root.iter(W + "r")):
            _mark_run(r)
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


@lru_cache(maxsize=16)
def _prepared(path: str, mtime: float, mark: bool) -> bytes:
    src = zipfile.ZipFile(path)
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as out:
        for item in src.infolist():
            data = src.read(item.filename)
            out.writestr(item, _process(data, mark) if item.filename in PARTS else data)
    return buf.getvalue()


def prepared(path: Path, mark: bool = True) -> BytesIO:
    """File mẫu đã bôi vàng ô {{ }} (mark=False: bản sạch, không bôi gì) — đưa thẳng cho DocxTemplate."""
    return BytesIO(_prepared(str(path), path.stat().st_mtime, mark))
