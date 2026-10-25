import { difference, isEqual, trim } from 'lodash-es'

export type WorkflowSimulationNodeState = 'matched' | 'skipped'
export type WorkflowSimulationOutcome = 'matched' | 'blocked' | 'auto-approved'
export type WorkflowDiagnosticSeverity = 'error' | 'warning' | 'info'

export interface WorkflowDiagnostic {
  code: string
  title: string
  description: string
  severity: WorkflowDiagnosticSeverity
  nodeKey?: string
}

/** Inspect every configured node against complete, tenant-filtered option collections. */
export function inspectWorkflowAssigneeReferences(
  nodes: Api.Workflow.WorkflowNode[],
  users: Api.Workflow.WorkflowUserOption[],
  roles: Api.Workflow.WorkflowRoleOption[]
): WorkflowDiagnostic[] {
  const userIds = users.map((user) => user.id)
  const roleCodes = roles.map((role) => role.roleCode)
  return nodes.flatMap((node): WorkflowDiagnostic[] => {
    const missing =
      node.assignee.type === 'users'
        ? difference(node.assignee.userIds ?? [], userIds)
        : node.assignee.type === 'roles'
          ? difference(node.assignee.roleCodes ?? [], roleCodes)
          : []
    if (!missing.length) return []
    const label = node.assignee.type === 'users' ? '成员' : '角色'
    return [
      {
        code: 'assignee-reference-unavailable',
        title: '审批对象不可用',
        description: `“${node.name || '未命名节点'}”有 ${missing.length} 个${label}已停用、不存在或不属于当前租户，请重新选择。`,
        severity: 'error',
        nodeKey: node.key
      }
    ]
  })
}

export interface WorkflowSimulationTrace {
  node: Api.Workflow.WorkflowNode
  state: WorkflowSimulationNodeState
  reason: string
  isFirstMatched: boolean
}

export interface WorkflowSimulationResult {
  outcome: WorkflowSimulationOutcome
  traces: WorkflowSimulationTrace[]
  diagnostics: WorkflowDiagnostic[]
  simulationStates: Record<string, WorkflowSimulationNodeState>
  matchedCount: number
  skippedCount: number
  errorCount: number
  warningCount: number
  firstMatchedNodeKey?: string
}

interface ConditionMatchResult {
  matched: boolean
  reason: string
}

const operatorLabels: Record<Api.Workflow.ConditionOperator, string> = {
  always: '无条件',
  eq: '等于',
  ne: '不等于',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
  in: '属于',
  contains: '包含',
  not_empty: '不为空'
}

const numericOperators = new Set<Api.Workflow.ConditionOperator>(['gt', 'gte', 'lt', 'lte'])

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return trim(value) === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join('、')
  if (value === null || value === undefined || value === '') return '空值'
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

function normalizeComparable(
  value: unknown,
  valueType?: Api.Workflow.WorkflowContextField['valueType']
): unknown {
  if (valueType === 'number') {
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : value
  }
  if (valueType === 'boolean') {
    if (value === true || value === 'true' || value === 1 || value === '1') return true
    if (value === false || value === 'false' || value === 0 || value === '0') return false
  }
  return value
}

function normalizeCandidates(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  return String(value ?? '')
    .split(',')
    .map((item) => trim(item))
    .filter(Boolean)
}

function matchCondition(
  condition: Api.Workflow.WorkflowCondition,
  context: Record<string, unknown>,
  field?: Api.Workflow.WorkflowContextField
): ConditionMatchResult {
  if (condition.operator === 'always') {
    return { matched: true, reason: '无条件进入该节点' }
  }

  const fieldKey = condition.field || ''
  const actualValue = context[fieldKey]
  const fieldLabel = field?.label || fieldKey || '未配置字段'
  if (condition.operator === 'not_empty') {
    const matched = !isEmptyValue(actualValue)
    return {
      matched,
      reason: matched ? `${fieldLabel}已填写` : `${fieldLabel}未填写，条件不成立`
    }
  }
  if (isEmptyValue(actualValue)) {
    return { matched: false, reason: `${fieldLabel}未填写，条件不成立` }
  }

  const expectedValue = condition.value
  const normalizedActual = normalizeComparable(actualValue, field?.valueType)
  const normalizedExpected = normalizeComparable(expectedValue, field?.valueType)
  let matched = false

  if (condition.operator === 'eq' || condition.operator === 'ne') {
    const equals = isEqual(normalizedActual, normalizedExpected)
    matched = condition.operator === 'eq' ? equals : !equals
  } else if (numericOperators.has(condition.operator)) {
    const actualNumber = Number(actualValue)
    const expectedNumber = Number(expectedValue)
    if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) {
      return { matched: false, reason: `${fieldLabel}或比较值不是有效数字` }
    }
    if (condition.operator === 'gt') matched = actualNumber > expectedNumber
    if (condition.operator === 'gte') matched = actualNumber >= expectedNumber
    if (condition.operator === 'lt') matched = actualNumber < expectedNumber
    if (condition.operator === 'lte') matched = actualNumber <= expectedNumber
  } else if (condition.operator === 'in') {
    matched = normalizeCandidates(expectedValue).some((candidate) =>
      isEqual(normalizedActual, normalizeComparable(candidate, field?.valueType))
    )
  } else if (condition.operator === 'contains') {
    matched = String(actualValue).includes(String(expectedValue ?? ''))
  }

  return {
    matched,
    reason: `${fieldLabel}（${formatValue(actualValue)}）${operatorLabels[condition.operator]}${formatValue(expectedValue)}，${matched ? '条件成立' : '条件不成立'}`
  }
}

