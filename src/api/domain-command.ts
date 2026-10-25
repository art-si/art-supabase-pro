import dayjs from 'dayjs'
import { clamp, countBy } from 'lodash-es'
import { formatArtValue, type ArtValueFormatOptions } from '@/utils/ui/format'
import { loadAllDocumentPages } from '@/utils/business/document-detail-list'
import { fetchAiOperationsOverview } from '@/api/ai-operations'
import { fetchEnterpriseDashboardData } from '@/api/enterprise-dashboard'
import {
  fetchWorkflowBottleneckAnalytics,
  fetchWorkflowCallbackOutbox,
  fetchWorkflowOperationalAnalytics
} from '@/api/workflow'
import { fetchCashForecastOverview } from '@fms/api/modules/treasury/cash-forecast'
import { fetchFinancialExceptionOverview } from '@fms/api/modules/financial-exception'
import { fetchReceivableAgingOverview } from '@fms/api/modules/transport/receivable-aging'
import { fetchPeopleAnalyticsOverview } from '@hr/api/modules/people-analytics'
import { fetchWorkforceRiskOverview } from '@hr/api/modules/workforce-risk'
import { mdmDomainDefinitions } from '@mdm/api/modules/catalog'
import { fetchMdmGovernanceOverview, fetchMdmQualityIssues } from '@mdm/api/modules/governance'
import { fetchRiskInspectionTaskList, fetchSafetyRiskList } from '@smis/api/modules/risk-control'
import { fetchRiskMapPoints } from '@smis/api/modules/risk-four-color-map'
import { fetchFleetHealthWorkspace } from '@vms/api/providers/supabase/vehicle/fleet-health'
import { useSupabase } from '@/hooks/core/useSupabase'

const { supabase, responseHandle } = useSupabase()

export type DomainCommandKind =
  | 'ai-safety'
  | 'safety-production'
  | 'financial-risk'
  | 'workflow-efficiency'
  | 'fleet-compliance'
  | 'data-governance'
  | 'workforce-insight'

export type DomainCommandTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'
export type DomainCommandLayout =
  'sentinel' | 'field' | 'treasury' | 'flow' | 'fleet' | 'topology' | 'people'
export type DomainCommandChartVariant =
  'bar' | 'horizontal-bar' | 'rose' | 'donut' | 'radar' | 'treemap' | 'graph' | 'lollipop'
export type DomainCommandTrendVariant = 'area' | 'line' | 'bar' | 'step'

export interface DomainCommandMetric {
  label: string
  value: string | number
  unit?: string
  hint: string
  icon: string
  tone: DomainCommandTone
}

export interface DomainCommandNode {
  label: string
  score: number
  caption: string
  icon: string
  tone: DomainCommandTone
}

export interface DomainCommandChartItem {
  label: string
  value: number
  caption?: string
  tone?: DomainCommandTone
}

export interface DomainCommandTrendPoint {
  label: string
  primary: number
  secondary?: number
}

export interface DomainCommandAlert {
  id: string
  title: string
  detail: string
  value: string | number
  tone: DomainCommandTone
}

export interface DomainCommandData {
  generatedAt: string
  score: number
  headline: string
  description: string
  activeCount: number
  riskCount: number
  metrics: DomainCommandMetric[]
  nodes: DomainCommandNode[]
  distribution: DomainCommandChartItem[]
  stages: DomainCommandChartItem[]
  trend: DomainCommandTrendPoint[]
  alerts: DomainCommandAlert[]
}

export interface DomainCommandDefinition {
  kind: DomainCommandKind
  title: string
  shortTitle: string
  description: string
  path: string
  icon: string
  accent: string
  scoreLabel: string
  activeLabel: string
  activeUnit: string
  distributionTitle: string
  stageTitle: string
  trendTitle: string
  alertTitle: string
  layout: DomainCommandLayout
  sceneVariant: DomainCommandLayout
  distributionChart: DomainCommandChartVariant
  stageChart: DomainCommandChartVariant
  trendChart: DomainCommandTrendVariant
  trendPrimaryLabel: string
  trendSecondaryLabel: string
}

interface AiSecurityEvent {
  id: string
  eventType: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  decision: 'observed' | 'blocked' | 'allowed'
  status: 'open' | 'investigating' | 'blocked' | 'resolved' | 'false_positive'
  title: string
  detail?: string | null
  detectedAt: string
}

export const domainCommandDefinitions: Record<DomainCommandKind, DomainCommandDefinition> = {
  'ai-safety': {
    kind: 'ai-safety',
    title: 'AI 安全与可信运行大屏',
    shortTitle: 'AI 安全',
    description: '监测模型运行、工具调用、人工反馈与智能识别质量，形成可信 AI 处置闭环。',
    path: '/dashboard/ai-safety-command',
    icon: 'ri:shield-keyhole-line',
    accent: '#7c6cff',
    scoreLabel: '可信运行指数',
    activeLabel: '本期运行',
    activeUnit: '次',
    distributionTitle: 'AI 能力调用分布',
    stageTitle: '结果审核闭环',
    trendTitle: '运行与异常趋势',
    alertTitle: '安全与质量事件',
    layout: 'sentinel',
    sceneVariant: 'sentinel',
    distributionChart: 'horizontal-bar',
    stageChart: 'donut',
    trendChart: 'step',
    trendPrimaryLabel: 'AI 运行',
    trendSecondaryLabel: '安全事件'
  },
  'safety-production': {
    kind: 'safety-production',
    title: '安全生产风险大屏',
    shortTitle: '安全生产',
    description: '统一呈现风险辨识、管控、巡检与隐患处置态势。',
    path: '/dashboard/safety-production-command',
    icon: 'ri:shield-flash-line',
    accent: '#ff8d5b',
    scoreLabel: '安全管控指数',
    activeLabel: '风险点',
    activeUnit: '处',
    distributionTitle: '四色风险结构',
    stageTitle: '风险巡检闭环',
    trendTitle: '风险治理态势',
    alertTitle: '重点风险事项',
    layout: 'field',
    sceneVariant: 'field',
    distributionChart: 'horizontal-bar',
    stageChart: 'horizontal-bar',
    trendChart: 'bar',
    trendPrimaryLabel: '业务总量',
    trendSecondaryLabel: '高风险'
  },
  'financial-risk': {
    kind: 'financial-risk',
    title: '财务资金风控大屏',
    shortTitle: '资金风控',
    description: '联动资金预测、应收账龄、银行对账与月结异常。',
    path: '/dashboard/financial-risk-command',
    icon: 'ri:funds-box-line',
    accent: '#31d6a6',
    scoreLabel: '资金安全指数',
    activeLabel: '风险事项',
    activeUnit: '项',
    distributionTitle: '应收账龄结构',
    stageTitle: '资金预测窗口',
    trendTitle: '资金压力走势',
    alertTitle: '财务阻塞事项',
    layout: 'treasury',
    sceneVariant: 'treasury',
    distributionChart: 'horizontal-bar',
    stageChart: 'lollipop',
    trendChart: 'area',
    trendPrimaryLabel: '预计流入',
    trendSecondaryLabel: '预计流出'
  },
  'workflow-efficiency': {
    kind: 'workflow-efficiency',
    title: '流程运营与审批效能大屏',
    shortTitle: '流程效能',
    description: '监控审批吞吐、SLA、瓶颈节点与业务回调健康度。',
    path: '/dashboard/workflow-efficiency-command',
    icon: 'ri:flow-chart',
    accent: '#48b8ff',
    scoreLabel: '流程效能指数',
    activeLabel: '运行流程',
    activeUnit: '条',
    distributionTitle: '业务类型负荷',
    stageTitle: '审批结果分布',
    trendTitle: '流程吞吐趋势',
    alertTitle: '瓶颈与回调异常',
    layout: 'flow',
    sceneVariant: 'flow',
    distributionChart: 'horizontal-bar',
    stageChart: 'horizontal-bar',
    trendChart: 'step',
    trendPrimaryLabel: '发起流程',
    trendSecondaryLabel: '驳回流程'
  },
  'fleet-compliance': {
    kind: 'fleet-compliance',
    title: '车队安全与合规大屏',
    shortTitle: '车队合规',
    description: '聚合车辆健康、证照到期、事故与维修工单风险。',
    path: '/dashboard/fleet-compliance-command',
    icon: 'ri:truck-line',
    accent: '#28d5c4',
    scoreLabel: '车队健康指数',
    activeLabel: '在册车辆',
    activeUnit: '台',
    distributionTitle: '车辆风险等级',
    stageTitle: '车辆健康分层',
    trendTitle: '风险车辆态势',
    alertTitle: '高风险车辆',
    layout: 'fleet',
    sceneVariant: 'fleet',
    distributionChart: 'horizontal-bar',
    stageChart: 'horizontal-bar',
    trendChart: 'bar',
    trendPrimaryLabel: '健康得分',
    trendSecondaryLabel: '风险得分'
  },
  'data-governance': {
    kind: 'data-governance',
    title: '主数据治理与质量大屏',
    shortTitle: '数据治理',
    description: '监控数据质量、变更审核、黄金记录与下游分发链路。',
    path: '/dashboard/data-governance-command',
    icon: 'ri:database-2-line',
    accent: '#6d8cff',
    scoreLabel: '数据可信指数',
    activeLabel: '治理规则',
    activeUnit: '条',
    distributionTitle: '治理问题结构',
    stageTitle: '治理处置队列',
    trendTitle: '数据质量态势',
    alertTitle: '质量与分发异常',
    layout: 'topology',
    sceneVariant: 'topology',
    distributionChart: 'horizontal-bar',
    stageChart: 'horizontal-bar',
    trendChart: 'bar',
    trendPrimaryLabel: '治理规模',
    trendSecondaryLabel: '异常数量'
  },
  'workforce-insight': {
    kind: 'workforce-insight',
    title: '人力风险与组织效能大屏',
    shortTitle: '人力效能',
    description: '呈现人员流动、组织分布、编制缺口和用工合规风险。',
    path: '/dashboard/workforce-insight-command',
    icon: 'ri:team-line',
    accent: '#b07cff',
    scoreLabel: '组织健康指数',
    activeLabel: '在岗人员',
    activeUnit: '人',
    distributionTitle: '组织人员分布',
    stageTitle: '人力风险结构',
    trendTitle: '人员流动趋势',
    alertTitle: '用工风险事项',
    layout: 'people',
    sceneVariant: 'people',
    distributionChart: 'horizontal-bar',
    stageChart: 'horizontal-bar',
    trendChart: 'area',
    trendPrimaryLabel: '期末人数',
    trendSecondaryLabel: '离职人数'
  }
}

