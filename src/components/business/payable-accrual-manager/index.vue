<template>
  <ArtDialog ref="dialog" title="自动暂估管理" size="xl" :show-footer="false">
    <ElAlert
      title="参数默认停用。启用后，采购入库审核将按保存人员的权限生成暂估；已有历史的参数应保留并停用。"
      type="info"
      :closable="false"
      class="mb-4"
    />
    <ArtAsyncState :loading="loading" :error="error" @retry="load">
      <template v-if="workspace">
        <div class="mb-4 flex flex-wrap gap-2">
          <ElButton v-auth="props.managePermission" type="primary" :disabled="busy" @click="edit()"
            >新增参数</ElButton
          >
          <ElButton :disabled="busy || loading" @click="load">刷新</ElButton>
        </div>
        <ElTabs v-model="tab" @tab-change="resetPage">
          <ElTabPane label="自动暂估参数" name="policies">
            <ArtTable
              :data="workspace.configurations.data"
              :columns="policyColumns"
              :pagination="pagination(workspace.configurations.total)"
              @pagination:current-change="changePage"
              @pagination:size-change="changeSize"
            >
              <template #enabled="{ row }"
                ><ArtDictDisplay dict-code="commonBoolean" :value="String(row.enabled)"
              /></template>
              <template #operation="{ row }"
                ><BusinessTableRowActions>
                  <ArtButtonTable
                    type="edit"
                    :permission="props.managePermission"
                    :disabled="busy"
                    @click="edit(row)"
                  />
                  <ArtButtonTable
                    type="delete"
                    :permission="props.deletePermission"
                    :disabled="busy"
                    @click="remove(row)"
                  /> </BusinessTableRowActions
              ></template>
            </ArtTable>
          </ElTabPane>
          <ElTabPane label="期末暂估缺口" name="gaps">
            <ElSelect
              v-model="periodId"
              placeholder="选择会计期间后查询缺口"
              filterable
              clearable
              class="mb-4 w-full"
              :disabled="busy"
              @change="resetPage"
            >
              <ElOption
                v-for="period in workspace.periods"
                :key="period.id"
                :value="period.id"
                :label="period.name"
              />
            </ElSelect>
            <ElAlert
              v-if="!workspace.canReadSources"
              title="查看入库缺口需要采购入库查看权限。"
              type="info"
              :closable="false"
              class="mb-4"
            />
            <ArtTable
              :data="workspace.gaps.data"
              :columns="gapColumns"
              :pagination="pagination(workspace.gaps.total)"
              @pagination:current-change="changePage"
              @pagination:size-change="changeSize"
            >
              <template #operation="{ row }"
                ><ElButton
                  v-auth="props.executePermission"
                  link
                  type="primary"
                  :disabled="busy || !hasAuth('WmsPurchaseInbound:View')"
                  @click="execute(row)"
                  >补提暂估</ElButton
                ></template
              >
            </ArtTable>
          </ElTabPane>
        </ElTabs>
      </template>
    </ArtAsyncState>
  </ArtDialog>
  <ArtDialog ref="editor" size="lg">
    <ElAlert
      title="库存组织确定后不可更换；已有入库或生成历史时，账套与生效日不可改写。"
      type="info"
      :closable="false"
      class="mb-4"
    />
    <ArtForm
      ref="form"
      v-model="model"
      :items="items"
      :rules="rules"
      :show-submit="false"
      :show-reset="false"
      label-position="top"
    />
  </ArtDialog>
  <MasterDataDeleteGuard ref="deleteGuard" />
