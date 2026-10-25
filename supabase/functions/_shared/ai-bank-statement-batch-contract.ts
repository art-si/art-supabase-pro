import {
  matchAiCashVoucherStatements,
  type AiCashVoucherDirection,
  type AiCashVoucherStatementCandidate
} from './ai-cash-voucher-ocr-contract.ts'

export type AiBankBatchColumn =
  | 'transactionDate'
  | 'amount'
  | 'receiptAmount'
  | 'paymentAmount'
  | 'direction'
  | 'bankReference'
  | 'counterpartyName'
  | 'payerName'
  | 'payeeName'
  | 'paymentMethod'
  | 'remark'

export interface AiBankCounterparty {
  id: string
  name: string
  direction: AiCashVoucherDirection
}

export interface AiBankBatchContext {
  mapping: Partial<Record<AiBankBatchColumn, string>>
  counterparties: AiBankCounterparty[]
  statementCandidates: AiCashVoucherStatementCandidate[]
  existingReferences: Set<string>
}

const aliases: Record<AiBankBatchColumn, string[]> = {
  transactionDate: ['交易日期', '交易时间', '记账日期', '发生日期', '日期', 'transactiondate', 'date'],
  amount: ['交易金额', '发生金额', '金额', 'amount'],
  receiptAmount: ['收入金额', '贷方金额', '收款金额', '入账金额', 'credit'],
  paymentAmount: ['支出金额', '借方金额', '付款金额', '出账金额', 'debit'],
  direction: ['收支方向', '交易方向', '借贷标志', '方向', 'direction'],
  bankReference: ['银行流水号', '交易流水号', '交易单号', '回单号', '参考号', '流水号', 'reference'],
  counterpartyName: ['对方户名', '对方名称', '往来单位', '交易对手', 'counterparty'],
  payerName: ['付款方', '付款人', '付款户名', 'payer'],
  payeeName: ['收款方', '收款人', '收款户名', 'payee'],
  paymentMethod: ['支付方式', '交易渠道', '付款方式', 'paymentmethod'],
  remark: ['摘要', '备注', '用途', '附言', 'remark']
}

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s_\-（）()]/g, '')
}

function text(value: unknown): string | null {
  const result = String(value ?? '').trim()
  return result || null
}

function numberValue(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const normalized = String(value).replace(/[￥¥,，\s]/g, '').replace(/^\((.+)\)$/, '-$1')
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : null
}

