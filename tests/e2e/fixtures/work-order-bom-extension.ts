import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { setupGlobDirectives } from '@/directives'
import WorkOrderDialog from '@mes/views/components/manufacturing/modules/work-order-dialog.vue'
import type { MesWorkOrder, MesWorkOrderBomSnapshot, MesWorkOrderRouteSnapshot } from '@mes/api'
import type { WorkOrderExtensionValues } from '@/types/business/work-order-extension'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const typeId = '33333333-3333-4333-8333-333333333333'
const materialId = '44444444-4444-4444-8444-444444444444'
const tenantOptions = [
  { label: '测试租户 A', value: tenantA },
  { label: '测试租户 B', value: tenantB }
]

const savedBom: MesWorkOrderBomSnapshot = {
  id: 'bom-snapshot-a',
  bomCode: 'BOM-PANEL-TEST',
  version: 'V2',
  status: 'active',
  items: [
    {
      id: 'bom-line-a',
      componentMaterialId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
      componentMaterialCode: 'BOM-CORE-A',
      componentMaterialName: '快照芯材 A',
      componentSpecification: '1200 × 800',
      sequenceNo: 10,
      quantity: 2,
      basicQuantity: 2,
      requiredQuantity: 20,
      unitId: 'unit-a',
      unitName: '件',
      positionNo: 'P01',
      operationName: '裁切',
      assignedRouteStepId: 'route-step-a',
      assignedOperationCode: 'CUT',
      assignedOperationName: '裁切',
      assignmentSource: 'configured',
      sourcePath: ['BOM-PANEL-TEST', 'BOM-CORE-A'],
      virtualUnexpanded: false
    }
  ]
}

const savedRoute: MesWorkOrderRouteSnapshot = {
  id: 'route-a',
  name: '板材标准路线',
  code: 'ROUTE-PANEL',
  version: 'V3',
  steps: [
    {
      id: 'route-step-a',
      code: 'CUT',
      name: '裁切',
      operationCode: 'CUT',
      sort: 10,
      sequenceNo: 10,
      sequenceType: 'standard',
      workCenterId: null,
      workCenterIds: [],
      workCenterNames: ['一号工作中心'],
      departmentId: null,
      departmentName: '板材车间',
      unitId: null,
      unitName: '件',
      basicBatch: 1,
      runOutputQuantity: 10,
      runProcessingMinutes: 30,
      runGreenMinutes: 0,
      setupMinutes: 5,
      queueMinutes: 0,
      transferMinutes: 0,
      minimumTransferQuantity: 1,
      overlapEnabled: false,
      operatorCount: 1,
      machineCount: 1,
      controlCode: '',
      controlCodeName: '',
      operationMode: '',
      processingMode: '',
      reportMode: '',
      inspectionMode: '',
      sequenceControl: '',
      reworkMode: '',
      firstInspectionControl: '',
      needInspection: false,
      firstInspection: false,
      isFirst: true,
      isLast: true,
      critical: false,
      description: '首道工序'
    }
  ]
}

