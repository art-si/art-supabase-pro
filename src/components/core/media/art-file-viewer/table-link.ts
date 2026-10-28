import type { TableColumnLink } from '@/types'
import type { FilePreviewTarget } from '@/hooks/core/useFilePreview'
import { resolveFileActionUrl, viewAttachment } from '@/utils/file'

/** ArtTable 附件名称列统一使用的预览入口。 */
export const attachmentTableLink: TableColumnLink<FilePreviewTarget> = {
  onClick: viewAttachment,
  disabled: (file) => !resolveFileActionUrl(file.url, window.location.href),
  title: (file) =>
    resolveFileActionUrl(file.url, window.location.href)
      ? `预览${file.name?.trim() || '附件'}`
      : '附件地址不可用，请重新上传或联系提供者'
}
