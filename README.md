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

## Chức năng chính
- Đơn hàng → hợp đồng & tạm ứng → lệnh sản xuất → phiếu tiếp nhận → phiếu cân trạm → thẻ lái xe (đi mạ / giao khách)
  → sai lệch (Quản lý ký) → kho ảo chênh lệch; đối ứng 3 số cân, sổ luân chuyển thép, công nợ theo khối lượng giao.
- Sửa chứng từ có **lịch sử chỉnh sửa** (ai, lúc nào, cũ → mới, lý do; sửa số kg bắt buộc lý do và tự lập / cập nhật biên bản sai lệch).
- Giao lại thẻ lái xe / phát lại lệnh SX bị từ chối; **xuất Excel** (.xlsx) mọi danh sách.
- Danh mục: khách hàng & nhãn (Khách thân thiết / Khách lẻ… — lọc đơn hàng, hợp đồng, dashboard), xe (số tấn theo từng xe),
  xưởng mạ; nguyên liệu mua vào + thống kê.
- Cảnh báo cuối ngày tự động (lệnh SX chưa cập nhật / trễ hạn, hợp đồng đến hạn, thẻ / phiếu cân quá hạn) gửi theo vai trò.
- Đăng nhập, phân quyền server, nhật ký thao tác; web responsive dùng trên điện thoại.

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

## Triển khai lên máy chủ (Docker)

Cần 1 máy chủ Linux có Docker (2 vCPU / 4 GB RAM là đủ cho giai đoạn đầu).

```bash
git clone https://github.com/huycuuvan/EMECS-ERP.git && cd EMECS-ERP && cp .env.example .env
```

Sửa `.env` (bắt buộc `POSTGRES_PASSWORD`, `SECRET_KEY`), rồi:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

- `frontend` (nginx) phục vụ giao diện ở cổng `HTTP_PORT` và chuyển `/api`, `/uploads` sang `backend`.
- `backend` tự chạy migration khi khởi động; DB trống thì nạp dữ liệu demo (tài khoản ở bảng trên — **đổi mật khẩu / khóa ngay** khi chạy thật).
- `backup` sao lưu DB mỗi ngày vào `./backups` (giữ `BACKUP_KEEP_DAYS` ngày). Khôi phục:
  `gunzip -c backups/steel_YYYYMMDD_HHMM.sql.gz | docker compose -f docker-compose.prod.yml exec -T db psql -U steel -d steel_one`
- Ảnh phiếu lưu trong volume `uploads`; link ảnh trả ra API có chữ ký + hết hạn 12 giờ (người ngoài không xem được).
- Nên đặt sau reverse proxy có HTTPS (Caddy / Nginx + Let's Encrypt) và trỏ tên miền; đặt `CORS_ORIGINS` theo tên miền đó.
- Bản demo cho khách xem: đặt `ALLOW_DEMO_RESET=1` và `VITE_DEMO_LOGIN=1` trong `.env`.
- Cảnh báo cuối ngày: chạy lúc `END_OF_DAY_HOUR` (mặc định 17h, giờ Việt Nam); tắt bằng `ALERTS_ENABLED=0`.

## Triển khai tách: frontend Vercel + backend Railway/Render

Vercel chỉ dùng cho **frontend** (backend cần ổ lưu ảnh, tiến trình cảnh báo 17h và PostgreSQL — không chạy được trên Vercel).

1. **Backend** (Railway hoặc Render — dịch vụ Docker, thư mục gốc `backend/`):
   - Tạo PostgreSQL trên cùng nền tảng → đặt `DATABASE_URL` dạng `postgresql+psycopg://user:pass@host:5432/db`
     (nếu nền tảng cấp `postgres://…` thì đổi tiền tố thành `postgresql+psycopg://`).
   - Đặt `SECRET_KEY`, `ALLOW_DEMO_RESET` (1 cho bản demo), `TZ=Asia/Ho_Chi_Minh`.
   - Gắn **volume / disk** vào `/app/uploads` để ảnh phiếu không mất khi deploy lại.
   - Kiểm tra: `https://<domain-backend>/health` trả `{"ok": true}`.
2. **Frontend** (Vercel): Import repo → *Root Directory* = `frontend` → sửa 3 chỗ `THAY-BANG-DOMAIN-BACKEND`
   trong `frontend/vercel.json` thành domain backend → Deploy. Bản demo cho khách: thêm biến môi trường
   `VITE_DEMO_LOGIN=1` (hiện nút đăng nhập nhanh) rồi deploy lại.

Vercel chuyển tiếp `/api` và `/uploads` sang backend nên trình duyệt chỉ thấy một tên miền — không cần cấu hình CORS.

## Trước khi chạy thật
- Đặt `SECRET_KEY` (chuỗi ngẫu nhiên ≥ 32 ký tự), `DATABASE_URL` và mật khẩu PostgreSQL thật qua biến môi trường; tạo tài khoản thật, khóa / xóa tài khoản demo; đặt `ALLOW_DEMO_RESET=0` để tắt `/api/admin/reset` (xóa toàn bộ dữ liệu).
- Khi nhiều người dùng / nhiều máy chủ: chuyển ảnh sang object storage (S3/MinIO) thay vì volume `uploads`.
