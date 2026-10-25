export type InvoiceComplianceSignalType =
  | 'amount_formula_mismatch'
  | 'counterparty_mismatch'
  | 'duplicate_invoice_number'
  | 'future_issue_date'
  | 'incomplete_statement_coverage'
  | 'missing_attachment'
  | 'missing_invoice_identity'
  | 'missing_tax_identity'
  | 'statement_amount_mismatch'
  | 'tax_calculation_mismatch'

export type InvoiceComplianceSeverity = 'critical' | 'high' | 'medium'
export type InvoiceComplianceRiskLevel = InvoiceComplianceSeverity | 'low'
export type InvoiceComplianceRecommendation =
  'block_for_verification' | 'manual_review' | 'routine_review'

export interface InvoiceComplianceSignal {
  type: InvoiceComplianceSignalType
  severity: InvoiceComplianceSeverity
  title: string
  detail: string
  evidence: string[]
}

export interface InvoiceComplianceAssessment {
  invoiceId: string
  invoiceRecordNo: string
  invoiceNo: string
  counterpartyName: string
  direction: string
  riskLevel: InvoiceComplianceRiskLevel
  riskScore: number
  confidence: number
  recommendation: InvoiceComplianceRecommendation
  summary: string
  signals: InvoiceComplianceSignal[]
  recommendedActions: string[]
  limitations: string[]
  metrics: {
    totalAmount: number
    calculatedTotalAmount: number
    linkedAmount: number
    unlinkedAmount: number
    statementCount: number
    duplicateCount: number
    attachmentCount: number
    coverageRate: number
    taxRate: number
  }
}

export interface InvoiceComplianceInput {
  invoice: Record<string, unknown>
  statementLinks?: Array<Record<string, unknown>>
  duplicateInvoices?: Array<Record<string, unknown>>
}

interface AuditOptions {
  now?: Date
}