function createNodeDiagnostic(
  node: Api.Workflow.WorkflowNode,
  code: string,
  title: string,
  description: string,
  severity: WorkflowDiagnosticSeverity = 'error'
): WorkflowDiagnostic {
  return { code, title, description, severity, nodeKey: node.key }
}

export function inspectWorkflowConfig(
  config: Api.Workflow.WorkflowConfig,
  fields: Api.Workflow.WorkflowContextField[]
): WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = []
  if (!config.nodes.length) {
    return [
      {
        code: 'NO_NODES',
        title: '尚未配置审批节点',
        description: '流程至少需要一个审批节点后才能发布。',
        severity: 'error'
      }
    ]
  }

  const allowedFields = new Set(fields.map((field) => field.key))
  const nodeKeys = new Set<string>()
  const nodeOrders = new Set<number>()
  for (const [index, node] of config.nodes.entries()) {
    const nodeLabel = trim(node.name) || `第 ${index + 1} 个节点`
    if (!trim(node.name)) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'NODE_NAME_EMPTY',
          '节点名称为空',
          `${nodeLabel}需要填写清晰的业务名称。`
        )
      )
    }
    if (nodeKeys.has(node.key)) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'NODE_KEY_DUPLICATE',
          '节点标识重复',
          `“${nodeLabel}”与其他节点使用了相同标识。`
        )
      )
    }
    nodeKeys.add(node.key)
    if (nodeOrders.has(node.order)) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'NODE_ORDER_DUPLICATE',
          '节点顺序重复',
          `“${nodeLabel}”的执行顺序与其他节点冲突。`
        )
      )
    }
    nodeOrders.add(node.order)

    const assigneeCount =
      node.assignee.type === 'users'
        ? (node.assignee.userIds?.length ?? 0)
        : (node.assignee.roleCodes?.length ?? 0)
    if (node.assignee.type !== 'initiator' && assigneeCount === 0) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'ASSIGNEE_EMPTY',
          '审批人未配置',
          `“${nodeLabel}”没有可解析的用户或角色。`
        )
      )
    }
    if (node.assignee.type === 'initiator' && !node.allowSelfApproval) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'INITIATOR_SELF_APPROVAL_CONFLICT',
          '发起人审批规则冲突',
          `“${nodeLabel}”指定发起人审批，但同时禁止发起人自审，运行时将无法生成审批任务。`
        )
      )
    }
    if (
      node.approvalMode === 'percentage' &&
      (!Number.isInteger(Number(node.approvalThresholdPercent)) ||
        Number(node.approvalThresholdPercent) < 1 ||
        Number(node.approvalThresholdPercent) > 100)
    ) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'THRESHOLD_INVALID',
          '通过比例无效',
          `“${nodeLabel}”的通过比例必须是 1 到 100 的整数。`
        )
      )
    }
    if (Number(node.reminderBeforeMinutes) > Number(node.dueHours) * 60) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'REMINDER_BEFORE_START',
          '提醒时间早于节点开始',
          `“${nodeLabel}”的到期前提醒超过办理时限，任务创建后可能立即提醒。`,
          'warning'
        )
      )
    }

    const condition = node.condition
    if (condition.operator !== 'always') {
      if (!trim(condition.field || '')) {
        diagnostics.push(
          createNodeDiagnostic(
            node,
            'CONDITION_FIELD_EMPTY',
            '条件字段未配置',
            `“${nodeLabel}”缺少进入条件字段。`
          )
        )
      } else if (!allowedFields.has(condition.field || '')) {
        diagnostics.push(
          createNodeDiagnostic(
            node,
            'CONDITION_FIELD_UNSUPPORTED',
            '条件字段不受支持',
            `“${nodeLabel}”引用了当前业务契约之外的字段。`
          )
        )
      }
    }
    if (!['always', 'not_empty'].includes(condition.operator) && isEmptyValue(condition.value)) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'CONDITION_VALUE_EMPTY',
          '条件比较值为空',
          `“${nodeLabel}”需要填写有效的比较值。`
        )
      )
    }
    const field = fields.find((item) => item.key === condition.field)
    if (
      numericOperators.has(condition.operator) &&
      (!Number.isFinite(Number(condition.value)) || field?.valueType !== 'number')
    ) {
      diagnostics.push(
        createNodeDiagnostic(
          node,
          'NUMERIC_CONDITION_INVALID',
          '数值条件无效',
          `“${nodeLabel}”的大小比较必须使用数值字段和有效数字。`
        )
      )
    }
  }

  if (config.allowAutoApprove) {
    diagnostics.push({
      code: 'AUTO_APPROVE_ENABLED',
      title: '已允许无节点命中时自动通过',
      description: '请确认该业务允许在所有条件均不满足时绕过人工审批。',
      severity: 'warning'
    })
  } else if (config.nodes.every((node) => node.condition.operator !== 'always')) {
    diagnostics.push({
      code: 'NO_UNCONDITIONAL_FALLBACK',
      title: '流程没有无条件兜底节点',
      description: '这是安全的失败关闭配置；请用多组边界样例确认条件覆盖符合预期。',
      severity: 'info'
    })
  }
  return diagnostics
}

