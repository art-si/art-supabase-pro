import { ref, toValue, type MaybeRefOrGetter } from 'vue'
import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
import { useAuth } from './useAuth'
import { createRecordReferenceNavigation } from '@/components/business/master-data-delete-guard/record-navigation'
import { ElMessage } from 'element-plus'
import {
  fetchRecordDeleteDependencies,
  type RecordDeleteDependency
} from '@/api/master-data-delete'
import { notifyFriendlyError, useArtFeedback } from './useArtFeedback'
import {
  getDeleteReferenceContext,
  type DeleteReferenceContext
} from '@/utils/supabase/delete-reference'
import type {
  MasterDataDeleteGuardOpenOptions,
  MasterDataDeleteResource,
  MasterDataDeleteDependencyMeta
} from '@/components/business/master-data-delete-guard/index.vue'
import {
  formatReferenceStatus,
  getRecordReferenceMeta
} from '@/components/business/master-data-delete-guard/record-meta'

export function recordDeleteGuardOptions(
  context: DeleteReferenceContext,
  resourceLabel: string,
  resources: MasterDataDeleteResource[],
  referenceMeta: Record<string, Partial<MasterDataDeleteDependencyMeta>> = {},
  fetchAdditionalDependencies?: (
    context: DeleteReferenceContext
  ) => Promise<RecordDeleteDependency[]>
): MasterDataDeleteGuardOpenOptions {
  const { hasAuth } = useAuth()
  const navigationMeta = { ...createRecordReferenceNavigation(hasAuth), ...referenceMeta }
  const dependencyMeta: Record<string, MasterDataDeleteDependencyMeta> = {}
  return {
    resourceLabel,
    resources,
    dependencyMeta,
    navigationResource: { type: context.table, queryKey: 'referencedRecordId' },
    fetchDependencies: async () => {
      const [standardRows, additionalRows] = await Promise.all([
        fetchRecordDeleteDependencies(context),
        fetchAdditionalDependencies?.(context) ?? []
      ])
      const rows = [...standardRows, ...additionalRows]
      for (const row of rows) {
        const meta = getRecordReferenceMeta(row.sourceTable)
        dependencyMeta[row.sourceTable] = {
          ...meta,
          unit: '条',
          order: 1,
          actionLabel: '查看关联',
          description: '请核对以下引用记录，处理关联后再重试删除。',
          ...navigationMeta[row.sourceTable]
        }
      }
      return rows.map((row) => ({
        ...row,
        createdAt: row.createdAt ?? '',
        dependencyCode: row.sourceTable,
        recordStatus: dependencyMeta[row.sourceTable]?.statusDictCode
          ? row.recordStatus
          : formatReferenceStatus(row.recordStatus) || '状态待核对',
        cleanupAllowed: false
      }))
    }
  }
}

export function useRecordDeleteGuard(
  table: MaybeRefOrGetter<string>,
  resourceLabel: MaybeRefOrGetter<string>,
  referenceMeta: Record<string, Partial<MasterDataDeleteDependencyMeta>> = {},
  fetchAdditionalDependencies?: (
    context: DeleteReferenceContext
  ) => Promise<RecordDeleteDependency[]>
) {
  const { hasAuth } = useAuth()
  const { confirmDelete } = useArtFeedback()
  const deleteBusy = ref(false)
  const deleteGuardRef = ref<{
    inspect: (options: MasterDataDeleteGuardOpenOptions) => Promise<boolean>
  }>()
  const inspectResolvedReferences = (
    resources: MasterDataDeleteResource[],
    tableName: string,
    label: string,
    constraint?: string,
    resolveResources?: () => Promise<MasterDataDeleteResource[]>
  ) => {
    if (!deleteGuardRef.value) {
      ElMessage.error('关联校验尚未就绪，请刷新页面后重试删除')
      return Promise.resolve(true)
    }
    return deleteGuardRef.value.inspect({
      ...recordDeleteGuardOptions(
        { table: tableName, ids: resources.map((row) => row.id), constraint },
        label,
        resources,
        referenceMeta,
        fetchAdditionalDependencies
      ),
      resolveResources
    })
  }
  const inspectDeleteReferences = (resources: MasterDataDeleteResource[], constraint?: string) =>
    inspectResolvedReferences(resources, toValue(table), toValue(resourceLabel), constraint)
  const deleteRecords = async (options: {
    resources: MasterDataDeleteResource[]
    resourceLabel?: string
    permission: string | string[]
    remove: () => Promise<unknown>
    onDeleted?: () => Promise<unknown>
    confirmMessage?: string
    failureMessage?: string
    successMessage?: string
    resolveResources?: () => Promise<MasterDataDeleteResource[]>
    /** Preserve domain-specific reference checks while sharing submission safeguards. */
    inspectReferences?: (
      resources: MasterDataDeleteResource[],
      constraint?: string
    ) => Promise<boolean>
  }): Promise<void> => {
    if (deleteBusy.value) return
    const permissions = Array.isArray(options.permission)
      ? [...options.permission]
      : [options.permission]
    const hasDeletePermission = () =>
      permissions.length > 0 &&
      permissions.every((permission) => permission.trim().length > 0 && hasAuth(permission))
    if (
      !options.resources.length ||
      options.resources.some((resource) => !resource.id) ||
      !hasDeletePermission()
    ) {
      ElMessage.error('当前账号无权删除此记录，或记录已变化，请刷新后重试')
      return
    }
    deleteBusy.value = true
    const resources = options.resources.map((resource) => ({ ...resource }))
    const assertScope = createTenantScopeReadGuard()
    const label = options.resourceLabel ?? toValue(resourceLabel)
    const tableName = toValue(table)
    const resolveResources = options.resolveResources
    const inspect = (constraint?: string) =>
      options.inspectReferences
        ? options.inspectReferences(resources, constraint)
        : inspectResolvedReferences(
            resources,
            tableName,
            label,
            constraint,
            resolveResources
              ? async () => {
                  const resolved = await resolveResources()
                  assertScope()
                  return resolved
                }
              : undefined
          )
    try {
      if (await inspect()) return
      assertScope()
      await confirmDelete(
        options.confirmMessage ??
          (resources.length === 1
            ? `确认删除${label}“${resources[0].label}”？此操作不可恢复。`
            : `确认删除选中的 ${resources.length} 条${label}？此操作不可恢复。`)
      )
      assertScope()
      if (!hasDeletePermission()) {
        ElMessage.error('删除权限已变化，请刷新页面后重试')
        return
      }
      try {
        await options.remove()
      } catch (error) {
        assertScope()
        if (!hasDeletePermission()) return
        if (await inspect(getDeleteReferenceContext(error)?.constraint)) return
        throw error
      }
      assertScope()
      if (!hasDeletePermission()) return
      if (options.successMessage) ElMessage.success(options.successMessage)
      try {
        await options.onDeleted?.()
      } catch (error) {
        assertScope()
        if (!hasDeletePermission()) return
        notifyFriendlyError(error, `${label}已删除，但列表刷新失败，请重新查询`)
      }
    } catch (error) {
      if (error !== 'cancel' && error !== 'close')
        notifyFriendlyError(error, options.failureMessage ?? `${label}删除失败，请刷新列表后重试`)
    } finally {
      deleteBusy.value = false
    }
  }
  const deleteRecord = (
    options: Omit<Parameters<typeof deleteRecords>[0], 'resources'> & {
      resource: MasterDataDeleteResource
    }
  ) => deleteRecords({ ...options, resources: [options.resource] })
  return { deleteGuardRef, inspectDeleteReferences, deleteRecord, deleteRecords, deleteBusy }
}
