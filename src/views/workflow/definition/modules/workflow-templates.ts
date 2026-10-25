import { cloneDeep } from 'lodash-es'
import { getWorkflowBusinessContract } from '../../modules/workflow-business-contracts'

export type WorkflowTemplateCategory =
  'all' | 'finance' | 'transport' | 'vehicle' | 'safety' | 'hr' | 'scm' | 'general'

export interface WorkflowTemplateDefinition {
  key: string
  name: string
  description: string
  category: Exclude<WorkflowTemplateCategory, 'all'>
  businessType: string
  icon: string
  tone: 'primary' | 'success' | 'warning' | 'info'
  nodeNames: string[]
  isCustom?: boolean
}

export interface WorkflowTemplateCategoryOption {
  key: WorkflowTemplateCategory
  label: string
}

const templateDefinitions: WorkflowTemplateDefinition[] = [
  {
    key: 'scm-sales-contract',
    name: '销售合同审批',
    description: '配置销售合同的审批人员、节点及金额条件，通过后生效。',
    category: 'scm',
    businessType: 'scm_sales_contract',
    icon: 'ri:contract-line',
    tone: 'primary',
    nodeNames: ['销售负责人审核']
  },
  {
    key: 'scm-sales-order',
    name: '销售订单审批',
    description: '配置销售订单的审批人员、节点及金额条件，通过后生效。',
    category: 'scm',
    businessType: 'scm_sales_order',
    icon: 'ri:shopping-bag-3-line',
    tone: 'primary',
    nodeNames: ['销售负责人审核']
  },
  {
    key: 'scm-sales-quotation',
    name: '销售报价审批',
    description: '按报价金额、项目、客户和产品分类审核销售报价；通过后自动汇总报价项分类。',
    category: 'scm',
    businessType: 'scm_sales_quotation',
    icon: 'ri:file-list-3-line',
    tone: 'primary',
    nodeNames: ['销售负责人审核']
  },
  {
    key: 'custom',
    name: '创建自定义审批',
    description: '从空白流程开始设计，业务类型、审批节点与条件均由你配置。',
    category: 'general',
    businessType: 'generic',
    icon: 'ri:add-line',
    tone: 'primary',
    nodeNames: ['审批节点'],
    isCustom: true
  },
  {
    key: 'waybill-cost',
    name: '运单费用审批',
    description: '根据费用金额、费用项目与收款方进行运输成本审核。',
    category: 'finance',
    businessType: 'tms_waybill_cost',
    icon: 'ri:money-cny-circle-line',
    tone: 'primary',
    nodeNames: ['费用审核', '财务负责人复核']
  },
  {
    key: 'travel-application',
    name: '出差申请审批',
    description: '核对出差行程、申请预算、费用承担部门与预计天数。',
    category: 'finance',
    businessType: 'fms_travel_application',
    icon: 'ri:flight-takeoff-line',
    tone: 'primary',
    nodeNames: ['部门负责人审核', '预算审核']
  },
  {
    key: 'expense-reimbursement',
    name: '费用报销审批',
    description: '覆盖报销金额、费用笔数、收款人与计划付款日期。',
    category: 'finance',
    businessType: 'tms_expense_reimbursement',
    icon: 'ri:bill-line',
    tone: 'success',
    nodeNames: ['部门负责人审核', '财务审核']
  },
  {
    key: 'invoice-review',
    name: '发票复核',
    description: '围绕价税合计、发票类型、税率与交易对方进行复核。',
    category: 'finance',
    businessType: 'tms_invoice',
    icon: 'ri:file-list-3-line',
    tone: 'info',
    nodeNames: ['发票合规复核']
  },
  {
    key: 'carrier-settlement',
    name: '承运商结算审批',
    description: '对承运商对账金额、费用明细与已结算金额进行审批。',
    category: 'finance',
    businessType: 'tms_carrier_statement',
    icon: 'ri:hand-coin-line',
    tone: 'warning',
    nodeNames: ['结算审核', '财务复核']
  },
  {
    key: 'customer-settlement',
    name: '客户结算审批',
    description: '核对客户对账金额、运单数量与结算进度。',
    category: 'finance',
    businessType: 'tms_customer_statement',
    icon: 'ri:secure-payment-line',
    tone: 'success',
    nodeNames: ['应收审核', '财务复核']
  },
  {
    key: 'transport-contract',
    name: '运输合同审批',
    description: '结合合同金额、合同类别、相对方与有效期进行分级审核。',
    category: 'transport',
    businessType: 'tms_contract',
    icon: 'ri:file-paper-2-line',
    tone: 'warning',
    nodeNames: ['业务负责人审核', '合同风险复核']
  },
  {
    key: 'vehicle-archive',
    name: '车辆档案维护审批',
    description: '用于车辆档案新增或关键资料变更的受控审批。',
    category: 'vehicle',
    businessType: 'vehicle_archive',
    icon: 'ri:car-line',
    tone: 'info',
    nodeNames: ['车辆管理员审核']
  },
  {
    key: 'hr-personnel-change',
    name: '人事异动审批',
    description: '用于转正、调岗、晋升、停复职与离职等员工主档变更。',
    category: 'hr',
    businessType: 'hr_personnel_change',
    icon: 'ri:swap-box-line',
    tone: 'primary',
    nodeNames: ['直属负责人审核', '人力资源复核']
  },
  {
    key: 'hr-lifecycle',
    name: '入转调离审批',
    description: '审批通过后自动生成入职、转正、调动或离职办理清单。',
    category: 'hr',
    businessType: 'hr_lifecycle_case',
    icon: 'ri:user-settings-line',
    tone: 'success',
    nodeNames: ['业务负责人确认', '人力资源确认']
  },
  {
    key: 'hr-self-service',
    name: '员工自助申请审批',
    description: '覆盖请假、加班、出差、补卡与资料变更等员工申请。',
    category: 'hr',
    businessType: 'hr_self_service_request',
    icon: 'ri:camera-line',
    tone: 'info',
    nodeNames: ['直属负责人审批']
  },
  {
    key: 'hr-recruitment',
    name: '招聘需求审批',
    description: '根据组织、岗位、编制人数和到岗计划审批招聘需求。',
    category: 'hr',
    businessType: 'hr_recruitment_requisition',
    icon: 'ri:user-add-line',
    tone: 'warning',
    nodeNames: ['用人部门审核', '人力资源复核']
  }
]

