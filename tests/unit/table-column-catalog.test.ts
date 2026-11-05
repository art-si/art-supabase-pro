import assert from 'node:assert/strict'
import test from 'node:test'
import { generateColumnCatalog } from '../../scripts/generate-table-column-catalog'

function catalogFor(paths: string[]) {
  return generateColumnCatalog(
    paths.map((component, index) => ({
      id: String(index),
      component,
      type: 'menu',
      path: component,
      parent_id: null
    }))
  )
}

test('catalog includes keyed recruitment lists, wrapped report ledgers and insurance children, excluding drawer-only lists', () => {
  const paths = [
    '/hr/recruitment/workbench',
    '/mes/production-execution/report-detail',
    '/vms/vehicle-manage/vehicle-insurance',
    '/mes/production-execution/production-report',
    '/system/column-config'
  ]
  const result = generateColumnCatalog(
    paths.map((component, index) => ({
      id: String(index),
      component,
      type: 'menu',
      path: component,
      parent_id: null
    }))
  )
  const recruitment = result.catalogs.find((item) => item.routePath === paths[0])!
  assert.ok(recruitment)
  assert.deepEqual(
    [...new Set(recruitment.columns.flatMap((column) => column.groups ?? []))].sort(),
    ['candidate', 'handoff', 'interview', 'offer', 'requisition', 'task']
  )
  const ledger = result.catalogs.find((item) => item.routePath === paths[1])!
  assert.ok(ledger.columns.some((column) => column.key === 'reportedAt'))
  assert.equal(ledger.columns.find((column) => column.key === 'operation')?.locked, true)
  const insurance = result.catalogs.find((item) => item.routePath === paths[2])!
  assert.ok(insurance.columns.some((column) => column.parentKey?.startsWith('__group__')))
  assert.ok(result.unregistered.some((item) => item.routePath === paths[3]))
  assert.ok(!result.catalogs.some((item) => item.routePath === paths[4]))
})

test('material reference menus include their complete route-specific columns without sibling fields', () => {
  const variants = {
    'unit-of-measure': ['unitName', 'symbol', 'dimension', 'decimalPlaces', 'conversionFactor'],
    'material-type': ['typeName', 'codePrefix', 'tagType'],
    'attribute-group': ['groupName', 'attributeCount', 'attributeSummary'],
    'code-rule': ['ruleName', 'strategy', 'exampleCode', 'codeLength']
  }
  const paths = Object.keys(variants).map((kind) => `/mdm/material-master/${kind}`)
  const result = catalogFor(paths)
  assert.deepEqual(result.unregistered, [])
  for (const [kind, keys] of Object.entries(variants)) {
    const catalog = result.catalogs.find(
      (item) => item.routePath === `/mdm/material-master/${kind}`
    )
    assert.ok(catalog, kind)
    assert.deepEqual(
      catalog.columns.map((column) => column.key),
      ['__selection__', 'sort', ...keys, 'status', 'updateTime', 'operation']
    )
    assert.equal(catalog.columns.at(-1)?.locked, true)
  }
  const unit = result.catalogs.find((item) => item.routePath === paths[0])!
  assert.deepEqual(
    unit.columns.filter((column) => ['unitName', 'conversionFactor'].includes(column.key)),
    [
      {
        key: 'unitName',
        label: '计量单位',
        visible: true,
        minWidth: 190,
        fixed: 'left',
        align: 'left',
        sortable: false,
        locked: false
      },
      {
        key: 'conversionFactor',
        label: '基准系数',
        visible: true,
        width: 120,
        fixed: false,
        align: 'right',
        sortable: false,
        locked: false
      }
    ]
  )
})