export function simulateWorkflow(
  config: Api.Workflow.WorkflowConfig,
  fields: Api.Workflow.WorkflowContextField[],
  context: Record<string, unknown>
): WorkflowSimulationResult {
  const diagnostics = inspectWorkflowConfig(config, fields)
  const fieldMap = new Map(fields.map((field) => [field.key, field]))
  const orderedNodes = [...config.nodes].sort((a, b) => a.order - b.order)
  let firstMatchedNodeKey: string | undefined
  const traces = orderedNodes.map((node): WorkflowSimulationTrace => {
    const match = matchCondition(node.condition, context, fieldMap.get(node.condition.field || ''))
    if (match.matched && !firstMatchedNodeKey) firstMatchedNodeKey = node.key
    return {
      node,
      state: match.matched ? 'matched' : 'skipped',
      reason: match.reason,
      isFirstMatched: match.matched && firstMatchedNodeKey === node.key
    }
  })
  const matchedCount = traces.filter((trace) => trace.state === 'matched').length
  const skippedCount = traces.length - matchedCount
  const configErrorCount = diagnostics.filter((item) => item.severity === 'error').length
  const outcome: WorkflowSimulationOutcome = configErrorCount
    ? 'blocked'
    : matchedCount
      ? 'matched'
      : config.allowAutoApprove
        ? 'auto-approved'
        : 'blocked'

  if (!matchedCount) {
    diagnostics.unshift({
      code: config.allowAutoApprove ? 'SAMPLE_AUTO_APPROVED' : 'SAMPLE_BLOCKED',
      title: config.allowAutoApprove ? '当前样例将自动通过' : '当前样例将被安全阻断',
      description: config.allowAutoApprove
        ? '所有节点条件均未命中，流程会按当前策略直接通过。'
        : '所有节点条件均未命中，流程不会静默通过，请检查样例或补充兜底节点。',
      severity: config.allowAutoApprove ? 'warning' : 'info'
    })
  }

  const errorCount = diagnostics.filter((item) => item.severity === 'error').length
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length

  return {
    outcome,
    traces,
    diagnostics,
    simulationStates: Object.fromEntries(traces.map((trace) => [trace.node.key, trace.state])),
    matchedCount,
    skippedCount,
    errorCount,
    warningCount,
    firstMatchedNodeKey
  }
}

export function createWorkflowSimulationContext(
  fields: Api.Workflow.WorkflowContextField[],
  nodes: Api.Workflow.WorkflowNode[]
): Record<string, unknown> {
  return Object.fromEntries(
    fields.map((field) => {
      const condition = nodes.find(
        (node) => node.condition.field === field.key && node.condition.operator !== 'always'
      )?.condition
      if (condition) {
        if (condition.operator === 'in') {
          return [field.key, normalizeCandidates(condition.value)[0] ?? '示例值']
        }
        if (condition.operator === 'contains' || condition.operator === 'eq') {
          return [field.key, condition.value ?? '示例值']
        }
        if (numericOperators.has(condition.operator)) {
          const base = Number(condition.value)
          if (Number.isFinite(base)) {
            return [field.key, ['gt', 'gte'].includes(condition.operator) ? base + 1 : base - 1]
          }
        }
      }
      if (field.valueType === 'number') return [field.key, 10000]
      if (field.valueType === 'boolean') return [field.key, true]
      if (field.valueType === 'date') return [field.key, new Date().toISOString().slice(0, 10)]
      return [field.key, `示例${field.label}`]
    })
  )
}