const clampScore = (value: number) => clamp(Math.round(value), 0, 100)
const rateScore = (risk: number, total: number) =>
  clampScore(total ? 100 - (risk / total) * 100 : 100)
const compactAmountOptions: ArtValueFormatOptions = {
  emptyText: '—',
  numberFormat: { notation: 'compact', maximumFractionDigits: 1 }
}

const financialPressureLabels: Record<Api.Fms.CashForecastOverview['pressureLevel'], string> = {
  healthy: '资金充足',
  attention: '需要关注',
  critical: '资金承压',
  unavailable: '数据待完善'
}

const receivableAgingLabels: Record<Api.Fms.ReceivableAgingBucketKey, string> = {
  current: '账期内',
  days1To30: '逾期 1–30 天',
  days31To60: '逾期 31–60 天',
  days61To90: '逾期 61–90 天',
  daysOver90: '逾期 90 天以上'
}

const aiFeatureLabels: Record<string, string> = {
  ai_assistant: '智能助手',
  sql_assistant: '数据问答',
  project_planner: '项目规划',
  document_ocr: '票据识别',
  invoice_ocr: '发票识别',
  voucher_ocr: '凭证识别',
  expense_ocr: '费用识别',
  waybill_cost_audit: '运单成本审核',
  receivables_collection: '应收催收建议',
  receivables_collection_advisor: '应收催收建议',
  vehicle_health: '车辆健康诊断',
  vehicle_health_advisor: '车辆健康诊断',
  waybill_receipt_ocr: '回单识别',
  waybill_expense_ocr: '运单费用识别',
  cash_voucher_ocr: '资金凭证识别',
  bank_statement_batch_match: '银行流水匹配',
  business_assistant: '业务助手',
  order_extraction: '订单信息提取',
  carrier_performance_advisor: '承运商绩效分析',
  invoice_compliance_audit: '发票合规审核',
  dispatch_recommendation: '智能调度建议',
  project_assistant: '项目助手',
  operations_diagnosis: '运行诊断',
  transport_anomaly_advisor: '运输异常分析',
  waybill_profit_analysis: '运单利润分析'
}

const aiEventTypeLabels: Record<string, string> = {
  unsafe_output: '不安全输出',
  access_denied: '越权访问阻断',
  prompt_injection: '提示词注入',
  sensitive_data: '敏感数据访问',
  tool_failure: '工具调用异常',
  model_failure: '模型运行异常'
}

const workflowBusinessTypeLabels: Record<string, string> = {
  generic: '通用审批',
  tms_waybill_cost: '运单费用',
  tms_expense_reimbursement: '费用报销',
  tms_invoice: '发票审批',
  tms_carrier_payment_application: '承运商付款',
  tms_carrier_statement: '承运商结算',
  tms_customer_statement: '客户结算',
  tms_contract: '运输合同',
  vehicle_archive: '车辆档案',
  smis_tool_return: '工器具归还',
  hr_personnel_change: '人事异动',
  hr_lifecycle_case: '员工生命周期',
  hr_self_service_request: '员工自助申请',
  hr_recruitment_requisition: '招聘需求'
}

const mdmDomainLabelMap = new Map(mdmDomainDefinitions.map((item) => [item.key, item.label]))
const mdmIssueStateLabels: Record<string, string> = {
  open: '待处理',
  in_progress: '整改中',
  pending_verification: '待复核',
  resolved: '已解决',
  waived: '已豁免',
  reopened: '重新打开'
}
const severityLabels: Record<string, string> = {
  low: '低风险',
  medium: '中风险',
  high: '高风险',
  critical: '严重风险'
}

const embeddedCodeLabels: Record<string, string> = {
  in_transit_energy: '运输途中能源费',
  in_transit_charging: '运输途中充电费',
  in_transit_other: '运输途中其他费用',
  loading: '装货环节',
  unloading: '卸货环节',
  pending: '待处理',
  processing: '处理中',
  failed: '失败',
  approved: '已通过',
  rejected: '已驳回'
}

function replaceEmbeddedCodes(value: string): string {
  return Object.entries(embeddedCodeLabels).reduce(
    (result, [code, label]) => result.replaceAll(code, label),
    value
  )
}

function resolveAiFeatureLabel(feature: string): string {
  return aiFeatureLabels[feature] ?? '其他 AI 能力'
}

