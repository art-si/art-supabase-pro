import type { JSONSchema } from 'monaco-editor/languages/features/json/register'
import { SETTING_DEFAULT_CONFIG } from '@/config/setting'
import { WEBSITE_CONFIG_DEFAULTS } from '@/config/website-config-defaults'

type FieldGuide = { description: string; values?: readonly (string | number | boolean)[] }

const appearanceGuide: Record<keyof typeof SETTING_DEFAULT_CONFIG, FieldGuide> = {
  menuType: {
    description: '主导航布局',
    values: ['left', 'header-left', 'top', 'top-left', 'dual-menu']
  },
  menuOpenWidth: { description: '侧边菜单展开宽度，单位 px，建议 180–320' },
  menuOpen: { description: '默认展开侧边菜单' },
  dualMenuShowText: { description: '双列菜单中显示文字标签' },
  systemThemeType: {
    description: '当前实际应用的主题；自动模式下由系统深浅色决定',
    values: ['auto', 'light', 'dark']
  },
  systemThemeMode: {
    description: '主题选择模式：跟随系统、浅色或深色',
    values: ['auto', 'light', 'dark']
  },
  menuThemeType: { description: '左侧菜单风格；默认暗色', values: ['dark', 'light', 'design'] },
  systemThemeColor: { description: '系统主色，使用 #RRGGBB 十六进制颜色' },
  showMenuButton: { description: '显示菜单折叠按钮' },
  showFastEnter: { description: '显示顶部快捷入口' },
  showRefreshButton: { description: '显示页面刷新按钮' },
  showCrumbs: { description: '显示面包屑导航' },
  showBreadcrumbIcon: { description: '面包屑中显示图标' },
  breadcrumbStyle: { description: '面包屑视觉风格', values: ['regular', 'background'] },
  showWorkTab: { description: '显示工作台多标签页' },
  showLanguage: { description: '显示语言切换入口' },
  showNprogress: { description: '页面切换时显示顶部进度条' },
  showSettingGuide: { description: '显示设置引导' },
  showFestivalText: { description: '显示节日提示文案' },
  watermarkVisible: { description: '显示页面水印' },
  autoClose: { description: '导航后自动收起移动端菜单' },
  uniqueOpened: { description: '菜单同一时间仅展开一个分组' },
  colorWeak: { description: '启用色弱模式' },
  refresh: { description: '页面刷新状态标记，属于运行时状态' },
  holidayFireworksLoaded: { description: '节日烟花加载标记，属于运行时状态' },
  boxBorderMode: { description: '卡片使用边框模式；false 为阴影模式' },
  pageTransition: {
    description: '页面切换动画',
    values: ['', 'fade', 'slide-left', 'slide-bottom', 'slide-top']
  },
  tabStyle: { description: '标签页样式', values: ['tab-default', 'tab-card', 'tab-google'] },
  customRadius: { description: '组件圆角，单位 rem', values: ['0', '0.25', '0.5', '0.75', '1'] },
  containerWidth: { description: '内容容器宽度', values: ['100%', '1200px'] },
  festivalDate: { description: '节日日期；留空表示不指定' }
}

const websiteGuide: Partial<Record<keyof typeof WEBSITE_CONFIG_DEFAULTS, FieldGuide>> = {
  siteName: { description: '网站完整名称' },
  siteShortName: { description: '导航和窄屏使用的简称' },
  siteDescription: { description: '网站简介' },
  logoUrl: { description: '网站 Logo 图片地址' },
  faviconUrl: { description: '浏览器标签页图标地址' },
  wordmarkImageEnabled: { description: '启用图片品牌字' },
  wordmarkLightUrl: { description: '浅色主题品牌字图片地址' },
  wordmarkDarkUrl: { description: '深色主题品牌字图片地址' },
  watermarkEnabled: { description: '启用业务页面水印' },
  watermarkContentType: {
    description: '水印内容来源',
    values: ['username', 'username_time', 'site_name', 'custom']
  },
  watermarkCustomText: { description: '自定义水印文案' },
  loginTitle: { description: '登录页标题' },
  loginSubtitle: { description: '登录页副标题' },
  loginDescription: { description: '登录页补充说明' },
  defaultLanguage: { description: '网站默认语言', values: ['zh', 'en'] },
  captchaEnabled: { description: '启用登录验证码' },
  captchaType: { description: '验证码服务类型', values: ['turnstile'] },
  turnstileSiteKey: { description: 'Cloudflare Turnstile 站点公钥' },
  turnstileSize: {
    description: '验证码组件尺寸',
    values: ['normal', 'compact', 'flexible', 'hidden']
  },
  turnstileTheme: { description: '验证码组件主题', values: ['auto', 'light', 'dark'] },
  captchaMaxAttempts: { description: '验证码触发前允许的失败次数；0 表示按现有策略处理' },
  captchaLockMinutes: { description: '触发限制后的锁定分钟数' },
  registerEnabled: { description: '允许新用户注册' },
  authChannels: { description: '第三方登录渠道列表，条目包含 key、provider、enabled 等字段' },
  maintenanceEnabled: { description: '启用维护模式' },
  maintenanceMessage: { description: '维护期间展示的提示文案' },
  seoTitle: { description: '搜索引擎页面标题' },
  seoKeywords: { description: '搜索引擎关键词，逗号分隔' },
  seoDescription: { description: '搜索引擎页面描述' },
  contactEmail: { description: '联系邮箱' },
  contactPhone: { description: '联系电话' },
  contactAddress: { description: '联系地址' },
  copyrightText: { description: '页脚版权文案' },
  icpRecord: { description: 'ICP备案号' },
  policeRecord: { description: '公安备案号' },
  enabled: { description: '启用网站配置' }
}

