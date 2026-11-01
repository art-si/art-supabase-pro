import type { SmisEmergencyDrillPlan, SmisEmergencyRescuePlan } from '@smis/api'
import {
  employeeId,
  itemId,
  organization,
  organizationId,
  recordId,
  tenantId,
  timestamp
} from './form-standard-smis-data'

export const rescuePlan: SmisEmergencyRescuePlan = {
  id: recordId,
  planNo: 'ERP-SMIS-0001',
  planName: '验收综合应急预案',
  planVersion: 'A',
  applicableOrganizationId: organizationId,
  applicableOrganizationName: organization.organizationName,
  isPublicScope: false,
  planCategory: 'comprehensive',
  applicablePositionIds: [itemId],
  applicablePositions: [{ id: itemId, positionCode: 'POST-SMIS', positionName: '验收安全岗' }],
  frequency: 'quarterly',
  reviewDate: '2026-10-31',
  reviewExperts: '验收评审专家',
  planAttachmentUrls: [],
  filingAttachmentUrls: [],
  isSpecialEquipmentDrill: false,
  planLevel: 'company',
  isValid: true,
  warningStatus: 'normal',
  recordStatus: 'submitted',
  description: '验收应急预案响应范围',
  drillDraftCount: 1,
  createTime: timestamp,
  updateTime: timestamp
}
export const drillPlan: SmisEmergencyDrillPlan = {
  id: recordId,
  planNo: 'EDP-SMIS-0001',
  drillName: '验收消防应急演练',
  sourcePlanId: recordId,
  sourcePlanNo: rescuePlan.planNo,
  sourcePlanName: rescuePlan.planName,
  compilationOrganizationId: organizationId,
  compilationOrganizationName: organization.organizationName,
  applicableOrganizationId: organizationId,
  applicableOrganizationName: organization.organizationName,
  drillForm: 'onsite',
  planCategory: 'comprehensive',
  responsibleEmployeeId: employeeId,
  responsibleEmployeeNo: 'EMP-SMIS',
  responsibleEmployeeName: '验收责任人',
  planStartDate: '2026-11-01',
  planEndDate: '2026-11-02',
  drillLocation: '验收装配区',
  drillSubject: '验收消防疏散科目',
  drillPurpose: '验收人员响应和协作',
  planLevel: 'company',
  isSpecialEquipmentDrill: false,
  attachmentUrls: [],
  remark: '验收演练计划资料',
  status: 'planned',
  warningStatus: 'normal',
  trainees: [
    {
      id: employeeId,
      tenantId,
      employeeNo: 'EMP-SMIS',
      employeeName: '验收参演人',
      employmentStatus: 'active'
    }
  ],
  createTime: timestamp,
  updateTime: timestamp
}
export const historicalCase = {
  id: recordId,
  accidentName: '验收机械伤害事故案例',
  accidentCategories: ['mechanical_injury'],
  accidentLevel: 'general',
  accidentOrganizationId: organizationId,
  occurrenceDate: '2026-10-01',
  caseStatus: 'in_use',
  applicableCompanyId: organizationId,
  summary: '验收事故经过与防范摘要',
  content: '验收事故经过、原因分析、处置过程和防范建议。',
  imageUrls: [],
  attachmentUrls: []
}
export const depreciation = {
  id: recordId,
  depreciationNo: 'DEP-SMIS-0001',
  depreciationName: '验收两年平均折旧',
  depreciationYears: 2,
  depreciationPeriodMonths: 24,
  status: 'active',
  remark: '验收资产折旧口径',
  annualRates: [
    { id: itemId, depreciationYear: 1, depreciationRate: 50 },
    { id: recordId, depreciationYear: 2, depreciationRate: 50 }
  ]
}