function resolveAiErrorLabel(code: string): string {
  if (!code) return '未分类运行异常'
  if (/permission|access|forbidden|unauthorized/i.test(code)) return '访问权限异常'
  if (/timeout|timed_out/i.test(code)) return '模型响应超时'
  if (/rate|quota|limit/i.test(code)) return '调用额度受限'
  if (/tool/i.test(code)) return '工具调用异常'
  if (/model|provider/i.test(code)) return '模型服务异常'
  return 'AI 运行异常'
}

function resolveAiEventDetail(event: AiSecurityEvent): string {
  const detail = replaceEmbeddedCodes(event.detail || '')
  const timeout = detail.match(/timed out after\s+(\d+)\s*ms/i)
  if (timeout)
    return `模型服务响应超时 · 约 ${Math.max(1, Math.round(Number(timeout[1]) / 1000))} 秒`
  if (/empty|no content|blank response/i.test(detail)) return '模型未返回有效内容，需要重新运行'
  if (/permission|access denied|forbidden|unauthorized/i.test(detail))
    return '访问权限校验未通过，调用已被阻断'
  if (/prompt injection/i.test(detail)) return '检测到提示词注入特征，调用已进入安全复核'
  if (/sensitive/i.test(detail)) return '检测到敏感数据访问，调用已进入安全复核'
  if (detail && !/[A-Za-z]{4,}/.test(detail)) return detail
  return `${aiEventTypeLabels[event.eventType] ?? 'AI 安全事件'} · ${dayjs(event.detectedAt).format('MM/DD HH:mm')}`
}

function resolveWorkflowCallbackDetail(detail?: string | null): string {
  if (!detail) return '业务回调等待自动重试'
  if (/timeout|timed out/i.test(detail)) return '下游系统响应超时，等待自动重试'
  if (/network|fetch|connection|socket/i.test(detail)) return '下游系统连接异常，等待自动重试'
  if (/permission|forbidden|unauthorized/i.test(detail)) return '下游系统权限校验未通过'
  if (/[A-Za-z]{4,}/.test(detail)) return '下游系统返回技术异常，请检查回调日志'
  return replaceEmbeddedCodes(detail)
}

async function fetchAiSecurityEvents(days: number): Promise<AiSecurityEvent[]> {
  const from = dayjs()
    .subtract(days - 1, 'day')
    .startOf('day')
    .toISOString()
  return loadAllDocumentPages<AiSecurityEvent, { from?: number; to?: number }>(
    ({ from: offset = 0, to = 499 }) =>
      responseHandle<AiSecurityEvent[]>(
        () =>
          supabase
            .from('ai_security_event')
            .select('id,event_type,severity,decision,status,title,detail,detected_at', {
              count: 'exact'
            })
            .gte('detected_at', from)
            .order('detected_at', { ascending: false })
            .order('id')
            .range(offset, to),
        { breakReturn: true, errorMessage: 'AI 安全事件加载失败' }
      ),
    {}
  )
}

async function loadAiSafety(): Promise<DomainCommandData> {
  const [data, securityEvents] = await Promise.all([
    fetchAiOperationsOverview(30),
    fetchAiSecurityEvents(30)
  ])
  const activeSecurityEvents = securityEvents.filter((item) =>
    ['open', 'investigating', 'blocked'].includes(item.status)
  )
  const blockedCount = securityEvents.filter((item) => item.decision === 'blocked').length
  const eventsByDay = countBy(securityEvents, (event) =>
    dayjs(event.detectedAt).format('YYYY-MM-DD')
  )
  const criticalCount = activeSecurityEvents.filter((item) =>
    ['high', 'critical'].includes(item.severity)
  ).length
  const score = clampScore(
    data.successRate * 0.45 +
      data.quality.reviewCompletionRate * 0.25 +
      data.feedbackQuality.resolutionRate * 0.2 +
      Math.max(0, 100 - criticalCount * 12) * 0.1
  )
  const alerts: DomainCommandAlert[] = [
    ...activeSecurityEvents.slice(0, 5).map((item) => ({
      id: item.id,
      title: item.title,
      detail: resolveAiEventDetail(item),
      value: item.decision === 'blocked' ? '已阻断' : '待处置',
      tone: ['high', 'critical'].includes(item.severity)
        ? ('danger' as const)
        : ('warning' as const)
    })),
    ...data.topErrors.slice(0, 4).map((item) => ({
      id: `error-${item.code}`,
      title: resolveAiErrorLabel(item.code),
      detail: 'AI 运行错误聚合',
      value: item.count,
      tone: 'danger' as const
    })),
    ...data.feedbackQuality.feedbackQueue
      .filter((item) => item.status === 'open' || item.status === 'in_progress')
      .slice(0, 4)
      .map((item) => ({
        id: `feedback-${item.feedbackId}`,
        title: item.issueType === 'unsafe' ? '不安全结果待复核' : 'AI 质量反馈待处理',
        detail: `${resolveAiFeatureLabel(item.feature)} · ${item.model}`,
        value: item.status === 'open' ? '待处理' : '处理中',
        tone: item.issueType === 'unsafe' ? ('danger' as const) : ('warning' as const)
      }))
  ]
  return {
    generatedAt: new Date().toISOString(),
    score,
    headline: criticalCount
      ? '存在高风险 AI 安全事件，优先完成复核处置'
      : 'AI 运行处于可信监测状态',
    description: `近 30 天共运行 ${data.totalRuns} 次，识别 ${securityEvents.length} 项安全事件并阻断 ${blockedCount} 项。`,
    activeCount: data.totalRuns,
    riskCount: activeSecurityEvents.length + data.feedbackQuality.openFeedbackIssues,
    metrics: [
      {
        label: 'AI 运行',
        value: data.totalRuns,
        unit: '次',
        hint: '近 30 天',
        icon: 'ri:brain-2-line',
        tone: 'primary'
      },
      {
        label: '运行成功率',
        value: data.successRate,
        unit: '%',
        hint: `${data.failedRuns} 次失败`,
        icon: 'ri:checkbox-circle-line',
        tone: data.successRate >= 95 ? 'success' : 'warning'
      },
      {
        label: '安全事件',
        value: securityEvents.length,
        unit: '项',
        hint: `${criticalCount} 项高风险未闭环`,
        icon: 'ri:shield-keyhole-line',
        tone: criticalCount ? 'danger' : 'success'
      },
      {
        label: '自动阻断',
        value: blockedCount,
        unit: '项',
        hint: '越权、注入与敏感调用',
        icon: 'ri:forbid-2-line',
        tone: blockedCount ? 'warning' : 'success'
      },
      {
        label: '低置信度产物',
        value: data.quality.pendingArtifacts,
        unit: '项',
        hint: `平均置信度 ${data.quality.averageConfidence}%`,
        icon: 'ri:scan-2-line',
        tone: data.quality.pendingArtifacts ? 'warning' : 'success'
      },
      {
        label: '反馈处置率',
        value: data.feedbackQuality.resolutionRate,
        unit: '%',
        hint: `${data.feedbackQuality.openFeedbackIssues} 项未闭环`,
        icon: 'ri:feedback-line',
        tone: data.feedbackQuality.openFeedbackIssues ? 'warning' : 'success'
      }
    ],
    nodes: [
      {
        label: '运行稳定',
        score: clampScore(data.successRate),
        caption: `${data.succeededRuns}/${data.totalRuns} 成功`,
        icon: 'ri:pulse-line',
        tone: 'success'
      },
      {
        label: '结果审核',
        score: clampScore(data.quality.reviewCompletionRate),
        caption: `${data.quality.reviewedArtifacts} 项已审核`,
        icon: 'ri:shield-check-line',
        tone: 'primary'
      },
      {
        label: '人工反馈',
        score: clampScore(data.feedbackQuality.positiveRate),
        caption: `${data.feedbackQuality.totalFeedback} 条反馈`,
        icon: 'ri:message-3-line',
        tone: 'info'
      },
      {
        label: '问题闭环',
        score: clampScore(data.feedbackQuality.resolutionRate),
        caption: `${data.feedbackQuality.closedFeedbackIssues} 项已关闭`,
        icon: 'ri:loop-right-line',
        tone: 'success'
      },
      {
        label: '字段采纳',
        score: clampScore(data.quality.fieldAcceptanceRate),
        caption: `${data.quality.acceptedFields} 个字段采纳`,
        icon: 'ri:checkbox-multiple-line',
        tone: 'primary'
      },
      {
        label: '安全防护',
        score: clampScore(100 - criticalCount * 12),
        caption: `${blockedCount} 项自动阻断`,
        icon: 'ri:alarm-warning-line',
        tone: criticalCount ? 'danger' : 'success'
      }
    ],
    distribution: data.featureBreakdown.slice(0, 6).map((item) => ({
      label: resolveAiFeatureLabel(item.feature),
      value: item.total,
      caption: `${Math.round(item.total ? (item.succeeded / item.total) * 100 : 0)}% 成功`
    })),
    stages: [
      { label: '待审核', value: data.quality.pendingArtifacts, caption: '等待复核' },
      { label: '已审核', value: data.quality.reviewedArtifacts, caption: '完成人审' },
      { label: '已应用', value: data.quality.appliedArtifacts, caption: '写入业务' },
      { label: '已拒绝', value: data.quality.rejectedArtifacts, caption: '未予采纳' }
    ],
    trend: data.dailyTrend.slice(-14).map((item) => ({
      label: dayjs(item.date).format('MM/DD'),
      primary: item.total,
      secondary: eventsByDay[dayjs(item.date).format('YYYY-MM-DD')] ?? 0
    })),
    alerts
  }
}

