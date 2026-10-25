export type RecognitionFeature = Api.IntelligentRecognition.Feature

export interface RecognitionCapability {
  feature: RecognitionFeature
  title: string
  description: string
  icon: string
  businessLabel: string
  businessRoute: string
  actionLabel: string
}

export const recognitionCapabilities: RecognitionCapability[] = [
  {
    feature: 'invoice_ocr',
    title: '发票识别',
    description: '提取票号、购销双方、税额与价税合计，标注低置信字段。',
    icon: 'ri:bill-line',
    businessLabel: '发票管理',
    businessRoute: financePaths.invoiceManagement,
    actionLabel: '开始识别'
  },
  {
    feature: 'waybill_receipt_ocr',
    title: '运输回单识别',
    description: '结合运单上下文识别签收时间、收货人和异常数量。',
    icon: 'ri:file-list-3-line',
    businessLabel: '配送管理',
    businessRoute: '/tms/delivery-management',
    actionLabel: '进入业务'
  },
  {
    feature: 'cash_voucher_ocr',
    title: '收付款凭证',
    description: '识别交易要素，并基于往来单位、金额和账期推荐对账单。',
    icon: 'ri:bank-card-line',
    businessLabel: '收付款管理',
    businessRoute: financePaths.cashTransaction,
    actionLabel: '开始识别'
  },
  {
    feature: 'waybill_expense_ocr',
    title: '运单费用票据识别',
    description: '识别能源、路桥、装卸及其他费用票据，并回填绑定运单的费用草稿。',
    icon: 'ri:gas-station-line',
    businessLabel: '运单费用',
    businessRoute: financePaths.waybillCost,
    actionLabel: '进入业务'
  }
]

export const featureLabels: Record<RecognitionFeature, string> = {
  invoice_ocr: '发票识别',
  waybill_receipt_ocr: '回单识别',
  cash_voucher_ocr: '收付款凭证',
  waybill_expense_ocr: '运单费用票据'
}

export const artifactStatusLabels: Record<Api.IntelligentRecognition.ArtifactStatus, string> = {
  pending: '待业务复核',
  applied: '已应用',
  rejected: '已驳回',
  superseded: '已失效'
}

export const fieldLabels: Record<string, string> = {
  invoiceNo: '发票号码',
  invoiceCode: '发票代码',
  invoiceType: '发票类型',
  issueDate: '开票日期',
  buyerName: '购买方',
  buyerTaxNumber: '购买方税号',
  sellerName: '销售方',
  sellerTaxNumber: '销售方税号',
  invoiceTitle: '发票抬头',
  taxNumber: '纳税人识别号',
  amountExcludingTax: '不含税金额',
  taxAmount: '税额',
  totalAmount: '价税合计',
  taxRate: '税率',
  orderNo: '运单号',
  signedAt: '签收时间',
  receiverName: '收货人',
  receivedQuantity: '实收数量',
  damagedQuantity: '破损数量',
  shortageQuantity: '短少数量',
  payerName: '付款方',
  payeeName: '收款方',
  transactionDate: '交易日期',
  amount: '交易金额',
  bankReference: '银行流水号',
  paymentMethod: '支付方式',
  summary: '摘要',
  remark: '备注',
  expenseType: '费用场景',
  occurredAt: '发生时间',
  providerName: '服务商',
  plateNo: '车牌号',
  driverName: '司机',
  quantity: '数量',
  unitPrice: '单价'
}

export function getCapability(feature: RecognitionFeature): RecognitionCapability {
  return (
    recognitionCapabilities.find((item) => item.feature === feature) ?? recognitionCapabilities[0]
  )
}

export function getPayloadRecord(
  payload?: Record<string, unknown> | null
): Record<string, unknown> {
  if (!payload) return {}
  for (const key of ['invoice', 'voucher', 'receipt', 'waybill']) {
    const value = payload[key]
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
  }
  return payload
}

export function getArtifactPayload(
  artifact: Api.IntelligentRecognition.RecognitionArtifact
): Record<string, unknown> {
  const finalPayload = artifact.finalPayload
  return finalPayload && Object.keys(finalPayload).length ? finalPayload : artifact.proposedPayload
}

export function getArtifactTitle(artifact: Api.IntelligentRecognition.RecognitionArtifact): string {
  const payload = getPayloadRecord(getArtifactPayload(artifact))
  const title =
    payload.invoiceNo || payload.orderNo || payload.bankReference || payload.transactionNo
  return typeof title === 'string' && title ? title : `识别任务 ${artifact.id.slice(0, 8)}`
}

export function getArtifactImageUrls(
  artifact: Api.IntelligentRecognition.RecognitionArtifact
): string[] {
  const urls = artifact.metadata?.imageUrls
  if (!Array.isArray(urls)) return []

  return urls
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url.trim()))
    .map((url) => url.trim())
    .slice(0, 5)
}

export function confidencePercent(value?: number | null): number {
  return Math.round((value ?? 0) * 100)
}

export type RecognitionRiskLevel = 'high' | 'medium' | 'normal'

export function getRecognitionRiskLevel(
  artifact: Api.IntelligentRecognition.RecognitionArtifact
): RecognitionRiskLevel {
  const score = confidencePercent(artifact.confidence)
  if (score < 65 || (artifact.warnings?.length ?? 0) >= 2) return 'high'
  if (score < 85 || artifact.warnings?.length) return 'medium'
  return 'normal'
}
import { financePaths } from '@/router/business-paths'
