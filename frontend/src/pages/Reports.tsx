/* Báo cáo đối ứng & Quá hạn — port pages/09-bao-cao.html (3 tab: đối ứng phiếu theo kỳ · quá hạn & thiếu số liệu · sức khỏe hợp đồng). */
import { App, Button, Tabs } from 'antd'
import { AlarmClock, ArrowLeftRight, Download, HeartPulse, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/ui'
import HealthTab from './reports/HealthTab'
import OverdueTab from './reports/OverdueTab'
import PeriodTab from './reports/PeriodTab'
import VehicleTab from './reports/VehicleTab'

const lbl = (icon: ReactNode, text: string) => <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{icon}{text}</span>

export default function Reports() {
  const { message } = App.useApp()
  const [params] = useSearchParams()
  return (
    <div>
      <PageHeader title="Báo cáo đối ứng & Quá hạn"
        desc="Đối ứng phiếu qua 4 tầng cân · điểm mặt thẻ/phiếu quá hạn theo người · sức khỏe từng hợp đồng"
        extra={<Button icon={<Download size={14} />} onClick={() => message.info('Demo: xuất báo cáo PDF gửi Quản lý A')}>Xuất PDF</Button>} />
      <Tabs defaultActiveKey={params.get('tab') === 'xe' ? 'xe' : 't1'} items={[
        { key: 't1', label: lbl(<ArrowLeftRight size={13} />, 'Đối ứng phiếu theo kỳ'), children: <PeriodTab /> },
        { key: 't2', label: lbl(<AlarmClock size={13} />, 'Quá hạn & thiếu số liệu'), children: <OverdueTab /> },
        { key: 't3', label: lbl(<HeartPulse size={13} />, 'Sức khỏe hợp đồng'), children: <HealthTab /> },
        { key: 'xe', label: lbl(<Truck size={13} />, 'Theo xe'), children: <VehicleTab /> },
      ]} />
    </div>
  )
}
