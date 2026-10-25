export type SpecialOperationPrecheckReadiness = 'ready' | 'needs_attention' | 'blocked'
export type SpecialOperationPrecheckSeverity = 'blocking' | 'warning'

export interface SpecialOperationPrecheckIssue {
  code: string
  severity: SpecialOperationPrecheckSeverity
  title: string
  description: string
  field?: string
}

export interface SpecialOperationPrecheckInput {
  operationTypeCode: string
  operationTypeName: string
  workContent: string | null
  workStartTime: string | null
  workEndTime: string | null
  workLocation: string | null
  workUnit: string | null
  workSection: string | null
  hotWorkLevel: string | null
  hotWorkMethodCount: number
  hazardFactorCount: number
  responsibleEmployeeSelected: boolean
  guardianCount: number
  verifierCount: number
  briefingGiverCount: number
  briefingReceiverCount: number
  workerCount: number
  analystCount: number
  siteAnalysisTotal: number
  siteAnalysisCompleted: number
  safetyMeasureTotal: number
  safetyMeasureConfirmed: number
  sitePhotoCount: number
  relatedOperationCount: number
  requiredCustomFields: Array<{ label: string; present: boolean }>
  blindPlateItemCount: number
}

export interface SpecialOperationPrecheckResult {
  score: number
  readiness: SpecialOperationPrecheckReadiness
  summary: string
  blockers: SpecialOperationPrecheckIssue[]
  warnings: SpecialOperationPrecheckIssue[]
  passedChecks: string[]
  recommendations: string[]
  metrics: {
    completedAnalysis: string
    confirmedMeasures: string
    workerCount: number
    photoCount: number
  }
}

const HIGH_RISK_GUARDIAN_TYPES = new Set([
  'HOT_WORK',
  'WORK_AT_HEIGHT',
  'LIFTING',
  'CONFINED_SPACE'
])

function hasText(value: string | null): boolean {
  return Boolean(value?.trim())
}

function hasDate(value: string | null): boolean {
  return Boolean(value && Number.isFinite(Date.parse(value)))
}

