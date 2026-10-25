<template>
  <ArtPermissionGuard :permission="permissions.View" resource-name="收款条件">
    <div class="business-workspace-page art-full-height min-w-0">
      <BusinessWorkspaceHeader
        title="收款条件"
        description="维护客户收款账期，自动形成应收计划到期日；停用保留历史引用。"
        icon="ri:calendar-check-line"
        density="compact"
      >
        <template #actions><BusinessTableWorkspaceActions :table="tableRef" /></template>
      </BusinessWorkspaceHeader>
      <ArtTableQuery
        :table-props="{
          emptyText: '暂无收款条件',
          emptyDescription: '新增并启用收款条件后，可在应收单中选择账期。'
        }"
        ref="tableRef"
        :api-fn="fetchRows"
        :columns-factory="columnsFactory"
        :search-items="[
          {
            key: 'keyword',
            label: '组合查询',
            type: 'input',
            props: { placeholder: '编号、名称', clearable: true }
          }
        ]"
        :header-actions="[
          { type: 'add', permission: permissions.Add, onClick: () => open() },
          {
            type: 'delete',
            permission: permissions.Delete,
            confirm: false,
            onClick: (ctx) => remove(ctx.selectedRows.map((row) => String(row.id)))
          }
        ]"
        header-actions-placement="workspace"
        focusable
      />
      <ArtDialog ref="dialogRef" size="md" confirm-text="保存收款条件">
        <ArtForm
          ref="formRef"
          v-model="form"
          :items="items"
          :rules="rules"
          :show-submit="false"
          :show-reset="false"
          :span="12"
          label-position="top"
        />
      </ArtDialog>
      <MasterDataDeleteGuard ref="deleteGuard" />
    </div>
  </ArtPermissionGuard>
