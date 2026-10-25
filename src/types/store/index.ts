import type { AppRouteRecord } from '@/types/router'

/**
 * Store 状态类型定义模块
 *
 * 提供 Pinia Store 的状态类型定义
 *
 * ## 主要功能
 *
 * - 系统主题类型
 * - 菜单主题类型
 * - 设置状态类型
 * - 工作标签页类型
 * - 用户状态类型
 * - 菜单状态类型
 * - 根状态类型
 *
 * ## 使用场景
 *
 * - Store 状态类型约束
 * - 状态数据结构定义
 * - 类型提示和自动补全
 *
 * @module types/store/index
 */

import { MenuThemeEnum, SystemThemeEnum } from '@/enums/app-enum'
import { LocationQueryRaw } from 'vue-router'

/** 工作标签页视觉风格 */
export type WorkTabStyle = 'tab-default' | 'tab-card' | 'tab-google'

/** 面包屑视觉风格 */
export type BreadcrumbStyle = 'regular' | 'background'

// 系统主题样式（light | dark）
export interface SystemThemeType {
  /** 主题类名 */
  className: string
}

// 定义包含多个主题的类型
export type SystemThemeTypes = {
  [key in Exclude<SystemThemeEnum, SystemThemeEnum.AUTO>]: SystemThemeType
}

// 菜单主题样式
export interface MenuThemeType {
  /** 主题类型 */
  theme: MenuThemeEnum
  /** 背景颜色 */
  background: string
  /** 系统名称颜色 */
  systemNameColor: string
  /** 文本颜色 */
  textColor: string
  /** 图标颜色 */
  iconColor: string
  /** 背景图片 */
  img?: string
}

// 设置中心
export interface SettingState {
  /** 主题 */
  theme: string
  /** 是否只保持一个子菜单的展开 */
  uniqueOpened: boolean
  /** 是否显示菜单按钮 */
  menuButton: boolean
  /** 是否显示刷新按钮 */
  showRefreshButton: boolean
  /** 是否显示面包屑 */
  showCrumbs: boolean
  /** 是否显示面包屑图标 */
  showBreadcrumbIcon: boolean
  /** 面包屑视觉风格 */
  breadcrumbStyle: BreadcrumbStyle
  /** 是否自动关闭 */
  autoClose: boolean
  /** 是否显示工作标签页 */
  showWorkTab: boolean
  /** 是否显示语言切换 */
  showLanguage: boolean
  /** 是否显示进度条 */
  showNprogress: boolean
  /** 主题模式 */
  themeModel: string
}

// 多标签
export interface WorkTab {
  /** 标签标题 */
  title: string
  /** 自定义标题 */
  customTitle?: string
  /** 路由路径 */
  path: string
  /** 路由名称 */
  name: string
  /** 是否缓存 */
  keepAlive: boolean
  /** 是否固定标签 */
  fixedTab?: boolean
  /** 路由参数 */
  params?: object
  /** 路由查询参数 */
  query?: LocationQueryRaw
  /** 图标 */
  icon?: string
  /** 是否激活 */
  isActive?: boolean
}

// 用户Store状态
export interface UserState {
  /** 用户信息 */
  userInfo: Api.Auth.UserInfo | null
  /** 认证令牌 */
  token: string | null
  /** 用户角色列表 */
  roles: string[]
  /** 用户权限列表 */
  permissions: string[]
}

