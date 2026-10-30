import { isEqual } from 'lodash-es'
import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
import { removeAttachmentRow } from '@/utils/file/attachment'

type AttachmentRow = Parameters<typeof removeAttachmentRow>[1]
type DraftContext = readonly (string | number | null | undefined)[]

interface DraftAttachmentRemovalOptions<T extends AttachmentRow> {
  getAttachments: () => readonly T[] | null | undefined
  setAttachments: (attachments: T[]) => void
  canRemove: () => boolean
  getContext: () => DraftContext
  action?: '删除' | '移除'
}

/** Unlink one unsaved attachment; this never deletes a stored file or business record. */
export function useDraftAttachmentRemoval<T extends AttachmentRow>(
  options: DraftAttachmentRemovalOptions<T>
): (row: T) => Promise<void> {
  const { confirmAction, confirmDelete } = useArtFeedback()
  const captureOperation = useTenantOperationGuard()

  return async (row: T): Promise<void> => {
    let isCurrentSnapshot: (() => boolean) | undefined
    try {
      const attachments = options.getAttachments()
      if (!options.canRemove() || !attachments?.includes(row)) return
      const context = [...options.getContext()]
      const isCurrentOperation = captureOperation()
      isCurrentSnapshot = () =>
        isCurrentOperation() &&
        options.getAttachments() === attachments &&
        isEqual(options.getContext(), context) &&
        attachments.includes(row) &&
        options.canRemove()
      if (options.action === '移除') {
        await confirmAction(`确定移除附件“${row.name}”吗？`, '移除附件', {
          confirmButtonText: '移除'
        })
      } else {
        await confirmDelete(`确定删除附件“${row.name}”吗？`)
      }
      if (!isCurrentSnapshot()) return
      options.setAttachments(removeAttachmentRow(attachments, row))
    } catch (error) {
      if (error === 'cancel' || error === 'close') return
      try {
        if (isCurrentSnapshot && !isCurrentSnapshot()) return
      } catch {
        // A failed state getter must not replace the original action error or escape this handler.
      }
      notifyFriendlyError(error, '附件移除失败，请重试')
    }
  }
}