</template>
<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { pick } from 'lodash-es'
  import { financePaths } from '@/router/business-paths'
  import type { MasterDataDeleteDependencyDetail } from '@/api/master-data-delete'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useArtFeedback, notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import type { ColumnOption } from '@/types'
  import {
    fetchPayableAccrualWorkspace,
    savePayableAccrualPolicy,
    fetchPayableAccrualDeleteDependencies,
    deletePayableAccrualPolicy,
    executePayableAccrual,
    type PayableAccrualWorkspace,
    type PayableAccrualPolicy,
    type PayableAccrualGap,
    type PayableAccrualInput
  } from '@/api/payable-accrual'

  const props = defineProps<{
    managePermission: string
    deletePermission: string
    executePermission: string
  }>()
  const dialog = ref<ArtDialogExpose>()
  const editor = ref<ArtDialogExpose>()
  const form = ref<InstanceType<typeof ArtForm>>()
  const deleteGuard = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const session = useArtOverlaySession(() => Boolean(unref(dialog.value?.visible)))
  const { hasAuth } = useAuth()
  const { confirmAction, confirmDelete } = useArtFeedback()
  const scope = useTenantScopeStore()
  const capture = useTenantOperationGuard(props.managePermission)
  const captureDelete = useTenantOperationGuard(props.deletePermission)
  const captureExecute = useTenantOperationGuard(props.executePermission)
  const workspace = ref<PayableAccrualWorkspace>()
  const loading = ref(false)
  let loadVersion = 0
  const busy = ref(false)
  const error = ref('')
  const tab = ref('policies')
  const current = ref(1)
  const size = ref(20)
  const periodId = ref('')
  const locked = ref(false)
  const yesNo = useDictionaryOptions('commonBoolean', (value) => value === 'true')
  const canEnable = computed(
    () =>
      hasAuth('FinanceEstimatedPayable:Add') &&
      hasAuth('WmsPurchaseInbound:View') &&
      hasAuth('WmsPurchaseInbound:Push')
  )
  const canAutoApprove = computed(
    () =>
      Boolean(workspace.value?.canAutoApprove) &&
      hasAuth('FinanceEstimatedPayable:Submit') &&
      hasAuth('FinanceEstimatedPayable:Approve')
  )
  const empty = (): PayableAccrualInput => ({
    code: '',
    name: '',
    organizationId: '',
    accountSetId: '',
    effectiveFrom: '',
    enabled: false,
    autoApprove: false,
    taxExcludedFromCost: true,
    remark: ''
  })
  const model = ref<PayableAccrualInput>(empty())
  const items = computed<FormItem[]>(() => [
    { key: 'code', label: '参数编码', type: 'input', span: 12, props: { maxlength: 40 } },
    { key: 'name', label: '参数名称', type: 'input', span: 12, props: { maxlength: 80 } },
    {
      key: 'organizationId',
      label: '库存组织',
      type: 'treeSelect',
      span: 24,
      props: {
        data: workspace.value?.organizations ?? [],
        nodeKey: 'id',
        props: { label: 'name', children: 'children', disabled: 'disabled' },
        checkStrictly: true,
        filterable: true,
        disabled: Boolean(model.value.id)
      }
    },
    {
      key: 'accountSetId',
      label: '人民币账套',
      type: 'select',
      span: 12,
      props: {
        options: workspace.value?.books
          .filter((book) => book.tenantId === selectedTenant())
          .map((book) => ({ label: book.name, value: book.id })),
        disabled: locked.value
      }
    },
    {
      key: 'effectiveFrom',
      label: '生效日期',
      type: 'date',
      span: 12,
      props: { valueFormat: 'YYYY-MM-DD', disabled: locked.value }
    },
    {
      key: 'enabled',
      label: '启用自动生成',
      help: '启用需要暂估应付新增、采购入库查看及下推权限；仍可保存停用参数。',
      type: 'radioGroup',
      span: 12,
      props: {
        options: yesNo.map((option) => ({ ...option, disabled: option.value && !canEnable.value })),
        optionType: 'button'
      }
    },
    {
      key: 'autoApprove',
      label: '自动审核暂估',
      help: '自动审核需要暂估应付提交及审核权限；关闭自动审核将保留人工审核流程。',
      type: 'radioGroup',
      span: 12,
      props: {
        options: yesNo.map((option) => ({
          ...option,
          disabled: option.value && !canAutoApprove.value
        })),
        optionType: 'button'
      }
    },
    {
      key: 'taxExcludedFromCost',
      label: '成本扣除税额',
      type: 'radioGroup',
      span: 12,
      props: { options: yesNo, optionType: 'button' }
    },
    { key: 'remark', label: '备注', type: 'input', span: 24, props: { type: 'textarea', rows: 3 } }
  ])
  function selectedTenant(): string | undefined {
    return findOrganizationTenant(workspace.value?.organizations ?? [])
  }
  function findOrganizationTenant(
    nodes: PayableAccrualWorkspace['organizations']
  ): string | undefined {
    for (const node of nodes) {
      if (node.id === model.value.organizationId && !node.disabled) return node.tenantId
      const tenant = node.children && findOrganizationTenant(node.children)
      if (tenant) return tenant
    }
  }
  const rules = Object.fromEntries(
    ['code', 'name', 'organizationId', 'accountSetId', 'effectiveFrom'].map((key) => [
      key,
      [{ required: true, message: '请完整填写此项', trigger: 'change' }]
    ])
  )
  const policyColumns: ColumnOption<PayableAccrualPolicy>[] = [
    { prop: 'code', label: '参数编码', minWidth: 150 },
    { prop: 'name', label: '参数名称', minWidth: 180 },
    { prop: 'organizationName', label: '库存组织', minWidth: 170 },
    { prop: 'accountSetName', label: '账套', minWidth: 170 },
    { prop: 'effectiveFrom', label: '生效日期', width: 130 },
    { prop: 'enabled', label: '启用', width: 85, useSlot: true },
    { prop: 'actorName', label: '执行人员', minWidth: 130 },
    { prop: 'generatedCount', label: '生成记录', width: 110 },
    { prop: 'operation', label: '操作', width: 110, fixed: 'right', useSlot: true }
  ]
  const gapColumns: ColumnOption<PayableAccrualGap>[] = [
    { prop: 'sourceDocumentNo', label: '采购入库单号', minWidth: 180 },
    { prop: 'businessDate', label: '业务日期', width: 130 },
    { prop: 'lineNo', label: '行号', width: 80 },
    { prop: 'materialDescription', label: '物料', minWidth: 180 },
    { prop: 'quantity', label: '入库数量', width: 120 },
    { prop: 'recognizedQuantity', label: '已立账数量', width: 130 },
    { prop: 'differenceQuantity', label: '缺口数量', width: 120 },
    { prop: 'pendingDocumentCount', label: '待审核单据', width: 120 },
    { prop: 'operation', label: '操作', width: 110, fixed: 'right', useSlot: true }
  ]
  const pagination = (total: number) => ({ current: current.value, size: size.value, total })
  async function load() {
    if (!hasAuth('FinanceEstimatedPayable:View') || !hasAuth(props.managePermission)) return
    const version = session.version.value
    const requestVersion = ++loadVersion
    const isCurrent = capture()
    loading.value = true
    error.value = ''
    try {
      const data = await fetchPayableAccrualWorkspace({
        current: current.value,
        size: size.value,
        periodId: periodId.value || undefined
      })
      if (session.isCurrent(version) && isCurrent() && requestVersion === loadVersion)
        workspace.value = data
    } catch (cause) {
      if (session.isCurrent(version) && isCurrent() && requestVersion === loadVersion) {
        error.value = '自动暂估资料未加载，请重试'
        notifyFriendlyError(cause, error.value)
      }
    } finally {
      if (session.isCurrent(version) && requestVersion === loadVersion) loading.value = false
    }
  }
  async function handleOpen() {
    if (!hasAuth('FinanceEstimatedPayable:View') || !hasAuth(props.managePermission)) return
    session.invalidate()
    workspace.value = undefined
    loading.value = false
    current.value = 1
    periodId.value = ''
    tab.value = 'policies'
    await dialog.value?.handleOpen(undefined, {
      onClose: () => {
        session.invalidate()
        void editor.value?.handleClose()
        return true
      }
    })
    await load()
  }
  function changePage(page: number) {
    current.value = page
    void load()
  }
  function changeSize(value: number) {
    size.value = value
    resetPage()
  }
  function resetPage() {
    current.value = 1
    void load()
  }
  async function edit(row?: PayableAccrualPolicy) {
    if (busy.value || !hasAuth(props.managePermission)) return
    model.value = row
      ? pick(row, [
          'id',
          'version',
          'code',
          'name',
          'organizationId',
          'accountSetId',
          'effectiveFrom',
          'enabled',
          'autoApprove',
          'taxExcludedFromCost',
          'remark'
        ])
      : empty()
    locked.value = row?.locked ?? false
    const version = session.version.value
    const isCurrent = capture()
    await editor.value?.handleOpen(undefined, {
      title: row ? '编辑自动暂估参数' : '新增自动暂估参数',
      confirmText: '保存参数',
      onOpen: () => form.value?.clearValidate(),
      onConfirm: async () => {
        if (
          !isCurrent() ||
          !session.isCurrent(version) ||
          !(await validateArtFormForSubmit(form.value))
        )
          return false
        const tenant = findOrganizationTenant(workspace.value?.organizations ?? [])
        if (
          !tenant ||
          !workspace.value?.books.some(
            (book) => book.id === model.value.accountSetId && book.tenantId === tenant
          )
        ) {
          ElMessage.warning('请选择库存组织所属租户的账套')
          return false
        }
        busy.value = true
        try {
          if (
            model.value.enabled &&
            (!canEnable.value || (model.value.autoApprove && !canAutoApprove.value))
          ) {
            ElMessage.warning('自动执行权限不足，请保存停用参数或关闭自动审核后重试')
            return false
          }
          if (model.value.enabled)
            await confirmAction(
              '启用后将按你当前权限在采购入库审核时自动生成暂估；自动审核会直接改变单据状态。',
              '启用自动暂估'
            )
          if (!isCurrent() || !session.isCurrent(version)) return false
          if (
            model.value.enabled &&
            (!canEnable.value || (model.value.autoApprove && !canAutoApprove.value))
          ) {
            ElMessage.warning('自动执行权限已变化，请重新核对参数')
            return false
          }
          await savePayableAccrualPolicy({ ...model.value })
          if (!isCurrent() || !session.isCurrent(version)) return false
          ElMessage.success('自动暂估参数已保存')
          await load()
          return true
        } catch (cause) {
          if (cause !== 'cancel' && cause !== 'close' && isCurrent())
            notifyFriendlyError(cause, '参数保存失败，请重试')
          return false
        } finally {
          busy.value = false
        }
      }
    })
  }
  async function remove(row: PayableAccrualPolicy) {
    if (busy.value || !hasAuth(props.deletePermission)) return
    const isCurrent = captureDelete()
    const version = session.version.value
    const options = {
      resourceLabel: '自动暂估参数',
      resources: [{ id: row.id, label: `${row.code} · ${row.name}` }],
      fetchDependencies: fetchPayableAccrualDeleteDependencies,
      dependencyMeta: {
        accrual_policy: {
          label: '启用参数',
          unit: '条',
          description: '请先停用参数。',
          actionLabel: '查看参数',
          order: 1
        },
        accrual_run: {
          label: '暂估生成历史',
          unit: '条',
          description: '请保留参数及授权历史。',
          order: 2,
          actionLabel: '查看暂估单',
          routePath: financePaths.estimatedPayable,
          canNavigate: () => hasAuth('FinanceEstimatedPayable:View')
        },
        accrual_inbound: {
          label: '已审核采购入库',
          unit: '条',
          description: '已纳入期末立账范围，请保留参数。',
          order: 3,
          actionLabel: '查看采购入库',
          routeName: 'WmsPurchaseInbound',
          routeQuery: (record: MasterDataDeleteDependencyDetail) => ({
            dependencyCode: 'wms_purchase_document',
            recordId: record.targetId
          }),
          canNavigate: () => hasAuth('WmsPurchaseInbound:View')
        }
      }
    }
    busy.value = true
    try {
      if (
        !deleteGuard.value ||
        (await deleteGuard.value.inspect(options)) ||
        !isCurrent() ||
        !session.isCurrent(version)
      )
        return
      await confirmDelete(`确认删除参数“${row.name}”？`)
      if (!isCurrent() || !session.isCurrent(version)) return
      try {
        await deletePayableAccrualPolicy(row.id)
      } catch (cause) {
        if (isCurrent() && session.isCurrent(version)) await deleteGuard.value.inspect(options)
        throw cause
      }
      if (isCurrent() && session.isCurrent(version)) {
        ElMessage.success('参数已删除')
        await load()
      }
    } catch (cause) {
      if (cause !== 'cancel' && cause !== 'close' && isCurrent())
        notifyFriendlyError(cause, '参数删除失败，请重新检查关联记录')
    } finally {
      busy.value = false
    }
  }
  async function execute(row: PayableAccrualGap) {
    if (busy.value || !hasAuth(props.executePermission) || !hasAuth('WmsPurchaseInbound:View'))
      return
    const isCurrent = captureExecute()
    const version = session.version.value
    busy.value = true
    try {
      await confirmAction(
        `将按采购入库“${row.sourceDocumentNo}”整单补提暂估，可能生成多张暂估单。请先核对待审核单据及参数。`,
        '补提暂估'
      )
      if (!isCurrent() || !session.isCurrent(version) || !hasAuth('WmsPurchaseInbound:View')) return
      const ids = await executePayableAccrual(row.sourceDocumentId)
      if (isCurrent() && session.isCurrent(version)) {
        ElMessage.success(
          ids.length ? `已生成${ids.length}张暂估单` : '未生成新暂估单，请核对已有单据'
        )
        await load()
      }
    } catch (cause) {
      if (cause !== 'cancel' && cause !== 'close' && isCurrent())
        notifyFriendlyError(cause, '补提失败，请刷新缺口后重试')
    } finally {
      busy.value = false
    }
  }
  watch(
    () => scope.revision,
    () => {
      session.invalidate()
      void editor.value?.handleClose()
      void dialog.value?.handleClose()
    }
  )
  defineExpose({ handleOpen })
</script>
