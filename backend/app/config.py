"""Cấu hình & hằng nghiệp vụ (giữ nguyên giá trị bản demo đã chốt với khách)."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR.mkdir(exist_ok=True)
UPLOAD_DIR.mkdir(exist_ok=True)

# PostgreSQL (docker compose up -d db). Có thể trỏ sang SQLite để thử nhanh: sqlite:///./data/steel.db
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+psycopg://steel:steel_dev_pw@localhost:5432/steel_one")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

# Đăng nhập: ĐỔI SECRET_KEY khi chạy thật (biến môi trường). Token hết hạn sau TOKEN_HOURS giờ.
SECRET_KEY = os.getenv("SECRET_KEY", "dev-only-secret-change-me-in-production-steel-one")
TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "12"))
# Mật khẩu ban đầu cho tài khoản demo (chỉ dùng khi seed dữ liệu demo)
DEMO_PASSWORD = os.getenv("DEMO_PASSWORD", "steel123")
# Cho phép POST /api/admin/reset (XÓA TOÀN BỘ dữ liệu, nạp lại demo). Môi trường thật: ALLOW_DEMO_RESET=0
ALLOW_DEMO_RESET = os.getenv("ALLOW_DEMO_RESET", "1") == "1"

TOLERANCE_KG = 30   # dung sai cân xe tải — lệch quá mức này thì tạo sai lệch
FILL_HOURS = 24     # hạn lái xe điền kg + ảnh phiếu kể từ khi xuất phát
CONTRACT_DAYS = 5   # hạn kế toán trả hợp đồng kể từ khi nhận đơn
PC_FILL_HOURS = 4   # phiếu cân trạm quá 4 giờ chưa có số/ảnh → quá hạn

# Cảnh báo cuối ngày (giờ Việt Nam): sau END_OF_DAY_HOUR hệ thống tự tạo thông báo tổng hợp 1 lần/ngày.
END_OF_DAY_HOUR = int(os.getenv("END_OF_DAY_HOUR", "17"))
ALERTS_ENABLED = os.getenv("ALERTS_ENABLED", "1") == "1"

# Tài khoản demo (seed). phone = tên đăng nhập. Một người có thể giữ nhiều vai trò.
PEOPLE = {
    "ql": {"name": "Quản lý A", "dept": "Điều hành", "roles": ["admin"], "phone": "0900000001"},
    "kt": {"name": "Trần Thu Hà", "dept": "Kế toán", "roles": ["kt"], "phone": "0900000002"},
    "sx": {"name": "Lê Văn Xưởng", "dept": "Sản xuất", "roles": ["sx"], "phone": "0900000003"},
    "kho": {"name": "Ngô Minh Kho", "dept": "Kho", "roles": ["kho"], "phone": "0900000004"},
    "lx1": {"name": "Phạm Văn Tài", "dept": "Vận tải", "roles": ["lx"], "phone": "0900000005"},
    "lx2": {"name": "Lê Đức Vận", "dept": "Vận tải", "roles": ["lx"], "phone": "0900000006"},
}
DRIVERS = [PEOPLE["lx1"]["name"], PEOPLE["lx2"]["name"]]  # mặc định khi chưa có user lx trong DB

REASONS_CAN = [
    "Hao hụt bavia / cắt gọt", "Sai số thiết bị cân", "Đếm thiếu / thừa số lượng",
    "Hàng để lại do quá tải trọng", "Ướt / bám tạp chất khi cân", "Khác (ghi rõ)",
]
REASONS_TU_CHOI_SX = [
    "Trùng lịch bảo trì máy", "Thiếu nguyên liệu thép", "Thiếu nhân lực ca",
    "Quá tải năng lực xưởng", "Bản vẽ chưa đủ thông tin", "Khác (ghi rõ)",
]
REASONS_TU_CHOI_LX = [
    "Xe đang bảo dưỡng", "Trùng chuyến khác", "Quá tải trọng cho phép",
    "Nghỉ phép / sức khỏe", "Khác (ghi rõ)",
]
VLOSS_RESOLUTIONS = [
    "Thanh lý phế liệu bavia", "Bồi thường từ xưởng mạ", "Trừ lương / quy trách nhiệm",
    "Chấp nhận chi phí", "Khác (ghi rõ)",
]

ROLES = [
    {"id": "admin", "label": "Quản lý (điều hành)"},
    {"id": "kt", "label": "NV1 — Kế toán"},
    {"id": "sx", "label": "NV2 — Xưởng sản xuất"},
    {"id": "kho", "label": "NV3 — Thủ kho"},
    {"id": "lx", "label": "NV3 — Lái xe"},
]

# 'full' quản lý · 'limited' thao tác giới hạn · 'view' chỉ xem · không có = ẩn
PERMISSIONS = {
    "kt": {"dashboard": "view", "don-hang": "view", "hop-dong": "full", "lsx": "view",
           "kho-ao": "view", "bao-cao": "view", "sai-lech": "view",
           "khach-hang": "view"},
    "sx": {"dashboard": "view", "don-hang": "view", "hop-dong": "view", "lsx": "full",
           "tiep-nhan": "view", "bao-cao": "view", "sai-lech": "view",
           "khach-hang": "view", "nguyen-lieu": "view"},
    "kho": {"dashboard": "view", "lsx": "view", "tiep-nhan": "full", "phieu-can": "full",
            "kho-ao": "limited", "van-chuyen": "view", "doi-ung-ma": "view",
            "bao-cao": "view", "sai-lech": "limited",
            "nguyen-lieu": "full", "xe": "view", "xuong-ma": "view"},
    "lx": {"dashboard": "view", "phieu-can": "view", "van-chuyen": "full",
           "doi-ung-ma": "view", "sai-lech": "limited",
           "xe": "view", "xuong-ma": "view"},
}