</template>
<script setup lang="tsx">
  import { ref, unref } from 'vue'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import { ElMessage } from 'element-plus'
  import {
    fetchArWorkspace,
    saveArCondition,
    deleteArRecords,
    fetchArDeleteDependencies,
    type ReceiptCondition,
    type ArQuery
  } from '@/api/receivables'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useArtFeedback, notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { financePaths } from '@/router/business-paths'
  import { useAuth } from '@/hooks/core/useAuth'
  import ArtTableQuery from '@/components/core/tables/art-table-query/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import type { ColumnOption } from '@/types'
  defineOptions({ name: 'ReceivableReceiptConditions' })
  const props = defineProps<{
    permissions: { View: string; Add: string; Edit: string; Delete: string }
  }>()
  const tableRef = ref<InstanceType<typeof ArtTableQuery>>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const deleteGuard = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const { confirmDelete } = useArtFeedback()
  const { hasAuth } = useAuth()
  const captureOperation = useTenantOperationGuard(props.permissions.View)
  const session = useArtOverlaySession(() => Boolean(unref(dialogRef.value?.visible)))
  const form = ref<Partial<ReceiptCondition> & { code: string }>({ code: '' })
  const booleanOptions = useDictionaryOptions('commonBoolean', (value) => value === 'true')
  const items: FormItem[] = [
    { key: 'code', label: '编号', type: 'input', props: { maxlength: 40 } },
    { key: 'name', label: '名称', type: 'input', props: { maxlength: 100 } },
    {
      key: 'dueDays',
      label: '账期天数',
      type: 'number',
      props: { min: 0, max: 3650, precision: 0 }
    },
    { key: 'isEnabled', label: '启用', type: 'radioGroup', props: { options: booleanOptions } },
    {
      key: 'remark',
      label: '描述',
      type: 'textarea',
      span: 24,
      props: { maxlength: 1000, rows: 2 }
    }
  ]
  const rules = {
    code: [{ required: true, message: '请填写编号' }],
    name: [{ required: true, message: '请填写名称' }],
    dueDays: [{ required: true, message: '请填写账期天数' }]
  }
  async function fetchRows(query: ArQuery) {
    return fetchArWorkspace('condition', {
      ...query,
      tenantId: useTenantScopeStore().effectiveTenantId
    })
  }
  const columnsFactory = (): ColumnOption<ReceiptCondition>[] => [
    { type: 'selection', width: 48 },
    { prop: 'conditionCode', label: '编号', minWidth: 160 },
    { prop: 'name', label: '名称', minWidth: 220 },
    { prop: 'dueDays', label: '账期天数', width: 130 },
    {
      prop: 'isEnabled',
      label: '启用状态',
      width: 120,
      formatter: (row) => (row.isEnabled ? '启用' : '停用')
    },
    { prop: 'remark', label: '描述', minWidth: 240 },
    {
      prop: 'operation',
      label: '操作',
      width: 90,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            permission={props.permissions.Edit}
            label="编辑"
            onClick={() => open(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  async function open(row?: ReceiptCondition): Promise<void> {
    const permission = row ? props.permissions.Edit : props.permissions.Add
    if (!hasAuth(permission)) return
    const scopeCurrent = captureOperation()
    const version = session.invalidate()
    const isCurrent = () => scopeCurrent() && session.isCurrent(version) && hasAuth(permission)
    form.value = row
      ? { ...row, code: row.conditionCode }
      : { code: '', name: '', dueDays: 0, isEnabled: true, remark: '' }
    await dialogRef.value?.handleOpen(undefined, {
      title: row ? '编辑收款条件' : '新增收款条件',
      onClose: () => {
        session.invalidate()
      },
      onConfirm: async () => {
        if (!isCurrent()) {
          ElMessage.warning('操作范围或权限已变化，请重新打开收款条件')
          return false
        }
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        if (!isCurrent()) return false
        try {
          await saveArCondition(form.value)
          if (!isCurrent()) return false
          ElMessage.success('收款条件已保存')
          await tableRef.value?.refreshData()
          return true
        } catch (error) {
          if (isCurrent()) notifyFriendlyError(error, '收款条件未保存，请重试')
          return false
        }
      }
    })
  }
  async function remove(ids: string[]): Promise<void> {
    if (!ids.length || !hasAuth(props.permissions.Delete)) return
    const scopeCurrent = captureOperation()
    const isCurrent = () => scopeCurrent() && hasAuth(props.permissions.Delete)
    const result = await fetchRows({ ids, size: 500 })
    if (!isCurrent()) return
    const rows = result.data.filter((row) => ids.includes(row.id))
    if (rows.length !== ids.length)
      throw new Error('所选收款条件已变化或不可查看，请重新查询后再删除')
    const options = {
      resourceLabel: '收款条件',
      resources: rows.map((row) => ({ id: row.id, label: row.name })),
      fetchDependencies: (values: string[]) => fetchArDeleteDependencies('condition', values),
      dependencyMeta: {
        financial: {
          label: '财务应收',
          unit: '张',
          description: '已被应收单引用的账期须保留，可改为停用。',
          actionLabel: '查看应收',
          routePath: financePaths.financialReceivable,
          routeQuery: (row: { targetId: string }) => ({ recordId: row.targetId }),
          canNavigate: () => hasAuth('FinanceFinancialReceivable:View'),
          order: 1
        },
        estimate: {
          label: '暂估应收',
          unit: '张',
          description: '已被暂估单引用的账期须保留，可改为停用。',
          actionLabel: '查看暂估',
          routePath: financePaths.estimatedReceivable,
          routeQuery: (row: { targetId: string }) => ({ recordId: row.targetId }),
          canNavigate: () => hasAuth('FinanceEstimatedReceivable:View'),
          order: 2
        }
      }
    }
    if (!deleteGuard.value || (await deleteGuard.value.inspect(options))) return
    if (!isCurrent()) return
    try {
      await confirmDelete(`确认删除 ${rows.length} 个无引用的收款条件？`)
    } catch {
      return
    }
    if (!isCurrent()) {
      ElMessage.warning('操作范围或权限已变化，请重新查询后删除')
      return
    }
    try {
      await deleteArRecords('condition', ids)
      if (!isCurrent()) return
      ElMessage.success('收款条件已删除')
      await tableRef.value?.refreshRemove()
    } catch (error) {
      if (!isCurrent()) return
      if (!(await deleteGuard.value?.inspect(options)))
        notifyFriendlyError(error, '删除未完成，请重新检查关联资料')
    }
  }
</script>
