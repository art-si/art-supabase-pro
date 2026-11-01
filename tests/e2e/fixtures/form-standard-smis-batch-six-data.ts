import type {
  SmisAccidentReport,
  SmisAnnouncement,
  SmisEquipment,
  SmisEquipmentCategory,
  SmisQuestion,
  SmisQuestionCategory,
  SmisSafetyTrainingPlan,
  SmisSafetyTrainingRecord
} from '@smis/api'
import {
  employeeId,
  itemId,
  organization,
  organizationId,
  recordId,
  tenantId,
  timestamp
} from './form-standard-smis-data'

export const trainingPlan: SmisSafetyTrainingPlan = {
  id: recordId,
  tenantId,
  planNo: 'TP-SMIS',
  subject: '验收设备安全培训',
  trainingCategory: 'annual',
  trainingType: 'safety_education',
  trainingForm: 'centralized_lecture',
  trainingLevel: 'company',
  organizerOrganizationId: organizationId,
  organizerOrganizationName: organization.organizationName,
  plannedStartAt: '2026-11-02T01:00:00Z',
  plannedEndAt: '2026-11-02T09:00:00Z',
  location: '验收培训室',
  content: '验收安全规程培训内容',
  requirements: '验收全员签到',
  trainingHours: 4,
  assessmentMethod: 'none',
  warningStatus: 'normal',
  status: 'draft',
  executionStatus: 'not_started',
  attachmentUrls: [],
  participantCount: 1,
  participants: [
    {
      employeeId,
      employeeNo: 'EMP-SMIS',
      employeeName: '验收参训人',
      organizationId,
      organizationName: organization.organizationName
    }
  ],
  createTime: timestamp,
  updateTime: timestamp
}
export const trainingRecord: SmisSafetyTrainingRecord = {
  id: recordId,
  tenantId,
  trainingPlanId: recordId,
  recordNo: 'TR-SMIS',
  planNo: 'TP-SMIS',
  subject: trainingPlan.subject,
  trainingCategory: trainingPlan.trainingCategory,
  trainingType: trainingPlan.trainingType,
  trainingForm: trainingPlan.trainingForm,
  trainingLevel: trainingPlan.trainingLevel,
  organizerOrganizationId: organizationId,
  organizerOrganizationName: organization.organizationName,
  assessmentMethod: 'none',
  actualStartAt: timestamp,
  actualEndAt: timestamp,
  location: '验收培训室',
  trainingContent: trainingPlan.content,
  trainingHours: 4,
  effectEvaluation: '验收培训效果良好',
  attachmentUrls: [],
  signInAttachmentUrls: [],
  status: 'draft',
  participantCount: 1,
  presentCount: 1,
  attendanceRate: 100,
  participants: [
    {
      ...trainingPlan.participants[0]!,
      attendanceStatus: 'present',
      checkInAt: timestamp,
      signMethod: 'manual',
      assessmentResult: 'not_assessed'
    }
  ],
  createTime: timestamp,
  updateTime: timestamp
}
export const announcement: SmisAnnouncement = {
  id: recordId,
  tenantId,
  categoryId: itemId,
  categoryName: '验收公告分类',
  title: '验收安全公告',
  contentHtml: '<p>验收安全公告正文</p>',
  contentText: '验收安全公告正文',
  lifecycleStatus: 'draft',
  displayStatus: 'draft',
  audienceType: 'all',
  effectiveStartDate: '2026-11-01',
  isPinned: false,
  attachmentUrls: [],
  createByName: '验收管理员',
  audienceEmployees: [],
  audienceOrganizations: [],
  myRead: false,
  readCount: 0,
  createTime: timestamp,
  updateTime: timestamp
}
export const equipmentCategory: SmisEquipmentCategory = {
  id: itemId,
  categoryCode: 'EC-SMIS',
  categoryName: '验收通用设备',
  profileType: 'general',
  status: 'enabled',
  sort: 10,
  childCount: 0,
  inspectionCategories: []
}
export const equipment: SmisEquipment = {
  id: recordId,
  sort: 10,
  categoryId: itemId,
  usingOrganizationId: organizationId,
  managingOrganizationId: organizationId,
  equipmentCode: 'EQ-SMIS',
  equipmentName: '验收装配设备',
  equipmentKind: 'general',
  useStatus: 'in_use',
  operationStatus: 'normal',
  assetStatus: 'active',
  importanceLevel: 'normal',
  qrToken: 'smis-e2e',
  isMajorHazardSource: false,
  isSpecialEquipment: false,
  status: 'enabled',
  category: equipmentCategory,
  usingOrganization: organization,
  managingOrganization: organization,
  pressureGaugeIds: [],
  safetyValveIds: [],
  attachmentCount: 0,
  inspectionCount: 0
}
export const accidentReport: SmisAccidentReport = {
  id: recordId,
  accidentNo: 'AR-SMIS',
  accidentName: '验收机械伤害快报',
  reporterEmployeeId: employeeId,
  reporterEmployee: {
    id: employeeId,
    tenantId,
    employeeNo: 'EMP-SMIS',
    employeeName: '验收上报人',
    employmentStatus: 'active',
    organizationId,
    organization
  },
  accidentTime: timestamp,
  accidentLocation: '验收装配区',
  accidentCategories: ['mechanical_injury'],
  operationAreaOrganizationId: organizationId,
  accidentLevel: 'general',
  indirectEconomicLoss: 1,
  minorInjuryCount: 1,
  seriousInjuryCount: 0,
  deathCount: 0,
  onSiteCount: 2,
  briefDescription: '验收机械伤害事故经过',
  causeAnalysis: '验收防护未到位',
  resultDetermination: '验收判定内容',
  imageUrls: [],
  measures: [
    {
      id: itemId,
      plannedMeasure: '验收增加固定防护罩',
      plannedImplementationDate: '2026-11-03',
      responsibleEmployeeId: employeeId,
      responsibleEmployee: {
        id: employeeId,
        tenantId,
        employeeNo: 'EMP-SMIS',
        employeeName: '验收措施负责人',
        employmentStatus: 'active'
      },
      sort: 10
    }
  ],
  people: []
}
export const questionCategory: SmisQuestionCategory = {
  id: itemId,
  categoryName: '验收安全题库',
  status: 'enabled',
  sort: 10,
  questionCount: 1
}
export const question: SmisQuestion = {
  id: recordId,
  categoryId: itemId,
  categoryName: questionCategory.categoryName,
  questionType: 'judgement',
  stem: '验收操作前应确认防护装置可靠',
  options: [
    { key: 'A', content: '正确' },
    { key: 'B', content: '错误' }
  ],
  correctAnswers: ['A'],
  defaultScore: 100,
  status: 'enabled',
  createTime: timestamp,
  updateTime: timestamp
}
