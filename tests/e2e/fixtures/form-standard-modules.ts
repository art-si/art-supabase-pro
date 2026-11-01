import { createApp, defineAsyncComponent, h, ref, type Component } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import { resolveMasterConfig } from '@mdm/views/components/operational-master/modules/master-config'
import {
  formStandardDictionaries,
  formStandardCompensationPlan
} from './form-standard-modules-data'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const id = '22222222-2222-4222-8222-222222222222'
const unitId = '33333333-3333-4333-8333-333333333333'
const menuId = '88888888-8888-4888-8888-888888888888'
const menuTree = [
  {
    id: menuId,
    parentId: null,
    name: 'MdmSalesCustomer',
    type: 'menu',
    path: '/mdm/sales-master/customer',
    meta: { title: '客户' }
  }
]
const params = new URLSearchParams(location.search)
const valid = params.get('valid') === 'true'
const material = {
  id,
  tenantId,
  materialCode: 'MAT-TEST',
  materialName: '验收物料',
  description: '验收物料',
  productionUnitId: unitId,
  baseUnitId: unitId
}
const supplier = {
  id,
  tenantId,
  supplierCode: 'SUP-TEST',
  supplierName: '验收供应商',
  supplierCategory: 'material',
  supplierType: 'general',
  enterpriseNature: 'private',
  industry: 'manufacturing',
  contactPerson: '验收联系人',
  contactPhone: '13800000000',
  region: '',
  addressDetail: '上海市验收路1号',
  coordinateSystem: 'gcj02',
  groupId: null
}
const tenantOptions = [{ label: '验收租户', value: tenantId }]
const department = { id, tenantId, code: 'DEPT', name: '验收产线', enabled: true }
const warehouse = {
  id,
  tenantId,
  warehouseName: '验收仓库',
  warehouseCode: 'WH',
  enableZones: false,
  enableLocations: false,
  status: 'enabled',
  businessScopes: ['purchase_in']
}
const common = {
  tenantId,
  tenantOptions,
  groups: [{ id, tenantId, name: '验收分组', code: 'GROUP', enabled: true }],
  departments: [department],
  department,
  workCenter: { id, tenantId, code: 'WC', name: '验收工作中心' },
  supplierId: id,
  warehouse,
  zone: null,
  bins: [],
  categories: [],
  materialTypes: [],
  sites: [],
  mode: 'add',
  units: [{ id: unitId, tenantId, unitCode: 'PC', unitName: '件' }]
}
type Entry = {
  load: () => Promise<{ default: Component }>
  page?: boolean
  args?: () => unknown[]
  props?: Record<string, unknown>
  editRow?: Record<string, unknown>
}
const entries: Record<string, Entry> = {
  'mdm-shift-pattern': {
    load: () => import('@mdm/views/production/calendar/modules/pattern-dialog.vue'),
    args: () => [id]
  },
  'hr-compensation-plan': {
    load: () => import('@hr/views/operations/compensation/modules/compensation-dialog.vue'),
    args: () => ['plan', formStandardCompensationPlan]
  },
  'hr-compensation-employee': {
    load: () => import('@hr/views/operations/compensation/modules/compensation-dialog.vue'),
    args: () => [
      'employee',
      {
        id,
        tenantId,
        employeeId: id,
        planId: formStandardCompensationPlan.id,
        baseAmount: 5000,
        currencyCode: 'CNY',
        payFrequency: 'monthly',
        effectiveFrom: '2026-11-01',
        changeReason: '验收',
        items: formStandardCompensationPlan.items.map((item) => ({
          ...item,
          amount: item.defaultAmount,
          rate: item.defaultRate,
          source: 'employee'
        }))
      }
    ]
  },
  'mdm-template-binding': {
    load: () => import('@mdm/views/production/operation-template/modules/binding-dialog.vue'),
    args: () => [[id]]
  },
  'mdm-inventory-policy': {
    load: () => import('@mdm/views/inventory/storage/modules/inventory-policy-dialog.vue'),
    args: () => [{ tenantId, warehouseName: '验收仓库' }]
  },
  'employee-profile': {
    page: true,
    load: () => import('@hr/views/personnel/employee-profile/index.vue')
  },
  'employee-detail': {
    page: true,
    load: () => import('@hr/views/personnel/employee-detail/index.vue')
  },
  'activity-formula-editor': {
    load: () =>
      import('@mdm/views/components/operational-master/modules/activity-formula-dialog.vue'),
    args: () => [{ ...common }]
  },
  'hr-service-assignment': {
    load: () => import('@hr/views/operations/self-service/modules/service-assignment-dialog.vue'),
    args: () => [
      { id, tenantId, requestNo: 'SR-TEST', title: '验收员工服务工单', assignedEmployeeId: null }
    ]
  },
  industry: {
    load: () => import('@mdm/views/engineering/component-type/modules/industry-group-dialog.vue'),
    args: () => [
      {
        ...common,
        ...(valid
          ? {
              row: {
                id,
                tenantId,
                parentId: null,
                code: 'PANEL',
                name: '验收行业',
                sort: 10,
                enabled: true,
                remark: ''
              }
            }
          : {})
      }
    ]
  },
  component: {
    load: () => import('@mdm/views/engineering/component-type/modules/component-type-dialog.vue'),
    args: () => [
      {
        ...common,
        ...(valid
          ? {
              row: {
                id,
                tenantId,
                groupId: id,
                componentTypeCode: 'OUTER_PANEL',
                componentTypeName: '验收外板',
                sortOrder: 10,
                enabled: true,
                textColor: '',
                tagStyle: 'primary',
                remark: ''
              }
            }
          : {})
      }
    ]
  },
  'bom-group': {
    load: () => import('@mdm/views/engineering/bom-maintenance/modules/bom-group-dialog.vue'),
    args: () => [
      {
        ...common,
        ...(valid
          ? {
              row: {
                id,
                tenantId,
                parentId: null,
                code: 'PRODUCT_BOM',
                name: '验收BOM分组',
                sort: 10,
                enabled: true,
                remark: ''
              }
            }
          : {})
      }
    ]
  },
  bom: {
    load: () => import('@mdm/views/engineering/bom-maintenance/modules/bom-dialog.vue'),
    args: () => [
      {
        ...common,
        ...(valid
          ? {
              row: {
                id,
                tenantId,
                materialId: id,
                material,
                version: 'A',
                status: 'design',
                purpose: 'production',
                baseQuantity: 1,
                baseUnitId: unitId,
                effectiveFrom: '2026-10-31',
                effectiveTo: '9999-12-31',
                items:
                  params.get('components') === 'true'
                    ? [
                        {
                          id: '55555555-5555-4555-8555-555555555555',
                          tenantId,
                          componentMaterialId: '44444444-4444-4444-8444-444444444444',
                          component: {
                            ...material,
                            id: '44444444-4444-4444-8444-444444444444',
                            materialCode: 'COMP-TEST',
                            materialName: '验收组件',
                            description: '验收组件'
                          },
                          sequenceNo: 10,
                          quantity: 1,
                          unitId,
                          scrapRate: 0,
                          mrpEnabled: true,
                          issueMethod: 'production_pick',
                          backflushMethod: 'none',
                          processRouteStepId: null,
                          effectiveFrom: '2026-10-31',
                          effectiveTo: '9999-12-31'
                        }
                      ]
                    : [],
                sort: 10
              }
            }
          : {})
      }
    ]
  },
  supplier: {
    load: () => import('@mdm/views/purchase-master/supplier/modules/supplier-dialog.vue'),
    args: () => [{ ...common, ...(valid ? { row: supplier } : {}) }]
  },
  'supplier-detail': {
    load: () => import('@mdm/views/purchase-master/supplier/modules/supplier-detail.vue'),
    args: () => [supplier],
    props: { groups: common.groups }
  },
  'supplier-contact': {
    load: () => import('@mdm/views/purchase-master/supplier/modules/supplier-contact-dialog.vue'),
    args: () => [
      {
        ...common,
        ...(valid
          ? {
              row: {
                id,
                supplierId: id,
                name: '验收联系人',
                phone: '13800000000',
                email: 'contact@example.com'
              }
            }
          : {})
      }
    ]
  },
  'supplier-bank': {
    load: () => import('@mdm/views/purchase-master/supplier/modules/supplier-bank-dialog.vue'),
    args: () => [
      {
        ...common,
        ...(valid
          ? {
              row: {
                id,
                supplierId: id,
                bankAccount: '6222000000000000',
                accountName: '验收供应商',
                bankName: '验收银行',
                currencyCode: 'CNY'
              }
            }
          : {})
      }
    ]
  },
  'master-group': {
    load: () => import('@mdm/views/components/operational-master/modules/group-dialog.vue'),
    args: () => [{ ...common, domain: 'customer' }],
    editRow: {
      id,
      tenantId,
      domain: 'customer',
      parentId: null,
      code: 'CUSTOMERS',
      name: '验收客户组',
      sort: 10,
      enabled: true,
      remark: ''
    }
  },
  'master-customer': {
    load: () => import('@mdm/views/components/operational-master/modules/master-dialog.vue'),
    args: () => [
      {
        ...common,
        config: resolveMasterConfig('/customer'),
        readonly: params.get('readonly') === 'true'
      }
    ],
    editRow: {
      id,
      tenantId,
      customerCode: 'CUSTOMER-TEST',
      customerName: '验收客户',
      enabled: true,
      remark: '',
      addressDetail: '上海市验收路2号'
    }
  },
  'master-project': {
    load: () => import('@mdm/views/components/operational-master/modules/master-dialog.vue'),
    args: () => [
      {
        ...common,
        config: resolveMasterConfig('/project'),
        readonly: params.get('readonly') === 'true'
      }
    ],
    editRow: {
      id,
      tenantId,
      projectCode: 'PROJECT-TEST',
      projectName: '验收项目',
      customerId: id,
      addressDetail: '上海市验收路3号',
      enabled: true,
      remark: ''
    }
  },
  'master-formula': {
    load: () => import('@mdm/views/components/operational-master/modules/master-dialog.vue'),
    args: () => [
      {
        ...common,
        config: resolveMasterConfig('/activity-formula'),
        readonly: params.get('readonly') === 'true'
      }
    ],
    editRow: {
      id,
      tenantId,
      code: 'FORMULA-TEST',
      name: '验收公式',
      purpose: 'report_preparation',
      activityTypes: ['machine'],
      formulaExpression: '3 + 4',
      formulaTranslation: '3 + 4',
      enabled: true,
      remark: ''
    }
  },
  'master-control': {
    load: () => import('@mdm/views/components/operational-master/modules/master-dialog.vue'),
    args: () => [
      {
        ...common,
        config: resolveMasterConfig('/operation-control-code'),
        readonly: params.get('readonly') === 'true'
      }
    ],
    editRow: {
      id,
      tenantId,
      controlCode: 'CTRL-TEST',
      controlCodeName: '验收控制码',
      participatesScheduling: false,
      enabled: true,
      remark: ''
    }
  },
  'master-operation': {
    load: () => import('@mdm/views/components/operational-master/modules/master-dialog.vue'),
    args: () => [
      {
        ...common,
        config: resolveMasterConfig('/operation'),
        readonly: params.get('readonly') === 'true'
      }
    ],
    editRow: {
      id,
      tenantId,
      code: 'OP-TEST',
      name: '验收工序',
      departmentId: id,
      workCenterIds: [id],
      price: 5,
      enabled: true,
      remark: ''
    }
  },
  'master-workstation': {
    load: () => import('@mdm/views/components/operational-master/modules/master-dialog.vue'),
    args: () => [
      {
        ...common,
        config: resolveMasterConfig('/workstation'),
        readonly: params.get('readonly') === 'true'
      }
    ],
    editRow: {
      id,
      tenantId,
      workstationCode: 'SHARED-WS-TEST',
      workstationName: '验收共用工位',
      departmentId: id,
      workCenterId: id,
      enabled: true,
      remark: ''
    }
  },
  'material-type': {
    load: () => import('@mdm/views/components/material-reference/modules/reference-dialog.vue'),
    args: () => [{ ...common, kind: 'material-type' }],
    editRow: { id, tenantId, typeCode: 'RAW-TEST', typeName: '验收物料类型', codePrefix: 'R' }
  },
  reference: {
    load: () => import('@mdm/views/components/material-reference/modules/reference-dialog.vue'),
    args: () => [{ ...common, kind: 'unit-of-measure' }]
  },
  attributes: {
    load: () => import('@mdm/views/components/material-reference/modules/reference-dialog.vue'),
    args: () => [{ ...common, kind: 'attribute-group' }],
    editRow: {
      id,
      tenantId,
      groupCode: 'ATTR-TEST',
      groupName: '验收属性组',
      attributes: [
        { key: 'color', name: '颜色', values: ['白色', '蓝色'], required: true, enabled: true }
      ]
    }
  },
  'code-rule': {
    load: () => import('@mdm/views/components/material-reference/modules/reference-dialog.vue'),
    args: () => [{ ...common, kind: 'code-rule' }],
    editRow: { id, tenantId, ruleCode: 'CODE-TEST', ruleName: '验收编码规则' }
  },
  'supply-rule': {
    load: () =>
      import('@mdm/views/components/inventory-configuration/modules/supply-chain-code-rule-dialog.vue'),
    editRow: {
      id,
      tenantId,
      ruleCode: 'BATCH_TEST',
      ruleName: '验收批次规则',
      exampleCode: 'TEST',
      applyBatch: true,
      applySerial: false,
      applyTracking: false,
      perMaterial: true,
      separator: '',
      status: 'enabled',
      remark: '',
      segments: [
        {
          attributeCode: 'CONSTANT',
          useMode: 'configured',
          format: '',
          configuredValue: 'TEST',
          length: 4,
          step: 1,
          paddingChar: '0',
          padDirection: 'left',
          truncate: false,
          sequenceSource: false,
          sort: 10,
          attribute: { attributeCode: 'CONSTANT', attributeName: '常量', attributeType: 'constant' }
        }
      ]
    }
  },
  'business-type': {
    load: () => import('@mdm/views/business-type/modules/business-type-dialog.vue'),
    args: () => [
      {
        ...common,
        effectiveTenantId: tenantId,
        menuTree,
        ...(valid
          ? {
              mode: 'edit',
              record: {
                id,
                tenantId,
                menuIds: [menuId],
                documentTypeId: id,
                documentTypeIds: [id],
                businessTypeCode: 'BUS-TEST',
                businessTypeName: '验收业务类型',
                documentTypes: [
                  {
                    id,
                    menuId,
                    menuIds: [menuId],
                    documentTypeCode: 'DOC-TEST',
                    documentTypeName: '验收单据类型'
                  }
                ]
              }
            }
          : {})
      }
    ]
  },
  'document-type': {
    load: () => import('@mdm/views/document-type/modules/document-type-dialog.vue'),
    args: () => [
      {
        ...common,
        effectiveTenantId: tenantId,
        menuTree,
        ...(valid
          ? {
              mode: 'edit',
              record: {
                id,
                tenantId,
                menuId,
                menuIds: [menuId],
                documentTypeCode: 'DOC-TEST',
                documentTypeName: '验收单据类型'
              }
            }
          : {})
      }
    ]
  },
  'document-production': {
    load: () => import('@mdm/views/document-type/modules/document-type-dialog.vue'),
    args: () => [
      {
        ...common,
        mode: 'edit',
        effectiveTenantId: tenantId,
        menuTree: [{ ...menuTree[0], name: 'MesWorkOrder', meta: { title: '生产工单' } }],
        record: {
          id,
          tenantId,
          menuId,
          menuIds: [menuId],
          documentTypeCode: 'PROD-TEST',
          documentTypeName: '验收生产单据类型',
          packingEnabled: true,
          extensionFields: [
            { key: 'thickness', label: '板厚', valueType: 'number', sourceComponentTypeId: null }
          ],
          packingThicknessFieldKey: 'thickness'
        }
      }
    ]
  },
  'document-payable': {
    load: () => import('@mdm/views/document-type/modules/document-type-dialog.vue'),
    args: () => [
      {
        ...common,
        mode: 'edit',
        effectiveTenantId: tenantId,
        menuTree: [
          { ...menuTree[0], name: 'FinanceEstimatedPayable', meta: { title: '暂估应付' } }
        ],
        record: {
          id,
          tenantId,
          menuId,
          menuIds: [menuId],
          documentTypeCode: 'PAY-TEST',
          documentTypeName: '验收应付单据类型',
          payableStandardPurchase: false,
          financialPayableTypeId: id,
          financialPayableType: {
            id,
            documentTypeCode: 'FIN-PAY',
            documentTypeName: '验收财务应付类型'
          }
        }
      }
    ]
  },
  person: {
    load: () => import('@mdm/views/production/modules/person-dialog.vue'),
    editRow: {
      id,
      tenantId,
      departmentId: id,
      employeeId: null,
      name: '验收人员',
      employeeNo: 'EMP-TEST',
      barcode: 'EMP-TEST',
      phone: '13800000000',
      workType: 'regular',
      jobTitle: '',
      trade: '',
      gender: '',
      hireDate: null,
      avatarUrl: '',
      permissionDepartmentIds: [],
      sort: 10,
      textColor: '',
      tagType: 'info',
      enabled: true,
      remark: ''
    }
  },
  department: {
    load: () => import('@mdm/views/production/modules/department-dialog.vue'),
    editRow: {
      id,
      tenantId,
      organizationId: null,
      parentId: null,
      name: '验收产线',
      code: 'DEPT-TEST',
      factory: '验收工厂',
      kind: '部门',
      sort: 10,
      textColor: '',
      tagType: 'info',
      enabled: true,
      remark: ''
    }
  },
  workstation: {
    load: () => import('@mdm/views/process-master/workstation/modules/workstation-dialog.vue'),
    editRow: {
      id,
      tenantId,
      workstationCode: 'WS-TEST',
      workstationName: '验收工位',
      departmentId: id,
      workCenterId: id,
      responsiblePersonId: null,
      andonSimNo: null,
      enabled: true,
      remark: ''
    }
  },
  category: {
    load: () => import('@mdm/views/material-master/material-category/modules/category-dialog.vue'),
    editRow: {
      id,
      tenantId,
      categoryCode: 'CAT-TEST',
      codePrefix: 'CAT-TEST',
      categoryName: '验收分类'
    }
  },
  route: {
    load: () => import('@mdm/views/process-master/process-route/modules/route-dialog.vue'),
    args: () => [
      valid
        ? {
            id,
            tenantId,
            materialId: id,
            material,
            code: 'RT-TEST',
            name: '验收路线',
            routeType: 'standard',
            allocationMode: 'quantity',
            version: 'A',
            batchFrom: 0,
            batchTo: 9999,
            productionUnitId: unitId,
            effectiveDate: '2026-10-31',
            expiryDate: '9999-12-31',
            source: 'manual',
            enabled: true,
            isDefault: false,
            customUnitConversion: false
          }
        : undefined,
      tenantId
    ]
  },
  warehouse: {
    load: () =>
      import('@mdm/views/inventory-master/warehouse-definition/modules/warehouse-dialog.vue'),
    editRow: {
      id,
      tenantId,
      organizationId: id,
      warehouseCode: 'WH-TEST',
      warehouseName: '验收仓库',
      warehouseType: 'raw_material',
      businessScopes: ['picking', 'availability'],
      enableLocations: false,
      enableZones: false,
      singleSkuPerBin: false,
      remark: '',
      status: 'enabled'
    }
  },
  'movement-type': {
    load: () =>
      import('@mdm/views/inventory-master/movement-type/modules/movement-type-dialog.vue'),
    args: () => [{ ...common, mode: valid ? 'edit' : 'add' }],
    editRow: {
      id,
      tenantId,
      movementCode: 'MOVE-TEST',
      movementName: '验收入库',
      direction: 'inbound',
      reverseTypeId: null,
      reversal: false,
      otherIo: false,
      status: 'enabled',
      remark: ''
    }
  },
  zone: {
    load: () => import('@mdm/views/inventory/storage/modules/zone-dialog.vue'),
    editRow: { id, zoneCode: 'ZONE-TEST', zoneName: '验收库区' }
  },
  bin: {
    load: () => import('@mdm/views/inventory/storage/modules/bin-dialog.vue'),
    editRow: { id, binCode: 'BIN-TEST', binName: '验收库位', binType: 'floor', status: 'available' }
  },
  change: { load: () => import('@mdm/views/governance-center/modules/change-request-dialog.vue') },
  scheduling: {
    load: () => import('@mes/views/production-plan/scheduling-rules/modules/rule-dialog.vue'),
    editRow: {
      id,
      tenantId,
      code: 'SCHED-TEST',
      name: '验收排产规则',
      enabled: true,
      isDefault: false,
      direction: 'forward',
      dispatchingRule: 'priority',
      finiteCapacity: true,
      respectCalendar: true,
      includeSetupTime: true,
      includeQueueTime: true,
      includeTransferTime: true,
      preserveLockedTasks: true,
      allowOvertime: false,
      frozenHorizonDays: 0,
      planningHorizonDays: 90,
      priorityWeight: 50,
      dueDateWeight: 30,
      criticalOperationWeight: 20,
      resourceSelectionStrategy: 'earliest_available',
      conflictStrategy: 'reject',
      remark: ''
    }
  },
  packing: {
    load: () => import('@mes/views/production-plan/pack-rules/modules/pack-rule-dialog.vue'),
    editRow: {
      id,
      tenantId,
      ruleCode: 'ROCK_BOARD',
      ruleName: '验收排包规则',
      enabled: true,
      maxPieces: 8,
      maxStackHeight: 600,
      boardThicknessMm: null,
      maxWeight: null,
      maxLength: null,
      sameWidth: true,
      sameArea: true,
      sameNumber: true,
      allowMixLength: false,
      remainderPolicy: 'separate',
      sortPriority: 'area,boardNo,width,length',
      remark: ''
    }
  },
  'scm-expense': {
    load: () => import('@scm/views/sales-quotation/expense-definition/modules/expense-dialog.vue'),
    args: () => [
      {
        ...common,
        effectiveTenantId: tenantId,
        ...(valid
          ? {
              record: {
                id,
                tenantId,
                expenseCode: 'EXP-TEST',
                expenseName: '验收费用',
                enabled: true,
                remark: '',
                sortOrder: 100,
                textColor: '',
                tagStyle: 'plain'
              }
            }
          : {})
      }
    ]
  }
}
const entry = entries[params.get('entry') || 'industry']
if (entry.page)
  document.documentElement.style.setProperty('--art-full-height', 'calc(100dvh - 32px)')
