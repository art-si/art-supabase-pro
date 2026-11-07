import type { DialogEmits } from 'element-plus'

export type Resource = Api.DataCenter.Resources.ResourceListItem

export interface FileType {
  value: string
  label: string | (() => string)
  suffix: string
  icon?: string
  [key: string]: unknown
}

// 定义 Props 类型
export interface ResourcePanelProps {
  resourceTenantId?: string
  /** Permission capabilities supplied by a host application; defaults preserve native pro behavior. */
  canView?: boolean
  canUpload?: boolean
  canRename?: boolean
  canDelete?: boolean
  multiple?: boolean
  limit?: number
  pageSize?: number
  internalScroll?: boolean
  showAction?: boolean
  showCopyActions?: boolean
  showPasteUpload?: boolean
  showRenameAction?: boolean
  dbClickConfirm?: boolean
  defaultFileType?: string
  fileTypes?: FileType[]
  /** 可选的外部底部栏挂载点，用于让弹窗内的分页、上传与确认操作保持可见 */
  footerTarget?: string | HTMLElement
}

export interface ResourcePanelEmits {
  cancel: () => void
  confirm: (value: Resource[]) => void
}

export interface ResourcePickerProps extends ResourcePanelProps {
  visible: boolean
}
export interface ResourcePickerEmits extends ResourcePanelEmits, DialogEmits {}