function dateValue(value: unknown): string | null {
  if (typeof value === 'number' && value > 1) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  const source = text(value)
  if (!source) return null
  const normalized = source.replace(/[年/.]/g, '-').replace(/月/g, '-').replace(/日/g, '')
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

function directionValue(value: unknown): AiCashVoucherDirection | null {
  const source = normalizedText(value)
  if (/^(receipt|收入|收款|贷|贷方|入账)$/.test(source)) return 'receipt'
  if (/^(payment|支出|付款|借|借方|出账)$/.test(source)) return 'payment'
  return null
}

function paymentMethodValue(value: unknown): string {
  const source = normalizedText(value)
  if (/微信/.test(source)) return 'wechat'
  if (/支付宝/.test(source)) return 'alipay'
  if (/现金/.test(source)) return 'cash'
  if (/银行|转账|网银|柜台/.test(source)) return 'bank_transfer'
  return 'bank_transfer'
}

export function inferAiBankBatchMapping(headers: string[]): Partial<Record<AiBankBatchColumn, string>> {
  const mapping: Partial<Record<AiBankBatchColumn, string>> = {}
  for (const [field, values] of Object.entries(aliases) as [AiBankBatchColumn, string[]][]) {
    const match = headers.find((header) => values.includes(normalizedText(header)))
    if (match) mapping[field] = match
  }
  return mapping
}

function valueAt(row: Record<string, unknown>, mapping: Partial<Record<AiBankBatchColumn, string>>, field: AiBankBatchColumn) {
  const header = mapping[field]
  return header ? row[header] : undefined
}

function matchCounterparty(name: string | null, direction: AiCashVoucherDirection, rows: AiBankCounterparty[]) {
  const source = normalizedText(name)
  if (!source) return null
  return rows
    .filter((item) => item.direction === direction)
    .map((item) => {
      const candidate = normalizedText(item.name)
      const score = source === candidate ? 100 : source.includes(candidate) || candidate.includes(source) ? 82 : 0
      return { ...item, score }
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score)[0] ?? null
}

export function normalizeAiBankBatchRows(rows: Record<string, unknown>[], context: AiBankBatchContext) {
  return rows.map((source, index) => {
    const receiptAmount = numberValue(valueAt(source, context.mapping, 'receiptAmount'))
    const paymentAmount = numberValue(valueAt(source, context.mapping, 'paymentAmount'))
    const explicitAmount = numberValue(valueAt(source, context.mapping, 'amount'))
    const explicitDirection = directionValue(valueAt(source, context.mapping, 'direction'))
    const direction: AiCashVoucherDirection | null = explicitDirection ??
      (receiptAmount && receiptAmount > 0 ? 'receipt' : paymentAmount && paymentAmount > 0 ? 'payment' : null)
    const amount = Math.abs(explicitAmount ?? (direction === 'receipt' ? receiptAmount : paymentAmount) ?? 0)
    const payerName = text(valueAt(source, context.mapping, 'payerName'))
    const payeeName = text(valueAt(source, context.mapping, 'payeeName'))
    const counterpartyName = text(valueAt(source, context.mapping, 'counterpartyName')) ??
      (direction === 'receipt' ? payerName : payeeName)
    const transactionDate = dateValue(valueAt(source, context.mapping, 'transactionDate'))
    const bankReference = text(valueAt(source, context.mapping, 'bankReference'))
    const counterparty = direction ? matchCounterparty(counterpartyName, direction, context.counterparties) : null
    const matches = direction ? matchAiCashVoucherStatements({
      payerName: direction === 'receipt' ? counterpartyName : null,
      payeeName: direction === 'payment' ? counterpartyName : null,
      transactionDate,
      amount: amount || null,
      bankReference,
      paymentMethod: 'bank_transfer'
    }, direction, context.statementCandidates.filter((item) => item.counterpartyId === counterparty?.id)) : []
    const bestMatch = matches[0]
    const issues: string[] = []
    if (!direction) issues.push('无法判断收支方向')
    if (!transactionDate) issues.push('交易日期无效')
    if (!amount) issues.push('交易金额无效')
    if (!counterpartyName) issues.push('缺少往来单位')
    if (counterpartyName && !counterparty) issues.push('未匹配到系统往来单位')
    if (bankReference && context.existingReferences.has(`${direction}:${bankReference}`)) issues.push('银行流水号已入账')
    const invalid = !direction || !transactionDate || !amount
    const duplicate = issues.includes('银行流水号已入账')
    const ready = !invalid && !duplicate && Boolean(counterparty && counterparty.score >= 82)
    return {
      rowId: `row-${index + 1}`,
      sourceRow: index + 2,
      status: duplicate ? 'duplicate' : invalid ? 'invalid' : ready ? 'ready' : 'review',
      direction,
      transactionDate,
      amount,
      bankReference,
      counterpartyName,
      counterpartyId: counterparty?.id ?? null,
      counterpartyScore: counterparty?.score ?? 0,
      paymentMethod: paymentMethodValue(valueAt(source, context.mapping, 'paymentMethod')),
      remark: text(valueAt(source, context.mapping, 'remark')),
      statementMatches: matches,
      allocations: bestMatch && bestMatch.score >= 65
        ? [{ statementId: bestMatch.statementId, allocationAmount: bestMatch.recommendedAllocation }]
        : [],
      issues
    }
  })
}