const CurrentDialog = defineAsyncComponent(entry.load)
const app = createApp({
  setup() {
    const dialog = ref<{ handleOpen: (...args: unknown[]) => Promise<void> }>()
    const saved = ref('尚未保存')
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        entry.page
          ? h(
              'main',
              { class: 'art-page-view h-screen min-h-0 overflow-hidden p-4' },
              h(CurrentDialog)
            )
          : h('main', { class: 'p-4' }, [
              h(
                ElButton,
                {
                  disabled: !dialog.value,
                  onClick: () => {
                    const args = entry.args?.() ?? [common]
                    if (valid && entry.editRow)
                      args[0] = { ...(args[0] as Record<string, unknown>), row: entry.editRow }
                    return dialog.value?.handleOpen(...args)
                  }
                },
                () => '打开真实业务入口'
              ),
              h('output', { 'data-testid': 'save-result' }, saved.value),
              h(CurrentDialog, {
                ...entry.props,
                ref: dialog,
                onSuccess: () => {
                  saved.value = '已保存'
                }
              })
            ])
      )
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/employee/:id', component: {} }
  ]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({
  userId: 'form-standard-test',
  tenantId,
  platformSuper: true
} as Api.Auth.UserInfo)
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: tenantId, tenantCode: 'TEST', tenantName: '验收租户', builtinType: 'business' }
]
scope.scopeOwnerUserId = 'form-standard-test'
scope.setTenantScope(tenantId)
user.setDictMap(formStandardDictionaries)
const settings = useSettingStore(store)
const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
initializeTheme()
await router.push({
  path: entry.page && params.get('recordId') ? `/employee/${params.get('recordId')}` : '/',
  query: entry.page
    ? Object.fromEntries(
        ['sourceUserId', 'email', 'tenantId', 'organizationId', 'returnPath']
          .filter((key) => params.has(key))
          .map((key) => [key, params.get(key)])
      )
    : {}
})
await router.isReady()
app.mount('#app')
