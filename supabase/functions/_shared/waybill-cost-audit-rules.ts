export type WaybillCostAuditSignalType =
  | 'amount_outlier'
  | 'cost_concentration'
  | 'duplicate_cost'
  | 'future_occurred_date'
  | 'missing_attachment'
  | 'missing_payee'
  | 'missing_remark'
  | 'negative_margin'
  | 'thin_margin'

export type WaybillCostAuditSeverity = 'critical' | 'high' | 'medium'
export type WaybillCostAuditRiskLevel = WaybillCostAuditSeverity | 'low'
export type WaybillCostAuditRecommendation =
  | 'block_for_verification'
  | 'manual_review'
  | 'routine_review'

export interface WaybillCostAuditSignal {
  type: WaybillCostAuditSignalType
  severity: WaybillCostAuditSeverity
  title: string
  detail: string
  evidence: string[]
}

export interface WaybillCostAuditAssessment {
  costId: string
  waybillId: string
  waybillNo: string
  route: string
  riskLevel: WaybillCostAuditRiskLevel
  riskScore: number
  confidence: number
  recommendation: WaybillCostAuditRecommendation
  summary: string
  signals: WaybillCostAuditSignal[]
  recommendedActions: string[]
  limitations: string[]
  metrics: {
    amount: number
    benchmarkMedian: number | null
    benchmarkSampleSize: number
    duplicateCount: number
    projectedTotalCost: number
    receivableAmount: number | null
    projectedGrossMargin: number | null
    attachmentCount: number
  }
}

export interface WaybillCostAuditInput {
  cost: Record<string, unknown>
  siblingCosts?: Array<Record<string, unknown>>
  referenceCosts?: Array<Record<string, unknown>>
  profit?: Record<string, unknown> | null
}

interface AuditOptions {
  now?: Date
}

const EVIDENCE_REQUIRED_TYPES = new Set([
  'cargo_damage',
  'driver_expense',
  'fuel',
  'loading',
  'parking',
  'toll',
  'waiting'
])
const EXPLANATION_REQUIRED_TYPES = new Set(['cargo_damage', 'other', 'waiting'])

const severityWeight: Record<WaybillCostAuditSeverity, number> = {
  critical: 3,
  high: 2,
  medium: 1
}

function field(row: Record<string, unknown>, snakeKey: string, camelKey: string): unknown {
  return row[snakeKey] ?? row[camelKey]
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function numberValue(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function unique(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))]
}