const severityWeight: Record<InvoiceComplianceSeverity, number> = {
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

function money(value: number): string {
  return `¥${roundMoney(value).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
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

function normalizeName(value: unknown): string {
  return text(value)
    .toLowerCase()
    .replace(/[\s（）()·.,，。\-_/]/g, '')
}

function signalScore(signal: InvoiceComplianceSignal): number {
  const scores: Record<InvoiceComplianceSignalType, number> = {
    duplicate_invoice_number: 98,
    amount_formula_mismatch: 92,
    statement_amount_mismatch: 88,
    tax_calculation_mismatch: 80,
    counterparty_mismatch: 76,
    future_issue_date: 74,
    missing_invoice_identity: 70,
    missing_tax_identity: 62,
    missing_attachment: 58,
    incomplete_statement_coverage: 52
  }
  return scores[signal.type]
}

function getRiskLevel(signals: InvoiceComplianceSignal[]): InvoiceComplianceRiskLevel {
  if (!signals.length) return 'low'
  return [...signals].sort(
    (left, right) => severityWeight[right.severity] - severityWeight[left.severity]
  )[0].severity
}

export function assessInvoiceCompliance(
  input: InvoiceComplianceInput,
  options: AuditOptions = {}
): InvoiceComplianceAssessment {
  const { invoice, statementLinks = [], duplicateInvoices = [] } = input
  const now = options.now ?? new Date()
  const invoiceId = text(field(invoice, 'id', 'id'))
  const invoiceRecordNo =
    text(field(invoice, 'invoice_record_no', 'invoiceRecordNo')) || '未编号登记单'
  const invoiceNo = text(field(invoice, 'invoice_no', 'invoiceNo'))
  const invoiceCode = text(field(invoice, 'invoice_code', 'invoiceCode'))
  const counterpartyName =
    text(field(invoice, 'counterparty_name_snapshot', 'counterpartyNameSnapshot')) ||
    '往来单位未设置'
  const direction = text(field(invoice, 'direction', 'direction'))
  const status = text(field(invoice, 'status', 'status'))
  const issueDate = text(field(invoice, 'issue_date', 'issueDate'))
  const invoiceTitle = text(field(invoice, 'invoice_title', 'invoiceTitle'))
  const taxNumber = text(field(invoice, 'tax_number', 'taxNumber'))
  const amountExcludingTax = roundMoney(
    numberValue(field(invoice, 'amount_excluding_tax', 'amountExcludingTax'))
  )
  const taxAmount = roundMoney(numberValue(field(invoice, 'tax_amount', 'taxAmount')))
  const totalAmount = roundMoney(numberValue(field(invoice, 'total_amount', 'totalAmount')))
  const taxRate = numberValue(field(invoice, 'tax_rate', 'taxRate'))
  const calculatedTotalAmount = roundMoney(amountExcludingTax + taxAmount)
  const attachments = attachmentCount(field(invoice, 'attachments', 'attachments'))
  const linkTotal = roundMoney(
    statementLinks.reduce(
      (sum, item) => sum + numberValue(field(item, 'linked_amount', 'linkedAmount')),
      0
    )
  )
  // The secure RPC returns raw invoice columns; association totals are derived from its links.
  const linkedAmountValue = field(invoice, 'linked_amount', 'linkedAmount')
  const unlinkedAmountValue = field(invoice, 'unlinked_amount', 'unlinkedAmount')
  const linkedAmount =
    linkedAmountValue == null ? linkTotal : roundMoney(numberValue(linkedAmountValue))
  const unlinkedAmount =
    unlinkedAmountValue == null
      ? roundMoney(totalAmount - linkedAmount)
      : roundMoney(numberValue(unlinkedAmountValue))
  const coverageRate = totalAmount > 0 ? clamp(linkedAmount / totalAmount, 0, 1) : 0
  const duplicateCount = duplicateInvoices.filter(
    (item) =>
      text(field(item, 'id', 'id')) !== invoiceId &&
      text(field(item, 'status', 'status')) !== 'voided'
  ).length
  const signals: InvoiceComplianceSignal[] = []
  const actions: string[] = []

  if (duplicateCount > 0 && invoiceNo) {
    signals.push({
      type: 'duplicate_invoice_number',
      severity: 'critical',
      title: '发票号码疑似重复登记',
      detail: `系统内发现 ${duplicateCount} 张未作废发票使用相同发票号码，存在重复入账风险。`,
      evidence: [
        `发票号码：${invoiceNo}`,
        `发票代码：${invoiceCode || '未填写'}`,
        `重复记录：${duplicateCount} 张`
      ]
    })
    actions.push('暂停审核通过，按发票代码、号码、金额和原始票面核对是否重复登记。')
  }

  if (Math.abs(calculatedTotalAmount - totalAmount) > 0.01) {
    signals.push({
      type: 'amount_formula_mismatch',
      severity: 'high',
      title: '价税合计计算不一致',
      detail: '不含税金额与税额之和不等于登记的价税合计。',
      evidence: [
        `不含税金额：${money(amountExcludingTax)}`,
        `税额：${money(taxAmount)}`,
        `登记合计：${money(totalAmount)}`,
        `计算合计：${money(calculatedTotalAmount)}`
      ]
    })
    actions.push('对照原始发票票面修正不含税金额、税额或价税合计。')
  }

  const expectedTaxAmount = roundMoney((amountExcludingTax * taxRate) / 100)
  const taxTolerance = Math.max(0.02, amountExcludingTax * 0.0001)
  if (taxRate > 0 && Math.abs(expectedTaxAmount - taxAmount) > taxTolerance) {
    signals.push({
      type: 'tax_calculation_mismatch',
      severity: 'high',
      title: '税率与税额不匹配',
      detail: '按登记税率计算的税额与当前税额差异超过容差，需要核对含税口径或税率。',
      evidence: [
        `登记税率：${taxRate}%`,
        `登记税额：${money(taxAmount)}`,
        `计算税额：${money(expectedTaxAmount)}`
      ]
    })
    actions.push('确认税率是否以百分数登记，并核对票面税额及舍入差异。')
  }

  if (
    linkedAmount < -0.01 ||
    unlinkedAmount < -0.01 ||
    Math.abs(linkTotal - linkedAmount) > 0.01 ||
    Math.abs(totalAmount - linkedAmount - unlinkedAmount) > 0.01
  ) {
    signals.push({
      type: 'statement_amount_mismatch',
      severity: 'high',
      title: '发票与对账关联金额不一致',
      detail: '关联明细合计、发票已关联金额或未关联金额之间存在不平衡。',
      evidence: [
        `关联明细合计：${money(linkTotal)}`,
        `发票已关联：${money(linkedAmount)}`,
        `发票未关联：${money(unlinkedAmount)}`,
        `价税合计：${money(totalAmount)}`
      ]
    })
    actions.push('逐条复核关联对账单金额，确保已关联与未关联金额合计等于发票金额。')
  }

  const linkCounterparties = [
    ...new Set(
      statementLinks
        .map((item) => text(field(item, 'counterparty_name', 'counterpartyName')))
        .filter(Boolean)
    )
  ]
  if (
    linkCounterparties.some(
      (name) => normalizeName(name) && normalizeName(name) !== normalizeName(counterpartyName)
    )
  ) {
    signals.push({
      type: 'counterparty_mismatch',
      severity: 'high',
      title: '往来单位与对账单不一致',
      detail: '发票登记的往来单位与已关联对账单中的往来单位不完全一致。',
      evidence: [
        `发票往来单位：${counterpartyName}`,
        `对账单单位：${linkCounterparties.join('、')}`
      ]
    })
    actions.push('核对发票购销双方、系统往来单位和对账单主体，避免跨主体关联。')
  }

  const issueTime = Date.parse(issueDate)
  if (Number.isFinite(issueTime) && issueTime > now.getTime() + 86_400_000) {
    signals.push({
      type: 'future_issue_date',
      severity: 'high',
      title: '开票日期晚于当前日期',
      detail: '登记的开票日期位于未来，可能存在录入错误。',
      evidence: [`开票日期：${issueDate}`, `研判日期：${now.toISOString().slice(0, 10)}`]
    })
    actions.push('对照票面核对开票日期后再继续审核。')
  }

  if (!invoiceNo && ['pending_review', 'issued', 'certified'].includes(status)) {
    signals.push({
      type: 'missing_invoice_identity',
      severity: 'high',
      title: '发票号码缺失',
      detail: '当前发票已进入复核或生效状态，但尚未登记可追溯的发票号码。',
      evidence: [`登记单号：${invoiceRecordNo}`, `当前状态：${status}`]
    })
    actions.push('补充票面发票号码；如有发票代码，也应一并登记。')
  }

  if (!invoiceTitle || !taxNumber) {
    signals.push({
      type: 'missing_tax_identity',
      severity: 'medium',
      title: '税务主体信息不完整',
      detail: '发票抬头或纳税人识别号缺失，无法完整核验开票主体。',
      evidence: [`发票抬头：${invoiceTitle || '未填写'}`, `纳税人识别号：${taxNumber || '未填写'}`]
    })
    actions.push('补齐发票抬头和纳税人识别号，并与客户或承运商档案核对。')
  }

  if (attachments === 0 && ['pending_review', 'issued', 'certified'].includes(status)) {
    signals.push({
      type: 'missing_attachment',
      severity: 'medium',
      title: '缺少原始发票附件',
      detail: '当前记录没有可供复核的票面图片或电子发票文件。',
      evidence: [`附件数量：0`, `价税合计：${money(totalAmount)}`]
    })
    actions.push('上传清晰完整的发票票面或电子发票原文件，保留审计依据。')
  }

  if (totalAmount > 0 && unlinkedAmount > 0.01) {
    const uncoveredRate = unlinkedAmount / totalAmount
    signals.push({
      type: 'incomplete_statement_coverage',
      severity: uncoveredRate >= 0.5 ? 'high' : 'medium',
      title: '发票尚未完整关联对账单',
      detail: '仍有部分发票金额未关联到对账单，入账与结算依据不完整。',
      evidence: [
        `未关联金额：${money(unlinkedAmount)}`,
        `已关联金额：${money(linkedAmount)}`,
        `覆盖率：${Math.round(coverageRate * 1000) / 10}%`
      ]
    })
    actions.push('确认未关联部分的业务归属，补充对账关联或说明差异原因。')
  }

  signals.sort(
    (left, right) =>
      severityWeight[right.severity] - severityWeight[left.severity] ||
      signalScore(right) - signalScore(left)
  )
  const riskLevel = getRiskLevel(signals)
  const riskScore = signals.length
    ? clamp(Math.max(...signals.map(signalScore)) + Math.min(8, (signals.length - 1) * 2), 1, 99)
    : 8
  const completenessChecks = [
    invoiceNo,
    invoiceTitle,
    taxNumber,
    issueDate,
    totalAmount > 0,
    attachments > 0
  ]
  const confidence = clamp(
    Math.round(
      (0.55 +
        completenessChecks.filter(Boolean).length * 0.055 +
        Math.min(0.12, statementLinks.length * 0.03)) *
        100
    ) / 100,
    0.55,
    0.98
  )
  const recommendation: InvoiceComplianceRecommendation = signals.some(
    (item) =>
      item.severity === 'critical' ||
      item.type === 'amount_formula_mismatch' ||
      item.type === 'statement_amount_mismatch'
  )
    ? 'block_for_verification'
    : signals.some((item) => item.severity === 'high')
      ? 'manual_review'
      : 'routine_review'
  const uniqueActions = [...new Set(actions)]
  if (!uniqueActions.length) {
    uniqueActions.push('按现有财务制度核对原始票面、开票主体和对账关联后，由审核人作出最终决定。')
  }

  return {
    invoiceId,
    invoiceRecordNo,
    invoiceNo,
    counterpartyName,
    direction,
    riskLevel,
    riskScore,
    confidence,
    recommendation,
    summary: signals.length
      ? `${invoiceRecordNo} 识别到 ${signals.length} 项发票复核风险，最高等级为${riskLevel === 'critical' ? '严重' : riskLevel === 'high' ? '高' : '中'}风险。`
      : `${invoiceRecordNo} 暂未识别到明确数据异常，可进入常规人工复核。`,
    signals,
    recommendedActions: uniqueActions,
    limitations: [
      '本次研判基于系统登记字段、对账关联和同租户重复记录，不替代税务平台查验。',
      '附件只检查是否存在，未读取或识别附件票面内容。',
      'AI 审核不会自动修改发票、对账关联或审核状态。'
    ],
    metrics: {
      totalAmount,
      calculatedTotalAmount,
      linkedAmount,
      unlinkedAmount,
      statementCount: statementLinks.length,
      duplicateCount,
      attachmentCount: attachments,
      coverageRate,
      taxRate
    }
  }
}

