"""Request body (camelCase từ FE)."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


class In(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("photo", mode="before", check_fields=False)
    @classmethod
    def _strip_photo_signature(cls, v):
        # client gửi lại link ảnh đã ký → lưu đường dẫn gốc /uploads/<tên>
        from .files import normalize_photo
        return normalize_photo(v) if isinstance(v, str) else v


class OrderItemIn(In):
    name: str
    qty: float = Field(ge=0)
    unit: str = "cấu kiện"
    kg_per_unit: float | None = Field(default=None, ge=0)  # KL/1 bộ; có thì tổng KL = SL × KL/1 bộ
    kg: float = Field(default=0, ge=0)  # tổng KL — dùng khi không nhập KL/1 bộ
    price: float = Field(ge=0)
    note: str = ""


class OrderCreate(In):
    customer: str = Field(min_length=1)
    code: str | None = None
    items: list[OrderItemIn] = Field(min_length=1)
    file: str | None = None
    note: str = ""
    customer_id: int | None = None  # chọn khách có sẵn; không có thì tìm/tạo theo tên `customer`
    vat_pct: float = Field(default=10, ge=0, le=100)


class OrderUpdate(In):
    customer: str | None = None
    customer_id: int | None = None
    code: str | None = None
    items: list[OrderItemIn] | None = None
    file: str | None = None
    note: str | None = None
    vat_pct: float | None = Field(default=None, ge=0, le=100)


class SendToKtIn(In):
    complete_by: datetime | None = None  # ngày hoàn thành đơn (bắt buộc — kiểm tra ở service để báo lỗi tiếng Việt)


class ContractUpdate(In):
    owner: str | None = None
    due_at: datetime | None = None
    unit_price: float | None = Field(default=None, ge=0)
    advance_pct: float | None = Field(default=None, ge=0, le=100)
    note: str | None = None


class PaymentIn(In):
    amount: float = Field(gt=0)
    type: str = "Thanh toán"
    note: str = ""


class LsxCreate(In):
    contract_id: str
    name: str | None = None
    qty: float | None = Field(default=None, ge=0)  # bỏ số lượng SP — chỉ còn khối lượng (giữ để tương thích)
    kg: float = Field(gt=0)
    lead_days: int = Field(default=7, ge=1)


class ReasonIn(In):
    reason: str = Field(min_length=1)


class LsxDailyIn(In):
    day: date | None = None  # mặc định hôm nay (giờ VN)
    kg: float = Field(ge=0)  # sản lượng trong ngày; không làm thì 0
    note: str = ""


class LsxExtendIn(In):
    to: datetime
    reason: str = Field(min_length=1)


class ReceiptItemIn(In):
    item_id: int
    qty: float = Field(ge=0)


class ReceiptCreate(In):
    lsx_id: str
    qty: float | None = Field(default=None, ge=0)
    kg: float | None = Field(default=None, ge=0)  # có items → tự tính = Σ SL × KL/1 bộ
    items: list[ReceiptItemIn] | None = None
    note: str = ""


class WeighingCreate(In):
    source_id: str  # PTN-… hoặc LSX-…
    kg_expected: float = Field(gt=0)


class WeighingFill(In):
    kg_actual: float = Field(ge=0)
    photo: str | None = None
    reason: str | None = None
    reason_note: str | None = None
    signer_lai_xe: str | None = None


class TaskCreate(In):
    type: str
    driver: str
    contract_id: str
    ref_id: str | None = None
    kg_required: float | None = Field(default=None, ge=0)  # không nhập → lấy theo chứng từ gốc (PC / thẻ đi mạ)
    note: str = ""
    vehicle_plate: str | None = None
    galvanizer_id: int | None = None
    arrive_at: datetime | None = None  # ngày giờ lái xe phải có mặt
    fill_deadline: datetime | None = None  # hạn trả phiếu (điền số cân + ảnh phiếu); bỏ trống = có mặt + 24h
    deliver_customer_id: int | None = None
    deliver_name: str = ""
    deliver_address: str = ""
    receiver_name: str = ""
    receiver_phone: str = ""
    contact_name: str = ""
    contact_phone: str = ""


class TaskFillGalv(In):
    kg: float = Field(ge=0)
    photo: str | None = None
    reason: str | None = None
    reason_note: str | None = None


class TaskFillDelivery(In):
    kg_picked: float = Field(ge=0)
    kg_delivered: float = Field(ge=0)
    photo: str | None = None
    reason: str | None = None
    reason_note: str | None = None


class PhotoIn(In):
    photo: str | None = None


class AcceptLossIn(In):
    ref_type: str  # pc | vc
    ref_id: str
    note: str | None = None


class ResolveVlossIn(In):
    resolution: str = Field(min_length=1)
    note: str | None = None