export function evaluateSpecialOperationPrecheck(
  input: SpecialOperationPrecheckInput
): SpecialOperationPrecheckResult {
  const blockers: SpecialOperationPrecheckIssue[] = []
  const warnings: SpecialOperationPrecheckIssue[] = []
  const passedChecks: string[] = []
  const recommendations: string[] = []
  const blocking = (
    code: string,
    title: string,
    description: string,
    field?: string
  ): void => blockers.push({ code, severity: 'blocking', title, description, field })
  const warning = (
    code: string,
    title: string,
    description: string,
    field?: string
  ): void => warnings.push({ code, severity: 'warning', title, description, field })

  if (!hasText(input.operationTypeCode)) {
    blocking('operation_type_missing', '未选择作业类型', '先明确作业类型后再进行票证预审。', 'operationTypeId')
  }
  if (!hasText(input.workContent)) {
    blocking('work_content_missing', '作业内容缺失', '补充具体作业任务、对象和边界。', 'workContent')
  }
  if (!hasText(input.workLocation)) {
    blocking('work_location_missing', '作业地点缺失', '填写可定位到区域、设备或部位的现场位置。', 'workLocation')
  }
  if (!hasDate(input.workStartTime) || !hasDate(input.workEndTime)) {
    blocking('work_time_missing', '作业时段不完整', '补齐有效的开始和结束时间。', 'workStartTime')
  } else if (Date.parse(input.workEndTime as string) <= Date.parse(input.workStartTime as string)) {
    blocking('work_time_invalid', '作业时段冲突', '结束时间必须晚于开始时间。', 'workEndTime')
  }
  if (
    hasText(input.operationTypeCode) &&
    hasText(input.workContent) &&
    hasText(input.workLocation) &&
    hasDate(input.workStartTime) &&
    hasDate(input.workEndTime) &&
    Date.parse(input.workEndTime as string) > Date.parse(input.workStartTime as string)
  ) {
    passedChecks.push('基础作业范围与时间信息完整')
  }

  if (!input.responsibleEmployeeSelected) {
    blocking('responsible_missing', '未指定作业负责人', '作业负责人是提交前必须明确的责任主体。', 'responsibleEmployeeId')
  }
  if (input.workerCount < 1) {
    blocking('workers_missing', '未配置作业人员', '至少添加一名本次作业人员并核对证件信息。', 'workers')
  }
  if (HIGH_RISK_GUARDIAN_TYPES.has(input.operationTypeCode) && input.guardianCount < 1) {
    blocking('guardian_missing', '缺少现场监护人', '当前作业类型需要明确现场监护责任。', 'guardianIds')
  }
  if (input.briefingGiverCount < 1 || input.briefingReceiverCount < 1) {
    warning('briefing_incomplete', '安全交底链路不完整', '建议同时明确交底人和接受交底人，并在开工前留痕。', 'briefingGiverIds')
  }
  if (
    input.responsibleEmployeeSelected &&
    input.workerCount > 0 &&
    (!HIGH_RISK_GUARDIAN_TYPES.has(input.operationTypeCode) || input.guardianCount > 0)
  ) {
    passedChecks.push('负责人、作业人员与监护角色已配置')
  }

  if (input.siteAnalysisTotal > 0 && input.siteAnalysisCompleted < input.siteAnalysisTotal) {
    blocking(
      'site_analysis_incomplete',
      '现场分析尚未完成',
      `已记录 ${input.siteAnalysisCompleted}/${input.siteAnalysisTotal} 项，提交前应逐项填写检测结果。`,
      'siteAnalysisRecords'
    )
  } else if (input.siteAnalysisTotal > 0) {
    passedChecks.push('现场分析项目已全部记录')
  } else {
    warning('site_analysis_unconfigured', '未配置现场分析项', '请确认当前作业类型是否无需气体、环境或工况检测。')
  }

  if (input.safetyMeasureTotal > 0 && input.safetyMeasureConfirmed < 1) {
    blocking('safety_measure_unconfirmed', '安全措施尚未确认', '至少核对并确认一项适用于本次作业的安全措施。', 'safetyMeasures')
  } else if (input.safetyMeasureConfirmed > 0) {
    passedChecks.push(`已确认 ${input.safetyMeasureConfirmed} 项安全措施`)
  } else {
    warning('safety_measure_unconfigured', '未配置安全检查项', '请先确认该作业类型的标准安全措施是否已维护。')
  }

  if (input.sitePhotoCount < 1) {
    warning('site_photo_missing', '缺少现场影像', '建议上传能证明作业环境、隔离边界和安全措施的现场照片。', 'sitePhotoUrls')
  } else {
    passedChecks.push(`已留存 ${input.sitePhotoCount} 张现场照片`)
  }

  const missingCustomFields = input.requiredCustomFields.filter((field) => !field.present)
  if (missingCustomFields.length) {
    blocking(
      'custom_fields_missing',
      '作业专有信息不完整',
      `待补充：${missingCustomFields.map((field) => field.label).join('、')}。`,
      'customValues'
    )
  } else if (input.requiredCustomFields.length) {
    passedChecks.push('作业专有必填信息完整')
  }

  if (input.operationTypeCode === 'HOT_WORK') {
    if (!hasText(input.hotWorkLevel)) blocking('hot_work_level_missing', '动火级别缺失', '请按制度选择动火级别。', 'hotWorkLevel')
    if (input.hotWorkMethodCount < 1) blocking('hot_work_method_missing', '动火方式缺失', '至少选择一种动火方式。', 'hotWorkMethods')
    if (input.hazardFactorCount < 1) blocking('hazard_factor_missing', '危害因素未辨识', '至少选择一项与现场相符的危害因素。', 'hazardFactorIds')
  }
  if (input.operationTypeCode === 'CONFINED_SPACE' && input.analystCount < 1) {
    blocking('analyst_missing', '缺少现场分析人', '受限空间作业需明确现场分析责任人。', 'analystIds')
  }
  if (input.operationTypeCode === 'BLIND_PLATE' && input.blindPlateItemCount < 1) {
    blocking('blind_plate_items_missing', '缺少盲板明细', '至少登记一项管线、介质、规格和盲板编号。', 'blindPlateItems')
  }

  if (!hasText(input.workUnit)) recommendations.push('补充作业单位，便于承包商与执行主体追溯。')
  if (!hasText(input.workSection)) recommendations.push('补充作业部位，减少现场定位歧义。')
  if (input.verifierCount < 1) recommendations.push('建议明确作业验证人，形成开工条件的交叉核对。')
  if (input.relatedOperationCount > 0) recommendations.push('当前涉及关联作业，建议同步核对作业时段与隔离边界。')
  if (!recommendations.length) recommendations.push('保持现有信息，并在提交前再次核对现场实际条件。')

  const score = Math.max(0, Math.min(100, 100 - blockers.length * 12 - warnings.length * 5))
  const readiness: SpecialOperationPrecheckReadiness = blockers.length
    ? 'blocked'
    : warnings.length
      ? 'needs_attention'
      : 'ready'
  const summary = blockers.length
    ? `发现 ${blockers.length} 项提交前阻断问题、${warnings.length} 项提醒，建议先补齐关键条件。`
    : warnings.length
      ? `未发现阻断问题，仍有 ${warnings.length} 项现场确认提醒。`
      : '当前草稿未发现明显缺项或规则冲突，可继续人工复核。'

  return {
    score,
    readiness,
    summary,
    blockers,
    warnings,
    passedChecks,
    recommendations,
    metrics: {
      completedAnalysis: `${input.siteAnalysisCompleted}/${input.siteAnalysisTotal}`,
      confirmedMeasures: `${input.safetyMeasureConfirmed}/${input.safetyMeasureTotal}`,
      workerCount: input.workerCount,
      photoCount: input.sitePhotoCount
    }
  }
}