test('operational master field loops register only table fields from the current route', () => {
  const variants = {
    // Customer contacts are 1:N child records, not columns of the customer master list.
    '/mdm/sales-master/customer': [
      'customerCode',
      'customerName',
      'groupId',
      'industry',
      'customerLevel',
      'region',
      'addressDetail',
      'enabled',
      'remark'
    ],
    '/mdm/sales-master/project': [
      'projectCode',
      'projectName',
      'customerId',
      'groupId',
      'projectMode',
      'projectStage',
      'projectStatus',
      'ownerId',
      'salespersonId',
      'contactName',
      'contactPhone',
      'region',
      'addressDetail',
      'source',
      'enabled',
      'remark'
    ],
    '/mdm/process-master/activity-formula': [
      'code',
      'name',
      'purpose',
      'activityTypes',
      'isDefault',
      'formulaExpression',
      'formulaTranslation',
      'description',
      'enabled',
      'remark'
    ],
    '/mdm/process-master/operation-control-code': [
      'controlCode',
      'controlCodeName',
      'participatesScheduling',
      'processingMode',
      'reportMode',
      'timeUnitId',
      'inspectionMode',
      'sequenceControl',
      'reworkMode',
      'enabled',
      'remark'
    ],
    '/mdm/process-master/operation': [
      'code',
      'name',
      'mnemonic',
      'groupId',
      'pricingType',
      'departmentId',
      'workCenterIds',
      'price',
      'pricingUnitId',
      'source',
      'enabled',
      'remark'
    ]
  }
  const result = catalogFor(Object.keys(variants))
  assert.deepEqual(result.unregistered, [])
  for (const [route, keys] of Object.entries(variants)) {
    const catalog = result.catalogs.find((item) => item.routePath === route)
    assert.ok(catalog, route)
    assert.deepEqual(
      catalog.columns.map((column) => column.key),
      ['__selection__', '__globalIndex__', ...keys, 'updateTime', 'operation'],
      route
    )
    if (route === '/mdm/sales-master/customer') {
      assert.ok(
        !catalog.columns.some((column) => ['contactName', 'contactPhone'].includes(column.key))
      )
    }
  }
})

test('dynamic inventory workspaces and a ledger whose name contains Detail are main lists', () => {
  const paths = [
    '/mdm/inventory-master/supply-chain-code-rule',
    '/mdm/inventory-master/outbound-rule',
    '/mes/production-execution/mold-detail'
  ]
  const result = catalogFor(paths)
  assert.deepEqual(result.unregistered, [])
  const supply = result.catalogs.find((item) => item.routePath === paths[0])!
  assert.deepEqual(
    supply.columns.map((column) => column.key),
    [
      '__selection__',
      'ruleName',
      'exampleCode',
      'segments',
      'applyBatch',
      'applySerial',
      'applyTracking',
      'perMaterial',
      'status',
      'updateTime',
      'operation'
    ]
  )
  assert.ok(supply.sourceFile.endsWith('/supply-chain-code-rule-workspace.vue'))
  const outbound = result.catalogs.find((item) => item.routePath === paths[1])!
  assert.deepEqual(
    outbound.columns.map((column) => column.key),
    [
      '__selection__',
      'ruleName',
      'fieldSource',
      'fieldName',
      'fieldKey',
      'direction',
      'status',
      'updateTime',
      'operation'
    ]
  )
  assert.ok(outbound.sourceFile.endsWith('/outbound-rule-workspace.vue'))
  const mold = result.catalogs.find((item) => item.routePath === paths[2])!
  assert.equal(mold.columns.length, 17)
  assert.ok(mold.columns.some((column) => column.key === 'workCenter.name'))
  assert.ok(mold.columns.some((column) => column.label === '生产工单 / 任务单'))
  assert.equal(mold.columns.at(-1)?.key, 'operation')
  assert.ok(mold.sourceFile.endsWith('/mold-detail-ledger.vue'))
})

test('waybill factories retain appended columns and select the route mode', () => {
  const paths = ['/tms/waybill-management/pending', '/tms/waybill-management/loaded']
  const result = catalogFor(paths)
  assert.deepEqual(result.unregistered, [])
  const pending = result.catalogs.find((item) => item.routePath === paths[0])!
  const loaded = result.catalogs.find((item) => item.routePath === paths[1])!
  const orderKeys = [
    'shippingContactName',
    'shippingCustomerName',
    'shippingContactPhone',
    'shippingAddressDetail',
    'originStation',
    'transferStation',
    'destinationStation',
    'receivingContactName',
    'receivingCustomerName',
    'receivingContactPhone',
    'receivingAddressDetail',
    'cargoItems',
    'cargoQuantityTotal',
    'cargoVolumeTotal',
    'cargoWeightTotal',
    'paymentMethod',
    'transportFee',
    'deliveryFee',
    'unloadingFee',
    'collectPaymentFee',
    'transferFee',
    'declaredValue',
    'insuranceFee',
    'packageFee',
    'otherFee',
    'totalFee',
    'createdByName',
    'createTime'
  ]
  assert.deepEqual(
    pending.columns.map((column) => column.key),
    ['__selection__', 'waybillNo', ...orderKeys, 'dispatchStatus', 'operation']
  )
  assert.equal(pending.columns.find((column) => column.key === 'waybillNo')?.label, '原始运单号')
  assert.deepEqual(
    loaded.columns.map((column) => column.key),
    [
      '__selection__',
      'waybillNo',
      'sourceOrderNos',
      'executionKind',
      'dispatchMode',
      ...orderKeys,
      'dispatchDriverName',
      'driverOwnership',
      'carrierName',
      'companyName',
      'dispatchDriverPhone',
      'dispatchPlateNo',
      'plannedDepartureTime',
      'dispatchStatus',
      'operation'
    ]
  )
  assert.equal(loaded.columns.find((column) => column.key === 'waybillNo')?.label, '调度运单号')
})

