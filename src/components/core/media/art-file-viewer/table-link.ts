import type { TableColumnLink } from '@/types'
import type { FilePreviewTarget } from '@/hooks/core/useFilePreview'
import { viewAttachment } from '@/utils/file'

/** ArtTable 附件名称列统一使用的预览入口。 */
export const attachmentTableLink: TableColumnLink<FilePreviewTarget> = {
  onClick: viewAttachment,
  disabled: (file) => !file.url,
  title: (file) => `预览${file.name?.trim() || '附件'}`
}
