<template>
  <ArtDialog ref="dialogRef">
    <div v-if="inspectionError" class="master-delete-guard__error" role="alert">
      <span class="master-delete-guard__error-icon" aria-hidden="true">
        <ArtSvgIcon icon="ri:shield-cross-line" />
      </span>
      <div>
        <strong>关联资料未完成核验，删除已停止</strong>
        <p>{{ inspectionError }}</p>
        <small>请重试；若问题持续，请联系管理员核对关联资料读取权限。</small>
      </div>
    </div>
    <div v-else class="master-delete-guard">
      <div class="master-delete-guard__lead">
        <div>
          <p v-if="blockingResources.length">
            {{ resourceTitle }}包含不满足删除条件的记录，请核对单据状态与下方原因后处理。
          </p>
          <p v-else>
            {{ resourceTitle }}仍被以下业务资料引用。<template v-if="safeRecordCount">{{
              cleanupAll
                ? '可一键清理安全项，业务历史请进入对应页面处理。'
                : '可勾选安全项直接清理，业务历史请进入对应页面处理。'
            }}</template
            ><template v-else>请核对关联记录，并到对应业务页面处理后再删除。</template>
          </p>
          <span v-if="currentOptions?.resourceType"
            >系统不会自动删除运单、合同、财务、审批或维修历史。</span
          >
          <span v-else>系统不会自动删除或解除关联业务记录。</span>
        </div>
        <ElTag type="warning" effect="light">
          <template v-if="blockingResources.length"
            >{{ blockingResources.length }} 条不可删除 ·
          </template>
          {{ dependencies.length }} 条关联
        </ElTag>
      </div>

      <div class="master-delete-guard__groups">
        <section v-if="blockingResources.length" class="master-delete-guard__group">
          <header class="master-delete-guard__group-header">
            <div class="master-delete-guard__group-title"
              ><span>!</span><strong>单据删除条件</strong></div
            >
          </header>
          <p class="master-delete-guard__group-help"
            >本次选择将整体停止删除，符合条件的记录也会保留。</p
          >
          <div class="master-delete-guard__records">
            <div
              v-for="resource in blockingResources"
              :key="resource.id"
              class="master-delete-guard__record"
            >
              <span class="master-delete-guard__record-spacer" aria-hidden="true" />
              <div class="master-delete-guard__record-copy">
                <strong :title="resource.label">{{ resource.label }}</strong>
                <span :title="resource.blockReason">{{ resource.blockReason }}</span>
                <ArtDictDisplay
                  v-if="resource.status && resource.statusDictCode"
                  :dict-code="resource.statusDictCode"
                  :value="resource.status"
                  display="text"
                />
              </div>
              <div class="master-delete-guard__record-actions">
                <ElTag type="info" effect="light" size="small">不可删除</ElTag>
                <ElButton
                  v-if="resource.to"
                  type="primary"
                  link
                  @click="viewBlockedResource(resource)"
                  >查看单据</ElButton
                >
              </div>
            </div>
          </div>
        </section>
        <section
          v-for="(group, index) in dependencyGroups"
          :key="group.code"
          class="master-delete-guard__group"
        >
          <header class="master-delete-guard__group-header">
            <div class="master-delete-guard__group-title">
              <span>{{ index + 1 }}</span>
              <strong>{{ group.meta.label }}</strong>
            </div>
            <div class="master-delete-guard__group-header-actions">
              <ElCheckbox
                v-if="!cleanupAll && getGroupSafeRecords(group).length"
                :model-value="isGroupFullySelected(group)"
                :indeterminate="isGroupPartiallySelected(group)"
                @change="
                  (checked: CheckboxValueType) => toggleGroupSelection(group, Boolean(checked))
                "
              >
                全选可清理项
              </ElCheckbox>
              <ElTag type="warning" effect="plain" size="small">
                {{ group.records.length }} {{ group.meta.unit }}
              </ElTag>
            </div>
          </header>
          <p class="master-delete-guard__group-help">{{ group.meta.description }}</p>

          <div class="master-delete-guard__records">
            <div
              v-for="record in group.records"
              :key="`${record.resourceId}:${record.recordId}`"
              class="master-delete-guard__record"
            >
              <ElCheckbox
                v-if="!cleanupAll && record.cleanupAllowed"
                :model-value="selectedRecordIds.includes(record.recordId)"
                :aria-label="`选择清理 ${record.recordNo}`"
                @change="
                  (checked: CheckboxValueType) =>
                    toggleRecordSelection(record.recordId, Boolean(checked))
                "
              />
              <span v-else class="master-delete-guard__record-spacer" aria-hidden="true" />

              <div class="master-delete-guard__record-copy">
                <strong :title="record.recordNo">{{ record.recordNo || '未编号记录' }}</strong>
                <span :title="formatRecordMeta(record)">
                  {{ formatRecordMeta(record) }}
                  <template v-if="group.meta.statusDictCode">
                    <template v-if="formatRecordMeta(record)"> · </template>
                    <ArtDictDisplay
                      :key="inspectionSequence"
                      :dict-code="group.meta.statusDictCode"
                      :value="record.recordStatus"
                      display="text"
                      empty-text="状态待核对"
                      unknown-text="状态待核对"
                    />
                  </template>
                </span>
              </div>

              <div class="master-delete-guard__record-actions">
                <ElTag
                  :type="record.cleanupAllowed ? 'success' : 'info'"
                  effect="light"
                  size="small"
                >
                  {{
                    record.cleanupAllowed
                      ? cleanupAll
                        ? '可一键清理'
                        : '可选择清理'
                      : '需保留/处理'
                  }}
                </ElTag>
                <ElButton
                  v-if="
                    record.targetId &&
                    (group.meta.canNavigate?.() ?? true) &&
                    (group.meta.resolveRouteName
                      ? group.meta.routeNames?.some((name) => router.hasRoute(name))
                      : group.meta.routeName
                        ? router.hasRoute(group.meta.routeName) ||
                          (group.meta.applicationCode && group.meta.routePath)
                        : group.meta.routePath)
                  "
                  link
                  :disabled="resolvingDependency"
                  type="primary"
                  @click="openDependency(group.meta, record)"
                >
                  {{ group.meta.actionLabel }}
                  <i class="ri:arrow-right-s-line" aria-hidden="true" />
                </ElButton>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div class="master-delete-guard__notice">
        <i class="ri:information-line" aria-hidden="true" />
        <span v-if="currentOptions?.resourceType"
          >处理页面会携带主数据与关联记录定位信息；请在目标页面核对对应记录。</span
        >
        <span v-else>请核对关联记录编号与状态，处理后重新检查。</span>
      </div>
    </div>

    <template #footer="{ api }">
      <div class="master-delete-guard__footer">
        <span v-if="safeRecordCount">
          <template v-if="cleanupAll">可清理 {{ safeRecordCount }} 个安全项</template
          ><template v-else
            >已选择 {{ selectedRecordIds.length }} / {{ safeRecordCount }} 个安全项</template
          >
        </span>
        <span v-else-if="inspectionError">校验失败时不会删除业务记录</span>
        <span v-else>当前关联均属于需保留或先处理的业务记录</span>
        <div class="master-delete-guard__footer-actions flex-wrap [&>.el-button]:ml-0!">
          <ElButton @click="api.handleClose()">关闭</ElButton>
          <ElButton
            type="primary"
            :loading="checking"
            :disabled="cleanupLoading"
            @click="retryInspection"
          >
            重新检查
          </ElButton>
          <ElButton
            v-if="safeRecordCount"
            type="danger"
            plain
            :loading="cleanupLoading"
            :disabled="!cleanupActionCount || checking || Boolean(inspectionError)"
            @click="handleCleanup"
          >
            {{ currentOptions?.cleanup?.actionLabel ?? '清理选中项' }}（{{ cleanupActionCount }}）
          </ElButton>
        </div>
      </div>
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { LocationQueryRaw, RouteLocationRaw } from 'vue-router'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { formatSensitiveNumberWithAffix } from '@/utils/field-permission'
  import { formatReferenceStatus } from './record-meta'
  import { groupBy, uniq } from 'lodash-es'
  import { Loading } from '@element-plus/icons-vue'
  import { ElMessage, type MessageHandler, type CheckboxValueType } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { financeRouteNames } from '@/router/business-paths'
  import type { ApplicationCode } from '@/config/application'
  import { navigateToApplication } from '@/utils/application-navigation'
  import {
    cleanupMasterDataDeleteDependencies,
    fetchMasterDataDeleteDependencies,
    fetchVehicleReminderDeleteDestination,
    type MasterDataDeleteDependencyDetail,
    type MasterDataDeleteResourceType
  } from '@/api/master-data-delete'

  defineOptions({ name: 'MasterDataDeleteGuard' })

  export interface MasterDataDeleteResource {
    id: string
    label: string
    blockReason?: string
    status?: string
    statusDictCode?: string
    to?: RouteLocationRaw
  }

  export interface MasterDataDeleteDependencyMeta {
    label: string
    unit: string
    description: string
    actionLabel: string
    routeName?: string
    applicationCode?: ApplicationCode
    statusDictCode?: string
    routeParams?: (
      record: MasterDataDeleteDependencyDetail
    ) => Record<string, string> | null | Promise<Record<string, string> | null>
    routePath?: string
    routeQuery?: LocationQueryRaw | ((record: MasterDataDeleteDependencyDetail) => LocationQueryRaw)
    routeNames?: string[]
    canNavigate?: () => boolean
    resolveRouteName?: (record: MasterDataDeleteDependencyDetail) => Promise<string | null>
    order: number
  }

  interface MasterDataDeleteGuardBaseOptions {
    resourceLabel: string
    resources: MasterDataDeleteResource[]
    resolveResources?: () => Promise<MasterDataDeleteResource[]>
    dependencyMeta?: Record<string, MasterDataDeleteDependencyMeta>
    cleanup?: CustomDependencyCleanup
  }

  interface CustomDependencyCleanup {
    selectionMode?: 'all'
    count?: (records: MasterDataDeleteDependencyDetail[]) => number
    actionLabel: string
    confirmMessage: (count: number) => string
    run: (records: MasterDataDeleteDependencyDetail[]) => Promise<number>
  }

  export type MasterDataDeleteGuardOpenOptions = MasterDataDeleteGuardBaseOptions &
    (
      | { resourceType: MasterDataDeleteResourceType; fetchDependencies?: never }
      | {
          resourceType?: never
          navigationResource?: { type: string; queryKey: string }
          fetchDependencies: (resourceIds: string[]) => Promise<MasterDataDeleteDependencyDetail[]>
        }
    )

  type DependencyMeta = MasterDataDeleteDependencyMeta

  interface DependencyGroup {
    code: string
    meta: DependencyMeta
    records: MasterDataDeleteDependencyDetail[]
  }

  const emit = defineEmits<{ cleared: [] }>()
  const router = useRouter()
  const route = useRoute()
  const { confirmAction } = useArtFeedback()
  const dialogRef = ref<ArtDialogExpose<Record<string, never>>>()
  const currentOptions = shallowRef<MasterDataDeleteGuardOpenOptions>()
  const dependencies = shallowRef<MasterDataDeleteDependencyDetail[]>([])
  const selectedRecordIds = ref<string[]>([])
  const cleanupLoading = ref(false)
  const inspectionError = ref('')
  let inspectionSequence = 0
  const checking = ref(false)
  let progressMessage: MessageHandler | undefined
  const cancelInspection = () => {
    inspectionSequence += 1
    checking.value = false
    progressMessage?.close()
  }
  onBeforeUnmount(cancelInspection)
  onDeactivated(cancelInspection)

  const dependencyMeta: Record<string, DependencyMeta> = {
    carrier_price: {
      label: '承运商价格方案',
      unit: '条',
      description: '报价配置不属于业务历史，可按需勾选后直接清理。',
      actionLabel: '去处理报价',
      routeName: 'TmsCarrierPrice',
      order: 10
    },
    contract: {
      label: '关联合同',
      unit: '份',
      description: '合同属于经营与审批历史，应先终止或保留合同，并停用对应客户或承运商。',
      actionLabel: '去处理合同',
      routeName: 'TmsContract',
      order: 20
    },
    driver: {
      label: '归属司机',
      unit: '名',
      description: '请先调整司机归属或逐个处理司机资料。',
      actionLabel: '去处理司机',
      routeName: 'TmsDriver',
      order: 30
    },
    waybill: createWaybillMeta('关联运单', 40),
    driver_waybill: createWaybillMeta('司机关联运单', 10),
    cargo_waybill: createWaybillMeta('货物关联运单', 10),
    address_waybill: createWaybillMeta('地址关联运单', 10),
    vehicle_waybill: createWaybillMeta('车辆关联运单', 10),
    vehicle_fixed_asset: createFinanceMeta('车辆固定资产', '项', 'FinanceFixedAsset', 15),
    vehicle_certificate: {
      label: '车辆或司机证件',
      unit: '份',
      description: '证件属于合规历史，请先核对关联证件，再处理车辆或司机档案。',
      actionLabel: '查看证件',
      routePath: '/vms/certificate-center',
      routeQuery: (record) => ({
        subjectType: currentOptions.value?.resourceType === 'driver' ? 'driver' : 'vehicle',
        subjectId: record.resourceId
      }),
      canNavigate: () => router.hasRoute('CertificateCenter'),
      order: 18
    },
    tms_driver_commission_rule: {
      label: '司机提成规则',
      unit: '条',
      description: '提成规则需要保留版本和结算依据，请先在司机档案中核对规则。',
      actionLabel: '查看提成规则',
      routeName: 'TmsDriver',
      routeQuery: (record) => ({ driverId: record.resourceId, commissionRuleId: record.recordId }),
      canNavigate: () => router.hasRoute('TmsDriver'),
      order: 20
    },
    tms_driver_invitation: {
      label: '司机邀请记录',
      unit: '条',
      description: '已关联司机的邀请记录属于身份关联历史，请先核对后再处理司机档案。',
      actionLabel: '查看邀请记录',
      routeName: 'TmsDriver',
      routeQuery: (record) => ({ driverId: record.resourceId, invitationId: record.recordId }),
      canNavigate: () => router.hasRoute('TmsDriver'),
      order: 21
    },
    carrier_statement: createFinanceMeta(
      '承运商对账单',
      '张',
      financeRouteNames.carrierSettlement,
      50
    ),
    carrier_statement_item: createFinanceMeta(
      '承运商对账明细',
      '条',
      financeRouteNames.carrierSettlement,
      60
    ),
    payment_application: createFinanceMeta(
      '付款申请',
      '张',
      financeRouteNames.paymentApplication,
      70
    ),
    payment_application_item: createFinanceMeta(
      '付款申请明细',
      '条',
      financeRouteNames.paymentApplication,
      80
    ),
    carrier_cash_allocation: createFinanceMeta(
      '付款核销',
      '条',
      financeRouteNames.cashTransaction,
      90
    ),
    carrier_cash_transaction: createFinanceMeta(
      '付款流水',
      '笔',
      financeRouteNames.cashTransaction,
      100
    ),
    carrier_invoice: createFinanceMeta(
      '承运商发票',
      '张',
      financeRouteNames.invoiceManagement,
      110
    ),
    vehicle_reminder_work_order: {
      label: '车辆提醒工单',
      unit: '条',
      description: '进行中工单需先处理；已取消或已关闭工单可勾选清理。',
      actionLabel: '去处理工单',
      routePath: '/vms/reminder-manage',
      order: 20
    },
    organization_child: createGovernanceMeta(
      '下级组织',
      '个',
      '请先迁移或停用下级组织，再删除当前组织节点。',
      '去处理组织',
      'Organization',
      10
    ),
    organization_user: createGovernanceMeta(
      '组织成员',
      '名',
      '用户档案与登录身份需要保留，请先迁移到其他组织或注销账号。',
      '去处理用户',
      'User',
      20
    ),
    organization_role: createGovernanceMeta(
      '组织角色',
      '个',
      '角色仍绑定当前组织，请先迁移、停用或处理角色。',
      '去处理角色',
      'Role',
      30
    ),
    role_menu_grant: createGovernanceMeta(
      '菜单授权',
      '项',
      '菜单授权属于权限配置，可按需勾选解绑。',
      '去查看菜单',
      'Menu',
      10
    ),
    role_user_assignment: createGovernanceMeta(
      '用户角色分配',
      '人',
      '用户档案不会删除，仅从选中用户解除该角色。',
      '去处理用户',
      'User',
      20
    ),
    menu_role_grant: createGovernanceMeta(
      '角色菜单授权',
      '项',
      '删除菜单前可选择解除角色授权，用户与角色本身不会删除。',
      '去处理角色',
      'Role',
      10
    ),
    menu_document_number_scene: createGovernanceMeta(
      '编号规则场景',
      '项',
      '编号规则仍定位到当前菜单，应先调整场景归属后再删除菜单。',
      '去处理编号规则',
      'DocumentNumberRule',
      20
    ),
    dict_type_child: createGovernanceMeta(
      '下级字典类型',
      '个',
      '目录存在下级类型时不直接级联删除，请先逐级确认。',
      '去处理字典',
      'Dict',
      10
    ),
    dict_type_item: createGovernanceMeta(
      '字典项',
      '项',
      '字典项属于系统配置，可逐项勾选清理。',
      '去处理字典',
      'Dict',
      20
    ),
    dictionary_child: createGovernanceMeta(
      '下级字典项',
      '项',
      '下级字典项可按需勾选清理，避免隐藏级联删除。',
      '去处理字典',
      'Dict',
      10
    ),
    attachment_waybill_proof: createGovernanceMeta(
      '运单凭证引用',
      '处',
      '附件已作为运单交付凭证使用，必须保留或先替换凭证。',
      '去查看运单',
      'TmsLoadedWaybillList',
      10
    ),
    order_waybill: createWaybillMeta('订单关联运单', 10),
    order_expense: createGovernanceMeta(
      '订单运单费用',
      '笔',
      '费用属于经营与财务历史，不允许随订单物理删除。',
      '去处理费用',
      financeRouteNames.waybillCost,
      20
    ),
    order_receipt_work_order: createGovernanceMeta(
      '回单异常工单',
      '张',
      '异常工单属于处置记录，应先关闭或保留订单。',
      '去处理工单',
      'TmsDeliveryManagement',
      30
    ),
    order_statement_item: createGovernanceMeta(
      '客户对账明细',
      '条',
      '对账明细属于财务审计历史，不允许随订单删除。',
      '去处理对账',
      financeRouteNames.customerSettlement,
      40
    )
  }

  function createGovernanceMeta(
    label: string,
    unit: string,
    description: string,
    actionLabel: string,
    routeName: string,
    order: number
  ): DependencyMeta {
    return { label, unit, description, actionLabel, routeName, order }
  }

  function createWaybillMeta(label: string, order: number): DependencyMeta {
    return {
      label,
      unit: '单',
      description: '运单属于运输履约历史，不允许级联物理删除。',
      actionLabel: '去查看运单',
      routeName: 'TmsLoadedWaybillList',
      order
    }
  }

  function createFinanceMeta(
    label: string,
    unit: string,
    routeName: string,
    order: number
  ): DependencyMeta {
    return {
      label,
      unit,
      description: '财务记录属于审计历史，不允许跟随主数据物理删除。',
      actionLabel: '去处理记录',
      routeName,
      order
    }
  }

  const resourceIds = computed(() => currentOptions.value?.resources.map((item) => item.id) ?? [])
  const blockingResources = computed(
    () => currentOptions.value?.resources.filter((item) => item.blockReason) ?? []
  )
  const viewBlockedResource = async (resource: MasterDataDeleteResource): Promise<void> => {
    if (!resource.to) return
    try {
      await dialogRef.value?.handleClose(true)
      await router.push(resource.to)
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '单据定位失败，请返回对应列表查询'))
    }
  }
  const canCleanup = computed(() =>
    Boolean(currentOptions.value?.resourceType || currentOptions.value?.cleanup)
  )
  const resourceTitle = computed(() => {
    const options = currentOptions.value
    if (!options) return '当前资料'
    if (options.resources.length === 1) {
      return `${options.resourceLabel}“${options.resources[0].label}”`
    }
    return `选中的 ${options.resources.length} 个${options.resourceLabel}`
  })
  const cleanupAll = computed(() => currentOptions.value?.cleanup?.selectionMode === 'all')
  const safeRecords = computed(() =>
    dependencies.value.filter((item) => item.cleanupAllowed && canCleanup.value)
  )
  const safeRecordCount = computed(
    () => currentOptions.value?.cleanup?.count?.(safeRecords.value) ?? safeRecords.value.length
  )
  const cleanupRecords = computed(() =>
    cleanupAll.value
      ? safeRecords.value
      : safeRecords.value.filter((item) => selectedRecordIds.value.includes(item.recordId))
  )
  const cleanupActionCount = computed(
    () =>
      currentOptions.value?.cleanup?.count?.(cleanupRecords.value) ?? cleanupRecords.value.length
  )
  const dependencyGroups = computed<DependencyGroup[]>(() => {
    const groups = groupBy(dependencies.value, (item) => item.dependencyCode)
    return Object.entries(groups)
      .map(([code, records]) => ({
        code,
        records,
        meta: currentOptions.value?.dependencyMeta?.[code] ??
          dependencyMeta[code] ?? {
            label: code,
            unit: '条',
            description: '该记录仍引用当前主数据，请先处理后再删除。',
            actionLabel: '去处理',
            order: 999
          }
      }))
      .sort((left, right) => left.meta.order - right.meta.order)
  })

  const formatRecordMeta = (record: MasterDataDeleteDependencyDetail): string => {
    const hasStatusDictionary =
      currentOptions.value?.dependencyMeta?.[record.dependencyCode]?.statusDictCode
    const parts = [
      record.recordSummary,
      hasStatusDictionary ? null : formatReferenceStatus(record.recordStatus)
    ]
    if ((currentOptions.value?.resources.length ?? 0) > 1) {
      const resource = currentOptions.value?.resources.find((item) => item.id === record.resourceId)
      if (resource) parts.unshift(`引用：${resource.label}`)
    }
    if (record.recordAmount !== null && record.recordAmount !== undefined) {
      parts.push(formatSensitiveNumberWithAffix(record.recordAmount, { prefix: '¥' }))
    }
    return parts.filter(Boolean).join(' · ') || (hasStatusDictionary ? '' : '待处理')
  }

  const toggleRecordSelection = (recordId: string, checked: boolean): void => {
    selectedRecordIds.value = checked
      ? uniq([...selectedRecordIds.value, recordId])
      : selectedRecordIds.value.filter((id) => id !== recordId)
  }

  const getGroupSafeRecords = (group: DependencyGroup): MasterDataDeleteDependencyDetail[] =>
    group.records.filter((record) => record.cleanupAllowed)

  const isGroupFullySelected = (group: DependencyGroup): boolean => {
    const safeRecords = getGroupSafeRecords(group)
    return (
      safeRecords.length > 0 &&
      safeRecords.every((record) => selectedRecordIds.value.includes(record.recordId))
    )
  }

  const isGroupPartiallySelected = (group: DependencyGroup): boolean => {
    const selectedCount = getGroupSafeRecords(group).filter((record) =>
      selectedRecordIds.value.includes(record.recordId)
    ).length
    return selectedCount > 0 && !isGroupFullySelected(group)
  }

  const toggleGroupSelection = (group: DependencyGroup, checked: boolean): void => {
    const groupRecordIds = getGroupSafeRecords(group).map((record) => record.recordId)
    selectedRecordIds.value = checked
      ? uniq([...selectedRecordIds.value, ...groupRecordIds])
      : selectedRecordIds.value.filter((recordId) => !groupRecordIds.includes(recordId))
  }

  const loadDependencies = async (sequence = inspectionSequence): Promise<void> => {
    const options = currentOptions.value
    if (!options) return
    const records = options.fetchDependencies
      ? await options.fetchDependencies(resourceIds.value)
      : await fetchMasterDataDeleteDependencies(options.resourceType, resourceIds.value)
    if (options !== currentOptions.value || sequence !== inspectionSequence) return
    dependencies.value = records
    selectedRecordIds.value = []
  }

  const inspect = async (options: MasterDataDeleteGuardOpenOptions): Promise<boolean> => {
    const sequence = ++inspectionSequence
    const hadDialog = Boolean(unref(dialogRef.value?.visible))
    currentOptions.value = options
    if (!hadDialog) dependencies.value = []
    selectedRecordIds.value = []
    inspectionError.value = ''
    checking.value = true
    progressMessage?.close()
    const progressTimer = window.setTimeout(() => {
      if (sequence !== inspectionSequence || hadDialog) return
      progressMessage = ElMessage({
        message: '正在检查删除条件…',
        icon: () => h(Loading, { class: 'el-icon is-loading' }),
        duration: 0,
        type: 'info'
      })
    }, 200)
    const showResult = () =>
      dialogRef.value?.handleOpen(
        {},
        {
          title: inspectionError.value ? '删除检查未完成' : `暂时无法删除${options.resourceLabel}`,
          size: inspectionError.value ? 'sm' : 'md',
          contentMaxHeight: '68vh',
          loading: false,
          showCancelButton: false,
          showConfirmButton: false,
          dialogProps: { closeOnClickModal: false }
        }
      )
    try {
      if (options.resolveResources) {
        const resources = await options.resolveResources()
        if (sequence !== inspectionSequence) return true
        currentOptions.value = { ...options, resources }
      }
      await loadDependencies()
      if (sequence !== inspectionSequence || (hadDialog && !unref(dialogRef.value?.visible)))
        return true
      if (dependencies.value.length || blockingResources.value.length) {
        await showResult()
        return true
      }
      if (hadDialog) await dialogRef.value?.handleClose(true)
      return false
    } catch (error) {
      if (sequence === inspectionSequence && (!hadDialog || unref(dialogRef.value?.visible))) {
        inspectionError.value = getFriendlySupabaseErrorMessage(
          error,
          '暂时无法检查关联资料，请重试'
        )
        await showResult()
      }
      return true
    } finally {
      window.clearTimeout(progressTimer)
      if (sequence === inspectionSequence) {
        checking.value = false
        progressMessage?.close()
        progressMessage = undefined
      }
    }
  }

  const retryInspection = async (): Promise<void> => {
    if (!currentOptions.value) return
    const blocked = await inspect(currentOptions.value)
    if (!blocked) ElMessage.info('关联已解除，请再次点击删除')
  }

  const handleCleanup = async (): Promise<void> => {
    const options = currentOptions.value
    const selected = cleanupRecords.value
    if (
      !options ||
      !canCleanup.value ||
      !selected.length ||
      !cleanupActionCount.value ||
      checking.value ||
      inspectionError.value ||
      cleanupLoading.value
    )
      return
    try {
      await confirmAction(
        options.cleanup?.confirmMessage(cleanupActionCount.value) ??
          `将永久清理选中的 ${selected.length} 项配置或终态记录。运单、合同和财务历史不会被删除，是否继续？`,
        '清理关联项确认',
        {
          type: 'warning',
          confirmButtonText: options.cleanup?.actionLabel ?? `确认清理 ${selected.length} 项`,
          cancelButtonText: '取消',
          confirmButtonType: 'danger',
          closeOnClickModal: false
        }
      )
      cleanupLoading.value = true
      let deletedCount = 0
      if (options.cleanup) {
        deletedCount = await options.cleanup.run(selected)
      } else if (options.resourceType) {
        const grouped = groupBy(selected, (item) => item.dependencyCode)
        for (const [dependencyCode, records] of Object.entries(grouped)) {
          deletedCount += await cleanupMasterDataDeleteDependencies({
            resourceType: options.resourceType,
            resourceIds: resourceIds.value,
            dependencyCode,
            recordIds: records.map((item) => item.recordId)
          })
        }
      }
      await loadDependencies()
      if (!dependencies.value.length) {
        await dialogRef.value?.handleClose(true)
        ElMessage.success(`已清理 ${deletedCount} 项关联资料，现在可以重新删除`)
        emit('cleared')
        return
      }
      ElMessage.success(`已清理 ${deletedCount} 项，其余业务历史仍需保留或处理`)
    } catch (error) {
      if (error !== 'cancel' && error !== 'close') {
        try {
          await loadDependencies()
        } catch (checkError) {
          inspectionError.value = getFriendlySupabaseErrorMessage(
            checkError,
            '关联重新检查失败，请稍后重试'
          )
        }
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '清理失败，请稍后重试'))
      }
    } finally {
      cleanupLoading.value = false
    }
  }

  const resolvingDependency = ref(false)
  const openDependency = async (
    meta: DependencyMeta,
    record: MasterDataDeleteDependencyDetail
  ): Promise<void> => {
    const options = currentOptions.value
    if (!options) return
    if (meta.canNavigate && !meta.canNavigate()) {
      ElMessage.error('当前账号无权查看关联记录，请联系业务负责人核对')
      return
    }
    const resourceQueryKeyMap: Record<MasterDataDeleteResourceType, string> = {
      carrier: 'carrierId',
      driver: 'driverId',
      cargo: 'cargoId',
      customer_address: 'addressId',
      vehicle: 'vehicleId',
      organization: 'organizationId',
      role: 'roleId',
      menu: 'menuId',
      dict_type: 'dictTypeId',
      dictionary: 'dictionaryId',
      attachment: 'attachmentId',
      order: 'orderId'
    }
    const resourceType =
      options.resourceType ?? options.navigationResource?.type ?? 'accessory_item'
    const resourceQuery = options.resourceType
      ? { [resourceQueryKeyMap[options.resourceType]]: record.resourceId }
      : { [options.navigationResource?.queryKey ?? 'accessoryItemId']: record.resourceId }
    const query = {
      fromMasterDelete: '1',
      resourceType,
      ...resourceQuery,
      recordId: record.targetId,
      recordNo: record.recordNo,
      dependencyCode: record.dependencyCode,
      returnPath: route.fullPath,
      resourceId: record.resourceId,
      resourceLabel: options.resourceLabel,
      resourceName:
        options.resources.find((item) => item.id === record.resourceId)?.label ??
        options.resourceLabel
    }
    if (meta.resolveRouteName || meta.routeName) {
      if (resolvingDependency.value) return
      resolvingDependency.value = true
      try {
        const name = meta.resolveRouteName ? await meta.resolveRouteName(record) : meta.routeName
        if ((!name || !router.hasRoute(name)) && meta.applicationCode && meta.routePath) {
          await dialogRef.value?.handleClose(true)
          await navigateToApplication(meta.applicationCode, meta.routePath, {
            ...query,
            ...(typeof meta.routeQuery === 'function' ? meta.routeQuery(record) : meta.routeQuery)
          })
          return
        }
        if (!name || !router.hasRoute(name)) {
          ElMessage.error('关联记录已不存在或当前账号无权查看，请重新检查关联')
          return
        }
        const params = await meta.routeParams?.(record)
        if (params === null) {
          ElMessage.error('关联记录已不存在或当前账号无权查看，请重新检查关联')
          return
        }
        await dialogRef.value?.handleClose(true)
        await router.push({
          name,
          params,
          query: {
            ...query,
            ...(typeof meta.routeQuery === 'function' ? meta.routeQuery(record) : meta.routeQuery)
          }
        })
      } catch (error) {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '关联记录定位失败，请重试'))
      } finally {
        resolvingDependency.value = false
      }
      return
    }
    if (record.dependencyCode === 'vehicle_reminder_work_order') {
      const reminderRoutes = {
        insurance: '/vms/reminder-manage/insurance-expiry',
        inspection: '/vms/reminder-manage/inspection-expiry',
        maintenance: '/vms/reminder-manage/maintenance-expiry',
        part: '/vms/reminder-manage/part-service-life',
        vehicle: '/vms/reminder-manage/vehicle-service-life'
      } as const
      dialogRef.value?.setLoading(true)
      try {
        const destination = await fetchVehicleReminderDeleteDestination(record.targetId)
        if (!destination || !reminderRoutes[destination.sourceType]) {
          ElMessage.error('关联工单已不存在或当前账号无法访问')
          return
        }
        await dialogRef.value?.handleClose(true)
        await router.push({
          path: reminderRoutes[destination.sourceType],
          query: { ...query, sourceKey: destination.sourceKey }
        })
      } catch (error) {
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '关联工单定位失败，请重试'))
      } finally {
        dialogRef.value?.setLoading(false)
      }
      return
    }
    await dialogRef.value?.handleClose(true)
    if (meta.routePath)
      await router.push({
        path: meta.routePath,
        query: {
          ...query,
          ...(typeof meta.routeQuery === 'function' ? meta.routeQuery(record) : meta.routeQuery)
        }
      })
  }

  defineExpose({ inspect, checking })