async function loadSafetyProduction(): Promise<DomainCommandData> {
  const [enterprise, risks, tasks, points] = await Promise.all([
    fetchEnterpriseDashboardData(),
    fetchSafetyRiskList({ from: 0, to: 19 }),
    fetchRiskInspectionTaskList({ from: 0, to: 19 }),
    fetchRiskMapPoints()
  ])
  const openRisk = risks.overview.total - risks.overview.controlled
  const riskCount = risks.overview.major + tasks.overview.overdue + enterprise.safety.openHazards
  const score = rateScore(riskCount, Math.max(risks.overview.total + tasks.overview.total, 1))
  const riskLevelCounts = points.reduce<Record<string, number>>((map, point) => {
    const key = point.riskLevelName || '未分级'
    map[key] = (map[key] ?? 0) + 1
    return map
  }, {})
  return {
    generatedAt: enterprise.generatedAt,
    score,
    headline: riskCount ? '重大风险与逾期任务需要优先处置' : '安全风险管控闭环运行平稳',
    description: `已识别 ${risks.overview.total} 项风险，${risks.overview.controlled} 项纳入管控，当前 ${tasks.overview.overdue} 项巡检逾期。`,
    activeCount: points.length,
    riskCount,
    metrics: [
      {
        label: '风险点',
        value: points.length,
        unit: '处',
        hint: '四色风险地图',
        icon: 'ri:map-pin-2-line',
        tone: 'primary'
      },
      {
        label: '重大风险',
        value: risks.overview.major,
        unit: '项',
        hint: `${openRisk} 项未受控`,
        icon: 'ri:alarm-warning-line',
        tone: risks.overview.major ? 'danger' : 'success'
      },
      {
        label: '开放隐患',
        value: enterprise.safety.openHazards,
        unit: '项',
        hint: `${enterprise.safety.overdueHazards} 项逾期`,
        icon: 'ri:error-warning-line',
        tone: enterprise.safety.overdueHazards ? 'danger' : 'warning'
      },
      {
        label: '巡检任务',
        value: tasks.overview.total,
        unit: '项',
        hint: `${tasks.overview.completed} 项完成`,
        icon: 'ri:task-line',
        tone: 'info'
      },
      {
        label: '巡检逾期',
        value: tasks.overview.overdue,
        unit: '项',
        hint: '需要立即处理',
        icon: 'ri:timer-flash-line',
        tone: tasks.overview.overdue ? 'danger' : 'success'
      },
      {
        label: '近期事故',
        value: enterprise.safety.recentAccidents,
        unit: '起',
        hint: '近 30 天',
        icon: 'ri:first-aid-kit-line',
        tone: enterprise.safety.recentAccidents ? 'danger' : 'success'
      }
    ],
    nodes: [
      {
        label: '风险辨识',
        score: rateScore(risks.overview.total - risks.overview.evaluated, risks.overview.total),
        caption: `${risks.overview.evaluated} 项已评价`,
        icon: 'ri:radar-line',
        tone: 'primary'
      },
      {
        label: '风险管控',
        score: clampScore(
          risks.overview.total ? (risks.overview.controlled / risks.overview.total) * 100 : 100
        ),
        caption: `${risks.overview.controlled} 项受控`,
        icon: 'ri:shield-check-line',
        tone: 'success'
      },
      {
        label: '巡检执行',
        score: rateScore(tasks.overview.overdue, tasks.overview.total),
        caption: `${tasks.overview.overdue} 项逾期`,
        icon: 'ri:search-eye-line',
        tone: tasks.overview.overdue ? 'warning' : 'success'
      },
      {
        label: '隐患治理',
        score: rateScore(enterprise.safety.overdueHazards, enterprise.safety.openHazards),
        caption: `${enterprise.safety.openHazards} 项开放`,
        icon: 'ri:tools-line',
        tone: enterprise.safety.overdueHazards ? 'danger' : 'success'
      },
      {
        label: '事故防控',
        score: clampScore(100 - enterprise.safety.recentAccidents * 12),
        caption: `${enterprise.safety.recentAccidents} 起近期事故`,
        icon: 'ri:first-aid-kit-line',
        tone: enterprise.safety.recentAccidents ? 'danger' : 'success'
      },
      {
        label: '设备安全',
        score: rateScore(enterprise.safety.criticalEquipment, enterprise.safety.equipmentTotal),
        caption: `${enterprise.safety.criticalEquipment} 台关键风险`,
        icon: 'ri:settings-3-line',
        tone: enterprise.safety.criticalEquipment ? 'warning' : 'success'
      }
    ],
    distribution: Object.entries(riskLevelCounts).map(([label, value]) => ({
      label,
      value,
      caption: '风险点',
      tone:
        label === '重大风险'
          ? ('danger' as const)
          : label === '较大风险'
            ? ('warning' as const)
            : label === '低风险'
              ? ('success' as const)
              : ('info' as const)
    })),
    stages: [
      { label: '未开始', value: tasks.overview.notStarted, caption: '待执行' },
      { label: '执行中', value: tasks.overview.inProgress, caption: '现场巡检' },
      { label: '已完成', value: tasks.overview.completed, caption: '闭环完成' },
      { label: '已逾期', value: tasks.overview.overdue, caption: '超出计划' }
    ],
    trend: [
      { label: '风险总量', primary: risks.overview.total, secondary: risks.overview.major },
      { label: '管控中', primary: risks.overview.controlled, secondary: openRisk },
      { label: '巡检任务', primary: tasks.overview.total, secondary: tasks.overview.overdue },
      {
        label: '开放隐患',
        primary: enterprise.safety.openHazards,
        secondary: enterprise.safety.overdueHazards
      }
    ],
    alerts: [
      ...risks.data.slice(0, 4).map((item) => ({
        id: item.id,
        title: item.riskName,
        detail: `${item.siteName} · ${item.hazardSource}`,
        value: item.riskLevelName || '待评价',
        tone: item.riskLevelCode === 'major' ? ('danger' as const) : ('warning' as const)
      })),
      ...tasks.data
        .filter((item) => item.status === 'overdue')
        .slice(0, 4)
        .map((item) => ({
          id: item.id,
          title: item.riskPointName,
          detail: `${item.taskNo} · 巡检任务逾期`,
          value: '逾期',
          tone: 'danger' as const
        }))
    ]
  }
}

