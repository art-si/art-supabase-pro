export type ProfitRiskLevel = 'critical' | 'high' | 'medium' | 'low'
export type ProfitSignalSeverity = 'critical' | 'high' | 'medium'

export interface WaybillProfitRow {
  id?: unknown
  waybill_id?: unknown
  waybill_no?: unknown
  waybill_status?: unknown
  customer_name?: unknown
  carrier_name?: unknown
  origin_station?: unknown
  destination_station?: unknown
  receivable_amount?: unknown
  carrier_payable_amount?: unknown
  other_cost_amount?: unknown
  total_cost_amount?: unknown
  gross_profit?: unknown
  gross_margin?: unknown
  completed_at?: unknown
}

export interface ProfitRiskSignal {
  type: string
  severity: ProfitSignalSeverity
  title: string
  detail: string
  evidence: string[]
}

export interface ProfitRiskWaybill {
  id: string
  waybillId: string
  waybillNo: string
  route: string
  customerName: string
  carrierName: string
  waybillStatus: string
  receivableAmount: number
  totalCostAmount: number
  grossProfit: number
  grossMargin: number
  riskScore: number
  reasons: string[]
}

export interface WaybillProfitPortfolioAssessment {
  riskLevel: ProfitRiskLevel
  riskScore: number
  confidence: number
  recommendation: 'repair_cost_baseline' | 'manual_profit_review' | 'routine_monitoring'
  summary: string
  signals: ProfitRiskSignal[]
  riskWaybills: ProfitRiskWaybill[]
  recommendedActions: string[]
  limitations: string[]
  metrics: {
    totalWaybills: number
    finalizedWaybills: number
    receivableAmount: number
    totalCostAmount: number
    bookGrossProfit: number
    bookGrossMargin: number | null
    costCoverage: number
    finalizedCostCoverage: number
    missingCostCount: number
    negativeMarginCount: number
    carrierPayableMissingCount: number
  }
}

interface NormalizedProfitRow {
  id: string
  waybillId: string
  waybillNo: string
  waybillStatus: string
  customerName: string
  carrierName: string
  route: string
  receivableAmount: number
  carrierPayableAmount: number
  otherCostAmount: number
  totalCostAmount: number
  grossProfit: number
  grossMargin: number
}

const FINALIZED_STATUSES = new Set(['signed', 'completed'])

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

function normalizeRow(row: WaybillProfitRow): NormalizedProfitRow {
  const origin = text(row.origin_station)
  const destination = text(row.destination_station)
  return {
    id: text(row.id),
    waybillId: text(row.waybill_id),
    waybillNo: text(row.waybill_no) || '未编号运单',
    waybillStatus: text(row.waybill_status) || 'unknown',
    customerName: text(row.customer_name) || '未关联客户',
    carrierName: text(row.carrier_name) || '未关联承运商',
    route: [origin, destination].filter(Boolean).join(' → ') || '路线待补充',
    receivableAmount: number(row.receivable_amount),
    carrierPayableAmount: number(row.carrier_payable_amount),
    otherCostAmount: number(row.other_cost_amount),
    totalCostAmount: number(row.total_cost_amount),
    grossProfit: number(row.gross_profit),
    grossMargin: number(row.gross_margin)
  }
}

function assessRiskWaybill(row: NormalizedProfitRow): ProfitRiskWaybill | null {
  let riskScore = 0
  const reasons: string[] = []
  const finalized = FINALIZED_STATUSES.has(row.waybillStatus)

  if (row.grossProfit < 0 || row.grossMargin < 0) {
    riskScore = 100
    reasons.push('账面毛利为负')
  }
  if (finalized && row.totalCostAmount <= 0) {
    riskScore = Math.max(riskScore, 88)
    reasons.push('已完成/签收但成本为零')
  } else if (row.totalCostAmount <= 0) {
    riskScore = Math.max(riskScore, 66)
    reasons.push('尚未形成成本基线')
  }
  if (row.carrierName !== '未关联承运商' && row.carrierPayableAmount <= 0) {
    riskScore = Math.max(riskScore, finalized ? 82 : 58)
    reasons.push('已关联承运商但承运应付为零')
  }
  if (row.carrierName === '未关联承运商') {
    riskScore = Math.min(100, riskScore + 10)
    reasons.push('承运主体缺失')
  }
  if (row.receivableAmount <= 0) {
    riskScore = Math.min(100, riskScore + 12)
    reasons.push('客户应收为零')
  }

  if (!reasons.length) return null
  return {
    id: row.id,
    waybillId: row.waybillId,
    waybillNo: row.waybillNo,
    route: row.route,
    customerName: row.customerName,
    carrierName: row.carrierName,
    waybillStatus: row.waybillStatus,
    receivableAmount: round(row.receivableAmount),
    totalCostAmount: round(row.totalCostAmount),
    grossProfit: round(row.grossProfit),
    grossMargin: round(row.grossMargin),
    riskScore,
    reasons
  }
}

