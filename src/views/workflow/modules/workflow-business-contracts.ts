import {
  financePaths,
  getExpenseReimbursementDetailPath,
  getWaybillCostDetailPath,
  resolveLegacyBusinessPath
} from '@/router/business-paths'

export interface WorkflowBusinessContract {
  businessType: string
  label: string
  menuName: string
  domain: 'transport' | 'finance' | 'master_data' | 'safety' | 'hr' | 'scm'
  riskLevel: 'high' | 'medium'
  owner: string
  fields: Api.Workflow.WorkflowContextField[]
  routePath: (businessId: string) => string
}

const contracts: Record<string, WorkflowBusinessContract> = {
  scm_sales_contract: {
    businessType: 'scm_sales_contract',
    label: '销售合同',
    menuName: 'ScmSalesContract',
    domain: 'scm',
    riskLevel: 'high',
    owner: '销售管理',
    fields: [
      { key: 'documentNo', label: '合同编号', valueType: 'text' },
      { key: 'projectId', label: '项目', valueType: 'text', referenceType: 'business' },
      { key: 'customerId', label: '客户', valueType: 'text', referenceType: 'business' },
      { key: 'totalAmount', label: '合同金额', valueType: 'number' }
    ],
    routePath: () => '/scm/sales-management/sales-contract'
  },
  scm_sales_order: {
    businessType: 'scm_sales_order',
    label: '销售订单',
    menuName: 'ScmSalesOrder',
    domain: 'scm',
    riskLevel: 'high',
    owner: '销售管理',
    fields: [
      { key: 'documentNo', label: '销售订单号', valueType: 'text' },
      { key: 'projectId', label: '项目', valueType: 'text', referenceType: 'business' },
      { key: 'customerId', label: '客户', valueType: 'text', referenceType: 'business' },
      { key: 'totalAmount', label: '订单金额', valueType: 'number' }
    ],
    routePath: () => '/scm/sales-management/sales-order'
  },
  scm_sales_quotation: {
    businessType: 'scm_sales_quotation',
    label: '销售报价单',
    menuName: 'ScmSalesQuotationDoc',
    domain: 'scm',
    riskLevel: 'medium',
    owner: '销售报价',
    fields: [
      { key: 'quotationNo', label: '报价单号', valueType: 'text' },
      { key: 'projectId', label: '项目', valueType: 'text', referenceType: 'business' },
      { key: 'productCategory', label: '报价产品分类', valueType: 'text' },
      { key: 'quantity', label: '数量', valueType: 'number' },
      { key: 'totalAmount', label: '总价', valueType: 'number' },
      { key: 'customerId', label: '客户', valueType: 'text', referenceType: 'business' }
    ],
    routePath: () => '/scm/sales-quotation/sales-quotation'
  },
  generic: {
    businessType: 'generic',
    label: '通用审批',
    menuName: 'WorkflowWorkbench',
    domain: 'master_data',
    riskLevel: 'medium',
    owner: '平台管理',
    fields: [],
    routePath: () => '/workflow/workbench'
  },
  tms_waybill_cost: {
    businessType: 'tms_waybill_cost',
    label: '运单费用',
    menuName: 'FinanceWaybillCost',
    domain: 'finance',
    riskLevel: 'high',
    owner: '运输财务',
    fields: [
      { key: 'amount', label: '费用金额', valueType: 'number', help: '本次费用金额' },
      { key: 'expenseItemName', label: '费用项目', valueType: 'text' },
      { key: 'payeeName', label: '收款方', valueType: 'text' },
      { key: 'waybillNo', label: '运单号', valueType: 'text' },
      { key: 'occurredOn', label: '发生日期', valueType: 'date' }
    ],
    routePath: getWaybillCostDetailPath
  },
  tms_expense_reimbursement: {
    businessType: 'tms_expense_reimbursement',
    label: '费用报销',
    menuName: 'FinanceExpenseReimbursement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '财务审批',
    fields: [
      { key: 'totalAmount', label: '报销金额', valueType: 'number' },
      { key: 'itemCount', label: '费用笔数', valueType: 'number' },
      { key: 'reimbursementNo', label: '报销单号', valueType: 'text' },
      { key: 'payeeName', label: '收款人', valueType: 'text' },
      { key: 'paymentMethod', label: '付款方式', valueType: 'text' },
      { key: 'plannedPaymentDate', label: '计划付款日期', valueType: 'date' }
    ],
    routePath: getExpenseReimbursementDetailPath
  },
  fms_travel_application: {
    businessType: 'fms_travel_application',
    label: '出差申请',
    menuName: 'FinanceTravelApplication',
    domain: 'finance',
    riskLevel: 'medium',
    owner: '差旅审批',
    fields: [
      { key: 'amount', label: '申请金额', valueType: 'number' },
      { key: 'applicationNo', label: '申请单号', valueType: 'text' },
      { key: 'itemCount', label: '行程段数', valueType: 'number' },
      { key: 'estimatedDays', label: '预计天数', valueType: 'number' },
      { key: 'employeeId', label: '申请人', valueType: 'text', referenceType: 'employee' },
      {
        key: 'organizationId',
        label: '费用承担部门',
        valueType: 'text',
        referenceType: 'organization'
      }
    ],
    routePath: (businessId) =>
      `${financePaths.travelApplication}?applicationId=${encodeURIComponent(businessId)}`
  },
  fms_travel_loan: {
    businessType: 'fms_travel_loan',
    label: '借款单',
    menuName: 'FinanceLoanApplication',
    domain: 'finance',
    riskLevel: 'high',
    owner: '财务审批',
    fields: [
      { key: 'amount', label: '借款金额', valueType: 'number' },
      { key: 'loanNo', label: '借款单号', valueType: 'text' },
      { key: 'itemCount', label: '借款明细笔数', valueType: 'number' },
      { key: 'payeeCount', label: '收款明细笔数', valueType: 'number' }
    ],
    routePath: () => financePaths.loanApplication
  },
  fms_travel_repayment: {
    businessType: 'fms_travel_repayment',
    label: '还款单',
    menuName: 'FinanceRepayment',
    domain: 'finance',
    riskLevel: 'high',
    owner: '财务审批',
    fields: [
      { key: 'amount', label: '还款金额', valueType: 'number' },
      { key: 'repaymentNo', label: '还款单号', valueType: 'text' },
      { key: 'loanId', label: '关联借款', valueType: 'text', referenceType: 'business' },
      { key: 'itemCount', label: '还款明细笔数', valueType: 'number' }
    ],
    routePath: () => financePaths.repayment
  },
  tms_invoice: {
    businessType: 'tms_invoice',
    label: '发票',
    menuName: 'FinanceInvoiceManagement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '财务',
    fields: [
      { key: 'totalAmount', label: '价税合计', valueType: 'number' },
      { key: 'direction', label: '发票方向', valueType: 'text' },
      { key: 'invoiceType', label: '发票类型', valueType: 'text' },
      { key: 'invoiceNo', label: '发票号码', valueType: 'text' },
      { key: 'taxRate', label: '税率', valueType: 'number' },
      { key: 'counterpartyName', label: '交易对方', valueType: 'text' }
    ],
    routePath: () => financePaths.invoiceManagement
  },
  tms_carrier_payment_application: {
    businessType: 'tms_carrier_payment_application',
    label: '承运商付款申请',
    menuName: 'FinanceCarrierPaymentApplication',
    domain: 'finance',
    riskLevel: 'high',
    owner: '应付结算',
    fields: [
      { key: 'amount', label: '申请付款金额', valueType: 'number' },
      { key: 'applicationNo', label: '付款申请单号', valueType: 'text' },
      { key: 'carrierId', label: '承运商', valueType: 'text', referenceType: 'business' },
      { key: 'carrierName', label: '承运商名称', valueType: 'text' },
      { key: 'plannedPaymentDate', label: '计划付款日期', valueType: 'date' },
      { key: 'statementCount', label: '对账单数量', valueType: 'number' }
    ],
    routePath: () => financePaths.paymentApplication
  },
  tms_carrier_statement: {
    businessType: 'tms_carrier_statement',
    label: '承运商结算',
    menuName: 'FinanceCarrierSettlement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '应付结算',
    fields: [
      { key: 'statementAmount', label: '对账金额', valueType: 'number' },
      { key: 'costCount', label: '费用明细数', valueType: 'number' },
      { key: 'statementNo', label: '对账单号', valueType: 'text' },
      { key: 'carrierId', label: '承运商', valueType: 'text', referenceType: 'business' },
      { key: 'carrierName', label: '承运商名称', valueType: 'text' },
      { key: 'settledAmount', label: '已结算金额', valueType: 'number' }
    ],
    routePath: () => financePaths.carrierSettlement
  },
  tms_customer_statement: {
    businessType: 'tms_customer_statement',
    label: '客户结算',
    menuName: 'FinanceCustomerSettlement',
    domain: 'finance',
    riskLevel: 'high',
    owner: '应收结算',
    fields: [
      { key: 'statementAmount', label: '对账金额', valueType: 'number' },
      { key: 'waybillCount', label: '运单数量', valueType: 'number' },
      { key: 'statementNo', label: '对账单号', valueType: 'text' },
      { key: 'customerId', label: '客户', valueType: 'text', referenceType: 'business' },
      { key: 'customerName', label: '客户名称', valueType: 'text' },
      { key: 'settledAmount', label: '已结算金额', valueType: 'number' }
    ],
    routePath: () => financePaths.customerSettlement
  },
  tms_contract: {
    businessType: 'tms_contract',
    label: '运输合同',
    menuName: 'TmsContract',
    domain: 'transport',
    riskLevel: 'high',
    owner: '合同管理',
    fields: [
      { key: 'businessContractType', label: '业务合同分类', valueType: 'text' },
      { key: 'contractCategory', label: '合同类别', valueType: 'text' },
      { key: 'transportMode', label: '运输方式', valueType: 'text' },
      { key: 'contractAmount', label: '合同金额', valueType: 'number' },
      { key: 'contractNo', label: '合同编号', valueType: 'text' },
      { key: 'carrierId', label: '承运商', valueType: 'text', referenceType: 'business' },
      { key: 'customerId', label: '客户', valueType: 'text', referenceType: 'business' },
      { key: 'partyName', label: '合同相对方', valueType: 'text' },
      { key: 'billingMethod', label: '计费方式', valueType: 'text' },
      { key: 'signTime', label: '签订时间', valueType: 'date' },
      { key: 'effectiveDate', label: '生效日期', valueType: 'date' },
      { key: 'expiryDate', label: '到期日期', valueType: 'date' },
      { key: 'isCompleted', label: '是否完成', valueType: 'boolean' },
      { key: 'handler', label: '经办人', valueType: 'text' }
    ],
    routePath: (businessId) => `/tms/basic-data/contract-detail/${businessId}`
  },
  vehicle_archive: {
    businessType: 'vehicle_archive',
    label: '车辆档案',
    menuName: 'VehicleArchiveManage',
    domain: 'master_data',
    riskLevel: 'medium',
    owner: '车辆管理',
    fields: [
      { key: 'plateNo', label: '车牌号', valueType: 'text' },
      { key: 'vehicleType', label: '车辆类型', valueType: 'text' },
      { key: 'companyName', label: '所属单位', valueType: 'text' },
      { key: 'approvedLoadMass', label: '核定载质量', valueType: 'number' },
      { key: 'operationType', label: '营运类型', valueType: 'text' },
      { key: 'isNewEnergy', label: '新能源车辆', valueType: 'boolean' }
    ],
    routePath: (businessId) => `/vms/vehicle-archive-detail/${businessId}`
  },
  smis_tool_return: {
    businessType: 'smis_tool_return',
    label: '工器具归还',
    menuName: 'SmisToolRequisitionReturn',
    domain: 'safety',
    riskLevel: 'medium',
    owner: '安全生产',
    fields: [
      { key: 'returnNo', label: '归还单号', valueType: 'text' },
      { key: 'employeeId', label: '领用人', valueType: 'text', referenceType: 'employee' },
      { key: 'employeeName', label: '领用人姓名', valueType: 'text' },
      { key: 'sourceDocumentNo', label: '源发放单号', valueType: 'text' },
      { key: 'returnDate', label: '归还日期', valueType: 'date' },
      { key: 'itemCount', label: '归还明细数', valueType: 'number' },
      { key: 'returnQuantity', label: '归还总数量', valueType: 'number' }
    ],
    routePath: () => '/smis/safety-production/tool-requisition/tool-requisition-return'
  },
  hr_personnel_change: {
    businessType: 'hr_personnel_change',
    label: '人事异动',
    menuName: 'HrPersonnelChange',
    domain: 'hr',
    riskLevel: 'high',
    owner: '人力资源',
    fields: [
      { key: 'changeNo', label: '异动单号', valueType: 'text' },
      {
        key: 'changeType',
        label: '异动类型',
        valueType: 'text',
        dictCode: 'hrPersonnelChangeType'
      },
      { key: 'employeeId', label: '员工', valueType: 'text', referenceType: 'employee' },
      { key: 'effectiveDate', label: '生效日期', valueType: 'date' }
    ],
    routePath: () => '/hr/personnel/personnel-change'
  },
  hr_lifecycle_case: {
    businessType: 'hr_lifecycle_case',
    label: '员工生命周期',
    menuName: 'HrLifecycle',
    domain: 'hr',
    riskLevel: 'high',
    owner: '人力资源',
    fields: [
      { key: 'caseNo', label: '事项编号', valueType: 'text' },
      {
        key: 'caseType',
        label: '事项类型',
        valueType: 'text',
        dictCode: 'hrLifecycleCaseType'
      },
      { key: 'employeeId', label: '员工', valueType: 'text', referenceType: 'employee' },
      { key: 'plannedEffectiveDate', label: '计划生效日期', valueType: 'date' }
    ],
    routePath: () => '/hr/personnel/lifecycle'
  },
  hr_self_service_request: {
    businessType: 'hr_self_service_request',
    label: '员工自助申请',
    menuName: 'HrSelfService',
    domain: 'hr',
    riskLevel: 'medium',
    owner: '员工服务',
    fields: [
      { key: 'requestNo', label: '申请编号', valueType: 'text' },
      {
        key: 'requestType',
        label: '申请类型',
        valueType: 'text',
        dictCode: 'hrSelfServiceRequestType'
      },
      { key: 'employeeId', label: '员工', valueType: 'text', referenceType: 'employee' },
      { key: 'durationHours', label: '申请时长', valueType: 'number' },
      { key: 'startAt', label: '开始时间', valueType: 'date' },
      { key: 'endAt', label: '结束时间', valueType: 'date' }
    ],
    routePath: () => '/hr/operations/self-service'
  },
  hr_recruitment_requisition: {
    businessType: 'hr_recruitment_requisition',
    label: '招聘需求',
    menuName: 'HrRecruitment',
    domain: 'hr',
    riskLevel: 'high',
    owner: '招聘管理',
    fields: [
      { key: 'requisitionNo', label: '需求编号', valueType: 'text' },
      {
        key: 'organizationId',
        label: '招聘组织',
        valueType: 'text',
        referenceType: 'organization'
      },
      { key: 'positionId', label: '招聘岗位', valueType: 'text', referenceType: 'position' },
      { key: 'openingCount', label: '需求人数', valueType: 'number' },
      { key: 'expectedOnboardDate', label: '期望到岗日期', valueType: 'date' }
    ],
    routePath: () => '/hr/recruitment/workbench'
  }
}

export const workflowBusinessContracts = Object.values(contracts).filter(
  (contract) => contract.businessType !== 'generic'
)

export function getWorkflowBusinessContract(businessType: string): WorkflowBusinessContract {
  return contracts[businessType] ?? contracts.generic
}

export function getWorkflowBusinessSourcePath(
  businessType: string,
  businessId: string,
  snapshotPath?: string | null
): string | undefined {
  const contract = getWorkflowBusinessContract(businessType)
  if (contract.businessType !== 'generic' && businessId) {
    return contract.routePath(businessId)
  }
  return snapshotPath ? resolveLegacyBusinessPath(snapshotPath) || snapshotPath : undefined
}

export function getWorkflowBusinessTypeLabel(businessType?: string | null): string {
  if (!businessType) return '未配置业务类型'
  return contracts[businessType]?.label ?? '未登记审批业务'
}

export function getWorkflowContextFields(
  businessType: string
): Api.Workflow.WorkflowContextField[] {
  return getWorkflowBusinessContract(businessType).fields
}
