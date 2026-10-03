"""Mô hình dữ liệu — bám theo shape của bản demo `Cơ khí thép/assets/js/steel-data.js`.

Chuỗi nghiệp vụ: Đơn hàng (DH) → Hợp đồng (HD) → Lệnh SX (LSX) → Phiếu tiếp nhận TP (PTN)
→ Phiếu cân trạm (PC) → Thẻ lái xe (VC: đi mạ / giao khách) → Sai lệch (SL) → Kho ảo (VK).
"""
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Table, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base, UTCDateTime


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # ql, kt, sx, kho, lx1, lx2, u-xxxx
    name: Mapped[str] = mapped_column(String(120))
    dept: Mapped[str] = mapped_column(String(60), default="")
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)  # tên đăng nhập
    password_hash: Mapped[str] = mapped_column(String(255))
    roles: Mapped[str] = mapped_column(String(80))  # "admin" | "kho,lx" … (ngăn cách dấu phẩy)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at = mapped_column(UTCDateTime, nullable=True)
    last_login_at = mapped_column(UTCDateTime, nullable=True)

    @property
    def role_list(self) -> list[str]:
        return [r for r in (self.roles or "").split(",") if r]


class AuditLog(Base):
    """Nhật ký thao tác: mọi request ghi (POST/PUT/PATCH/DELETE) của người dùng đã đăng nhập."""
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at = mapped_column(UTCDateTime, index=True)
    user_id: Mapped[str | None] = mapped_column(String(32), index=True)
    user_name: Mapped[str | None] = mapped_column(String(120))
    method: Mapped[str] = mapped_column(String(8))
    path: Mapped[str] = mapped_column(String(255))
    status: Mapped[int] = mapped_column(Integer)


class Sequence(Base):
    __tablename__ = "sequences"
    key: Mapped[str] = mapped_column(String(16), primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)


class Order(Base):
    __tablename__ = "orders"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    customer: Mapped[str] = mapped_column(String(200))
    code: Mapped[str] = mapped_column(String(32))
    date = mapped_column(UTCDateTime)
    file: Mapped[str | None] = mapped_column(String(255))
    total_kg: Mapped[float] = mapped_column(Float, default=0)
    value: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(40))  # Chốt đơn | Đã chuyển kế toán | Đã có hợp đồng
    contract_id: Mapped[str | None] = mapped_column(String(32))
    note: Mapped[str] = mapped_column(Text, default="")
    customer_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)  # → customers.id
    vat_pct: Mapped[float] = mapped_column(Float, default=10, server_default="10")  # thuế VAT % (file đặt hàng khách)
    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.id")


class OrderItem(Base):
    __tablename__ = "order_items"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id"))
    name: Mapped[str] = mapped_column(String(255))
    qty: Mapped[float] = mapped_column(Float, default=0)
    unit: Mapped[str] = mapped_column(String(32), default="cấu kiện")
    kg_per_unit: Mapped[float | None] = mapped_column(Float, nullable=True)  # KL/1 bộ (kg) — tổng KL = SL × KL/1 bộ
    kg: Mapped[float] = mapped_column(Float, default=0)  # tổng KL (kg)
    price: Mapped[float] = mapped_column(Float, default=0)  # đơn giá đ/kg
    note: Mapped[str] = mapped_column(String(255), default="", server_default="")
    order: Mapped[Order] = relationship(back_populates="items")


