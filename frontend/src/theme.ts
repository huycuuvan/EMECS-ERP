import type { ThemeConfig } from 'antd'

/** Bảng màu "Industrial Press" lấy từ bản demo (assets/css/style.css). Dùng qua CSS var trong global.css. */
export const C = {
  paper: '#f5f1e8', paper2: '#ece7d7', paper3: '#e0dac6', canvas: '#fbfaf5',
  ink: '#14130f', ink2: '#1f1d18', ink3: '#2b2820',
  ash: '#6b665b', ash2: '#918b7e', ash3: '#b8b2a2',
  rule: '#d8d2c0', ruleSoft: '#e8e3d3', ruleHair: '#efebde',
  rust: '#c5400a', rust2: '#e85a2a', rustSoft: '#f4e2d6', rustDeep: '#8a2d07',
  moss: '#2f5d3a', mossSoft: '#dde8d8',
  amber: '#9c7714', amberSoft: '#f0e6c4',
  signal: '#8a1f1f', signalSoft: '#efd5d5',
  steel: '#4a5560', steelSoft: '#e0e5ea',
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
      darkItemColor: '#cfc9b9', darkItemHoverColor: '#ffffff', darkGroupTitleColor: C.ash2,
      itemBorderRadius: 8,
    },
    Table: {
      headerBg: C.paper2, headerColor: C.ash, rowHoverBg: '#f3eee0', borderColor: C.ruleHair,
      headerSplitColor: 'transparent', cellPaddingBlock: 12,
    },
    Card: { colorBorderSecondary: C.rule },
    Button: { primaryShadow: 'none', defaultShadow: 'none', fontWeight: 600 },
    Tag: { defaultBg: C.paper2 },
    Drawer: { colorBgElevated: C.paper },
    Tabs: { itemSelectedColor: C.ink, inkBarColor: C.rust },
  },
}