async function loadFinancialRisk(): Promise<DomainCommandData> {
  const [forecast, aging, exceptions] = await Promise.all([
    fetchCashForecastOverview(),
    fetchReceivableAgingOverview(),
    fetchFinancialExceptionOverview()
  ])
  const score =
    forecast.pressureLevel === 'critical'
      ? 45
      : forecast.pressureLevel === 'attention'
        ? 72
        : forecast.pressureLevel === 'unavailable'
          ? 0
          : 94
  return {
    generatedAt: exceptions.generatedAt,
    score,
    headline: exceptions.totalIssues ? '财务异常需要按阻塞程度集中处置' : '资金与结算链路运行平稳',
    description: `当前 ${exceptions.totalIssues} 项财务异常，${aging.overdueStatementCount} 笔应收逾期，30 天预计余额 ${formatArtValue(forecast.projectedBalance30d, 'number', compactAmountOptions)} 元。`,
    activeCount: exceptions.totalIssues,
    riskCount: exceptions.totalIssues + aging.overdueStatementCount,
    metrics: [
      {
        label: '可用资金',
        value: formatArtValue(forecast.availableBalance, 'number', compactAmountOptions),
        unit: '元',
        hint: '本位币余额',
        icon: 'ri:wallet-3-line',
        tone: forecast.readable ? 'success' : 'info'
      },
      {
        label: '30天预计余额',
        value: formatArtValue(forecast.projectedBalance30d, 'number', compactAmountOptions),
        unit: '元',
        hint: financialPressureLabels[forecast.pressureLevel],
        icon: 'ri:line-chart-line',
        tone:
          forecast.pressureLevel === 'critical'
            ? 'danger'
            : forecast.pressureLevel === 'attention'
              ? 'warning'
              : 'success'
      },
      {
        label: '应收余额',
        value: formatArtValue(forecast.receivableOutstanding, 'number', compactAmountOptions),
        unit: '元',
        hint: `${aging.overdueStatementCount} 笔逾期`,
        icon: 'ri:money-cny-circle-line',
        tone: aging.overdueStatementCount ? 'warning' : 'success'
      },
      {
        label: '应付余额',
        value: formatArtValue(forecast.payableOutstanding, 'number', compactAmountOptions),
        unit: '元',
        hint: '待支付口径',
        icon: 'ri:bank-card-line',
        tone: 'info'
      },
      {
        label: '银行未达',
        value: exceptions.bankUnmatchedCount,
        unit: '笔',
        hint: '等待对账',
        icon: 'ri:bank-line',
        tone: exceptions.bankUnmatchedCount ? 'warning' : 'success'
      },
      {
        label: '月结阻塞',
        value: exceptions.closeBlockingCount,
        unit: '项',
        hint: '影响期间关闭',
        icon: 'ri:calendar-close-line',
        tone: exceptions.closeBlockingCount ? 'danger' : 'success'
      }
    ],
    nodes: [
      {
        label: '资金安全',
        score,
        caption: `30天余额 ${formatArtValue(forecast.projectedBalance30d, 'number', compactAmountOptions)}`,
        icon: 'ri:safe-2-line',
        tone: score < 60 ? 'danger' : score < 80 ? 'warning' : 'success'
      },
      {
        label: '应收健康',
        score: rateScore(aging.overdueStatementCount, aging.statementCount),
        caption: `${aging.overdueStatementCount} 笔逾期`,
        icon: 'ri:funds-line',
        tone: aging.overdueStatementCount ? 'warning' : 'success'
      },
      {
        label: '银行对账',
        score: clampScore(100 - exceptions.bankUnmatchedCount * 5),
        caption: `${exceptions.bankUnmatchedCount} 笔未达`,
        icon: 'ri:bank-line',
        tone: exceptions.bankUnmatchedCount ? 'warning' : 'success'
      },
      {
        label: '过账链路',
        score: clampScore(100 - exceptions.postingFailedCount * 10),
        caption: `${exceptions.postingFailedCount} 笔失败`,
        icon: 'ri:book-2-line',
        tone: exceptions.postingFailedCount ? 'danger' : 'success'
      },
      {
        label: '成本审核',
        score: clampScore(100 - exceptions.costPendingReviewCount * 3),
        caption: `${exceptions.costPendingReviewCount} 项待审`,
        icon: 'ri:file-search-line',
        tone: exceptions.costPendingReviewCount ? 'warning' : 'success'
      },
      {
        label: '期间结账',
        score: clampScore(100 - exceptions.closeBlockingCount * 12),
        caption: `${exceptions.closeBlockingCount} 项阻塞`,
        icon: 'ri:calendar-check-line',
        tone: exceptions.closeBlockingCount ? 'danger' : 'success'
      }
    ],
    distribution: aging.buckets.map((item, index) => ({
      label: receivableAgingLabels[item.key],
      value: item.amount ?? item.statementCount,
      caption: `${item.statementCount} 笔`,
      tone: (['success', 'info', 'primary', 'warning', 'danger'] as const)[index]
    })),
    stages: forecast.horizons.map((item) => ({
      label: `${item.days}天`,
      value: Math.max(0, Math.round(item.projectedBalance ?? 0)),
      caption: '预计余额'
    })),
    trend: forecast.horizons.map((item) => ({
      label: `${item.days}天`,
      primary: Math.max(0, Math.round(item.expectedInflow ?? 0)),
      secondary: Math.max(0, Math.round(item.expectedOutflow ?? 0))
    })),
    alerts: exceptions.issues.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      detail: replaceEmbeddedCodes(item.description),
      value: item.routeLabel,
      tone:
        item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'info'
    }))
  }
}