function money(value: number): string {
  return `¥${roundMoney(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

function percentage(value: number): string {
  return `${Math.round(value * 1_000) / 10}%`
}

function median(values: number[]): number | null {
  const sorted = values.filter((item) => item > 0).sort((left, right) => left - right)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? roundMoney(sorted[middle])
    : roundMoney((sorted[middle - 1] + sorted[middle]) / 2)
}

function attachmentCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (typeof value !== 'string' || !value.trim()) return 0
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.length : 0
  } catch {
    return 0
  }
}

function normalizedPayee(row: Record<string, unknown>): string {
  return text(field(row, 'payee_name', 'payeeName')).toLowerCase().replace(/\s+/g, '')
}

function signalScore(signal: WaybillCostAuditSignal): number {
  const scores: Record<WaybillCostAuditSignalType, number> = {
    negative_margin: 96,
    duplicate_cost: 88,
    future_occurred_date: 82,
    amount_outlier: 76,
    thin_margin: signal.severity === 'high' ? 74 : 56,
    cost_concentration: 58,
    missing_attachment: 52,
    missing_payee: 48,
    missing_remark: 42
  }
  return scores[signal.type]
}

function riskLevel(signals: WaybillCostAuditSignal[]): WaybillCostAuditRiskLevel {
  if (!signals.length) return 'low'
  return [...signals].sort(
    (left, right) => severityWeight[right.severity] - severityWeight[left.severity]
  )[0].severity
}

export function assessWaybillCost(
  input: WaybillCostAuditInput,
  options: AuditOptions = {}
): WaybillCostAuditAssessment {
  const { cost, siblingCosts = [], referenceCosts = [], profit = null } = input
  const now = options.now ?? new Date()
  const costId = text(field(cost, 'id', 'id'))
  const waybillId = text(field(cost, 'waybill_id', 'waybillId'))
  const waybill = (field(cost, 'waybill', 'waybill') ?? {}) as Record<string, unknown>
  const order = (field(waybill, 'order', 'order') ?? {}) as Record<string, unknown>
  const waybillNo = text(field(waybill, 'waybill_no', 'waybillNo')) || '未编号运单'
  const origin =
    text(field(waybill, 'origin_city', 'originCity')) ||
    text(field(order, 'origin_station', 'originStation')) ||
    '起点未设置'
  const destination =
    text(field(waybill, 'destination_city', 'destinationCity')) ||
    text(field(order, 'destination_station', 'destinationStation')) ||
    '终点未设置'
  const route = `${origin} → ${destination}`
  const amount = roundMoney(numberValue(field(cost, 'amount', 'amount')))
  const costType = text(field(cost, 'cost_type', 'costType')).toLowerCase()
  const auditStatus = text(field(cost, 'audit_status', 'auditStatus')).toLowerCase()
  const occurredOn = text(field(cost, 'occurred_on', 'occurredOn'))
  const payee = normalizedPayee(cost)
  const remark = text(field(cost, 'remark', 'remark'))
  const attachments = attachmentCount(field(cost, 'attachments', 'attachments'))
  const activeSiblings = siblingCosts.filter((item) => {
    const id = text(field(item, 'id', 'id'))
    const status = text(field(item, 'audit_status', 'auditStatus')).toLowerCase()
    return id !== costId && status !== 'voided'
  })
  const duplicates = activeSiblings.filter((item) => {
    const siblingType = text(field(item, 'cost_type', 'costType')).toLowerCase()
    const siblingAmount = roundMoney(numberValue(field(item, 'amount', 'amount')))
    return siblingType === costType && siblingAmount === amount && normalizedPayee(item) === payee
  })
  const benchmarkValues = referenceCosts
    .filter((item) => text(field(item, 'id', 'id')) !== costId)
    .map((item) => numberValue(field(item, 'amount', 'amount')))
    .filter((item) => item > 0)
  const benchmarkMedian = median(benchmarkValues)
  const totalCost = profit ? numberValue(field(profit, 'total_cost_amount', 'totalCostAmount')) : 0
  const approvedSiblingTotal = activeSiblings
    .filter((item) => text(field(item, 'audit_status', 'auditStatus')) === 'approved')
    .reduce((sum, item) => sum + numberValue(field(item, 'amount', 'amount')), 0)
  const approvedBase = profit ? totalCost : approvedSiblingTotal
  const projectedTotalCost = roundMoney(approvedBase + (auditStatus === 'approved' ? 0 : amount))
  const receivable = profit
    ? roundMoney(numberValue(field(profit, 'receivable_amount', 'receivableAmount')))
    : null
  const projectedGrossMargin = receivable && receivable > 0
    ? Math.round(((receivable - projectedTotalCost) / receivable) * 10_000) / 10_000
    : null
  const signals: WaybillCostAuditSignal[] = []
  const actions: string[] = []

  if (duplicates.length) {
    signals.push({
      type: 'duplicate_cost',
      severity: 'high',
      title: '存在疑似重复费用',
      detail: `同一运单中发现 ${duplicates.length} 条费用类型、金额和收款方均相同的有效记录。`,
      evidence: [
        `本次费用：${costType || '未设置类型'} / ${money(amount)}`,
        `相同记录数：${duplicates.length}`,
        `收款方：${text(field(cost, 'payee_name', 'payeeName')) || '未填写'}`
      ]
    })
    actions.push('核对原始票据和费用发生时间，确认不是同一笔费用被重复登记。')
  }

  if (
    benchmarkMedian !== null &&
    benchmarkValues.length >= 5 &&
    amount >= benchmarkMedian * 3 &&
    amount - benchmarkMedian >= 500
  ) {
    signals.push({
      type: 'amount_outlier',
      severity: amount >= benchmarkMedian * 5 ? 'high' : 'medium',
      title: '费用金额显著高于历史基准',
      detail: '当前金额与同费用类型的近期已审核记录相比偏高，需要确认业务原因。',
      evidence: [
        `当前金额：${money(amount)}`,
        `历史中位数：${money(benchmarkMedian)}`,
        `参考样本：${benchmarkValues.length} 条`
      ]
    })
    actions.push('对照合同、里程、计费单价和历史同类费用，说明本次金额偏高的原因。')
  }

  if (projectedGrossMargin !== null && projectedGrossMargin < 0) {
    signals.push({
      type: 'negative_margin',
      severity: 'critical',
      title: '预计运单毛利转负',
      detail: '计入当前费用后，运单预计总成本将超过应收金额。',
      evidence: [
        `应收金额：${money(receivable ?? 0)}`,
        `预计总成本：${money(projectedTotalCost)}`,
        `预计毛利率：${percentage(projectedGrossMargin)}`
      ]
    })
    actions.push('暂停直接审核通过，先核对应收运价、承运结算价和全部附加费用。')
  } else if (projectedGrossMargin !== null && projectedGrossMargin < 0.1) {
    const severity: WaybillCostAuditSeverity = projectedGrossMargin < 0.05 ? 'high' : 'medium'
    signals.push({
      type: 'thin_margin',
      severity,
      title: '预计运单毛利偏低',
      detail: '计入当前费用后，运单预计毛利率低于 10%。',
      evidence: [
        `应收金额：${money(receivable ?? 0)}`,
        `预计总成本：${money(projectedTotalCost)}`,
        `预计毛利率：${percentage(projectedGrossMargin)}`
      ]
    })
    actions.push('确认低毛利是否已获得业务负责人授权，并在审核意见中保留原因。')
  }

  if (
    approvedBase > 0 &&
    projectedTotalCost > 0 &&
    costType !== 'carrier_freight' &&
    amount / projectedTotalCost >= 0.6
  ) {
    signals.push({
      type: 'cost_concentration',
      severity: 'medium',
      title: '单笔附加费用占比较高',
      detail: '当前非承运费占预计总成本的比例较高，建议检查计费拆分是否合理。',
      evidence: [
        `当前费用：${money(amount)}`,
        `预计总成本：${money(projectedTotalCost)}`,
        `费用占比：${percentage(amount / projectedTotalCost)}`
      ]
    })
    actions.push('检查该费用是否应拆分、是否已包含在承运费或其他费用中。')
  }

  const occurredTime = Date.parse(occurredOn)
  if (Number.isFinite(occurredTime) && occurredTime > now.getTime() + 86_400_000) {
    signals.push({
      type: 'future_occurred_date',
      severity: 'high',
      title: '费用发生日期晚于当前日期',
      detail: '费用发生日期位于未来，可能存在录入错误。',
      evidence: [`发生日期：${occurredOn}`, `研判日期：${now.toISOString().slice(0, 10)}`]
    })
    actions.push('核对票据日期并修正费用发生日期后再继续审核。')
  }

  if (!payee) {
    signals.push({
      type: 'missing_payee',
      severity: 'medium',
      title: '收款方信息缺失',
      detail: '当前费用没有明确收款方，后续对账和结算追溯依据不足。',
      evidence: [`费用类型：${costType || '未设置'}`, `费用金额：${money(amount)}`]
    })
    actions.push('补充实际收款方，并确认与合同主体、司机或承运商信息一致。')
  }

  if (EVIDENCE_REQUIRED_TYPES.has(costType) && amount >= 200 && attachments === 0) {
    signals.push({
      type: 'missing_attachment',
      severity: 'medium',
      title: '费用凭证缺失',
      detail: '该费用类型和金额通常需要票据、回单或其他附件作为审核依据。',
      evidence: [`费用类型：${costType}`, `费用金额：${money(amount)}`, '附件数量：0']
    })
    actions.push('上传对应票据、回单或现场凭证，确保费用可追溯。')
  }

  if (EXPLANATION_REQUIRED_TYPES.has(costType) && !remark) {
    signals.push({
      type: 'missing_remark',
      severity: 'medium',
      title: '特殊费用说明不足',
      detail: '该费用类型需要说明发生原因、计费口径或责任归属。',
      evidence: [`费用类型：${costType}`, `费用金额：${money(amount)}`]
    })
    actions.push('补充费用发生原因、计算方式和责任归属。')
  }

  signals.sort(
    (left, right) =>
      severityWeight[right.severity] - severityWeight[left.severity] ||
      signalScore(right) - signalScore(left)
  )
  const currentRiskLevel = riskLevel(signals)
  const riskScore = signals.length
    ? clamp(Math.max(...signals.map(signalScore)) + Math.min(6, (signals.length - 1) * 2), 0, 99)
    : 10
  const hasCritical = signals.some((item) => item.severity === 'critical')
  const recommendation: WaybillCostAuditRecommendation = hasCritical || duplicates.length
    ? 'block_for_verification'
    : signals.length
      ? 'manual_review'
      : 'routine_review'
  let confidence = 0.5
  if (profit) confidence += 0.15
  if (benchmarkValues.length >= 5) confidence += 0.12
  if (siblingCosts.length) confidence += 0.08
  if (occurredOn) confidence += 0.05
  if (payee) confidence += 0.04
  if (attachments) confidence += 0.03

  return {
    costId,
    waybillId,
    waybillNo,
    route,
    riskLevel: currentRiskLevel,
    riskScore,
    confidence: Math.round(clamp(confidence, 0.4, 0.92) * 100) / 100,
    recommendation,
    summary: signals.length
      ? `${waybillNo} 的本笔费用识别到 ${signals.length} 项审核风险，最高为${currentRiskLevel === 'critical' ? '严重' : currentRiskLevel === 'high' ? '高' : '中'}风险。`
      : `${waybillNo} 的本笔费用暂未识别到明确异常，仍需按现有财务制度完成最终审核。`,
    signals,
    recommendedActions: unique(
      actions.length
        ? actions
        : ['按现有财务审核流程核对票据、合同和费用归属后，由审核人作出决定。']
    ).slice(0, 7),
    limitations: unique([
      '本次结果只基于系统内费用、运单和利润数据，不替代发票真伪、合同条款和线下票据核验。',
      benchmarkValues.length < 5
        ? '同费用类型的近期已审核样本不足 5 条，本次不判断历史金额离群。'
        : '',
      !profit ? '未取得运单利润数据，本次不判断预计毛利风险。' : '',
      'AI 审核不会自动修改金额、审核状态或结算状态。'
    ]),
    metrics: {
      amount,
      benchmarkMedian,
      benchmarkSampleSize: benchmarkValues.length,
      duplicateCount: duplicates.length,
      projectedTotalCost,
      receivableAmount: receivable,
      projectedGrossMargin,
      attachmentCount: attachments
    }
  }
}