class Contract(Base):
    __tablename__ = "contracts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(32))
    code: Mapped[str] = mapped_column(String(32))
    customer: Mapped[str] = mapped_column(String(200))
    sent_to_kt_at = mapped_column(UTCDateTime)
    due_at = mapped_column(UTCDateTime)
    returned_at = mapped_column(UTCDateTime, nullable=True)
    sign_date = mapped_column(UTCDateTime, nullable=True)
    status: Mapped[str] = mapped_column(String(40))  # Soạn thảo | Đã trả khách | Đã ký | Đang triển khai | Hoàn thành
    owner: Mapped[str] = mapped_column(String(120))
    total_qty: Mapped[float] = mapped_column(Float, default=0)
    unit: Mapped[str] = mapped_column(String(32), default="cấu kiện")
    total_kg: Mapped[float] = mapped_column(Float, default=0)
    unit_price: Mapped[float] = mapped_column(Float, default=0)
    value: Mapped[float] = mapped_column(Float, default=0)
    vat_pct: Mapped[float] = mapped_column(Float, default=8)
    advance_pct: Mapped[float] = mapped_column(Float, default=0)
    advance_required: Mapped[float] = mapped_column(Float, default=0)
    advance_received: Mapped[float] = mapped_column(Float, default=0)
    advance_received_at = mapped_column(UTCDateTime, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="contract", cascade="all, delete-orphan", order_by="Payment.date")


class Payment(Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    contract_id: Mapped[str] = mapped_column(ForeignKey("contracts.id"))
    date = mapped_column(UTCDateTime)
    amount: Mapped[float] = mapped_column(Float)
    type: Mapped[str] = mapped_column(String(80))
    note: Mapped[str] = mapped_column(Text, default="")
    contract: Mapped[Contract] = relationship(back_populates="payments")


class Lsx(Base):
    __tablename__ = "lsx"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    contract_id: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(255))
    assigned_at = mapped_column(UTCDateTime)
    assigned_by: Mapped[str] = mapped_column(String(120))
    lead_days: Mapped[int] = mapped_column(Integer, default=7)
    deadline = mapped_column(UTCDateTime)
    status: Mapped[str] = mapped_column(String(32))  # Chờ nhận | Đang SX | Từ chối | Hoàn thành
    accepted_at = mapped_column(UTCDateTime, nullable=True)
    accepted_by: Mapped[str | None] = mapped_column(String(120))
    reject_reason: Mapped[str | None] = mapped_column(Text)
    qty_plan: Mapped[float] = mapped_column(Float, default=0)
    kg_plan: Mapped[float] = mapped_column(Float, default=0)
    qty_done: Mapped[float] = mapped_column(Float, default=0)
    kg_done: Mapped[float] = mapped_column(Float, default=0)
    ext_to = mapped_column(UTCDateTime, nullable=True)
    ext_reason: Mapped[str | None] = mapped_column(Text)
    ext_approved_by: Mapped[str | None] = mapped_column(String(120))
    ext_at = mapped_column(UTCDateTime, nullable=True)
    logs: Mapped[list["LsxLog"]] = relationship(
        back_populates="lsx", cascade="all, delete-orphan", order_by="LsxLog.at")


class LsxLog(Base):
    __tablename__ = "lsx_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lsx_id: Mapped[str] = mapped_column(ForeignKey("lsx.id"))
    at = mapped_column(UTCDateTime)
    text: Mapped[str] = mapped_column(Text)
    lsx: Mapped[Lsx] = relationship(back_populates="logs")


class Receipt(Base):
    """Phiếu tiếp nhận thành phẩm (kho nhận từ xưởng)."""
    __tablename__ = "receipts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    lsx_id: Mapped[str] = mapped_column(String(32), index=True)
    contract_id: Mapped[str] = mapped_column(String(32), index=True)
    date = mapped_column(UTCDateTime)
    qty: Mapped[float] = mapped_column(Float, default=0)
    kg: Mapped[float] = mapped_column(Float, default=0)
    by: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text, default="")


class Weighing(Base):
    """Phiếu cân tại trạm công ty (xuất hàng lên xe đi mạ)."""
    __tablename__ = "weighings"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    contract_id: Mapped[str] = mapped_column(String(32), index=True)
    lsx_id: Mapped[str] = mapped_column(String(32))
    date = mapped_column(UTCDateTime)
    kg_expected: Mapped[float] = mapped_column(Float, default=0)
    kg_actual: Mapped[float | None] = mapped_column(Float)
    photo: Mapped[str | None] = mapped_column(Text)
    signer_boc_xep: Mapped[str] = mapped_column(String(120), default="")
    signer_kho: Mapped[str] = mapped_column(String(120), default="")
    signer_lai_xe: Mapped[str] = mapped_column(String(120), default="")
    by: Mapped[str] = mapped_column(String(120))
    mismatch_id: Mapped[str | None] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))  # Chờ cân | Đã cân | Lệch — chờ ký
    loss_accepted: Mapped[bool] = mapped_column(Boolean, default=False)