async function loadWorkflowEfficiency(): Promise<DomainCommandData> {
  const [operations, bottlenecks, callbacks] = await Promise.all([
    fetchWorkflowOperationalAnalytics(30),
    fetchWorkflowBottleneckAnalytics(30),
    fetchWorkflowCallbackOutbox(null, 20)
  ])
  const score = clampScore(bottlenecks.summary.slaComplianceRate)
  const interrupted = operations.summary.interruptedCount
  return {
    generatedAt: operations.generatedAt,
    score,
    headline: bottlenecks.summary.overduePendingCount
      ? '审批瓶颈正在影响业务时效'
      : '审批与业务回调链路运行平稳',
    description: `近 30 天启动 ${operations.summary.totalCount} 条流程，SLA 达标率 ${bottlenecks.summary.slaComplianceRate}%，平均耗时 ${operations.summary.averageDurationHours} 小时。`,
    activeCount: operations.summary.runningCount,
    riskCount: bottlenecks.summary.overduePendingCount + callbacks.summary.deadLetter,
    metrics: [
      {
        label: '运行流程',
        value: operations.summary.runningCount,
        unit: '条',
        hint: '当前审批中',
        icon: 'ri:flow-chart',
        tone: 'primary'
      },
      {
        label: 'SLA 达标率',
        value: bottlenecks.summary.slaComplianceRate,
        unit: '%',
        hint: `${bottlenecks.summary.slaBreachedCount} 次违约`,
        icon: 'ri:timer-line',
        tone: score >= 90 ? 'success' : score >= 70 ? 'warning' : 'danger'
      },
      {
        label: '平均审批时长',
        value: operations.summary.averageDurationHours,
        unit: 'h',
        hint: `P90 ${bottlenecks.summary.p90HandleHours}h`,
        icon: 'ri:time-line',
        tone: 'info'
      },
      {
        label: '逾期待办',
        value: bottlenecks.summary.overduePendingCount,
        unit: '项',
        hint: `${bottlenecks.summary.pendingCount} 项待处理`,
        icon: 'ri:alarm-warning-line',
        tone: bottlenecks.summary.overduePendingCount ? 'danger' : 'success'
      },
      {
        label: '中断流程',
        value: interrupted,
        unit: '条',
        hint: '驳回、取消或撤回',
        icon: 'ri:stop-circle-line',
        tone: interrupted ? 'warning' : 'success'
      },
      {
        label: '回调死信',
        value: callbacks.summary.deadLetter,
        unit: '条',
        hint: `${callbacks.summary.retryWait} 条等待重试`,
        icon: 'ri:link-unlink-m',
        tone: callbacks.summary.deadLetter ? 'danger' : 'success'
      }
    ],
    nodes: [
      {
        label: '审批吞吐',
        score: rateScore(operations.summary.runningCount, operations.summary.totalCount),
        caption: `${operations.summary.approvedCount} 条通过`,
        icon: 'ri:check-double-line',
        tone: 'success'
      },
      {
        label: 'SLA 合规',
        score,
        caption: `${bottlenecks.summary.slaBreachedCount} 次违约`,
        icon: 'ri:timer-flash-line',
        tone: score >= 90 ? 'success' : 'warning'
      },
      {
        label: '节点效率',
        score: clampScore(100 - Math.min(100, bottlenecks.summary.averageHandleHours * 2)),
        caption: `平均 ${bottlenecks.summary.averageHandleHours}h`,
        icon: 'ri:node-tree',
        tone: 'primary'
      },
      {
        label: '人员负荷',
        score: rateScore(bottlenecks.summary.transferredCount, bottlenecks.summary.taskCount),
        caption: `${bottlenecks.summary.transferredCount} 次转交`,
        icon: 'ri:user-shared-line',
        tone: 'info'
      },
      {
        label: '业务回调',
        score: rateScore(
          callbacks.summary.deadLetter,
          Object.values(callbacks.summary).reduce((sum, value) => sum + value, 0)
        ),
        caption: `${callbacks.summary.deadLetter} 条死信`,
        icon: 'ri:webhook-line',
        tone: callbacks.summary.deadLetter ? 'danger' : 'success'
      },
      {
        label: '流程稳定',
        score: rateScore(interrupted, operations.summary.totalCount),
        caption: `${interrupted} 条中断`,
        icon: 'ri:pulse-line',
        tone: interrupted ? 'warning' : 'success'
      }
    ],
    distribution: operations.businessTypes.slice(0, 6).map((item) => ({
      label: workflowBusinessTypeLabels[item.businessType] ?? '其他审批业务',
      value: item.totalCount,
      caption: `${item.approvalRate}% 通过`
    })),
    stages: [
      { label: '运行中', value: operations.summary.runningCount, caption: '正在审批' },
      { label: '已通过', value: operations.summary.approvedCount, caption: '审批完成' },
      { label: '已驳回', value: operations.summary.rejectedCount, caption: '业务退回' },
      { label: '已中断', value: interrupted, caption: '取消或撤回' }
    ],
    trend: operations.daily.slice(-14).map((item) => ({
      label: dayjs(item.date).format('MM/DD'),
      primary: item.startedCount,
      secondary: item.rejectedCount
    })),
    alerts: [
      ...bottlenecks.nodes
        .filter((item) => item.riskLevel !== 'normal')
        .slice(0, 5)
        .map((item) => ({
          id: `${item.definitionId}-${item.nodeKey}`,
          title: `${item.definitionName} · ${item.nodeName}`,
          detail: `${item.pendingCount} 项待办，P90 ${item.p90HandleHours}h`,
          value: item.riskLevel === 'critical' ? '严重' : '关注',
          tone: item.riskLevel === 'critical' ? ('danger' as const) : ('warning' as const)
        })),
      ...callbacks.items
        .filter((item) => item.status === 'dead_letter' || item.status === 'retry_wait')
        .slice(0, 3)
        .map((item) => ({
          id: item.id,
          title: item.businessTitle,
          detail: resolveWorkflowCallbackDetail(item.lastError),
          value: item.status === 'dead_letter' ? '死信' : '重试',
          tone: item.status === 'dead_letter' ? ('danger' as const) : ('warning' as const)
        }))
    ]
  }
}

async function loadFleetCompliance(): Promise<DomainCommandData> {
  const fleet = await fetchFleetHealthWorkspace({ from: 0, to: 49 })
  if (fleet.error) throw fleet.error
  const { overview } = fleet
  const riskCount = overview.critical + overview.high + overview.openWorkOrders
  const score = rateScore(overview.critical * 2 + overview.high, Math.max(overview.total * 2, 1))
  return {
    generatedAt: new Date().toISOString(),
    score,
    headline: riskCount ? '高风险车辆与开放工单需要优先处置' : '车队健康与证照状态平稳',
    description: `在册 ${overview.total} 台车辆，${overview.critical} 台严重风险，${overview.openWorkOrders} 张开放工单。`,
    activeCount: overview.total,
    riskCount,
    metrics: [
      {
        label: '在册车辆',
        value: overview.total,
        unit: '台',
        hint: '车队资产总量',
        icon: 'ri:truck-line',
        tone: 'primary'
      },
      {
        label: '车队健康度',
        value: score,
        unit: '%',
        hint: '综合风险折算',
        icon: 'ri:heart-pulse-line',
        tone: score >= 90 ? 'success' : score >= 70 ? 'warning' : 'danger'
      },
      {
        label: '严重风险',
        value: overview.critical,
        unit: '台',
        hint: '需要立即处置',
        icon: 'ri:alarm-warning-line',
        tone: overview.critical ? 'danger' : 'success'
      },
      {
        label: '高风险车辆',
        value: overview.high,
        unit: '台',
        hint: '重点跟踪',
        icon: 'ri:error-warning-line',
        tone: overview.high ? 'warning' : 'success'
      },
      {
        label: '开放工单',
        value: overview.openWorkOrders,
        unit: '张',
        hint: '维修处置中',
        icon: 'ri:tools-line',
        tone: overview.openWorkOrders ? 'warning' : 'success'
      },
      {
        label: '健康车辆',
        value: overview.low,
        unit: '台',
        hint: '低风险等级',
        icon: 'ri:shield-check-line',
        tone: 'success'
      }
    ],
    nodes: [
      {
        label: '证照合规',
        score: rateScore(
          fleet.data.filter(
            (item) =>
              (item.insuranceDaysRemaining ?? 31) <= 30 ||
              (item.inspectionDaysRemaining ?? 31) <= 30
          ).length,
          overview.total
        ),
        caption: '保险与年检',
        icon: 'ri:file-shield-2-line',
        tone: 'success'
      },
      {
        label: '维护健康',
        score: rateScore(
          fleet.data.filter((item) => item.openWorkOrderCount > 0).length,
          overview.total
        ),
        caption: `${overview.openWorkOrders} 张开放工单`,
        icon: 'ri:tools-line',
        tone: overview.openWorkOrders ? 'warning' : 'success'
      },
      {
        label: '事故闭环',
        score: rateScore(
          fleet.data.reduce((sum, item) => sum + item.unresolvedAccidentCount, 0),
          overview.total
        ),
        caption: '未结事故',
        icon: 'ri:car-washing-line',
        tone: 'primary'
      },
      {
        label: '检测质量',
        score: rateScore(
          fleet.data.reduce((sum, item) => sum + item.failedInspectionCount, 0),
          overview.total
        ),
        caption: '检测不合格',
        icon: 'ri:search-eye-line',
        tone: 'info'
      },
      {
        label: '风险车辆',
        score,
        caption: `${overview.critical + overview.high} 台高风险`,
        icon: 'ri:radar-line',
        tone: score < 70 ? 'danger' : 'warning'
      },
      {
        label: '车队工单',
        score: rateScore(overview.openWorkOrders, overview.total),
        caption: `${overview.openWorkOrders} 张开放`,
        icon: 'ri:file-list-3-line',
        tone: overview.openWorkOrders ? 'warning' : 'success'
      }
    ],
    distribution: [
      { label: '严重', value: overview.critical, caption: '立即处置', tone: 'danger' },
      { label: '高风险', value: overview.high, caption: '重点跟踪', tone: 'warning' },
      { label: '中风险', value: overview.medium, caption: '计划改善', tone: 'info' },
      { label: '低风险', value: overview.low, caption: '运行平稳', tone: 'success' }
    ],
    stages: [
      { label: '严重', value: overview.critical, caption: '风险红线', tone: 'danger' },
      { label: '高风险', value: overview.high, caption: '重点关注', tone: 'warning' },
      { label: '中风险', value: overview.medium, caption: '持续监测', tone: 'info' },
      { label: '低风险', value: overview.low, caption: '健康运行', tone: 'success' }
    ],
    trend: fleet.data.slice(0, 8).map((item) => ({
      label: item.plateNo,
      primary: item.healthScore,
      secondary: item.riskScore
    })),
    alerts: fleet.data
      .filter((item) => item.riskLevel === 'critical' || item.riskLevel === 'high')
      .slice(0, 8)
      .map((item) => ({
        id: item.vehicleId,
        title: item.plateNo,
        detail: item.issues.slice(0, 2).join(' · ') || '车辆健康风险',
        value: item.riskScore,
        tone: item.riskLevel === 'critical' ? 'danger' : 'warning'
      }))
  }
}