export const workflowTemplateCategories: WorkflowTemplateCategoryOption[] = [
  { key: 'all', label: '全部' },
  { key: 'finance', label: '财务审批' },
  { key: 'transport', label: '运输管理' },
  { key: 'vehicle', label: '车辆管理' },
  { key: 'safety', label: '安全生产' },
  { key: 'hr', label: '人力资源' },
  { key: 'scm', label: '供应链管理' },
  { key: 'general', label: '通用审批' }
]

export const workflowTemplates = templateDefinitions.map((template) => ({
  ...template,
  fieldCount: getWorkflowBusinessContract(template.businessType).fields.length
}))

export type WorkflowTemplate = (typeof workflowTemplates)[number]

export function createWorkflowNode(name: string, index: number): Api.Workflow.WorkflowNode {
  return {
    key: `node_${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
    name,
    order: index + 1,
    approvalMode: 'any',
    approvalThresholdPercent: 100,
    rejectVetoEnabled: true,
    allowSelfApproval: false,
    dueHours: 24,
    reminderBeforeMinutes: 60,
    escalationEnabled: true,
    escalateAfterHours: 4,
    assignee: { type: 'roles', roleCodes: [] },
    condition: { operator: 'always' }
  }
}

export function createWorkflowTemplateDraft(
  templateKey: string
): Api.Workflow.WorkflowDefinitionSavePayload {
  const template =
    workflowTemplates.find((item) => item.key === templateKey) ?? workflowTemplates[0]
  return cloneDeep({
    code: '',
    name: template.isCustom ? '' : template.name,
    businessType: template.businessType,
    description: template.isCustom ? '' : template.description,
    changeNote: '初始化流程设计',
    config: {
      nodes: template.nodeNames.map(createWorkflowNode),
      allowAutoApprove: false
    }
  })
}