class Task(Base):
    """Thẻ công việc lái xe. type: di_ma (công ty → xưởng mạ) | giao_khach (mạ → khách)."""
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    type: Mapped[str] = mapped_column(String(16))
    driver: Mapped[str] = mapped_column(String(120))
    contract_id: Mapped[str] = mapped_column(String(32), index=True)
    ref_id: Mapped[str | None] = mapped_column(String(32))
    assigned_at = mapped_column(UTCDateTime)
    status: Mapped[str] = mapped_column(String(32))  # Chờ xác nhận | Đã nhận | Từ chối | Đang chạy | Hoàn thành
    accepted_at = mapped_column(UTCDateTime, nullable=True)
    departed_at = mapped_column(UTCDateTime, nullable=True)
    fill_deadline = mapped_column(UTCDateTime, nullable=True)
    kg_required: Mapped[float] = mapped_column(Float, default=0)
    kg_at_galv: Mapped[float | None] = mapped_column(Float)
    kg_picked: Mapped[float | None] = mapped_column(Float)
    kg_delivered: Mapped[float | None] = mapped_column(Float)
    filled_at = mapped_column(UTCDateTime, nullable=True)
    photo: Mapped[str | None] = mapped_column(Text)
    reject_reason: Mapped[str | None] = mapped_column(Text)
    mismatch_id: Mapped[str | None] = mapped_column(String(32))
    note: Mapped[str] = mapped_column(Text, default="")
    loss_accepted: Mapped[bool] = mapped_column(Boolean, default=False)
    vehicle_plate: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)  # biển số xe chạy chuyến
    galvanizer_id: Mapped[int | None] = mapped_column(Integer, nullable=True)  # → galvanizers.id (thẻ đi mạ)


class Mismatch(Base):
    """Sổ sai lệch — mọi con số lệch phải có lý do + Quản lý ký."""
    __tablename__ = "mismatches"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    source: Mapped[str] = mapped_column(String(60))  # Trạm cân công ty | Cân tại xưởng mạ | Giao khách
    ref_type: Mapped[str] = mapped_column(String(8))  # pc | vc
    ref_id: Mapped[str] = mapped_column(String(32))
    contract_id: Mapped[str] = mapped_column(String(32), index=True)
    date = mapped_column(UTCDateTime)
    expected: Mapped[float] = mapped_column(Float)
    actual: Mapped[float] = mapped_column(Float)
    delta: Mapped[float] = mapped_column(Float)
    reason: Mapped[str] = mapped_column(String(120))
    reason_note: Mapped[str] = mapped_column(Text, default="")
    reported_by: Mapped[str] = mapped_column(String(120))
    dept: Mapped[str] = mapped_column(String(60))
    status: Mapped[str] = mapped_column(String(32))  # Chờ QL ký | Đã ký xác nhận
    signed_by: Mapped[str | None] = mapped_column(String(120))
    signed_at = mapped_column(UTCDateTime, nullable=True)


class VLoss(Base):
    """Kho ảo chênh lệch — phần hụt Quản lý đã cho phép, chờ xử lý dứt điểm."""
    __tablename__ = "vloss"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    date = mapped_column(UTCDateTime)
    ref_type: Mapped[str] = mapped_column(String(8))
    ref_id: Mapped[str] = mapped_column(String(32))
    contract_id: Mapped[str] = mapped_column(String(32), index=True)
    source: Mapped[str] = mapped_column(String(60))
    kg: Mapped[float] = mapped_column(Float)
    approved_by: Mapped[str] = mapped_column(String(120))
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32))  # Đang treo | Đã xử lý
    resolution: Mapped[str | None] = mapped_column(String(120))
    resolved_at = mapped_column(UTCDateTime, nullable=True)
    resolved_note: Mapped[str | None] = mapped_column(Text)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at = mapped_column(UTCDateTime)
    title: Mapped[str] = mapped_column(String(255))
    sub: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(16), default="info")  # info | success | warning | error
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    # vai trò nhận thông báo, ngăn cách dấu phẩy ("sx,admin"); None = mọi người
    roles: Mapped[str | None] = mapped_column(String(80), nullable=True)


