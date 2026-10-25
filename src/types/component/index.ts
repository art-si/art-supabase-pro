/**
 * 组件类型定义模块
 *
 * 提供项目组件的类型定义
 *
 * ## 主要功能
 *
 * - 表格列配置类型
 * - 分页配置类型
 *
 * ## 使用场景
 *
 * - 组件 Props 类型约束
 * - 组件配置类型定义
 * - 组件事件参数类型
 *
 * @module types/component/index
 */

export type DictDisplayMode = 'auto' | 'tag' | 'badge' | 'text'

// 通用组件配置默认服务于元数据驱动场景，未知行结构由调用处通过泛型收窄。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentRecord = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ComponentValue = any

export interface DictColumnOption<T = ComponentRecord> {
  /** 字典类型编码 */
  code: string
  /** auto: 标签样式优先，其次文字颜色 Badge，最后普通文字 */
  display?: DictDisplayMode
  /** 动态指定用于匹配字典项的值，默认读取当前列 prop */
  value?: (row: T) => string | number | null | undefined
}

/** 将表格的文本单元格作为查看入口；无权限或禁用时仍显示原始文本。 */
export interface TableColumnLink<T = ComponentRecord> {
  onClick: (row: T) => void | Promise<void>
  permission?: string
  disabled?: (row: T) => boolean
  title?: (row: T) => string
}

/** 编辑表格列校验时提供给业务规则的上下文。 */
export interface TableColumnValidationContext<T = ComponentRecord> {
  row: T
  rowIndex: number
  prop: string
  value: unknown
}

export type TableColumnValidationMessage<T = ComponentRecord> =
  string | ((context: TableColumnValidationContext<T>) => string)

/** 编辑表格列的自定义校验规则；返回 true/void 表示通过，false 或字符串表示失败。 */
export interface TableColumnValidationRule<T = ComponentRecord> {
  validator: (
    context: TableColumnValidationContext<T>
  ) => boolean | string | void | Promise<boolean | string | void>
  message?: TableColumnValidationMessage<T>
}

// 表格列配置接口
export interface ColumnOption<T = ComponentRecord> {
  /** Optional current-page filter supplied by the table's column profile. */
  filterType?: import('../table-column-config').TableColumnFilterType
  // 列类型
  type?: 'selection' | 'expand' | 'index' | 'globalIndex'
  // 列属性名
  prop?: string
  // 列标题
  label?: string
  // 编辑型表格中的必填列；表头会以与表单一致的红色星号提示
  required?: boolean
  // 必填校验失败提示；支持根据当前行生成业务提示
  requiredMessage?: TableColumnValidationMessage<T>
  // 业务自定义校验规则；由 ArtTable.validate / validateField 触发
  rules?: TableColumnValidationRule<T> | TableColumnValidationRule<T>[]
  // 分组表头子列
  children?: ColumnOption<T>[]
  // 列宽度
  width?: string | number
  // 最小列宽度
  minWidth?: string | number
  // 固定列
  fixed?: boolean | 'left' | 'right'
  // 是否可排序
  sortable?: boolean | 'custom'
  // 是否展示行拖拽手柄，默认 false；支持按行动态控制
  draggable?: boolean | ((row: T) => boolean)
  // 是否禁用当前行拖拽，默认 false；支持按行动态控制
  dragDisabled?: boolean | ((row: T) => boolean)
  // 行拖拽手柄图标
  dragIcon?: string
  // 过滤器选项
  filters?: ComponentValue[]
  // 过滤方法
  filterMethod?: (value: ComponentValue, row: T) => boolean
  // 过滤器位置
  filterPlacement?: string
  // 是否禁用
  disabled?: boolean
  // 是否显示列
  visible?: boolean
  // 是否选中显示
  checked?: boolean
  // 自定义渲染函数
  formatter?: (row: T) => ComponentValue
  // 字典展示配置
  dict?: DictColumnOption<T>
  // 文本列的链接式查看入口，与同行的查看操作复用同一个业务回调
  link?: TableColumnLink<T>
  // 插槽相关配置
  // 是否使用插槽渲染内容
  useSlot?: boolean
  // 插槽名称（默认为 prop 值）
  slotName?: string
  // 是否使用表头插槽
  useHeaderSlot?: boolean
  // 表头插槽名称（默认为 `${prop}-header`）
  headerSlotName?: string
  // 其他属性
  [key: string]: ComponentValue
}

// 分页配置
export interface PaginationConfig {
  // 当前页
  currentPage: number
  // 每页条数
  pageSize: number
  // 总条数
  total: number
  // 每页显示个数选择器的选项
  pageSizes?: number[]
  // 组件布局
  layout?: string
  // 是否为小型分页
  small?: boolean
}
