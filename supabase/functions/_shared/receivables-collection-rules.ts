export type ReceivablesRiskLevel = 'critical' | 'high' | 'medium' | 'low'
export type ReceivablesSignalSeverity = 'critical' | 'high' | 'medium'
export type ReceivablesRecommendation =
  | 'unblock_settlement'
  | 'complete_invoicing'
  | 'prioritize_collection'
  | 'routine_monitoring'

export interface CustomerStatementRow {
  id?: unknown
  statement_no?: unknown
  customer_id?: unknown
  customer_name?: unknown
  period_start?: unknown
  period_end?: unknown
  status?: unknown
  statement_amount?: unknown
  settled_amount?: unknown
  outstanding_amount?: unknown
  submitted_at?: unknown
  reviewed_at?: unknown
}

export interface InvoiceableStatementRow {
  statement_id?: unknown
  direction?: unknown
  statement_amount?: unknown
  invoiced_amount?: unknown
  uninvoiced_amount?: unknown
}

export interface ReceivablesRiskSignal {
  type: string
  severity: ReceivablesSignalSeverity
  title: string
  detail: string
  evidence: string[]
}

export interface ReceivablesPriorityStatement {
  id: string
  statementNo: string
  customerId: string
  customerName: string
  periodStart: string
  periodEnd: string
  status: string
  ageDays: number
  statementAmount: number
  settledAmount: number
  outstandingAmount: number
  uninvoicedAmount: number
  riskScore: number
  reasons: string[]
}

export interface ReceivablesRiskCustomer {
  customerId: string
  customerName: string
  statementCount: number
  outstandingAmount: number
  maxAgeDays: number
  riskScore: number
  statementNos: string[]
}

export interface ReceivablesCollectionAssessment {
  riskLevel: ReceivablesRiskLevel
  riskScore: number
  confidence: number
  recommendation: ReceivablesRecommendation
  summary: string
  signals: ReceivablesRiskSignal[]
  priorityStatements: ReceivablesPriorityStatement[]
  riskCustomers: ReceivablesRiskCustomer[]
  recommendedActions: string[]
  limitations: string[]
  metrics: {
    totalStatementCount: number
    openStatementCount: number
    statementAmount: number
    settledAmount: number
    outstandingAmount: number
    collectionRate: number
    aging30Amount: number
    aging60Amount: number
    aging90Amount: number
    uninvoicedAmount: number
    reviewBlockedAmount: number
    atRiskAmount: number
  }
}

interface NormalizedStatement {
  id: string
  statementNo: string
  customerId: string
  customerName: string
  periodStart: string
  periodEnd: string
  status: string
  ageDays: number
  statementAmount: number
  settledAmount: number
  outstandingAmount: number
  uninvoicedAmount: number
}