const geofenceGuide = {
  enabled: { description: '启用电子围栏策略' },
  loadingRadiusM: { description: '装货打卡半径，单位米' },
  unloadingRadiusM: { description: '卸货打卡半径，单位米' },
  loadingAllowOutsideCheckIn: { description: '允许在装货围栏外手动打卡' },
  unloadingAllowOutsideCheckIn: { description: '允许在卸货围栏外手动打卡' },
  autoConfirmLoading: { description: '进入装货围栏时自动确认' },
  autoConfirmUnloading: { description: '进入卸货围栏时自动确认' }
} satisfies Record<
  keyof Pick<
    Api.SystemManage.GeofenceConfigItem,
    | 'enabled'
    | 'loadingRadiusM'
    | 'unloadingRadiusM'
    | 'loadingAllowOutsideCheckIn'
    | 'unloadingAllowOutsideCheckIn'
    | 'autoConfirmLoading'
    | 'autoConfirmUnloading'
  >,
  FieldGuide
>

function createProperties(
  values: object,
  guide: Record<string, FieldGuide>
): Record<string, JSONSchema> {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const field = guide[key]
      const type = Array.isArray(value) ? 'array' : value === null ? 'string' : typeof value
      const schema: JSONSchema = { type, description: field?.description }
      if (field?.values) schema.enum = [...field.values]
      if (type === 'string' && !field?.values) schema.type = ['string', 'null']
      if (key === 'menuOpenWidth') {
        schema.minimum = 180
        schema.maximum = 320
      }
      if (key === 'systemThemeColor') schema.pattern = '^#[0-9a-fA-F]{6}$'
      return [key, schema]
    })
  )
}

const appearanceSchema: JSONSchema = {
  type: 'object',
  description: '界面外观设置；悬停字段名查看说明，输入值时按 Ctrl+Space 查看候选项。',
  properties: createProperties(SETTING_DEFAULT_CONFIG, appearanceGuide),
  additionalProperties: true
}

const websiteSchema: JSONSchema = {
  type: 'object',
  description: '网站品牌、登录、验证码和联系信息。',
  properties: createProperties(WEBSITE_CONFIG_DEFAULTS, websiteGuide),
  additionalProperties: true
}

websiteSchema.properties!.authChannels = {
  type: 'array',
  description: websiteGuide.authChannels?.description,
  items: {
    type: 'object',
    properties: {
      key: { type: 'string', description: '渠道唯一键，如 wechat、dingtalk、google' },
      label: { type: 'string', description: '登录页展示的渠道名称' },
      provider: {
        type: 'string',
        description: 'Supabase Auth 服务商；自定义渠道以 custom: 开头',
        enum: [
          'custom:wechat',
          'custom:dingtalk',
          'custom:wecom',
          'custom:feishu',
          'google',
          'azure',
          'github'
        ]
      },
      icon: { type: 'string', description: '渠道图标，使用 Iconify 图标名' },
      description: { type: ['string', 'null'], description: '渠道用途说明' },
      scopes: { type: ['string', 'null'], description: 'OAuth 授权范围，留空使用服务商默认值' },
      queryParamName: { type: ['string', 'null'], description: '授权请求的附加参数名' },
      queryParamValue: { type: ['string', 'null'], description: '授权请求的附加参数值' },
      enabled: { type: 'boolean', description: '是否向用户展示该登录渠道' },
      allowLinking: { type: 'boolean', description: '是否允许已登录用户关联该渠道' }
    },
    additionalProperties: true
  }
}

const geofenceSchema: JSONSchema = {
  type: 'object',
  description: '装卸货电子围栏策略。',
  properties: createProperties(
    {
      enabled: false,
      loadingRadiusM: 1000,
      unloadingRadiusM: 1000,
      loadingAllowOutsideCheckIn: false,
      unloadingAllowOutsideCheckIn: false,
      autoConfirmLoading: false,
      autoConfirmUnloading: false
    },
    geofenceGuide
  ),
  additionalProperties: true
}

export const getJsonParamSchema = (paramKey: string): JSONSchema | undefined =>
  ({
    'ui.appearance.config': appearanceSchema,
    'website.config': websiteSchema,
    'tms.geofence.config': geofenceSchema
  })[paramKey]
