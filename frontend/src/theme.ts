import type { ThemeConfig } from 'antd'

/** Bảng màu EMECS Việt Nam (phương án A): đỏ thương hiệu + vàng điểm nhấn trên nền trung tính. Tên khóa giữ như cũ
 *  (rust = màu chính, signal = cảnh báo, paper/ink = nền/chữ). Đồng bộ với biến CSS trong index.css. */
export const C = {
  paper: '#f6f6f5', paper2: '#ececeb', paper3: '#dfdfdd', canvas: '#ffffff',
  ink: '#17181c', ink2: '#212329', ink3: '#2c2f36',
  ash: '#62656d', ash2: '#8b8e96', ash3: '#b5b7bd',
  rule: '#dcdde0', ruleSoft: '#e7e8ea', ruleHair: '#f0f0f1',
  rust: '#d11a24', rust2: '#e30f1b', rustSoft: '#fbe3e4', rustDeep: '#9b111a',
  moss: '#1e6b3a', mossSoft: '#e6f4ea',
  amber: '#8a6100', amberSoft: '#fff3c4',
  signal: '#a3121b', signalSoft: '#fde4e4',
  steel: '#4b5563', steelSoft: '#e5e7eb',
  yellow: '#ffd200', // vàng tia sét EMECS — điểm nhấn (vạch menu đang chọn), không dùng cho chữ trên nền sáng
}

export const FF_SANS = "'Geist', 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif"
export const FF_MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', monospace"

export const theme: ThemeConfig = {
  token: {
    colorPrimary: C.rust,
    colorSuccess: C.moss,
    colorWarning: C.amber,
    colorError: C.signal,
    colorInfo: C.steel,
    colorText: C.ink,
    colorTextSecondary: C.ash,
    colorTextTertiary: C.ash2,
    colorBorder: C.rule,
    colorBorderSecondary: C.ruleSoft,
    colorBgLayout: C.paper,
    colorBgContainer: C.canvas,
    colorBgElevated: C.canvas,
    colorFillAlter: C.paper2,
    colorLink: C.rust,
    fontFamily: FF_SANS,
    fontFamilyCode: FF_MONO,
    fontSize: 14,
    borderRadius: 8,
    borderRadiusLG: 12,
  },
  components: {
    Layout: { siderBg: C.ink, headerBg: C.paper, bodyBg: C.paper, headerHeight: 60, headerPadding: '0 24px' },
    Menu: {
      darkItemBg: C.ink, darkSubMenuItemBg: C.ink, darkItemSelectedBg: C.rust,
      darkItemColor: '#c9cbd1', darkItemHoverColor: '#ffffff', darkGroupTitleColor: C.ash2,
      itemBorderRadius: 8,
    },
    Table: {
      headerBg: C.paper2, headerColor: C.ash, rowHoverBg: '#f7f7f8', borderColor: C.ruleHair,
      headerSplitColor: 'transparent', cellPaddingBlock: 12,
    },
    Card: { colorBorderSecondary: C.rule },
    // viền ô đang nhập dùng than chì — màu chính là đỏ nên viền đỏ dễ bị hiểu nhầm là đang báo lỗi
    Input: { activeBorderColor: C.ink3, hoverBorderColor: C.ash2, activeShadow: '0 0 0 2px rgba(23, 24, 28, .08)' },
    InputNumber: { activeBorderColor: C.ink3, hoverBorderColor: C.ash2, activeShadow: '0 0 0 2px rgba(23, 24, 28, .08)' },
    Select: { activeBorderColor: C.ink3, hoverBorderColor: C.ash2, activeOutlineColor: 'rgba(23, 24, 28, .08)' },
    DatePicker: { activeBorderColor: C.ink3, hoverBorderColor: C.ash2, activeShadow: '0 0 0 2px rgba(23, 24, 28, .08)' },
    Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 600 },
    Tag: { defaultBg: C.paper2 },
    Drawer: { colorBgElevated: C.paper },
    Tabs: { itemSelectedColor: C.ink, inkBarColor: C.rust },
  },
}