const CLOSED_STATUSES = new Set(['settled', 'voided'])
const REVIEW_BLOCKED_STATUSES = new Set(['draft', 'pending_review'])
const COLLECTABLE_STATUSES = new Set(['confirmed', 'partially_settled'])
const DAY_MS = 86_400_000

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function number(value: unknown): number {
  const resolved = Number(value ?? 0)
  return Number.isFinite(resolved) ? resolved : 0
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

function percentage(part: number, total: number): number {
  return total > 0 ? round((part / total) * 100, 1) : 0
}

function money(value: number): string {
  return `¥${round(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

function ageInDays(periodEnd: string, now: Date): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd)) return 0
  const endAt = new Date(`${periodEnd}T00:00:00.000Z`).getTime()
  if (!Number.isFinite(endAt)) return 0
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Math.max(0, Math.floor((today - endAt) / DAY_MS))
}

function normalizeStatements(
  statementRows: CustomerStatementRow[],
  invoiceRows: InvoiceableStatementRow[],
  now: Date
): NormalizedStatement[] {
  const invoiceMap = new Map<string, number>()
  for (const row of invoiceRows) {
    if (text(row.direction) && text(row.direction) !== 'receivable') continue
    const statementId = text(row.statement_id)
    if (statementId) invoiceMap.set(statementId, Math.max(0, number(row.uninvoiced_amount)))
  }

  return statementRows
    .map((row) => {
      const id = text(row.id)
      const statementAmount = Math.max(0, number(row.statement_amount))
      const settledAmount = Math.max(0, number(row.settled_amount))
      const outstandingAmount = Math.max(
        0,
        number(row.outstanding_amount) || statementAmount - settledAmount
      )
      const periodEnd = text(row.period_end)
      return {
        id,
        statementNo: text(row.statement_no) || '未编号对账单',
        customerId: text(row.customer_id),
        customerName: text(row.customer_name) || '未关联客户',
        periodStart: text(row.period_start),
        periodEnd,
        status: text(row.status) || 'unknown',
        ageDays: ageInDays(periodEnd, now),
        statementAmount: round(statementAmount),
        settledAmount: round(settledAmount),
        outstandingAmount: round(outstandingAmount),
        uninvoicedAmount: round(invoiceMap.get(id) ?? 0)
      }
    })
    .filter((row) => row.id && !CLOSED_STATUSES.has(row.status))
}

function assessStatement(
  row: NormalizedStatement,
  portfolioOutstanding: number,
  allowConcentrationRisk: boolean
): ReceivablesPriorityStatement | null {
  if (row.outstandingAmount <= 0) return null

  let riskScore = 25
  const reasons: string[] = []
  if (row.ageDays >= 90) {
    riskScore = 92
    reasons.push('账期结束已超过 90 天')
  } else if (row.ageDays >= 60) {
    riskScore = 80
    reasons.push('账期结束已超过 60 天')
  } else if (row.ageDays >= 30) {
    riskScore = 66
    reasons.push('账期结束已超过 30 天')
  } else if (row.ageDays >= 15) {
    riskScore = 48
    reasons.push('账期结束已超过 15 天')
  }

  if (REVIEW_BLOCKED_STATUSES.has(row.status)) {
    riskScore = Math.max(riskScore, row.ageDays >= 30 ? 76 : 58)
    reasons.push(row.status === 'draft' ? '对账单仍为草稿' : '对账单等待审核确认')
  }
  if (COLLECTABLE_STATUSES.has(row.status) && row.uninvoicedAmount > 0) {
    riskScore = Math.min(100, riskScore + 9)
    reasons.push('仍有未开票金额')
  }
  const outstandingRatio = row.statementAmount > 0 ? row.outstandingAmount / row.statementAmount : 0
  if (outstandingRatio >= 0.8) {
    riskScore = Math.min(100, riskScore + 7)
    reasons.push('未结金额占对账金额 80% 以上')
  }
  if (
    allowConcentrationRisk &&
    portfolioOutstanding > 0 &&
    row.outstandingAmount / portfolioOutstanding >= 0.3
  ) {
    riskScore = Math.min(100, riskScore + 6)
    reasons.push('单笔未结金额占当前应收 30% 以上')
  }

  return { ...row, riskScore, reasons }
}

function buildRiskCustomers(
  statements: ReceivablesPriorityStatement[]
): ReceivablesRiskCustomer[] {
  const grouped = new Map<string, ReceivablesRiskCustomer>()
  for (const statement of statements) {
    const key = statement.customerId || statement.customerName
    const current = grouped.get(key) ?? {
      customerId: statement.customerId,
      customerName: statement.customerName,
      statementCount: 0,
      outstandingAmount: 0,
      maxAgeDays: 0,
      riskScore: 0,
      statementNos: []
    }
    current.statementCount += 1
    current.outstandingAmount = round(current.outstandingAmount + statement.outstandingAmount)
    current.maxAgeDays = Math.max(current.maxAgeDays, statement.ageDays)
    current.riskScore = Math.max(current.riskScore, statement.riskScore)
    current.statementNos.push(statement.statementNo)
    grouped.set(key, current)
  }
  return [...grouped.values()]
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore || right.outstandingAmount - left.outstandingAmount
    )
    .slice(0, 6)
}

export function assessReceivablesCollection(
  source: {
    statements: CustomerStatementRow[]
    invoiceableStatements?: InvoiceableStatementRow[]
  },
  options: { now?: Date } = {}
): ReceivablesCollectionAssessment {
  const now = options.now ?? new Date()
  const rows = normalizeStatements(source.statements, source.invoiceableStatements ?? [], now)
  const statementAmount = rows.reduce((sum, row) => sum + row.statementAmount, 0)
  const settledAmount = rows.reduce((sum, row) => sum + row.settledAmount, 0)
  const outstandingAmount = rows.reduce((sum, row) => sum + row.outstandingAmount, 0)
  const customerCount = new Set(rows.map((row) => row.customerId || row.customerName)).size
  const allowConcentrationRisk =
    rows.length >= 3 && customerCount >= 2 && outstandingAmount >= 10_000
  const priorityStatements = rows
    .map((row) => assessStatement(row, outstandingAmount, allowConcentrationRisk))
    .filter((item): item is ReceivablesPriorityStatement => Boolean(item))
    .sort(
      (left, right) =>
        right.riskScore - left.riskScore ||
        right.ageDays - left.ageDays ||
        right.outstandingAmount - left.outstandingAmount
    )
  const riskCustomers = buildRiskCustomers(priorityStatements)
  const aging30Rows = rows.filter((row) => row.ageDays >= 30 && row.outstandingAmount > 0)
  const aging60Rows = rows.filter((row) => row.ageDays >= 60 && row.outstandingAmount > 0)
  const aging90Rows = rows.filter((row) => row.ageDays >= 90 && row.outstandingAmount > 0)
  const reviewBlockedRows = rows.filter(
    (row) => REVIEW_BLOCKED_STATUSES.has(row.status) && row.outstandingAmount > 0
  )
  const uninvoicedRows = rows.filter(
    (row) => COLLECTABLE_STATUSES.has(row.status) && row.uninvoicedAmount > 0
  )
  const aging30Amount = round(aging30Rows.reduce((sum, row) => sum + row.outstandingAmount, 0))
  const aging60Amount = round(aging60Rows.reduce((sum, row) => sum + row.outstandingAmount, 0))
  const aging90Amount = round(aging90Rows.reduce((sum, row) => sum + row.outstandingAmount, 0))
  const uninvoicedAmount = round(
    uninvoicedRows.reduce((sum, row) => sum + row.uninvoicedAmount, 0)
  )
  const reviewBlockedAmount = round(
    reviewBlockedRows.reduce((sum, row) => sum + row.outstandingAmount, 0)
  )
  const atRiskAmount = round(
    priorityStatements
      .filter((row) => row.riskScore >= 60)
      .reduce((sum, row) => sum + row.outstandingAmount, 0)
  )
  const signals: ReceivablesRiskSignal[] = []

  if (aging90Rows.length) {
    signals.push({
      type: 'aging_over_90_days',
      severity: 'critical',
      title: '存在 90 天以上长账龄应收',
      detail: `${aging90Rows.length} 笔未结对账单的账期结束时间已超过 90 天，应优先核实回款承诺与争议原因。`,
      evidence: [`涉及金额：${money(aging90Amount)}`, `涉及客户：${new Set(aging90Rows.map((row) => row.customerId || row.customerName)).size} 家`]
    })
  } else if (aging60Rows.length) {
    signals.push({
      type: 'aging_over_60_days',
      severity: 'high',
      title: '60 天以上应收需要升级跟进',
      detail: `${aging60Rows.length} 笔未结对账单已进入较长账龄区间，建议明确责任人与下一次催收节点。`,
      evidence: [`涉及金额：${money(aging60Amount)}`, `占当前未结：${percentage(aging60Amount, outstandingAmount).toFixed(1)}%`]
    })
  }

  if (reviewBlockedRows.length) {
    signals.push({
      type: 'settlement_review_blocked',
      severity: reviewBlockedRows.some((row) => row.ageDays >= 30) ? 'high' : 'medium',
      title: '对账确认阻塞回款流程',
      detail: `${reviewBlockedRows.length} 笔对账单仍处于草稿或待审核状态，尚未形成稳定的开票与催收依据。`,
      evidence: [`阻塞金额：${money(reviewBlockedAmount)}`, `最久账龄：${Math.max(...reviewBlockedRows.map((row) => row.ageDays))} 天`]
    })
  }

  if (uninvoicedRows.length) {
    signals.push({
      type: 'uninvoiced_receivables',
      severity: uninvoicedAmount >= outstandingAmount * 0.5 ? 'high' : 'medium',
      title: '未开票金额影响回款推进',
      detail: `${uninvoicedRows.length} 笔已确认或部分结算的对账单仍有未开票金额，可能成为客户付款流程的前置阻塞。`,
      evidence: [`未开票金额：${money(uninvoicedAmount)}`, `占当前未结：${percentage(uninvoicedAmount, outstandingAmount).toFixed(1)}%`]
    })
  }

  const topCustomer = riskCustomers[0]
  if (
    allowConcentrationRisk &&
    topCustomer &&
    topCustomer.outstandingAmount / outstandingAmount >= 0.5
  ) {
    signals.push({
      type: 'customer_concentration',
      severity: topCustomer.riskScore >= 80 ? 'high' : 'medium',
      title: '应收集中度偏高',
      detail: `${topCustomer.customerName} 的未结金额占当前应收的一半以上，单一客户回款波动会明显影响现金流。`,
      evidence: [`客户未结：${money(topCustomer.outstandingAmount)}`, `应收占比：${percentage(topCustomer.outstandingAmount, outstandingAmount).toFixed(1)}%`]
    })
  }

  const riskScore = Math.max(12, ...priorityStatements.map((row) => row.riskScore))
  const riskLevel: ReceivablesRiskLevel =
    riskScore >= 85 ? 'critical' : riskScore >= 70 ? 'high' : riskScore >= 45 ? 'medium' : 'low'
  const recommendation: ReceivablesRecommendation = reviewBlockedRows.length
    ? 'unblock_settlement'
    : uninvoicedRows.length
      ? 'complete_invoicing'
      : aging30Rows.length
        ? 'prioritize_collection'
        : 'routine_monitoring'
  const collectionRate = percentage(settledAmount, statementAmount)
  const agingSummary = aging60Amount
    ? `其中 ${money(aging60Amount)} 的账期结束已超过 60 天`
    : '暂未发现账期结束超过 60 天的未结应收'
  const summary = rows.length
    ? `当前 ${rows.length} 笔未关闭客户对账单形成 ${money(outstandingAmount)} 未结应收，${agingSummary}。建议${recommendation === 'unblock_settlement' ? '先解除对账审核阻塞' : recommendation === 'complete_invoicing' ? '先补齐未开票资料' : recommendation === 'prioritize_collection' ? '优先跟进长账龄应收' : '保持常规回款跟进'}。`
    : '当前没有未关闭的客户对账单，暂未识别到需要优先处理的回款风险。'

  const recommendedActions: string[] = []
  if (reviewBlockedRows.length) {
    recommendedActions.push(
      '先处理草稿和待审核对账单，明确争议项、审核责任人与最晚确认时间，避免回款流程停在对账环节。'
    )
  }
  if (uninvoicedRows.length) {
    recommendedActions.push(
      '对已确认但未完成开票的应收补齐发票，记录客户付款所需资料和预计开票完成时间。'
    )
  }
  if (aging30Rows.length) {
    recommendedActions.push(
      '按风险分数从高到低安排催收，优先跟进长账龄应收，并记录客户承诺的下次回款节点。'
    )
  }
  if (rows.length && !recommendedActions.length) {
    recommendedActions.push(
      '维持常规回款跟进，确认客户付款资料已齐全，并记录预计回款日期与责任人。'
    )
  }
  recommendedActions.push(
    '每周复核对账、开票、回款核销三段数据，只把本次结果作为人工催收排序依据，不自动修改财务状态。'
  )

  return {
    riskLevel,
    riskScore,
    confidence: rows.length >= 20 ? 0.88 : rows.length >= 8 ? 0.82 : rows.length ? 0.72 : 0.6,
    recommendation,
    summary,
    signals,
    priorityStatements: priorityStatements.slice(0, 10),
    riskCustomers,
    recommendedActions,
    limitations: [
      '系统当前未维护客户合同账期、信用额度和承诺付款日，因此“账龄”按对账单账期结束日计算，不等同于合同逾期天数。',
      '本次分析仅覆盖系统内客户对账单、已结金额与开票关联，不包含线下回款承诺、争议沟通和未录入银行流水。',
      '风险分数用于帮助财务人员排序，不代表客户信用评级，也不会自动发送催收消息或修改对账、发票、回款状态。'
    ],
    metrics: {
      totalStatementCount: source.statements.length,
      openStatementCount: rows.length,
      statementAmount: round(statementAmount),
      settledAmount: round(settledAmount),
      outstandingAmount: round(outstandingAmount),
      collectionRate,
      aging30Amount,
      aging60Amount,
      aging90Amount,
      uninvoicedAmount,
      reviewBlockedAmount,
      atRiskAmount
    }
  }
}