test('HR shared workspace receives its literal entry props and registers business columns', () => {
  const route = '/hr/personnel/personnel-change'
  const result = catalogFor([route])
  assert.deepEqual(result.unregistered, [])
  assert.deepEqual(
    result.catalogs[0].columns.map((column) => column.key),
    ['employee.employeeName', 'changeType', 'effectiveDate', 'status', 'reason', 'operation']
  )
  assert.equal(result.catalogs[0].columns[0].label, '员工 / 异动单号')
})

test('every main tab is registered in approval, governance, project warehouse and accounting workspaces', () => {
  const variants = {
    '/workflow/workbench': {
      'pendingTable.columnsFactory': ['businessTitle', 'assignmentSource', 'dueAt'],
      'globalTable.columnsFactory': [
        'businessTitle',
        'tenant',
        'businessType',
        'assigneeNames',
        'nodeName',
        'assignmentSource',
        'initiator',
        'createTime',
        'dueAt',
        'operation'
      ],
      'handledTable.columnsFactory': ['businessTitle', 'comment', 'handledAt'],
      'initiatedTable.columnsFactory': ['businessTitle', 'currentNodeName', 'finishedAt']
    },
    '/mdm/governance-center': {
      qualityColumns: ['sourceName', 'severity', 'detectionCount'],
      changeColumns: ['title', 'requesterEmail', 'effectiveAt'],
      matchColumns: ['leftRecordId', 'rightRecordId', 'matchScore'],
      outboxColumns: ['event', 'consumer', 'attempts', 'lastError']
    },
    '/wms/project-warehouse/project-report': {
      stockColumns: ['material', 'batchNo', 'pack', 'size'],
      materialColumns: ['materialName', 'reservedQuantity', 'stockAreaSqm', 'serialCount'],
      materialWipColumns: ['netIssuedQuantity', 'consumedQuantity', 'lastAdjustedAt', 'operation'],
      packColumns: ['packNo', 'originProjectId', 'confirmed', 'shippedAreaSqm'],
      orderColumns: ['workOrderNo', 'materialNameSnapshot', 'plannedEndDate'],
      movementColumns: ['referenceNo', 'movementType', 'targetConstructionNo', 'occurredAt'],
      serialColumns: ['serialNo', 'parent', 'childSerialNos', 'createTime']
    },
    '/fms/accounting/ledger-center': {
      balanceColumnsFactory: ['subjectCode', 'openingDebit', 'openingCredit'],
      generalColumnsFactory: ['periodNo', 'openingBalance', 'voucherCount'],
      subsidiaryColumnsFactory: ['voucherDate', 'voucherNo', 'auxiliaryDisplay', 'balanceAmount']
    }
  }
  const result = catalogFor(Object.keys(variants))
  assert.deepEqual(result.unregistered, [])
  for (const [route, groups] of Object.entries(variants)) {
    const catalog = result.catalogs.find((item) => item.routePath === route)
    assert.ok(catalog, route)
    assert.deepEqual(
      [...new Set(catalog.columns.flatMap((column) => column.groups ?? []))].sort(),
      Object.keys(groups).sort(),
      route
    )
    assert.ok(
      catalog.columns.every((column) => column.groups?.length),
      route
    )
    for (const [group, requiredKeys] of Object.entries(groups)) {
      const columns = catalog.columns.filter((column) => column.groups?.includes(group))
      for (const key of requiredKeys)
        assert.ok(
          columns.some((column) => column.key === key),
          `${route}: ${group}: ${key}`
        )
    }
    for (const child of catalog.columns.filter((column) => column.parentKey)) {
      const parent = catalog.columns.find((column) => column.key === child.parentKey)
      assert.ok(parent, `${route}: ${child.key} parent`)
      for (const group of parent.groups ?? [])
        assert.ok(child.groups?.includes(group), `${route}: ${child.key}: ${group}`)
    }
  }
})