class FieldChange(Base):
    """Lịch sử chỉnh sửa từng trường của chứng từ: ai sửa, lúc nào, giá trị cũ → mới, lý do.
    entity_type: dh | hd | lsx | ptn | pc | vc | sl · field: tên trường phía API (camelCase, vd kgActual)."""
    __tablename__ = "field_changes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    at = mapped_column(UTCDateTime, index=True)
    entity_type: Mapped[str] = mapped_column(String(8))
    entity_id: Mapped[str] = mapped_column(String(32), index=True)
    field: Mapped[str] = mapped_column(String(64))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    user_id: Mapped[str | None] = mapped_column(String(32))
    user_name: Mapped[str | None] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(Text, default="")


# ================================================================ danh mục (M01, M04, M06)
customer_tags = Table(
    "customer_tags", Base.metadata,
    Column("customer_id", ForeignKey("customers.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    """Thẻ khách hàng do người dùng tạo (Khách thân thiết, Khách lẻ…) — dùng làm bộ lọc."""
    __tablename__ = "tags"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(60), unique=True)
    color: Mapped[str] = mapped_column(String(16), default="#4a5560")


class Customer(Base):
    __tablename__ = "customers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    short_code: Mapped[str] = mapped_column(String(32), default="")
    tax_code: Mapped[str] = mapped_column(String(32), default="")
    address: Mapped[str] = mapped_column(String(255), default="")
    contact_name: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at = mapped_column(UTCDateTime, nullable=True)
    # hồ sơ pháp nhân (in hợp đồng): người đại diện, chức vụ, tài khoản ngân hàng
    representative: Mapped[str] = mapped_column(String(120), default="", server_default="")
    representative_title: Mapped[str] = mapped_column(String(80), default="", server_default="")
    bank_account: Mapped[str] = mapped_column(String(40), default="", server_default="")
    bank_name: Mapped[str] = mapped_column(String(200), default="", server_default="")  # ngân hàng — chi nhánh
    # phân loại (báo giá M01/M06): "Thân thiết" | "Đơn lẻ" | "" (chưa phân loại)
    segment: Mapped[str] = mapped_column(String(20), default="", server_default="", index=True)
    tags: Mapped[list[Tag]] = relationship(secondary=customer_tags, order_by="Tag.name", lazy="selectin")


class Vehicle(Base):
    """Danh mục xe — giám sát số tấn theo từng xe."""
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    plate: Mapped[str] = mapped_column(String(20), unique=True)
    capacity_kg: Mapped[float] = mapped_column(Float, default=0)
    kind: Mapped[str] = mapped_column(String(8), default="nhà")  # nhà | thuê
    default_driver: Mapped[str] = mapped_column(String(120), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Galvanizer(Base):
    """Danh mục xưởng mạ kẽm."""
    __tablename__ = "galvanizers"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), unique=True)
    address: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(32), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class MaterialReceipt(Base):
    """Phiếu nhập nguyên liệu mua vào (thép tấm, thép hình…) — kho nhập để thống kê."""
    __tablename__ = "material_receipts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # NL-0001
    date = mapped_column(UTCDateTime, index=True)
    supplier: Mapped[str] = mapped_column(String(200))
    steel_grade: Mapped[str] = mapped_column(String(40), default="")  # mác thép: SS400, Q345B…
    spec: Mapped[str] = mapped_column(String(200), default="")  # quy cách
    qty: Mapped[float] = mapped_column(Float, default=0)
    unit: Mapped[str] = mapped_column(String(32), default="tấm")
    kg: Mapped[float] = mapped_column(Float, default=0)
    note: Mapped[str] = mapped_column(Text, default="")
    by: Mapped[str] = mapped_column(String(120), default="")