</script>

<style scoped lang="scss">
  .master-delete-guard {
    display: grid;
    gap: 12px;
    min-width: 0;

    &__error {
      display: flex;
      gap: 14px;
      align-items: flex-start;
      padding: 18px;
      background: var(--el-color-danger-light-9);
      border: 1px solid var(--el-color-danger-light-8);
      border-radius: var(--el-border-radius-base);

      > div {
        min-width: 0;
      }

      strong,
      p,
      small {
        display: block;
        margin: 0;
        line-height: 1.5;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin-top: 6px;
        color: var(--el-color-danger-dark-2);
      }

      small {
        margin-top: 8px;
        color: var(--el-text-color-secondary);
      }
    }

    &__error-icon {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      font-size: 19px;
      color: var(--el-color-danger);
      background: var(--el-bg-color);
      border-radius: var(--el-border-radius-base);
    }

    &__lead {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;

      p {
        margin: 0;
        line-height: 1.6;
        color: var(--el-text-color-primary);
      }

      span {
        display: block;
        margin-top: 2px;
        font-size: 13px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }

      .el-tag {
        flex: none;
      }
    }

    &__groups {
      display: grid;
      gap: 10px;
    }

    &__group {
      padding: 12px;
      background: var(--el-fill-color-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__group-header,
    &__group-header-actions,
    &__group-title,
    &__record,
    &__record-actions,
    &__footer,
    &__footer-actions,
    &__notice {
      display: flex;
      align-items: center;
    }

    &__group-header,
    &__footer {
      justify-content: space-between;
    }

    &__group-title {
      gap: 8px;

      > span {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        font-size: 12px;
        font-weight: 700;
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border-radius: 50%;
      }
    }

    &__group-header-actions {
      gap: 10px;
    }

    &__group-help {
      margin: 5px 0 0 30px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--el-text-color-secondary);
    }

    &__records {
      display: grid;
      gap: 6px;
      padding-top: 10px;
      margin-top: 10px;
      border-top: 1px dashed var(--el-border-color);
    }

    &__record {
      gap: 8px;
      min-width: 0;
      padding: 8px;
      background: var(--el-bg-color);
      border-radius: var(--el-border-radius-small);
    }

    &__record-spacer {
      flex: 0 0 14px;
      width: 14px;
    }

    &__record-copy {
      display: grid;
      flex: 1;
      min-width: 0;

      strong,
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      span {
        margin-top: 2px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__record-actions,
    &__footer-actions,
    &__notice {
      flex: none;
      gap: 8px;
    }

    &__notice {
      align-items: flex-start;
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--el-color-warning-dark-2);
      background: var(--el-color-warning-light-9);
      border-radius: var(--el-border-radius-base);

      i {
        margin-top: 1px;
        font-size: 16px;
      }
    }

    &__footer {
      gap: 16px;
      width: 100%;

      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    @media (width <= 640px) {
      &__lead,
      &__record,
      &__footer {
        flex-direction: column;
        align-items: stretch;
      }

      &__record-actions,
      &__footer-actions {
        justify-content: space-between;
      }

      &__footer-actions .el-button {
        flex: 1;
      }
    }
  }
</style>