export function assessWaybillProfitPortfolio(
  sourceRows: WaybillProfitRow[]
): WaybillProfitPortfolioAssessment {
  const rows = sourceRows.map(normalizeRow).filter((row) => row.waybillStatus !== 'cancelled')
  const finalizedRows = rows.filter((row) => FINALIZED_STATUSES.has(row.waybillStatus))
  const costedRows = rows.filter((row) => row.totalCostAmount > 0)
  const finalizedCostedRows = finalizedRows.filter((row) => row.totalCostAmount > 0)
  const negativeRows = rows.filter((row) => row.grossProfit < 0 || row.grossMargin < 0)
  const carrierPayableMissingRows = rows.filter(
    (row) => row.carrierName !== '未关联承运商' && row.carrierPayableAmount <= 0
  )
  const missingCostRows = rows.filter((row) => row.totalCostAmount <= 0)

  const receivableAmount = rows.reduce((sum, row) => sum + row.receivableAmount, 0)
  const totalCostAmount = rows.reduce((sum, row) => sum + row.totalCostAmount, 0)
  const bookGrossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0)
  const bookGrossMargin = receivableAmount > 0 ? (bookGrossProfit / receivableAmount) * 100 : null
  const costCoverage = percentage(costedRows.length, rows.length)
  const finalizedCostCoverage = percentage(finalizedCostedRows.length, finalizedRows.length)
  const signals: ProfitRiskSignal[] = []

  if (negativeRows.length) {
    signals.push({
      type: 'negative_margin',
      severity: 'critical',
      title: '存在实际亏损运单',
      detail: `${negativeRows.length} 票运单的成本已经超过应收，需要优先核对运价、附加费用和审核口径。`,
      evidence: [
        `亏损运单：${negativeRows.length} 票`,
        `最大单票亏损：${money(Math.abs(Math.min(...negativeRows.map((row) => row.grossProfit))))}`
      ]
    })
  }

  const finalizedMissingCost = finalizedRows.length - finalizedCostedRows.length
  if (finalizedMissingCost > 0) {
    signals.push({
      type: 'finalized_missing_cost',
      severity: 'critical',
      title: '已完成运单缺少成本基线',
      detail: `${finalizedMissingCost} 票已完成或签收运单仍显示零成本，当前 100% 毛利属于账面假象。`,
      evidence: [
        `已完成/签收：${finalizedRows.length} 票`,
        `已形成成本：${finalizedCostedRows.length} 票`,
        `完成单成本覆盖率：${finalizedCostCoverage.toFixed(1)}%`
      ]
    })
  }

  if (rows.length && costCoverage < 70) {
    signals.push({
      type: 'cost_coverage_low',
      severity: costCoverage < 30 ? 'high' : 'medium',
      title: '利润数据覆盖率不足',
      detail: `当前只有 ${costedRows.length}/${rows.length} 票形成成本，暂不适合直接用于客户、线路或承运商绩效判断。`,
      evidence: [`成本覆盖率：${costCoverage.toFixed(1)}%`, `缺少成本：${missingCostRows.length} 票`]
    })
  }

  if (carrierPayableMissingRows.length) {
    signals.push({
      type: 'carrier_payable_missing',
      severity: 'high',
      title: '承运应付尚未形成',
      detail: `${carrierPayableMissingRows.length} 票已关联承运商但承运应付为零，会导致利润被系统性高估。`,
      evidence: [
        `缺失承运应付：${carrierPayableMissingRows.length} 票`,
        `涉及应收：${money(carrierPayableMissingRows.reduce((sum, row) => sum + row.receivableAmount, 0))}`
      ]
    })
  }

  const riskWaybills = rows
    .map(assessRiskWaybill)
    .filter((item): item is ProfitRiskWaybill => Boolean(item))
    .sort((left, right) => right.riskScore - left.riskScore || left.grossProfit - right.grossProfit)
    .slice(0, 8)

  const riskScore = Math.min(
    100,
    Math.max(
      negativeRows.length ? 94 : 0,
      finalizedMissingCost ? 88 : 0,
      costCoverage < 30 ? 82 : costCoverage < 70 ? 64 : 24,
      carrierPayableMissingRows.length ? 72 : 0
    )
  )
  const riskLevel: ProfitRiskLevel =
    riskScore >= 85 ? 'critical' : riskScore >= 70 ? 'high' : riskScore >= 45 ? 'medium' : 'low'
  const recommendation =
    costCoverage < 70
      ? 'repair_cost_baseline'
      : negativeRows.length
        ? 'manual_profit_review'
        : 'routine_monitoring'

  const summary = rows.length
    ? `${rows.length} 票运单中，${missingCostRows.length} 票尚未形成成本，${negativeRows.length} 票已出现亏损；当前利润数据${costCoverage < 70 ? '应先补齐成本再用于经营决策' : '可进入常规经营复核'}。`
    : '当前范围内没有可分析的运单利润数据。'

  return {
    riskLevel,
    riskScore,
    confidence: rows.length >= 10 ? 0.92 : rows.length >= 5 ? 0.84 : 0.7,
    recommendation,
    summary,
    signals,
    riskWaybills,
    recommendedActions: [
      '先补齐已完成、已签收运单的承运应付和已审核附加费用，建立可信成本基线。',
      '优先复核负毛利运单，核对客户运价、承运结算价、重复费用和费用审核状态。',
      '成本覆盖率达到 90% 以上后，再按客户、线路或承运商比较毛利表现。',
      '把本次诊断作为人工经营复核清单，不直接修改运单、费用、对账或结算状态。'
    ],
    limitations: [
      '本次只分析系统内运单利润视图和已审核费用，不包含未登记的线下成本。',
      '零成本不等于真实零成本，可能代表承运应付或附加费用尚未录入和审核。',
      '本次诊断不会自动修改金额、费用审核状态、对账单或结算状态。'
    ],
    metrics: {
      totalWaybills: rows.length,
      finalizedWaybills: finalizedRows.length,
      receivableAmount: round(receivableAmount),
      totalCostAmount: round(totalCostAmount),
      bookGrossProfit: round(bookGrossProfit),
      bookGrossMargin: bookGrossMargin === null ? null : round(bookGrossMargin),
      costCoverage,
      finalizedCostCoverage,
      missingCostCount: missingCostRows.length,
      negativeMarginCount: negativeRows.length,
      carrierPayableMissingCount: carrierPayableMissingRows.length
    }
  }
}