test('main schedule table remains registered while object-detail and attachment tables are excluded', () => {
  const main = '/mdm/production/shift-scheduling'
  const details = [
    '/data-center/supabase-ai-assistant',
    '/vms/vehicle-archive-detail',
    '/vms/vehicle-manage/routine-inspection-detail'
  ]
  const result = catalogFor([main, ...details])
  const schedule = result.catalogs.find((item) => item.routePath === main)
  assert.ok(schedule)
  assert.deepEqual(
    schedule.columns.map((column) => column.key),
    ['shift', 'time', 'dateMode', 'effectiveDate', 'weekdays', 'members', 'status', 'operation']
  )
  for (const route of details) {
    assert.ok(
      result.unregistered.some((item) => item.routePath === route),
      route
    )
    assert.ok(!result.catalogs.some((item) => item.routePath === route), route)
  }
})

test('PMIS calendar routes register stable day keys for every month without fixed calendar dates', () => {
  const paths = [
    '/pmis/inspection/inspection-sheet',
    '/pmis/inspection/inspection-detail',
    '/pmis/patrol/patrol-detail',
    '/pmis/maintenance/maintenance-detail',
    '/pmis/preventive/preventive-detail'
  ]
  const result = catalogFor(paths)
  assert.deepEqual(result.unregistered, [])
  for (const catalog of result.catalogs) {
    assert.deepEqual(
      catalog.columns.map((column) => column.key),
      [
        '__globalIndex__',
        'identity',
        ...Array.from({ length: 31 }, (_, index) => `day${String(index + 1).padStart(2, '0')}`)
      ],
      catalog.routePath
    )
    assert.equal(catalog.columns.find((column) => column.key === 'day31')?.label, '31')
  }
})

test('route-specific business columns stay separate while mutable view and permission branches remain available', () => {
  const variants = [
    {
      route: '/mes/production-plan/work-order',
      include: ['workOrderNo', 'orderQuantity', 'status'],
      exclude: ['taskNo', 'operationCode', 'scheduledQuantity']
    },
    {
      route: '/mes/production-plan/operation-task',
      include: ['taskNo', 'operationCode', 'scheduledQuantity'],
      exclude: ['orderQuantity', 'statusReason']
    },
    {
      route: '/scm/purchase-management/purchase-contract',
      include: ['title', 'detailLine.lineNo', 'detailLine.quantity'],
      exclude: ['applicant', 'purchased', 'detailLine.receivedQuantity']
    },
    {
      route: '/fms/accounts-receivable/estimated-receivable',
      include: ['lineNo', 'unreversedAmount', 'linkedFinancialAmount'],
      exclude: ['outstandingAmount', 'accountingStatus']
    },
    {
      route: '/fms/accounts-receivable/financial-receivable',
      include: ['lineNo', 'outstandingAmount', 'accountingStatus'],
      exclude: ['unreversedAmount', 'linkedFinancialAmount']
    },
    {
      route: '/fms/accounts-payable/estimated-payable',
      include: ['lineNo', 'unreversedAmount', 'linkedAmount'],
      exclude: ['writtenOffAmount', 'freezeStatus']
    },
    {
      route: '/fms/accounts-payable/purchase-payable',
      include: ['lineNo', 'writtenOffAmount', 'freezeStatus'],
      exclude: ['unreversedAmount', 'linkedAmount']
    },
    {
      route: '/wms/inbound-business/purchase-inbound',
      include: ['inventoryUnitName', 'materialCode'],
      exclude: ['baseQuantity', 'baseUnitName', 'discountAmount']
    },
    {
      route: '/wms/inbound-business/purchase-return',
      include: ['baseQuantity', 'baseUnitName', 'materialCode'],
      exclude: ['discountAmount']
    },
    {
      route: '/vms/vehicle-manage/own-vehicle-task',
      include: ['registeredTollFee', 'registeredOtherFee'],
      exclude: []
    }
  ]
  const result = catalogFor(variants.map((variant) => variant.route))
  assert.deepEqual(result.unregistered, [])
  for (const variant of variants) {
    const catalog = result.catalogs.find((item) => item.routePath === variant.route)
    assert.ok(catalog, variant.route)
    for (const key of variant.include)
      assert.ok(
        catalog.columns.some((column) => column.key === key),
        `${variant.route}: ${key}`
      )
    for (const key of variant.exclude)
      assert.ok(!catalog.columns.some((column) => column.key === key), `${variant.route}: ${key}`)
  }
})
