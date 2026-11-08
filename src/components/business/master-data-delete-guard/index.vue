<template>
  <ArtDialog ref="dialogRef" @close="invalidateDialogWork">
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
  import { formatReferenceStatus, getRecordReferenceMeta } from './record-meta'
  import { cloneDeep, groupBy, uniq } from 'lodash-es'
  import { Loading } from '@element-plus/icons-vue'
  import { ElMessage, type MessageHandler, type CheckboxValueType } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantOperationGuard } from '@/hooks/core/useTenantOperationGuard'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { useAuth } from '@/hooks/core/useAuth'
  import { createRecordReferenceNavigation } from './record-navigation'
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
  const captureOperation = useTenantOperationGuard()
  const tenantScope = useTenantScopeStore()
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const referenceNavigation = createRecordReferenceNavigation(hasAuth)
  const dialogRef = ref<ArtDialogExpose<Record<string, never>>>()
  const {
    version: dialogSession,
    invalidate: invalidateDialogSession,
    isCurrent: isDialogSessionCurrent
  } = useArtOverlaySession(() => Boolean(unref(dialogRef.value?.visible)))
  const currentOptions = shallowRef<MasterDataDeleteGuardOpenOptions>()
  const dependencies = shallowRef<MasterDataDeleteDependencyDetail[]>([])
  const selectedRecordIds = ref<string[]>([])
  const cleanupLoading = ref(false)
  const inspectionError = ref('')
  let inspectionSequence = 0
  let cleanupSequence = 0
  let navigationSequence = 0
  let active = true
  const checking = ref(false)
  const resolvingDependency = ref(false)
  let progressMessage: MessageHandler | undefined
  const cancelInspection = () => {
    inspectionSequence += 1
    checking.value = false
    progressMessage?.close()
  }
  const invalidateDialogWork = () => {
    cancelInspection()
    invalidateDialogSession()
    cleanupSequence += 1
    navigationSequence += 1
    cleanupLoading.value = false
    resolvingDependency.value = false
  }
  const leaveContext = () => {
    invalidateDialogWork()
    currentOptions.value = undefined
    dependencies.value = []
    selectedRecordIds.value = []
    inspectionError.value = ''
    if (unref(dialogRef.value?.visible)) void dialogRef.value?.handleClose(true)
  }
  watch(
    () => [
      route.fullPath,
      tenantScope.revision,
      tenantScope.effectiveTenantId,
      userStore.getUserInfo.userId
    ],
    leaveContext,
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    active = false
    invalidateDialogWork()
  })
  onDeactivated(() => {
    active = false
    leaveContext()
  })
  onActivated(() => {
    active = true
  })

  const dependencyMeta: Record<string, DependencyMeta> = {
    attachment_website_configuration: {
      label: '网站配置',
      unit: '项',
      description: '图片正在用于网站标识或菜单品牌字图，请先在网站配置中替换后再删除。',
      actionLabel: '查看网站配置',
      routeName: 'WebsiteConfig',
      order: 10
    },
    carrier_price: {
      label: '承运商价格方案',
      unit: '条',
      description: '请先到承运商协议价页面核对并处理报价配置，再重试删除。',
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
    cargo_waybill: {
      ...createWaybillMeta('货物关联运单', 10),
      routeName: 'TmsWaybillDetail',
      routeParams: (record) => ({ id: record.targetId }),
      canNavigate: () => hasAuth('TmsLoadedWaybillList:View')
    },
    cargo_contract: {
      label: '货物关联运输合同',
      unit: '份',
      description: '合同包含该货物的运输约定，请先核对并处理合同引用。',
      actionLabel: '查看运输合同',
      routeName: 'TmsContract',
      routeParams: (record) => ({ id: record.targetId }),
      canNavigate: () => hasAuth('TmsContract:View'),
      statusDictCode: 'tmsContractStatus',
      order: 11
    },
    cargo_order: {
      label: '货物关联运输订单',
      unit: '单',
      description: '订单货物清单仍引用该货物，请先核对并处理订单。',
      actionLabel: '查看运输订单',
      ...referenceNavigation.tms_order,
      statusDictCode: 'tmsOrderStatus',
      order: 12
    },
    cargo_waybill_allocation: {
      ...createWaybillMeta('运单货物分配', 13),
      routeName: 'TmsWaybillDetail',
      routeParams: (record) => ({ id: record.targetId }),
      canNavigate: () => hasAuth('TmsLoadedWaybillList:View')
    },
    cargo_customer_price: {
      ...createGovernanceMeta(
        '货物关联客户协议价',
        '条',
        '客户协议价的货物清单仍引用该货物，请先处理协议价。',
        '查看客户协议价',
        'TmsCustomerPrice',
        14
      ),
      ...referenceNavigation.tms_customer_price,
      statusDictCode: 'tmsPriceAgreementStatus'
    },
    cargo_carrier_price: {
      ...createGovernanceMeta(
        '货物关联承运商协议价',
        '条',
        '承运商协议价的货物清单仍引用该货物，请先处理协议价。',
        '查看承运商协议价',
        'TmsCarrierPrice',
        15
      ),
      ...referenceNavigation.tms_carrier_price,
      statusDictCode: 'tmsPriceAgreementStatus'
    },
    address_waybill: {
      ...createWaybillMeta('地址关联运单', 10),
      routeName: 'TmsWaybillDetail',
      routeParams: (record) => ({ id: record.targetId }),
      canNavigate: () => hasAuth('TmsLoadedWaybillList:View')
    },
    address_favorite_route: {
      ...createGovernanceMeta(
        '地址关联常用线路',
        '条',
        '线路仍使用该装卸地址，请先调整线路地址。',
        '查看常用线路',
        'TmsFavoriteRoute',
        11
      ),
      canNavigate: () => hasAuth('TmsFavoriteRoute:View')
    },
    address_order: {
      label: '地址关联运输订单',
      unit: '单',
      description: '订单仍使用该装卸地址，请先核对并处理订单引用。',
      actionLabel: '查看运输订单',
      ...referenceNavigation.tms_order,
      statusDictCode: 'tmsOrderStatus',
      order: 12
    },
    address_customer_price: {
      ...createGovernanceMeta(
        '地址关联客户协议价',
        '条',
        '客户协议价仍使用该地址，请先调整协议价的装卸地址。',
        '查看客户协议价',
        'TmsCustomerPrice',
        13
      ),
      ...referenceNavigation.tms_customer_price,
      statusDictCode: 'tmsPriceAgreementStatus'
    },
    address_carrier_price: {
      ...createGovernanceMeta(
        '地址关联承运商协议价',
        '条',
        '承运商协议价仍使用该地址，请先调整协议价的装卸地址。',
        '查看承运商协议价',
        'TmsCarrierPrice',
        14
      ),
      ...referenceNavigation.tms_carrier_price,
      statusDictCode: 'tmsPriceAgreementStatus'
    },
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
    tms_driver_blacklist: {
      label: '司机黑名单历史',
      unit: '条',
      description: '司机存在黑名单记录，请先在黑名单页面核对历史。',
      actionLabel: '查看黑名单记录',
      ...referenceNavigation.tms_driver_blacklist,
      statusDictCode: 'tmsDriverBlacklistStatus',
      order: 22
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
    carrier_billing_waybill: createWaybillMeta('保留开票账户快照的运单', 115),
    carrier_child_unit: {
      ...createGovernanceMeta(
        '下级承运商',
        '家',
        '请先调整下级承运商的上级单位，再删除当前承运商。',
        '查看下级承运商',
        'TmsCarrier',
        120
      ),
      canNavigate: () => hasAuth('TmsCarrier:View')
    },
    carrier_vehicle: {
      ...createGovernanceMeta(
        '归属车辆',
        '辆',
        '请先在车辆档案中调整承运商归属，再重试删除。',
        '查看车辆',
        'VehicleArchiveManage',
        130
      ),
      canNavigate: () => hasAuth('VehicleArchive:View')
    },
    carrier_trailer: {
      ...createGovernanceMeta(
        '归属挂车',
        '辆',
        '请先在挂车档案中调整承运商归属，再重试删除。',
        '查看挂车',
        'TrailerManage',
        140
      ),
      canNavigate: () => hasAuth('TrailerManage:View')
    },
    carrier_waybill_cost: {
      ...createFinanceMeta('承运商运单费用', '单', financeRouteNames.waybillCostDetail, 150),
      ...referenceNavigation.tms_waybill_cost
    },
    carrier_payable_settlement_line: {
      ...createFinanceMeta('承运商付款业务明细', '条', 'FinancePayablePayment', 160),
      ...referenceNavigation.fms_payable_settlement_document
    },
    carrier_driver_invitation: {
      label: '承运商司机邀请',
      unit: '条',
      description: '邀请记录保留了承运商身份关联，请先联系业务负责人核对后再处理。',
      actionLabel: '查看邀请记录',
      canNavigate: () => false,
      order: 170
    },
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
    attachment_scm_sales_contract: {
      label: '销售合同附件',
      unit: '份',
      description: '附件已关联合同，请到合同中核对并替换或移除关联后再删除资源。',
      actionLabel: '查看销售合同',
      routeName: 'ScmSalesContract',
      applicationCode: 'scm',
      routePath: '/scm/sales-management/sales-contract',
      statusDictCode: 'scmDocumentStatus',
      canNavigate: () => hasAuth('ScmSalesContract:View'),
      order: 20
    },
    attachment_scm_purchase_contract: {
      label: '采购合同附件',
      unit: '份',
      description: '附件已关联合同，请到合同中核对并替换或移除关联后再删除资源。',
      actionLabel: '查看采购合同',
      routeName: 'ScmPurchaseContract',
      applicationCode: 'scm',
      routePath: '/scm/purchase-management/purchase-contract',
      routeQuery: { dependencyCode: 'scm_purchase_document' },
      statusDictCode: 'scmPurchaseStatus',
      canNavigate: () => hasAuth('ScmPurchaseContract:View'),
      order: 30
    },
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
      statusDictCode: 'tmsWaybillStatus',
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

  const blockingResources = computed(
    () => currentOptions.value?.resources.filter((item) => item.blockReason) ?? []
  )
  const viewBlockedResource = async (resource: MasterDataDeleteResource): Promise<void> => {
    if (!resource.to || resolvingDependency.value) return
    const options = currentOptions.value
    const operationCurrent = captureOperation()
    const inspection = inspectionSequence
    const session = dialogSession.value
    const navigation = ++navigationSequence
    const destination = cloneDeep(resource.to)
    const isCurrent = () =>
      active &&
      operationCurrent() &&
      currentOptions.value === options &&
      inspection === inspectionSequence &&
      navigation === navigationSequence &&
      isDialogSessionCurrent(session)
    let closedByThis = false
    const afterCloseCurrent = () =>
      closedByThis &&
      active &&
      operationCurrent() &&
      currentOptions.value === options &&
      inspectionSequence <= inspection + 1 &&
      navigationSequence <= navigation + 1
    try {
      if (!isCurrent()) return
      resolvingDependency.value = true
      closedByThis = true
      const closed = await dialogRef.value?.handleClose(true)
      if (!closed || !afterCloseCurrent()) return
      await router.push(destination)
    } catch (error) {
      if (isCurrent() || afterCloseCurrent())
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '单据定位失败，请返回对应列表查询'))
    } finally {
      if (
        navigation === navigationSequence ||
        (closedByThis && navigationSequence === navigation + 1)
      )
        resolvingDependency.value = false
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
            label: getRecordReferenceMeta(code).label,
            unit: '条',
            description: '该记录仍引用当前主数据，请先处理后再删除。',
            actionLabel: '去处理',
            order: 999
          }
      }))
      .sort((left, right) => left.meta.order - right.meta.order)
  })

  const formatRecordMeta = (record: MasterDataDeleteDependencyDetail): string => {
    const hasStatusDictionary = (
      currentOptions.value?.dependencyMeta?.[record.dependencyCode] ??
      dependencyMeta[record.dependencyCode]
    )?.statusDictCode
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

  const loadDependencies = async (
    options: MasterDataDeleteGuardOpenOptions,
    resources: MasterDataDeleteResource[],
    isCurrent: () => boolean
  ): Promise<boolean> => {
    const ids = resources.map((item) => item.id)
    const records = options.fetchDependencies
      ? await options.fetchDependencies(ids)
      : await fetchMasterDataDeleteDependencies(options.resourceType, ids)
    if (!isCurrent()) return false
    dependencies.value = records
    selectedRecordIds.value = []
    return true
  }

  const inspect = async (options: MasterDataDeleteGuardOpenOptions): Promise<boolean> => {
    const sequence = ++inspectionSequence
    cleanupSequence += 1
    navigationSequence += 1
    invalidateDialogSession()
    cleanupLoading.value = false
    resolvingDependency.value = false
    const operationCurrent = captureOperation()
    const isCurrent = () => active && sequence === inspectionSequence && operationCurrent()
    const hadDialog = Boolean(unref(dialogRef.value?.visible))
    currentOptions.value = options
    if (!hadDialog) dependencies.value = []
    selectedRecordIds.value = []
    inspectionError.value = ''
    checking.value = true
    progressMessage?.close()
    const progressTimer = window.setTimeout(() => {
      if (!isCurrent() || hadDialog) return
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
      let resolvedOptions = options
      if (options.resolveResources) {
        const resources = await options.resolveResources()
        if (!isCurrent()) return true
        resolvedOptions = { ...options, resources }
        currentOptions.value = resolvedOptions
      }
      if (!(await loadDependencies(resolvedOptions, resolvedOptions.resources, isCurrent)))
        return true
      if (!isCurrent() || (hadDialog && !unref(dialogRef.value?.visible))) return true
      if (dependencies.value.length || blockingResources.value.length) {
        await showResult()
        return true
      }
      if (hadDialog && !(await dialogRef.value?.handleClose(true))) return true
      return active &&
        operationCurrent() &&
        currentOptions.value === resolvedOptions &&
        (sequence === inspectionSequence || (hadDialog && sequence + 1 === inspectionSequence))
        ? false
        : true
    } catch (error) {
      if (isCurrent() && (!hadDialog || unref(dialogRef.value?.visible))) {
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
    const resources = options?.resources.map((item) => ({ ...item })) ?? []
    const selected = cleanupRecords.value.map((item) => ({ ...item }))
    const actionCount = cleanupActionCount.value
    if (
      !options ||
      !canCleanup.value ||
      !selected.length ||
      !actionCount ||
      checking.value ||
      inspectionError.value ||
      cleanupLoading.value
    )
      return
    const operationCurrent = captureOperation()
    const inspection = inspectionSequence
    const session = dialogSession.value
    const cleanup = ++cleanupSequence
    const isCurrent = () =>
      active &&
      cleanup === cleanupSequence &&
      inspection === inspectionSequence &&
      operationCurrent() &&
      currentOptions.value === options &&
      isDialogSessionCurrent(session)
    if (!isCurrent()) return
    cleanupLoading.value = true
    try {
      await confirmAction(
        options.cleanup?.confirmMessage(actionCount) ??
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
      if (!isCurrent()) return
      let deletedCount = 0
      if (options.cleanup) {
        deletedCount = await options.cleanup.run(selected)
        if (!isCurrent()) return
      } else if (options.resourceType) {
        const grouped = groupBy(selected, (item) => item.dependencyCode)
        for (const [dependencyCode, records] of Object.entries(grouped)) {
          if (!isCurrent()) return
          deletedCount += await cleanupMasterDataDeleteDependencies({
            resourceType: options.resourceType,
            resourceIds: resources.map((item) => item.id),
            dependencyCode,
            recordIds: records.map((item) => item.recordId)
          })
          if (!isCurrent()) return
        }
      }
      if (!(await loadDependencies(options, resources, isCurrent))) return
      if (!isCurrent()) return
      if (!dependencies.value.length) {
        ElMessage.success(`已清理 ${deletedCount} 项关联资料，现在可以重新删除`)
        emit('cleared')
        await dialogRef.value?.handleClose(true)
        return
      }
      ElMessage.success(`已清理 ${deletedCount} 项，其余业务历史仍需保留或处理`)
    } catch (error) {
      if (isCurrent() && error !== 'cancel' && error !== 'close') {
        try {
          await loadDependencies(options, resources, isCurrent)
        } catch (checkError) {
          if (isCurrent())
            inspectionError.value = getFriendlySupabaseErrorMessage(
              checkError,
              '关联重新检查失败，请稍后重试'
            )
        }
        if (isCurrent())
          ElMessage.error(getFriendlySupabaseErrorMessage(error, '清理失败，请稍后重试'))
      }
    } finally {
      if (cleanup === cleanupSequence) cleanupLoading.value = false
    }
  }

  const openDependency = async (
    meta: DependencyMeta,
    sourceRecord: MasterDataDeleteDependencyDetail
  ): Promise<void> => {
    const options = currentOptions.value
    if (!options || resolvingDependency.value) return
    const record = cloneDeep(sourceRecord)
    const operationCurrent = captureOperation()
    const inspection = inspectionSequence
    const session = dialogSession.value
    const navigation = ++navigationSequence
    const isCurrent = () =>
      active &&
      navigation === navigationSequence &&
      inspection === inspectionSequence &&
      operationCurrent() &&
      currentOptions.value === options &&
      isDialogSessionCurrent(session) &&
      (meta.canNavigate?.() ?? true)
    if (!isCurrent()) {
      if (operationCurrent() && meta.canNavigate && !meta.canNavigate())
        ElMessage.error('当前账号无权查看关联记录，请联系业务负责人核对')
      return
    }
    resolvingDependency.value = true
    let closedByThis = false
    const afterCloseCurrent = () =>
      closedByThis &&
      active &&
      operationCurrent() &&
      currentOptions.value === options &&
      inspectionSequence <= inspection + 1 &&
      navigationSequence <= navigation + 1 &&
      (meta.canNavigate?.() ?? true)
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
    try {
      const extraQuery = cloneDeep(
        typeof meta.routeQuery === 'function' ? meta.routeQuery(record) : meta.routeQuery
      )
      if (meta.resolveRouteName || meta.routeName) {
        const name = meta.resolveRouteName ? await meta.resolveRouteName(record) : meta.routeName
        if (!isCurrent()) return
        if ((!name || !router.hasRoute(name)) && meta.applicationCode && meta.routePath) {
          closedByThis = true
          const closed = await dialogRef.value?.handleClose(true)
          if (!closed || !afterCloseCurrent()) return
          await navigateToApplication(meta.applicationCode, meta.routePath, {
            ...query,
            ...extraQuery
          })
          return
        }
        if (!name || !router.hasRoute(name)) {
          ElMessage.error('关联记录已不存在或当前账号无权查看，请重新检查关联')
          return
        }
        const params = await meta.routeParams?.(record)
        if (!isCurrent()) return
        if (params === null) {
          ElMessage.error('关联记录已不存在或当前账号无权查看，请重新检查关联')
          return
        }
        closedByThis = true
        const closed = await dialogRef.value?.handleClose(true)
        if (!closed || !afterCloseCurrent()) return
        await router.push({
          name,
          params,
          query: { ...query, ...extraQuery }
        })
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
        const destination = await fetchVehicleReminderDeleteDestination(record.targetId)
        if (!isCurrent()) return
        if (!destination || !reminderRoutes[destination.sourceType]) {
          ElMessage.error('关联工单已不存在或当前账号无法访问')
          return
        }
        closedByThis = true
        const closed = await dialogRef.value?.handleClose(true)
        if (!closed || !afterCloseCurrent()) return
        await router.push({
          path: reminderRoutes[destination.sourceType],
          query: { ...query, sourceKey: destination.sourceKey }
        })
        return
      }
      if (!isCurrent()) return
      closedByThis = true
      const closed = await dialogRef.value?.handleClose(true)
      if (closed && meta.routePath && afterCloseCurrent())
        await router.push({
          path: meta.routePath,
          query: { ...query, ...extraQuery }
        })
    } catch (error) {
      if (isCurrent() || afterCloseCurrent())
        ElMessage.error(getFriendlySupabaseErrorMessage(error, '关联记录定位失败，请重试'))
    } finally {
      if (
        navigation === navigationSequence ||
        (closedByThis && navigationSequence === navigation + 1)
      ) {
        resolvingDependency.value = false
        dialogRef.value?.setLoading(false)
      }
    }
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
