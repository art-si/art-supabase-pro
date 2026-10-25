import type { Ref, VNodeChild } from 'vue'
import type { DialogPropsPublic } from 'element-plus'
import type {
  ArtOverlayExpose,
  ArtOverlayOptions,
  ArtScrollOptions
} from '@/hooks/core/useArtOverlay'

export type ArtDialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

export interface ArtDialogOptions<TData = unknown> extends ArtOverlayOptions<
  TData,
  ArtDialogExpose<TData>
> {
  /** 弹窗标题 */
  title?: string
  /** 标题下方的辅助说明 */
  subtitle?: string
  /** 弹窗宽度 */
  width?: string | number
  /** 响应式尺寸预设；显式 width 的优先级更高 */
  size?: ArtDialogSize
  /** 是否全屏 */
  fullscreen?: boolean
  /** 是否显示全屏切换按钮，默认 true */
  showFullscreenButton?: boolean
  /** 进入全屏按钮提示文本 */
  fullscreenText?: string
  /** 退出全屏按钮提示文本 */
  exitFullscreenText?: string
  /** 内容区域最大高度，超过后启用滚动容器 */
  contentMaxHeight?: string | number
  /** 是否允许 ArtDialog 为内容区创建滚动容器；画布类内容可关闭 */
  useScrollbar?: boolean
  /** 路由切换时是否自动关闭，避免 KeepAlive 页面中的 Teleport 弹窗残留 */
  closeOnRouteChange?: boolean
  /** 单次打开时额外传递给 ElDialog 的属性 */
  dialogProps?: Partial<DialogPropsPublic> & Record<string, unknown>
}

export type ArtDialogProps<TData = unknown> = ArtDialogOptions<TData> &
  Partial<Omit<DialogPropsPublic, 'modelValue' | 'title' | 'width'>>

export interface ArtDialogExpose<TData = unknown> extends ArtOverlayExpose<
  TData,
  ArtDialogOptions<TData>
> {
  /** 底层 ElDialog 实例 Ref */
  dialogRef: Readonly<Ref<unknown>>
  /** 内容 ElScrollbar 实例 Ref */
  scrollbarRef: Readonly<Ref<unknown>>
  /** 当前是否全屏 */
  fullscreen: Readonly<Ref<boolean>>
  /** 当前是否为专注填单模式 */
  focusMode: Readonly<Ref<boolean>>
  /** 打开弹窗并传入本次数据与覆盖配置 */
  handleOpen: (data?: TData, options?: ArtDialogOptions<TData>) => Promise<void>
  /** 获取底层 ElDialog 实例 */
  getDialogInstance: () => unknown
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

export interface ArtDialogEmits<TData = unknown> {
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
  /** 全屏状态切换完成 */
  'fullscreen-change': [value: boolean]
  'focus-change': [value: boolean]
  'open-auto-focus': []
  'close-auto-focus': []
}

export interface ArtDialogSlotProps<TData = unknown> {
  /** 当前打开数据 */
  data: TData
  /** 弹窗公开操作 API */
  api: ArtDialogExpose<TData>
}

export interface ArtDialogSlots<TData = unknown> {
  default?: (props: ArtDialogSlotProps<TData> & { loading: boolean }) => VNodeChild
  header?: (props: ArtDialogSlotProps<TData>) => VNodeChild
  'header-actions'?: (props: ArtDialogSlotProps<TData>) => VNodeChild
  subtitle?: (props: ArtDialogSlotProps<TData>) => VNodeChild
  footer?: (props: ArtDialogSlotProps<TData> & { loading: boolean }) => VNodeChild
  'footer-left'?: (props: ArtDialogSlotProps<TData> & { loading: boolean }) => VNodeChild
}

export type { ArtScrollOptions }
