import type {
  SmisEmergencyDrillRecord,
  SmisHiddenHazardGovernanceDetail,
  SmisHiddenHazardInspectionTask,
  SmisHiddenHazardInspectionTaskDetail,
  SmisHiddenHazardLedgerRecord,
  SmisRectificationNoticeRecord,
  SmisRiskControlInformationRecord,
  SmisRiskInspectionTask,
  SmisRiskInspectionTaskDetail,
  SmisThreeViolationEducation
} from '@smis/api'
import {
  employeeId,
  itemId,
  organizationId,
  recordId,
  tenantId,
  timestamp
} from './form-standard-smis-data'

export const longRiskMeasure = {
  positions:
    '智能装备装配事业部设备维护与工艺保障联合班组安全管理岗位、生产设备检修责任岗位及夜班值守复核岗位',
  standardBasis:
    '依据生产设备安全防护管理标准第七章第三节与装配生产线检修联锁作业指导书，逐项核验固定防护罩、检修门联锁和紧急停机装置的有效性。标准依据结束。',
  failureMode:
    '防护罩固定螺栓松脱、检修门联锁接线断开或旁路、紧急停机装置失效，可能导致检修人员进入危险区域时旋转部件未停止。失效形式结束。'
}
export const longHazardSource = {
  sourceRecordNo: 'SOURCE-SMIS-ASSEMBLY-GUARD-INTERLOCK-INSPECTION-2026-0000123456789-END',
  inspectionTypeName:
    '智能装备装配生产线传动系统防护与检修联锁综合专项排查（设备维护、安全管理及夜班值守联合复核）'
}