async function loadDataGovernance(): Promise<DomainCommandData> {
  const [overview, issues] = await Promise.all([
    fetchMdmGovernanceOverview(),
    fetchMdmQualityIssues({ current: 1, size: 20 })
  ])
  const riskCount = overview.openIssues + overview.overdueIssues + overview.deadLetters
  const score = clampScore(
    100 - overview.overdueIssues * 7 - overview.deadLetters * 12 - overview.pendingMatches * 2
  )
  const domainCounts = issues.data.reduce<Record<string, number>>((map, issue) => {
    const domainLabel = mdmDomainLabelMap.get(issue.domainKey) ?? '其他主数据'
    map[domainLabel] = (map[domainLabel] ?? 0) + 1
    return map
  }, {})
  return {
    generatedAt: overview.generatedAt,
    score,
    headline: riskCount ? '质量问题与分发死信需要治理闭环' : '主数据治理链路运行平稳',
    description: `${overview.activeRules} 条质量规则持续运行，${overview.openIssues} 项开放问题，${overview.deadLetters} 条下游死信。`,
    activeCount: overview.activeRules,
    riskCount,
    metrics: [
      {
        label: '数据责任人',
        value: overview.stewards,
        unit: '人',
        hint: '治理职责已登记',
        icon: 'ri:user-star-line',
        tone: 'primary'
      },
      {
        label: '生效规则',
        value: overview.activeRules,
        unit: '条',
        hint: '持续质量检测',
        icon: 'ri:filter-3-line',
        tone: 'success'
      },
      {
        label: '开放问题',
        value: overview.openIssues,
        unit: '项',
        hint: `${overview.overdueIssues} 项逾期`,
        icon: 'ri:error-warning-line',
        tone: overview.overdueIssues ? 'danger' : overview.openIssues ? 'warning' : 'success'
      },
      {
        label: '待审变更',
        value: overview.pendingChanges,
        unit: '项',
        hint: '主数据变更队列',
        icon: 'ri:git-pull-request-line',
        tone: overview.pendingChanges ? 'warning' : 'success'
      },
      {
        label: '匹配候选',
        value: overview.pendingMatches,
        unit: '组',
        hint: '等待黄金记录确认',
        icon: 'ri:git-merge-line',
        tone: overview.pendingMatches ? 'warning' : 'success'
      },
      {
        label: '分发死信',
        value: overview.deadLetters,
        unit: '条',
        hint: `${overview.pendingDeliveries} 条待投递`,
        icon: 'ri:link-unlink-m',
        tone: overview.deadLetters ? 'danger' : 'success'
      }
    ],
    nodes: [
      {
        label: '质量规则',
        score: overview.activeRules ? 100 : 0,
        caption: `${overview.activeRules} 条生效`,
        icon: 'ri:shield-check-line',
        tone: overview.activeRules ? 'success' : 'info'
      },
      {
        label: '问题治理',
        score: rateScore(overview.overdueIssues, Math.max(overview.openIssues, 1)),
        caption: `${overview.overdueIssues} 项逾期`,
        icon: 'ri:bug-line',
        tone: overview.overdueIssues ? 'danger' : 'success'
      },
      {
        label: '变更审核',
        score: clampScore(100 - overview.pendingChanges * 3),
        caption: `${overview.pendingChanges} 项待审`,
        icon: 'ri:git-pull-request-line',
        tone: overview.pendingChanges ? 'warning' : 'success'
      },
      {
        label: '黄金记录',
        score: clampScore(100 - overview.pendingMatches * 3),
        caption: `${overview.pendingMatches} 组待确认`,
        icon: 'ri:medal-line',
        tone: overview.pendingMatches ? 'warning' : 'success'
      },
      {
        label: '数据分发',
        score: clampScore(100 - overview.deadLetters * 12),
        caption: `${overview.deadLetters} 条死信`,
        icon: 'ri:send-plane-line',
        tone: overview.deadLetters ? 'danger' : 'success'
      },
      {
        label: '责任体系',
        score: overview.stewards ? 100 : 0,
        caption: `${overview.stewards} 名责任人`,
        icon: 'ri:team-line',
        tone: overview.stewards ? 'success' : 'info'
      }
    ],
    distribution: Object.entries(domainCounts).map(([label, value]) => ({
      label,
      value,
      caption: '开放质量问题'
    })),
    stages: [
      { label: '开放问题', value: overview.openIssues, caption: '治理队列' },
      { label: '逾期问题', value: overview.overdueIssues, caption: '超过 SLA' },
      { label: '待审变更', value: overview.pendingChanges, caption: '等待审批' },
      { label: '待确认匹配', value: overview.pendingMatches, caption: '黄金记录' },
      { label: '分发死信', value: overview.deadLetters, caption: '链路异常' }
    ],
    trend: [
      { label: '规则运行', primary: overview.activeRules, secondary: 0 },
      { label: '开放问题', primary: overview.openIssues, secondary: overview.overdueIssues },
      { label: '变更队列', primary: overview.pendingChanges, secondary: 0 },
      { label: '匹配队列', primary: overview.pendingMatches, secondary: 0 },
      { label: '数据分发', primary: overview.pendingDeliveries, secondary: overview.deadLetters }
    ],
    alerts: issues.data.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.sourceName,
      detail: `${mdmDomainLabelMap.get(item.domainKey) ?? '其他主数据'} · ${item.sourceCode || '无编码'} · ${mdmIssueStateLabels[item.state] ?? '状态待确认'}`,
      value: severityLabels[item.severity] ?? '风险待确认',
      tone: item.severity === 'critical' ? 'danger' : item.severity === 'high' ? 'warning' : 'info'
    }))
  }
}

