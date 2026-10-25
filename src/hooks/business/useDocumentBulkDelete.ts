import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import { uniqBy } from 'lodash-es'
import { ElMessage } from 'element-plus'
import { useAuth } from '@/hooks/core/useAuth'
import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
import type { MasterDataDeleteResource } from '@/components/business/master-data-delete-guard/index.vue'
import type { ArtTableQueryHeaderAction } from '@/components/core/tables/art-table-query/index.vue'

interface DocumentBulkDeleteOptions {
  permission: MaybeRefOrGetter<string>
  resourceLabel: MaybeRefOrGetter<string>
  idKey: 'id' | 'documentId'
  busy: MaybeRefOrGetter<boolean>
  canDelete?: (row: Record<string, unknown>) => boolean
  inspect: (resources: MasterDataDeleteResource[]) => Promise<boolean>
  remove: (id: string) => Promise<unknown>
  refresh: () => Promise<void>
  clearSelection: () => void
}

/** Both list modes delete whole draft documents; detail rows are deduplicated first. */
export function useDocumentBulkDelete(options: DocumentBulkDeleteOptions) {
  const deleting = ref(false)
  const { hasAuth } = useAuth()
  const { confirmDelete } = useArtFeedback()
  const action = (): ArtTableQueryHeaderAction => ({
    key: 'bulk-delete',
    icon: 'ri:delete-bin-line',
    buttonProps: { type: 'danger', plain: true },
    selectionRequired: true,
    label: '批量删除',
    permission: toValue(options.permission),
    confirm: false,
    disabled: ({ selectedRows }) =>
      deleting.value ||
      toValue(options.busy) ||
      selectedRows.some(
        (row) => row.status !== 'draft' || (options.canDelete && !options.canDelete(row))
      ),
    onClick: async ({ selectedRows }) => {
      if (deleting.value || toValue(options.busy)) return
      const permission = toValue(options.permission)
      const label = toValue(options.resourceLabel)
      if (!hasAuth(permission)) {
        ElMessage.error('当前账号无权删除这些单据，请刷新后重试')
        return
      }
      if (
        !selectedRows.length ||
        selectedRows.some(
          (row) =>
            typeof row[options.idKey] !== 'string' ||
            !row[options.idKey] ||
            typeof row.documentNo !== 'string' ||
            row.status !== 'draft' ||
            (options.canDelete && !options.canDelete(row))
        )
      ) {
        ElMessage.warning('仅可批量删除可维护的暂存单据，请取消勾选已提交、已审核或已办理的单据')
        return
      }
      const resources = uniqBy(
        selectedRows.map((row) => ({
          id: String(row[options.idKey]),
          label: String(row.documentNo)
        })),
        'id'
      )
      const assertScope = createTenantScopeReadGuard()
      let removed = 0
      deleting.value = true
      try {
        if (await options.inspect(resources)) return
        assertScope()
        await confirmDelete(
          `确认删除 ${resources.length} 张${label}？\n${resources
            .slice(0, 8)
            .map((row) => row.label)
            .join(
              '、'
            )}${resources.length > 8 ? ` 等 ${resources.length} 张` : ''}\n按明细勾选也会删除所属整张单据及全部明细，同一单据只删除一次。此操作不可恢复。`
        )
        for (const resource of resources) {
          assertScope()
          if (!hasAuth(permission) || permission !== toValue(options.permission)) {
            throw new Error('删除权限或单据类型已变化，请刷新后重试')
          }
          try {
            await options.remove(resource.id)
          } catch (error) {
            await options.inspect(resources.slice(removed))
            throw error
          }
          removed += 1
        }
        ElMessage.success(`已删除 ${removed} 张${label}`)
      } catch (error) {
        if (error !== 'cancel' && error !== 'close') {
          notifyFriendlyError(error, '批量删除失败，请刷新列表后重试')
          if (removed) ElMessage.warning(`已删除 ${removed} 张，其余单据未删除，请刷新后重新勾选`)
        }
      } finally {
        try {
          if (removed) {
            options.clearSelection()
            await options.refresh()
          }
        } finally {
          deleting.value = false
        }
      }
    }
  })
  return { bulkDeleteAction: action, bulkDeleting: deleting }
}