export interface DictMap extends Record<string, Api.DataCenter.DictListItem[] | undefined> {
  status?: Api.DataCenter.DictListItem[]
  sex?: Api.DataCenter.DictListItem[]
  userType?: Api.DataCenter.DictListItem[]
  sysUserIdentityType?: Api.DataCenter.DictListItem[]
  menuType?: Api.DataCenter.DictListItem[]
  i18nScope?: Api.DataCenter.DictListItem[]
  commonBoolean?: Api.DataCenter.DictListItem[]
  vehicleType?: Api.DataCenter.DictListItem[]
  vehicleOriginType?: Api.DataCenter.DictListItem[]
  vehicleColor?: Api.DataCenter.DictListItem[]
  vehicleBusinessType?: Api.DataCenter.DictListItem[]
  vehicleOperationStatus?: Api.DataCenter.DictListItem[]
  vehiclePurchaseStatus?: Api.DataCenter.DictListItem[]
  vehicleLevel?: Api.DataCenter.DictListItem[]
  vehicleFuelType?: Api.DataCenter.DictListItem[]
  vehicleEmissionStandard?: Api.DataCenter.DictListItem[]
  vehicleTransportIndustry?: Api.DataCenter.DictListItem[]
  vehicleOperationType?: Api.DataCenter.DictListItem[]
  vehicleAuditStatus?: Api.DataCenter.DictListItem[]
  vehicleRecordProcessed?: Api.DataCenter.DictListItem[]
  vehicleAccidentDataSource?: Api.DataCenter.DictListItem[]
  vehicleAccidentResponsibility?: Api.DataCenter.DictListItem[]
  vehicleMaintenanceType?: Api.DataCenter.DictListItem[]
  vehiclePartType?: Api.DataCenter.DictListItem[]
  vehiclePartQualityCategory?: Api.DataCenter.DictListItem[]
  vehiclePartUsageStatus?: Api.DataCenter.DictListItem[]
  vehiclePartEnableMode?: Api.DataCenter.DictListItem[]
  vehiclePartWarrantyMode?: Api.DataCenter.DictListItem[]
  parts_unit?: Api.DataCenter.DictListItem[]
  FILE_EXTENSION_LABEL_MAP?: Api.DataCenter.DictListItem[]
  systemParamGroup?: Api.DataCenter.DictListItem[]
  systemParamType?: Api.DataCenter.DictListItem[]
  tmsCarrierType?: Api.DataCenter.DictListItem[]
  tmsDriverLicenseType?: Api.DataCenter.DictListItem[]
  tmsCargoUnit?: Api.DataCenter.DictListItem[]
  tmsContractBillingMethod?: Api.DataCenter.DictListItem[]
  tmsContractCategory?: Api.DataCenter.DictListItem[]
  tmsContractBusinessType?: Api.DataCenter.DictListItem[]
  tmsContractTransportMode?: Api.DataCenter.DictListItem[]
  tmsCustomerPriceTransportType?: Api.DataCenter.DictListItem[]
  tmsCustomerPriceCargoType?: Api.DataCenter.DictListItem[]
  tmsCustomerPriceVehicleType?: Api.DataCenter.DictListItem[]
  tmsCustomerPriceVehicleLength?: Api.DataCenter.DictListItem[]
  tmsCustomerPriceBillingMethod?: Api.DataCenter.DictListItem[]
  tmsStationType?: Api.DataCenter.DictListItem[]
  tmsOrderDeliveryMethod?: Api.DataCenter.DictListItem[]
  tmsOrderPaymentMethod?: Api.DataCenter.DictListItem[]
  tmsOrderQuoteExpenseItem?: Api.DataCenter.DictListItem[]
  tmsOrderQuoteStatus?: Api.DataCenter.DictListItem[]
  tmsOrderTransportMode?: Api.DataCenter.DictListItem[]
  tmsOrderStatus?: Api.DataCenter.DictListItem[]
  tmsWaybillDispatchStatus?: Api.DataCenter.DictListItem[]
  tmsWaybillStatus?: Api.DataCenter.DictListItem[]
  tmsSettlementType?: Api.DataCenter.DictListItem[]
  tmsSettlementStatus?: Api.DataCenter.DictListItem[]
  tmsCashDirection?: Api.DataCenter.DictListItem[]
  tmsCashTransactionStatus?: Api.DataCenter.DictListItem[]
  tmsCashPaymentMethod?: Api.DataCenter.DictListItem[]
  tmsCarrierPaymentApplicationStatus?: Api.DataCenter.DictListItem[]
  tmsInvoiceDirection?: Api.DataCenter.DictListItem[]
  tmsInvoiceStatus?: Api.DataCenter.DictListItem[]
  tmsInvoiceType?: Api.DataCenter.DictListItem[]
  tmsWaybillCostType?: Api.DataCenter.DictListItem[]
  tmsCostAuditStatus?: Api.DataCenter.DictListItem[]
  tmsWaybillCostSettlementStatus?: Api.DataCenter.DictListItem[]
  fmsFundAccountType?: Api.DataCenter.DictListItem[]
  fmsFundAccountStatus?: Api.DataCenter.DictListItem[]
  fmsFundLedgerDirection?: Api.DataCenter.DictListItem[]
  fmsFundLedgerSourceType?: Api.DataCenter.DictListItem[]
  fmsFundTransferStatus?: Api.DataCenter.DictListItem[]
  fmsBankReconciliationStatus?: Api.DataCenter.DictListItem[]
  fmsBankStatementLineStatus?: Api.DataCenter.DictListItem[]
  fmsBankMatchType?: Api.DataCenter.DictListItem[]
  fmsFinancialStatementType?: Api.DataCenter.DictListItem[]
  fmsStatementMappingDirection?: Api.DataCenter.DictListItem[]
  fmsStatementDisplayStyle?: Api.DataCenter.DictListItem[]
  fmsStatementCalculationMethod?: Api.DataCenter.DictListItem[]
  fmsCashFlowDirection?: Api.DataCenter.DictListItem[]
  fmsBillDirection?: Api.DataCenter.DictListItem[]
  fmsBillType?: Api.DataCenter.DictListItem[]
  fmsBillStatus?: Api.DataCenter.DictListItem[]
  fmsBillEventType?: Api.DataCenter.DictListItem[]
  fmsAssetStatus?: Api.DataCenter.DictListItem[]
  fmsDepreciationMethod?: Api.DataCenter.DictListItem[]
  fmsDepreciationRunStatus?: Api.DataCenter.DictListItem[]
  fmsPayrollRunStatus?: Api.DataCenter.DictListItem[]
  fmsTaxType?: Api.DataCenter.DictListItem[]
  fmsTaxPeriodStatus?: Api.DataCenter.DictListItem[]
  fmsTaxLedgerDirection?: Api.DataCenter.DictListItem[]
  fmsPeriodCloseRunStatus?: Api.DataCenter.DictListItem[]
  fmsPeriodCloseCheckCode?: Api.DataCenter.DictListItem[]
  fmsPeriodCloseCheckStatus?: Api.DataCenter.DictListItem[]
}

// 设置Store状态
export interface SettingStoreState extends SettingState {
  // 额外的设置状态
  /** 菜单是否折叠 */
  collapsed: boolean
  /** 设备类型 */
  device: 'desktop' | 'mobile'
  /** 当前语言 */
  language: string
}

// 工作标签页Store状态
export interface WorkTabState {
  /** 标签页列表 */
  tabs: WorkTab[]
  /** 当前激活的标签页 */
  activeTab: string
  /** 缓存的标签页列表 */
  cachedTabs: string[]
}

// 菜单Store状态
export interface MenuState {
  /** 菜单列表 */
  menuList: AppRouteRecord[]
  /** 菜单是否已加载 */
  isLoaded: boolean
  /** 菜单是否折叠 */
  collapsed: boolean
}

// 根Store状态类型
export interface RootState {
  /** 用户状态 */
  user: UserState
  /** 设置状态 */
  setting: SettingStoreState
  /** 工作标签页状态 */
  workTab: WorkTabState
  /** 菜单状态 */
  menu: MenuState
}
