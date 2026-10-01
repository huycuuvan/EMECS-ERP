# Quy ước frontend — STEEL ONE (React + Vite + TS + antd v6)

Nguồn sự thật nghiệp vụ & giao diện: bản demo HTML khách đã duyệt ở `../Cơ khí thép/`
(`docs/spec.md`, `pages/*.html`, `assets/js/steel-data.js`, `assets/js/layout.js`, `assets/css/style.css`).
Mục tiêu: **giữ nguyên nội dung, số liệu, thuật ngữ, bố cục** của từng trang demo, dựng lại bằng antd + API thật.

## Chạy
- Backend: `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000` (đã chạy sẵn ở :8000)
- Frontend: `cd frontend && npm run dev` (đã chạy sẵn ở :5173, proxy `/api` + `/uploads` → :8000)
- Typecheck: `cd frontend && npx tsc -b` — PHẢI sạch lỗi ở file bạn sở hữu trước khi báo xong.
- Gọi thử API: `curl -s localhost:8000/api/contracts/HD-2609-01 | python3 -m json.tool | head`
- Khôi phục dữ liệu demo sau khi thử mutation: `curl -s -X POST localhost:8000/api/admin/reset`

## File dùng chung — KHÔNG sửa (nếu thiếu gì, ghi vào báo cáo cuối cho người điều phối)
`src/api/*`, `src/lib/*`, `src/components/ui.tsx`, `src/components/PhotoBlock.tsx`, `src/peek/{PeekProvider,PeekShell,RecordLink,context,meta,registry}.tsx|ts`,
`src/layout/*`, `src/App.tsx`, `src/main.tsx`, `src/theme.ts`, `src/index.css`, `backend/*`.
Chỉ sửa/tạo file được giao. File phụ riêng của bạn: đặt trong `src/pages/<tên-trang>/` hoặc `src/peek/drawers/<tên>/` (tạo thư mục mới).

## Dùng gì
- Dữ liệu: hook trong `src/api/hooks.ts` (useContracts, useContract(id) = contractAgg, useLedger, useWeighings…, và mutation useXxx). Mutation đã tự toast + invalidate cache — không tự gọi message.success lần nữa.
- Kiểu: `src/api/types.ts` (khớp backend). Danh sách phiếu cân / thẻ lái xe KHÔNG kèm ảnh (`photo=null`, dùng `hasPhoto`); drawer lấy ảnh bằng `useWeighing(id)` / `useTask(id)`.
- Định dạng: `src/lib/format.ts` — fmtD, fmtDT, fmtKg, fmtT, fmtDelta, money, moneyShort, relTime, daysLeft, hoursOver.
- Đăng nhập: `useAuth()` → `user`, `roles`, `hasRole(r)` (admin luôn true), `logout()`. Quyền thật kiểm ở server (`backend/app/security.py`) — UI chỉ ẩn/khóa nút cho khớp, nút phải ẩn đúng với quy tắc server (vd giao thẻ / phát lệnh SX / ký sai lệch = `hasRole('admin')`).
- Phân quyền: `useAuth().can('<nav-id>', 'edit'|'full')` — ẩn/disable nút thao tác theo vai trò như demo (nav-id: dashboard, don-hang, hop-dong, lsx, tiep-nhan, phieu-can, kho-ao, van-chuyen, doi-ung-ma, bao-cao, sai-lech).
- UI chung `src/components/ui.tsx`: PageHeader, Kpi + KpiGrid (tone: ink|rust|moss|amber|signal|steel), StatusTag, DueChip, AdvChip, Cell + CellGrid (ô thông tin drawer), Sec (tiêu đề mục), Bar (progress), DeltaKg.
- Ảnh phiếu: `PhotoBlock` (xem/tải/ảnh demo/xóa) và `PhotoInput` (dùng trong Form.Item).
- Drawer bản ghi: bọc nội dung bằng `PeekShell` (`type`, `id`, `status`, `sub`, `actions`, `loading`, `notFound`). Mở drawer khác: `usePeek().open('hd', id)` hoặc `<RecordLink id="HD-2609-01" />` (tự suy loại từ tiền tố). Bấm dòng bảng → `open(type, row.id)` (dùng `onRow={(r)=>({onClick:()=>open('pc', r.id)})}` + `rowClassName="clickable-row"`).
- Icon: `lucide-react` (cùng bộ icon với demo, tên PascalCase: `Scale`, `Truck`…).
- antd v6: Drawer dùng `size` (không phải width); Modal/Popconfirm/Form bình thường; lấy `message`/`modal` qua `App.useApp()`.
- Biểu đồ: không có thư viện chart — dùng Progress/thanh CSS/SVG tự vẽ đơn giản như demo (ERPCharts trong demo là SVG thuần).

## Quy tắc giao diện (từ docs/spec.md của demo)
- Màn đầu mỗi chức năng = DANH SÁCH bản ghi (Table antd, có ô tìm kiếm + bộ lọc như demo); bấm dòng mở drawer.
- Số quá hạn / lệch / kém → màu đỏ `var(--signal)` và BẤM ĐƯỢC để mở bản ghi gốc.
- Tiếng Việt 100%, thuật ngữ đúng như demo. Số dùng `className="num"` (tabular-nums). Mã bản ghi dùng `RecordLink`.
- Lý do lệch / từ chối là dropdown từ `useMeta()` (reasonsCan, reasonsTuChoiSx, reasonsTuChoiLx, vlossResolutions) + ô ghi chú.
- Form tạo/sửa: `Modal` + `Form` antd, validate bắt buộc như demo; nút chính màu rust (type="primary").
- Không dùng localStorage cho dữ liệu nghiệp vụ — mọi thứ qua API.
