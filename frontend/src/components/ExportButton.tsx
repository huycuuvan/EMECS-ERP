/* Nút "Xuất Excel" — tải file .xlsx thật từ server theo bộ lọc đang áp dụng trên màn hình.
   `params`: bộ lọc server hiểu (giống API danh sách). `ids` + `total`: khi màn hình lọc thêm phía giao diện
   (tìm kiếm, tab, lọc nhanh…) thì gửi mã các dòng đang hiển thị để file khớp đúng những gì người dùng thấy. */
import { App, Button } from 'antd'
import { Download } from 'lucide-react'
import { useExportXlsx } from '@/api/hooksEdit'
import type { ExportKind, ExportParams } from '@/api/typesEdit'

/** Quá nhiều mã thì bỏ `ids` (URL quá dài) — chỉ lọc theo `params`. */
const MAX_IDS = 400

export default function ExportButton({ kind, params, ids, total, label = 'Xuất Excel', size }: {
  kind: ExportKind; params?: ExportParams; ids?: string[]; total?: number; label?: string; size?: 'small' | 'middle'
}) {
  const { message } = App.useApp()
  const { run, loading } = useExportXlsx()
  const onClick = () => {
    const filtered = ids && total != null && ids.length < total
    if (filtered && !ids.length) return message.info('Không có dòng nào phù hợp bộ lọc để xuất')
    run(kind, { ...params, ...(filtered && ids.length <= MAX_IDS ? { ids: ids.join(',') } : {}) })
  }
  return <Button size={size} icon={<Download size={14} />} loading={loading} onClick={onClick}>{label}</Button>
}