function workOrder(
  tenantId: string,
  extensionValues: WorkOrderExtensionValues = {},
  hasSavedSnapshot = false
): MesWorkOrder {
  return {
    id:
      tenantId === tenantA
        ? '55555555-5555-4555-8555-555555555555'
        : '66666666-6666-4666-8666-666666666666',
    tenantId,
    workOrderNo: tenantId === tenantA ? 'WO-BOM-A' : 'WO-BOM-B',
    workOrderTypeId: typeId,
    extensionValues,
    extensionSchemaSnapshot: [],
    packingEnabledSnapshot: true,
    packingThicknessFieldKeySnapshot: null,
    packingRuleId: null,
    details: [],
    projectId: null,
    constructionNo: null,
    materialId,
    orderQuantity: 10,
    productionUnitId: null,
    isInitialDocument: false,
    plannedStartDate: '2026-10-31',
    plannedEndDate: '2026-11-02',
    productionFixedLeadDaysSnapshot: 0,
    productionPreprocessDaysSnapshot: 0,
    selfMadeProductionDaysSnapshot: 0,
    productionPostprocessDaysSnapshot: 0,
    productionDaysSnapshot: 0,
    schedulingRuleId: null,
    schedulingPriority: 0,
    schedulingStrategySnapshot: 'forward',
    planningTimeFenceDaysSnapshot: 0,
    batchRoundingQuantitySnapshot: null,
    scheduleLocked: false,
    lastScheduledAt: null,
    source: 'manual',
    urgency: 'normal',
    status: 'pending',
    orderStatus: 'CRTD',
    statusReason: null,
    remark: '',
    specialRequirement: null,
    trackingNo: null,
    followNo: null,
    merchandiserId: null,
    salespersonId: null,
    customerCode: null,
    customProcessCode: null,
    specificationQuantity: null,
    salesOrderNo: null,
    salesOrderQuantity: null,
    completedQuantity: 0,
    warehousedQuantity: 0,
    printCount: 0,
    materialCodeSnapshot: 'PANEL-TEST',
    materialNameSnapshot: 'BOM 验证板材',
    specificationSnapshot: '1000 × 50',
    drawingNoSnapshot: '',
    unitSnapshot: '平方米',
    workOrderTypeNameSnapshot: '板材生产工单',
    plannerId: null,
    plannerNameSnapshot: '',
    dispatcherId: null,
    dispatcherNameSnapshot: '',
    inboundWarehouseId: null,
    inboundWarehouseNameSnapshot: '',
    projectNameSnapshot: null,
    bomSnapshot: hasSavedSnapshot ? [savedBom] : [],
    routeSnapshot: hasSavedSnapshot ? savedRoute : {},
    confirmedAt: null,
    closedAt: null,
    deletedAt: null,
    updateTime: '2026-10-31T00:00:00Z',
    createBy: 'work-order-bom-test'
  }
}

const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof WorkOrderDialog>>()
    const modes = [
      ['add', '新增工单'],
      ['edit', '编辑空参数工单'],
      ['copy', '编辑复制工单'],
      ['reference', '编辑参考工单'],
      ['manual', '编辑人工参数工单'],
      ['readonly', '查看只读工单'],
      ['saved', '编辑有生产资料的工单'],
      ['saved-readonly', '查看有生产资料的工单'],
      ['tenant-b', '编辑租户 B 工单']
    ] as const
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'art-page-view p-4' }, [
          h(
            'div',
            { class: 'flex flex-wrap gap-2' },
            modes.map(([mode, label]) =>
              h(
                ElButton,
                {
                  'data-testid': `open-${mode}`,
                  onClick: () => {
                    scope.setTenantScope(mode === 'tenant-b' ? tenantB : tenantA)
                    // Copy/reference edit the newly returned record; RPC creation is verified by database tests.
                    const extensionValues =
                      mode === 'manual'
                        ? {
                            core: '77777777-7777-4777-8777-777777777777',
                            film: '人工覆膜',
                            width: 888
                          }
                        : {}
                    void dialog.value?.handleOpen({
                      tenantId: mode === 'tenant-b' ? tenantB : tenantA,
                      tenantOptions,
                      row:
                        mode === 'add'
                          ? undefined
                          : workOrder(
                              mode === 'tenant-b' ? tenantB : tenantA,
                              extensionValues,
                              mode === 'saved' || mode === 'saved-readonly'
                            ),
                      readonly: mode === 'readonly' || mode === 'saved-readonly'
                    })
                  }
                },
                () => label
              )
            )
          ),
          h(WorkOrderDialog, { ref: dialog })
        ])
      )
  }
})
app.use(store)
initializeTheme()
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/mes/production-plan/work-order', component: { render: () => null } }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'work-order-bom-test',
  tenantId: tenantA,
  platformSuper: true
} as Api.Auth.UserInfo)
const scope = useTenantScopeStore(store)
scope.tenantOptions = tenantOptions.map((option) => ({
  id: option.value,
  tenantCode: option.value === tenantA ? 'A' : 'B',
  tenantName: option.label,
  builtinType: option.value === tenantA ? 'platform' : 'business'
}))
scope.scopeOwnerUserId = 'work-order-bom-test'
scope.setTenantScope(tenantA)
await router.push('/mes/production-plan/work-order')
await router.isReady()
app.mount('#app')
