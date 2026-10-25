import type { Ref, VNodeChild } from 'vue'
import type { DrawerPropsPublic } from 'element-plus'
import type {
  ArtOverlayExpose,
  ArtOverlayOptions,
  ArtScrollOptions
} from '@/hooks/core/useArtOverlay'

export type ArtDrawerSizePreset = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface ArtDrawerOptions<TData = unknown> extends ArtOverlayOptions<
  TData,
  ArtDrawerExpose<TData>
> {
  /** 抽屉标题 */
  title?: string
  /** 默认头部的业务图标；自定义 header 插槽优先 */
  headerIcon?: string
  /** 标题下方的辅助说明 */
  subtitle?: string
  /** 抽屉尺寸 */
  size?: string | number | ArtDrawerSizePreset
  /** 是否全屏 */
  fullscreen?: boolean
  /** 是否显示全屏切换按钮 */
  showFullscreenButton?: boolean
  /** 进入全屏按钮提示文本 */
  fullscreenText?: string
  /** 退出全屏按钮提示文本 */
  exitFullscreenText?: string
  /** 抽屉打开方向 */
  direction?: 'ltr' | 'rtl' | 'ttb' | 'btt'
  /** 单次打开时额外传递给 ElDrawer 的属性 */
  drawerProps?: Partial<DrawerPropsPublic> & Record<string, unknown>
}

export type ArtDrawerProps<TData = unknown> = ArtDrawerOptions<TData> &
  Partial<Omit<DrawerPropsPublic, 'modelValue' | 'title' | 'size' | 'direction'>>

export interface ArtDrawerExpose<TData = unknown> extends ArtOverlayExpose<
  TData,
  ArtDrawerOptions<TData>
> {
  /** 底层 ElDrawer 实例 Ref */
  drawerRef: Readonly<Ref<unknown>>
  /** 内容 ElScrollbar 实例 Ref */
  scrollbarRef: Readonly<Ref<unknown>>
  /** 当前是否全屏 */
  fullscreen: Readonly<Ref<boolean>>
  /** 当前是否为专注填单模式 */
  focusMode: Readonly<Ref<boolean>>
  /** 打开抽屉并传入本次数据与覆盖配置 */
  handleOpen: (data?: TData, options?: ArtDrawerOptions<TData>) => Promise<void>
  /** 获取底层 ElDrawer 实例 */
  getDrawerInstance: () => unknown
  /** 设置全屏状态 */
  setFullscreen: (value: boolean) => void
  /** 切换全屏状态 */
  toggleFullscreen: () => void
  /** 设置专注填单模式；退出时恢复进入前的全屏状态 */
  setFocusMode: (value: boolean) => void
  toggleFocusMode: () => void
  /** 控制内容滚动位置 */
  scrollTo: (options: ArtScrollOptions) => void
}

export interface ArtDrawerEmits<TData = unknown> {
  /** 打开动画开始 */
  open: [data: TData]
  /** 打开动画结束 */
  opened: [data: TData]
  /** 关闭动画开始 */
  close: [data: TData]
  /** 关闭动画结束 */
  closed: []
  /** 开始执行确认流程 */
  confirm: [data: TData]
  /** 数据重置完成 */
  reset: []
  /** 打开、关闭或确认回调发生异常 */
  error: [error: unknown]
  'open-auto-focus': []
  'close-auto-focus': []
  'resize-start': [event: MouseEvent, size: number]
  resize: [event: MouseEvent, size: number]
  'resize-end': [event: MouseEvent, size: number]
  'fullscreen-change': [value: boolean]
  'focus-change': [value: boolean]
}

export interface ArtDrawerSlotProps<TData = unknown> {
  /** 当前打开数据 */
  data: TData
  /** 抽屉公开操作 API */
  api: ArtDrawerExpose<TData>
}

export interface ArtDrawerSlots<TData = unknown> {
  default?: (props: ArtDrawerSlotProps<TData> & { loading: boolean }) => VNodeChild
  header?: (props: ArtDrawerSlotProps<TData>) => VNodeChild
  subtitle?: (props: ArtDrawerSlotProps<TData>) => VNodeChild
  footer?: (props: ArtDrawerSlotProps<TData> & { loading: boolean }) => VNodeChild
}

export type { ArtScrollOptions }