export const hazardGovernance: SmisHiddenHazardGovernanceDetail = {
  id: recordId,
  hazardNo: 'HG-SMIS',
  sourceType: 'quick_report',
  description: '验收通道临时堆物',
  location: '验收北侧通道',
  hazardLevel: 'general',
  status: 'completed',
  reporterEmployeeId: employeeId,
  reporterEmployeeNo: 'EMP-SMIS',
  reporterEmployeeName: '验收上报人',
  reportedAt: timestamp,
  imageUrls: [],
  rectificationSuggestion: '验收移除障碍物',
  approverEmployeeName: '验收核准人',
  approvedAt: timestamp,
  approvalResult: 'rectify',
  rectificationDeadline: timestamp,
  rectificationMeasures: '验收划线管理',
  rectificationResponsibleEmployeeId: employeeId,
  rectificationResponsibleEmployeeName: '验收整改人',
  rectificationCompletedAt: timestamp,
  rectificationDescription: '验收现场已清理',
  rectificationImageUrls: [],
  acceptorEmployeeName: '验收复核人',
  acceptedAt: timestamp,
  acceptanceResult: 'passed',
  acceptanceDescription: '验收通道恢复畅通',
  acceptanceImageUrls: [],
  events: [
    {
      id: itemId,
      eventType: 'acceptance_passed',
      eventTitle: '验收闭环事件',
      eventContent: '验收现场复核通过',
      evidenceUrls: [],
      eventAt: timestamp
    }
  ],
  createTime: timestamp,
  updateTime: timestamp
}
export const hazardLedger: SmisHiddenHazardLedgerRecord = {
  ...hazardGovernance,
  overdue: false,
  evidenceCount: 0,
  events: [
    {
      id: itemId,
      title: '验收台账闭环事件',
      content: '验收整改记录归档',
      evidenceUrls: [],
      eventAt: timestamp
    }
  ]
}
export const riskInformation: SmisRiskControlInformationRecord = {
  id: recordId,
  hazardNo: 'RI-SMIS',
  pointNo: 'RP-SMIS',
  identificationLocation: '验收传动区',
  organizationIds: [organizationId],
  organizationNames: '验收安全部',
  siteName: '验收装配区',
  equipmentFacility: '验收装配设备',
  isSpecialEquipment: false,
  activityNames: '验收设备维护',
  hazardFactor: '验收旋转部件伤害',
  accidentTypes: ['mechanical_injury'],
  consequence: '验收机械伤害后果',
  methodCode: 'LEC',
  lValue: 1,
  eValue: 2,
  cValue: 3,
  riskScore: 6,
  riskLevelCode: 'low',
  riskLevelName: '低风险',
  riskLevelColor: '#059669',
  measureCount: 1,
  linkedPositionCount: 1,
  generatedHazardCount: 0,
  measures: [
    {
      id: itemId,
      category: '工程措施',
      controlLevel: '班组级',
      content: '验收固定防护罩管控',
      hazardLevel: 'general',
      positions: '验收安全岗',
      frequency: '每天1次'
    }
  ]
}
export const rectification: SmisRectificationNoticeRecord = {
  id: recordId,
  noticeNo: 'RN-SMIS',
  hazardNo: 'HG-SMIS',
  rectificationPlanNo: 'RP-SMIS',
  inspectionTime: timestamp,
  inspectionOrganizationName: '验收安全部',
  inspectorNames: '验收检查人',
  inspectedOrganizationName: '验收装配部',
  hazardDescription: '验收通道临时堆物',
  rectificationRequirement: '验收清理通道',
  rectificationDeadline: timestamp,
  status: 'completed',
  rectificationCompletedAt: timestamp,
  rectificationDescription: '验收整改落实完毕',
  rectificationImageUrls: [],
  hazardImageUrls: [],
  location: '验收北侧通道',
  hazardLevel: 'general',
  responsibleEmployeeName: '验收责任人'
}
export const violation: SmisThreeViolationEducation = {
  id: recordId,
  tenantId,
  inspectedEmployeeId: employeeId,
  checkerEmployeeId: employeeId,
  employeeNo: 'EMP-SMIS',
  employeeName: '验收被检查人',
  checkerName: '验收检查人',
  warningStatus: 'normal',
  educationStatus: 'educated',
  inspectionTime: timestamp,
  violationDescription: '验收未按规程操作',
  plannedEducationContent: '验收操作规程培训',
  educationContent: '验收安全教育课程',
  educationResult: '验收教育考核通过',
  trainingHours: 2,
  examScore: 98,
  attachmentUrls: [],
  responsibleEmployees: [
    {
      id: employeeId,
      employeeNo: 'EMP-SMIS',
      employeeName: '验收教育负责人',
      organizationName: '验收安全部'
    }
  ]
}
export const drillRecord: SmisEmergencyDrillRecord = {
  id: recordId,
  drillPlanId: recordId,
  planNo: 'EDP-SMIS-0001',
  drillName: '验收消防应急演练',
  sourcePlanName: '验收综合应急预案',
  drillForm: 'onsite',
  planCategory: 'comprehensive',
  planLevel: 'company',
  applicableOrganizationId: organizationId,
  applicableOrganizationName: '验收安全部',
  drillLocation: '验收装配区',
  drillSubject: '验收消防疏散科目',
  drillPurpose: '验收应急响应能力',
  drillProcess: '验收响应过程',
  drillSummary: '验收总结',
  drillEvaluation: '验收评估通过',
  imageUrls: [],
  attachmentUrls: [],
  status: 'submitted',
  participants: []
}
export const hiddenTaskDetail: SmisHiddenHazardInspectionTaskDetail = {
  id: recordId,
  sourcePlanId: itemId,
  sourcePlanNo: 'HP-SMIS',
  sourcePlanName: '验收隐患计划',
  taskNo: 'HT-SMIS',
  inspectionObject: '验收设备通道',
  inspectionTypeName: '验收日常巡查',
  status: 'completed',
  executorEmployeeId: employeeId,
  executorEmployeeName: '验收执行人',
  executorEmployeeNo: 'EMP-SMIS',
  plannedStartAt: timestamp,
  plannedEndAt: timestamp,
  inspectionOrganizationName: '验收安全部',
  inspectedOrganizationName: '验收装配部',
  executionSummary: '验收检查正常',
  attachmentUrls: [],
  items: [
    {
      id: itemId,
      standardCode: 'IS-SMIS',
      standardName: '验收通道标准',
      itemCode: 'ITEM-SMIS',
      inspectionContent: '验收通道保持畅通',
      result: 'normal',
      attachmentUrls: [],
      sort: 10
    }
  ],
  events: [
    {
      id: itemId,
      eventType: 'completed',
      eventContent: '验收隐患任务完成事件',
      operatorName: '验收执行人',
      eventAt: timestamp
    }
  ]
}
export const hiddenTask: SmisHiddenHazardInspectionTask = {
  ...hiddenTaskDetail,
  itemCount: 1,
  normalCount: 1,
  abnormalCount: 0,
  createTime: timestamp,
  updateTime: timestamp
}
export const riskTaskDetail: SmisRiskInspectionTaskDetail = {
  id: recordId,
  tenantId,
  taskNo: 'RT-SMIS',
  riskPointId: itemId,
  riskPointNo: 'RP-SMIS',
  riskPointName: '验收装配区',
  riskPointType: 'equipment',
  riskLevelCode: 'low',
  riskLevelName: '低风险',
  riskLevelColor: '#059669',
  controlLevel: 'team',
  responsibleEmployeeId: employeeId,
  responsibleEmployeeNo: 'EMP-SMIS',
  responsibleEmployeeName: '验收责任人',
  assigneeEmployeeId: employeeId,
  assigneeEmployeeNo: 'EMP-SMIS',
  assigneeEmployeeName: '验收执行人',
  plannedStartAt: timestamp,
  plannedEndAt: timestamp,
  status: 'completed',
  executionSummary: '验收风险巡查完成',
  attachmentUrls: [],
  items: [
    {
      id: itemId,
      inspectionContent: '验收防护罩可靠',
      result: 'normal',
      attachmentUrls: [],
      sort: 10
    }
  ],
  events: [
    {
      id: itemId,
      eventType: 'completed',
      eventContent: '验收风险任务完成事件',
      operatorName: '验收执行人',
      eventAt: timestamp
    }
  ]
}
export const riskTask: SmisRiskInspectionTask = {
  ...riskTaskDetail,
  itemCount: 1,
  completedItemCount: 1,
  abnormalCount: 0,
  createTime: timestamp,
  updateTime: timestamp
}