async function loadWorkforceInsight(): Promise<DomainCommandData> {
  const [risk, analyticsResult] = await Promise.all([
    fetchWorkforceRiskOverview(),
    fetchPeopleAnalyticsOverview({ periodMonths: 12 })
  ])
  if (analyticsResult.error) throw analyticsResult.error
  const analytics = analyticsResult.data
  if (!analytics) throw new Error('人力分析大屏未返回可用数据')
  const riskCount =
    risk.criticalCount +
    risk.expiringContractCount +
    risk.expiringQualificationCount +
    risk.vacancyCount
  const score = clampScore(
    analytics.overview.dataCompletenessRate * 0.3 +
      Math.max(0, 100 - analytics.overview.turnoverRate) * 0.25 +
      rateScore(riskCount, Math.max(risk.activeEmployeeCount, 1)) * 0.45
  )
  return {
    generatedAt: analytics.generatedAt,
    score,
    headline: riskCount ? '编制与用工合规风险需要协同处理' : '组织人员结构保持稳定',
    description: `当前在岗 ${risk.activeEmployeeCount} 人，近 12 个月净变化 ${analytics.overview.netChange} 人，流失率 ${analytics.overview.turnoverRate}%。`,
    activeCount: risk.activeEmployeeCount,
    riskCount,
    metrics: [
      {
        label: '在岗人员',
        value: risk.activeEmployeeCount,
        unit: '人',
        hint: `${analytics.overview.endingFte} FTE`,
        icon: 'ri:team-line',
        tone: 'primary'
      },
      {
        label: '人员净变化',
        value: analytics.overview.netChange,
        unit: '人',
        hint: `${analytics.overview.hires} 入职 / ${analytics.overview.exits} 离职`,
        icon: 'ri:user-shared-line',
        tone: analytics.overview.netChange >= 0 ? 'success' : 'warning'
      },
      {
        label: '人员流失率',
        value: analytics.overview.turnoverRate,
        unit: '%',
        hint: `平均司龄 ${analytics.overview.averageTenureYears} 年`,
        icon: 'ri:logout-box-r-line',
        tone: analytics.overview.turnoverRate > 15 ? 'warning' : 'success'
      },
      {
        label: '编制缺口',
        value: risk.vacancyCount,
        unit: '人',
        hint: '关键岗位补员',
        icon: 'ri:user-add-line',
        tone: risk.vacancyCount ? 'warning' : 'success'
      },
      {
        label: '合同到期',
        value: risk.expiringContractCount,
        unit: '人',
        hint: '未来 60 天',
        icon: 'ri:file-warning-line',
        tone: risk.expiringContractCount ? 'warning' : 'success'
      },
      {
        label: '资质到期',
        value: risk.expiringQualificationCount,
        unit: '人',
        hint: '未来 60 天',
        icon: 'ri:award-line',
        tone: risk.expiringQualificationCount ? 'danger' : 'success'
      }
    ],
    nodes: [
      {
        label: '组织规模',
        score: 100,
        caption: `${risk.activeEmployeeCount} 人在岗`,
        icon: 'ri:organization-chart',
        tone: 'primary'
      },
      {
        label: '人员稳定',
        score: clampScore(100 - analytics.overview.turnoverRate),
        caption: `${analytics.overview.turnoverRate}% 流失率`,
        icon: 'ri:team-line',
        tone: analytics.overview.turnoverRate > 15 ? 'warning' : 'success'
      },
      {
        label: '编制健康',
        score: rateScore(
          risk.vacancyCount,
          Math.max(risk.activeEmployeeCount + risk.vacancyCount, 1)
        ),
        caption: `${risk.vacancyCount} 人缺口`,
        icon: 'ri:user-add-line',
        tone: risk.vacancyCount ? 'warning' : 'success'
      },
      {
        label: '合同合规',
        score: rateScore(risk.expiringContractCount, risk.activeEmployeeCount),
        caption: `${risk.expiringContractCount} 份到期`,
        icon: 'ri:file-shield-2-line',
        tone: risk.expiringContractCount ? 'warning' : 'success'
      },
      {
        label: '资质合规',
        score: rateScore(risk.expiringQualificationCount, risk.activeEmployeeCount),
        caption: `${risk.expiringQualificationCount} 项到期`,
        icon: 'ri:award-line',
        tone: risk.expiringQualificationCount ? 'danger' : 'success'
      },
      {
        label: '数据完整',
        score: clampScore(analytics.overview.dataCompletenessRate),
        caption: `${analytics.overview.dataCompletenessRate}% 完整`,
        icon: 'ri:database-2-line',
        tone: analytics.overview.dataCompletenessRate >= 90 ? 'success' : 'warning'
      }
    ],
    distribution: analytics.organizationDistribution
      .slice(0, 6)
      .map((item) => ({ label: item.name, value: item.headcount, caption: `${item.share}%` })),
    stages: [
      { label: '严重风险', value: risk.criticalCount, caption: '立即处置', tone: 'danger' },
      {
        label: '合同到期',
        value: risk.expiringContractCount,
        caption: '未来60天',
        tone: 'warning'
      },
      {
        label: '资质到期',
        value: risk.expiringQualificationCount,
        caption: '未来60天',
        tone: 'warning'
      },
      { label: '试用到期', value: risk.probationDueCount, caption: '未来30天', tone: 'info' },
      { label: '编制缺口', value: risk.vacancyCount, caption: '待补充', tone: 'primary' }
    ],
    trend: analytics.flowTrend.map((item) => ({
      label: dayjs(item.month).format('MM月'),
      primary: item.headcount,
      secondary: item.exits
    })),
    alerts: risk.items.slice(0, 8).map((item) => ({
      id: item.id,
      title: item.title,
      detail: `${item.subject} · ${item.description}`,
      value:
        item.daysRemaining === null || item.daysRemaining === undefined
          ? '待处理'
          : item.daysRemaining < 0
            ? `逾期${Math.abs(item.daysRemaining)}天`
            : `${item.daysRemaining}天`,
      tone: item.level === 'critical' ? 'danger' : item.level === 'warning' ? 'warning' : 'info'
    }))
  }
}

export async function fetchDomainCommandData(kind: DomainCommandKind): Promise<DomainCommandData> {
  const loaders: Record<DomainCommandKind, () => Promise<DomainCommandData>> = {
    'ai-safety': loadAiSafety,
    'safety-production': loadSafetyProduction,
    'financial-risk': loadFinancialRisk,
    'workflow-efficiency': loadWorkflowEfficiency,
    'fleet-compliance': loadFleetCompliance,
    'data-governance': loadDataGovernance,
    'workforce-insight': loadWorkforceInsight
  }
  return await loaders[kind]()
}

export function createEmptyDomainCommandData(): DomainCommandData {
  return {
    generatedAt: new Date().toISOString(),
    score: 0,
    headline: '等待业务数据接入',
    description: '当前范围暂无可用统计数据。',
    activeCount: 0,
    riskCount: 0,
    metrics: [],
    nodes: [],
    distribution: [],
    stages: [],
    trend: [],
    alerts: []
  }
}
