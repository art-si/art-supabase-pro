export interface SmisHazardForecastObservation {
  status: string
  hazardLevel?: string | null
  reportedAt: string
  rectificationDeadline?: string | null
}

export interface SmisRiskForecastInput {
  asOf: string
  lookbackDays: number
  observations: SmisHazardForecastObservation[]
}

export interface SmisRiskForecastDriver {
  code: string
  label: string
  value: string
  description: string
  tone: 'danger' | 'warning' | 'primary' | 'success'
}

export interface SmisRiskForecastResult {
  score: number
  riskLevel: 'low' | 'medium' | 'high' | 'critical'
  confidence: 'low' | 'medium' | 'high'
  confidenceScore: number
  lookbackDays: number
  currentPeriodCount: number
  previousPeriodCount: number
  openCount: number
  overdueCount: number
  forecast30DayCount: number
  trendPercent: number | null
  drivers: SmisRiskForecastDriver[]
  recommendations: string[]
  methodology: string
}

const OPEN_STATUSES = new Set(['pending_approval', 'rectifying', 'pending_acceptance'])

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function toTime(value: string | null | undefined): number | null {
  if (!value) return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function severityWeight(value: string | null | undefined): number {
  const level = (value || '').toLowerCase()
  if (/(major|critical|重大|red|general_a|level_1)/.test(level)) return 4
  if (/(high|较大|orange|general_b|level_2)/.test(level)) return 3
  if (/(medium|一般|yellow|general_c|level_3)/.test(level)) return 2
  return 1
}

export function evaluateSmisRiskForecast(input: SmisRiskForecastInput): SmisRiskForecastResult {
  const lookbackDays = clamp(Math.trunc(input.lookbackDays || 30), 7, 180)
  const asOf = toTime(input.asOf) ?? Date.now()
  const periodMs = lookbackDays * 86_400_000
  const currentStart = asOf - periodMs
  const previousStart = currentStart - periodMs
  const valid = input.observations.filter((item) => toTime(item.reportedAt) !== null)
  const current = valid.filter((item) => {
    const time = toTime(item.reportedAt) as number
    return time > currentStart && time <= asOf
  })
  const previous = valid.filter((item) => {
    const time = toTime(item.reportedAt) as number
    return time > previousStart && time <= currentStart
  })
  const open = current.filter((item) => OPEN_STATUSES.has(item.status))
  const overdue = open.filter((item) => {
    const deadline = toTime(item.rectificationDeadline)
    return deadline !== null && deadline < asOf
  })
  const trendPercent = previous.length
    ? Math.round(((current.length - previous.length) / previous.length) * 100)
    : current.length
      ? null
      : 0
  const averageSeverity = current.length
    ? current.reduce((sum, item) => sum + severityWeight(item.hazardLevel), 0) / current.length
    : 0

  const backlogScore = current.length ? (open.length / current.length) * 30 : 0
  const overdueScore = open.length ? (overdue.length / open.length) * 25 : 0
  const trendScore = trendPercent === null ? Math.min(current.length * 2, 12) : clamp(trendPercent, 0, 100) * 0.2
  const severityScore = (averageSeverity / 4) * 15
  const volumeScore = clamp((current.length / Math.max(lookbackDays, 1)) * 30, 0, 10)
  const score = Math.round(clamp(backlogScore + overdueScore + trendScore + severityScore + volumeScore, 0, 100))
  const riskLevel = score >= 75 ? 'critical' : score >= 55 ? 'high' : score >= 30 ? 'medium' : 'low'

  const sampleSize = current.length + previous.length
  const confidenceScore = Math.round(clamp(20 + Math.sqrt(sampleSize) * 12, 20, 92))
  const confidence = sampleSize >= 30 ? 'high' : sampleSize >= 8 ? 'medium' : 'low'
  const dailyRate = (current.length * 0.65 + previous.length * 0.35) / lookbackDays
  const forecast30DayCount = Math.round(Math.max(0, dailyRate * 30))

  const drivers: SmisRiskForecastDriver[] = [
    {
      code: 'open_backlog',
      label: '未闭环隐患',
      value: `${open.length} 项`,
      description: current.length ? `占本期隐患 ${Math.round((open.length / current.length) * 100)}%` : '本期无新增样本',
      tone: open.length ? 'warning' : 'success'
    },
    {
      code: 'overdue',
      label: '逾期整改',
      value: `${overdue.length} 项`,
      description: overdue.length ? '已超过整改期限，建议优先核实' : '未发现已明确期限的逾期项',
      tone: overdue.length ? 'danger' : 'success'
    },
    {
      code: 'trend',
      label: '新增趋势',
      value: trendPercent === null ? '缺少同期基线' : `${trendPercent > 0 ? '+' : ''}${trendPercent}%`,
      description: `本期 ${current.length} 项，上期 ${previous.length} 项`,
      tone: trendPercent !== null && trendPercent > 20 ? 'danger' : trendPercent !== null && trendPercent > 0 ? 'warning' : 'primary'
    },
    {
      code: 'forecast',
      label: '未来 30 天基线',
      value: `${forecast30DayCount} 项`,
      description: '按近两期加权发生率外推，不代表确定结果',
      tone: 'primary'
    }
  ]

  const recommendations: string[] = []
  if (overdue.length) recommendations.push('先复核逾期隐患的责任人、整改期限和验收安排。')
  if (open.length > Math.max(2, current.length / 2)) recommendations.push('未闭环占比较高，建议按风险等级建立每日清零清单。')
  if (trendPercent !== null && trendPercent > 20) recommendations.push('新增隐患上升明显，建议对高频场所和类型安排专项排查。')
  if (confidence === 'low') recommendations.push('当前样本较少，建议累计更多周期数据后再用于趋势判断。')
  if (!recommendations.length) recommendations.push('保持现有排查与闭环节奏，并持续关注新增隐患结构变化。')

  return {
    score,
    riskLevel,
    confidence,
    confidenceScore,
    lookbackDays,
    currentPeriodCount: current.length,
    previousPeriodCount: previous.length,
    openCount: open.length,
    overdueCount: overdue.length,
    forecast30DayCount,
    trendPercent,
    drivers,
    recommendations,
    methodology: 'deterministic_weighted_trend_v1'
  }
}
