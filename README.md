# STEEL ONE — ERP điều hành cơ khí kết cấu thép

Bản triển khai đầu tiên dựng theo bản demo HTML khách đã duyệt (`Cơ khí thép/`).
Quy trình: Đơn hàng → Hợp đồng & tạm ứng → Lệnh sản xuất → Phiếu tiếp nhận TP → Phiếu cân trạm
→ Thẻ lái xe (đi mạ / giao khách) → Sai lệch (Quản lý ký) → Kho ảo chênh lệch.
Lõi: đối ứng 3 số cân — cân xuất công ty = cân đến xưởng mạ = lấy từ mạ giao khách.

| Thư mục | Nội dung |
|---|---|
| `backend/` | FastAPI + SQLAlchemy 2 + PostgreSQL 16 (Alembic quản lý migration) |
| `frontend/` | React 19 + Vite + TypeScript + antd v6 + React Query |
| `Cơ khí thép/`, `docs/` | Bản demo HTML gốc + tài liệu BA/SRS — **chỉ lưu nội bộ, không có trên Git** |

## Chạy máy dev

Cần Docker (chạy PostgreSQL), Python 3.12, Node 20+.

```bash
docker compose up -d db
```

```bash
cd backend && /usr/local/bin/python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
```

```bash
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Mở http://localhost:5173 · API docs tự sinh: http://localhost:8000/docs · Giao diện điện thoại: http://localhost:5173/mobile

Mỗi lần khởi động backend tự chạy migration (`alembic upgrade head`); nếu DB trống thì nạp dữ liệu demo
(thời gian tính tương đối theo lúc nạp). Kết nối mặc định: `postgresql+psycopg://steel:steel_dev_pw@localhost:5432/steel_one`
(đổi qua biến môi trường `DATABASE_URL`).

**Đổi cấu trúc DB** (thêm/sửa cột, bảng trong `backend/app/models.py`) → sinh migration rồi commit file trong `backend/migrations/versions/`:

```bash
cd backend && .venv/bin/alembic revision --autogenerate -m "mo ta thay doi"
```
Khôi phục dữ liệu demo: menu avatar góc phải → "Khôi phục dữ liệu demo", hoặc `POST /api/admin/reset`.

## Kiểm thử

```bash
cd backend && .venv/bin/python -m pytest -q tests
```

Chạy test trên PostgreSQL (DB riêng `steel_one_test`, không đụng dữ liệu dev):

```bash
cd backend && TEST_DATABASE_URL=postgresql+psycopg://steel:steel_dev_pw@localhost:5432/steel_one_test .venv/bin/python -m pytest -q tests
```

```bash
cd frontend && npx tsc -b
```

## Đăng nhập & phân quyền
- Đăng nhập bằng **số điện thoại + mật khẩu** (JWT, hết hạn sau 12 giờ). Mọi API bắt buộc đăng nhập và **kiểm quyền ở server**
  theo bảng `PERMISSIONS` trong `backend/app/config.py` (giống bản demo), cộng một số quy tắc riêng:
  ký sai lệch / duyệt kho ảo / phát lệnh SX / giao thẻ lái xe = chỉ Quản lý; nhận – từ chối – cập nhật lệnh SX = Xưởng;
  thao tác thẻ lái xe = đúng lái xe được giao. Lái xe chỉ thấy thẻ của mình.
- Một người có thể giữ **nhiều vai trò** (vd thủ kho kiêm lái xe) — quyền lấy mức cao nhất.
- Người thao tác (người cân, người nhận lệnh, người ký…) ghi theo tài khoản đăng nhập. Mọi thao tác ghi được lưu **nhật ký**
  (Quản trị → Người dùng & phân quyền → Nhật ký thao tác).
- Tài khoản demo (seed), mật khẩu chung `steel123` (đổi qua biến môi trường `DEMO_PASSWORD`):

| SĐT | Người | Vai trò |
|---|---|---|
| 0900000001 | Quản lý A | Quản lý (toàn quyền, quản trị người dùng) |
| 0900000002 | Trần Thu Hà | Kế toán |
| 0900000003 | Lê Văn Xưởng | Xưởng sản xuất |
| 0900000004 | Ngô Minh Kho | Thủ kho |
| 0900000005 | Phạm Văn Tài | Lái xe |
| 0900000006 | Lê Đức Vận | Lái xe |

Ở chế độ dev (`npm run dev`) trang đăng nhập có nút đăng nhập nhanh từng vai trò để demo. Bản build production ẩn các nút này
(bật lại bằng `VITE_DEMO_LOGIN=1`). Lái xe / xưởng đăng nhập sẽ vào thẳng giao diện điện thoại `/mobile`.

## Trước khi chạy thật
- Đặt `SECRET_KEY` (chuỗi ngẫu nhiên ≥ 32 ký tự), `DATABASE_URL` và mật khẩu PostgreSQL thật qua biến môi trường; tạo tài khoản thật, khóa / xóa tài khoản demo; đặt `ALLOW_DEMO_RESET=0` để tắt `/api/admin/reset` (xóa toàn bộ dữ liệu).
- Sao lưu DB định kỳ (`pg_dump`); lưu ảnh lên object storage thay vì thư mục `backend/uploads`
  (hiện ảnh phục vụ công khai theo tên file ngẫu nhiên, chưa kiểm quyền khi xem ảnh).
