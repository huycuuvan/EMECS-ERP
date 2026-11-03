/** Bản demo (npm run dev hoặc build với VITE_DEMO_LOGIN=1): đăng nhập nhanh tài khoản demo, nút "Ảnh demo", làm mới dữ
    liệu demo, các nút chưa làm thật (xuất PDF, in sổ). Bản chạy thật (VITE_DEMO_LOGIN=0) ẩn hết. */
export const DEMO = import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === '1'
