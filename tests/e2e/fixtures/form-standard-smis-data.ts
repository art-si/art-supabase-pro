import type {
  SmisHiddenHazardInspectionPlan,
  SmisHiddenHazardInspectionPlanDetail,
  SmisRiskControlPoint,
  SmisRiskPoint,
  SmisSpecialOperationPermit,
  SmisSpecialOperationType
} from '@smis/api'

export const tenantId = '11111111-1111-4111-8111-111111111111'
export const recordId = '22222222-2222-4222-8222-222222222222'
export const employeeId = '33333333-3333-4333-8333-333333333333'
export const organizationId = '44444444-4444-4444-8444-444444444444'
export const itemId = '55555555-5555-4555-8555-555555555555'
export const operationTypeId = '66666666-6666-4666-8666-666666666666'
export const frequencyId = '77777777-7777-4777-8777-777777777777'
export const timestamp = '2026-10-31T08:00:00+08:00'
export const dictionaries: Record<
  string,
  Array<{ label: string; value: string; remark?: string }>
> = {
  smisControlLevel: [{ label: '班组级', value: 'team' }],
  smisRiskControlLevel: [{ label: '班组级', value: 'team' }],
  smisRiskInspectionResult: [{ label: '正常', value: 'normal' }],
  smisHiddenHazardInspectionResult: [{ label: '正常', value: 'normal' }],
  smisCourseCategory: [{ label: '安全生产', value: 'safety_production' }],
  smisCourseType: [{ label: '视频', value: 'video' }],
  smisQuestionType: [
    { label: '单选题', value: 'single' },
    { label: '判断题', value: 'judgement' }
  ],
  smisQuestionStatus: [{ label: '启用', value: 'enabled' }],
  smisExamAssemblyMode: [
    { label: '固定组卷', value: 'fixed' },
    { label: '随机组卷', value: 'random' }
  ],
  smisHiddenHazardGovernanceStatus: [
    { label: '已完成', value: 'completed' },
    { label: '待核准', value: 'pending_approval' }
  ],
  smisHiddenHazardSourceType: [{ label: '快速上报', value: 'quick_report' }],
  smisHiddenHazardApprovalResult: [{ label: '整改', value: 'rectify' }],
  smisHiddenHazardAcceptanceResult: [{ label: '通过', value: 'passed' }],
  smisHiddenHazardTaskStatus: [{ label: '已完成', value: 'completed' }],
  smisRiskInspectionTaskStatus: [{ label: '已完成', value: 'completed' }],
  smisThreeViolationEducationStatus: [{ label: '已教育', value: 'educated' }],
  smisThreeViolationWarningStatus: [{ label: '正常', value: 'normal' }],
  smisAnnouncementAudienceType: [{ label: '全体人员', value: 'all' }],
  smisSafetyTrainingCategory: [{ label: '年度培训', value: 'annual' }],
  smisSafetyTrainingType: [{ label: '安全教育', value: 'safety_education' }],
  smisSafetyTrainingForm: [{ label: '集中授课', value: 'centralized_lecture' }],
  smisSafetyTrainingLevel: [{ label: '公司级', value: 'company' }],
  smisSafetyTrainingAssessmentMethod: [{ label: '无需考核', value: 'none' }],
  smisSafetyTrainingAttendanceStatus: [
    { label: '已签到', value: 'present' },
    { label: '待签到', value: 'pending' }
  ],
  smisSafetyTrainingSignMethod: [{ label: '手工签到', value: 'manual' }],
  smisSafetyTrainingAssessmentResult: [{ label: '未考核', value: 'not_assessed' }],
  smisEquipmentKind: [{ label: '通用设备', value: 'general' }],
  smisEquipmentUseStatus: [{ label: '在用', value: 'in_use' }],
  smisEquipmentOperationStatus: [{ label: '正常', value: 'normal' }],
  smisEquipmentAssetStatus: [{ label: '有效', value: 'active' }],
  smisEquipmentImportanceLevel: [{ label: '普通', value: 'normal' }],
  smisControlMeasureCategory: [{ label: '工程措施', value: 'engineering' }],
  smisPrimaryHazardCategory: [{ label: '基础管理', value: 'basic_management' }],
  smisSecondaryHazardCategory: [
    { label: '安全规章', value: 'safety_rules', remark: 'basic_management' }
  ],
  smisFrequencyUnit: [{ label: '天', value: 'day' }],
  commonIssuanceCycle: [{ label: '年', value: 'year' }],
  smisSpecialOperationFieldType: [{ label: '文本', value: 'text' }],
  supplierCategory: [{ label: '材料供应商', value: 'material_supplier' }],
  supplierType: [{ label: '一般供应商', value: 'general' }],
  enterpriseNature: [{ label: '民营', value: 'private' }],
  supplierIndustry: [{ label: '生产制造业', value: 'manufacturing' }],
  smisRiskPointType: [{ label: '设备设施', value: 'equipment' }],
  smisSiteCategory: [{ label: '车间', value: 'workshop' }],
  commonEnabledDisabledStatus: [
    { label: '启用', value: 'enabled' },
    { label: '停用', value: 'disabled' }
  ],
  commonEnabledDisabledVoidedStatus: [{ label: '启用', value: 'enabled' }],
  commonDeadlineUnit: [{ label: '天', value: 'day' }],
  commonPlanCycle: [
    { label: '不循环', value: 'once' },
    { label: '周', value: 'week' }
  ],
  smisSpecialOperationPermitStatus: [{ label: '草稿', value: 'draft' }],
  commonEnabledStatus: [{ label: '启用', value: 'enabled' }],
  commonBoolean: [
    { label: '否', value: 'false' },
    { label: '是', value: 'true' }
  ],
  commonDraftSubmittedStatus: [{ label: '已提交', value: 'submitted' }],
  smisEquipmentInspectionConclusion: [{ label: '可使用', value: 'operable' }],
  smisEquipmentInspectionStatus: [{ label: '已完成', value: 'completed' }],
  smisEquipmentInspectionReminderMonths: [{ label: '提前 1 个月', value: '1' }],
  smisHazardSourceLevel: [{ label: '四级', value: 'level_4' }],
  smisHazardSourceRiskLevel: [{ label: '低风险', value: 'low' }],
  smisHazardLevel: [{ label: '一般隐患', value: 'general' }],
  mdmMaterialSource: [{ label: '外购', value: 'purchase' }],
  smisMaterialUnit: [{ label: '千克', value: 'KG' }],
  smisHazardousWasteSafetyMeasure: [{ label: '密闭保存', value: 'sealed' }],
  smisHazardousWasteCharacteristic: [{ label: '易燃', value: 'flammable' }],
  smisTagStyle: [{ label: '警示', value: 'warning' }],
  smisEmergencyPlanCategory: [{ label: '综合应急预案', value: 'comprehensive' }],
  smisEmergencyPlanFrequency: [{ label: '每季度', value: 'quarterly' }],
  smisEmergencyPlanLevel: [{ label: '公司级', value: 'company' }],
  smisEmergencyDrillForm: [{ label: '现场演练', value: 'onsite' }],
  commonWarningStatus: [{ label: '正常', value: 'normal' }],
  smisAccidentCategory: [{ label: '机械伤害', value: 'mechanical_injury' }],
  smisAccidentLevel: [{ label: '一般事故', value: 'general' }],
  smisAccidentCaseStatus: [{ label: '在用', value: 'in_use' }],
  smisEquipmentDepreciationStatus: [{ label: '启用', value: 'active' }],
  smisEmergencyDrillPlanStatus: [{ label: '已计划', value: 'planned' }]
}

export const supplier = {
  id: recordId,
  supplierCode: 'SUP-SMIS',
  supplierName: '验收安全服务供应商',
  supplierCategory: 'material_supplier',
  supplierGroup: '华东区域',
  supplierType: 'general',
  enterpriseNature: 'private',
  industry: 'manufacturing',
  contactPerson: '验收联系人',
  contactPhone: '13800000000',
  region: '',
  regionAdcode: '',
  addressDetail: '上海市验收路 1 号',
  longitude: 121.47,
  latitude: 31.23,
  coordinateSystem: 'gcj02',
  remark: '验收合作范围'
}

export const organization = {
  id: organizationId,
  parentId: null,
  organizationCode: 'ORG-SMIS',
  organizationName: '验收安全部'
}
export const riskPoint: SmisRiskPoint = {
  id: recordId,
  pointNo: 'RP-00001',
  pointName: '验收装配区风险点',
  riskType: 'equipment',
  siteId: itemId,
  siteName: '验收装配区',
  equipmentId: operationTypeId,
  equipmentName: '验收设备',
  isSpecialEquipment: false,
  controlPlanName: '验收风险管控方案',
  controlPlanAttachmentUrls: [],
  photoUrls: [],
  attachmentUrls: [],
  status: 'enabled',
  sort: 10,
  organizations: [organization],
  hazardCount: 1,
  activityCount: 1,
  riskScore: 20,
  riskLevel: 'low'
}
export const riskOptions = {
  sites: [
    {
      id: itemId,
      siteName: '验收装配区',
      organizationId,
      organizationName: '验收安全部',
      categoryCode: 'workshop'
    }
  ],
  organizations: [organization],
  equipment: [
    {
      id: operationTypeId,
      equipmentCode: 'EQ-SMIS',
      equipmentName: '验收设备',
      isSpecialEquipment: false,
      usingOrganizationId: organizationId
    }
  ],
  hazardCategories: []
}
export const controlPoint: SmisRiskControlPoint = {
  riskPointId: recordId,
  riskPointNo: 'RP-00001',
  riskPointName: '验收装配区风险点',
  riskPointType: 'equipment',
  siteName: '验收装配区',
  riskLevelCode: 'low',
  riskLevelName: '低风险',
  riskLevelColor: '#00897b',
  accidentTypes: [],
  planId: recordId,
  controlStartAt: timestamp,
  controlDescription: '验收总体管控要求',
  controlStatus: 'active',
  controlLevels: ['company'],
  responsibleNames: '验收责任人',
  taskCount: 1,
  assignments: [
    {
      controlLevel: 'company',
      responsibleEmployeeId: employeeId,
      responsibleEmployeeNo: 'EMP-SMIS',
      responsibleEmployeeName: '验收责任人',
      responsibleOrganizationId: organizationId,
      responsibleOrganizationName: '验收安全部',
      duplicateConfigurationId: frequencyId,
      frequencyLabel: '每周一次',
      controlMeasure: '验收层级巡查要求',
      sort: 1
    }
  ]
}
export const controlOptions = {
  riskPoints: [{ id: recordId, pointNo: riskPoint.pointNo, pointName: riskPoint.pointName }],
  duplicateConfigurations: [{ id: frequencyId, displayLabel: '每周一次' }]
}

export const plan: SmisHiddenHazardInspectionPlan = {
  id: recordId,
  planNo: 'HP-SMIS-0001',
  planName: '验收月度隐患排查计划',
  inspectionTypeId: operationTypeId,
  inspectionTypeName: '日常检查',
  inspectionTypeCode: 'DAILY',
  inspectionOrganizationId: organizationId,
  inspectionOrganizationName: '验收安全部',
  inspectedOrganizationId: organizationId,
  inspectedOrganizationName: '验收安全部',
  executorEmployeeId: employeeId,
  executorEmployeeName: '验收执行人',
  executorEmployeeNo: 'EMP-SMIS',
  plannedStartAt: '2026-11-01T08:00:00+08:00',
  plannedEndAt: '2026-11-30T18:00:00+08:00',
  taskDeadlineValue: 2,
  taskDeadlineUnit: 'day',
  cycleType: 'week',
  cycleInterval: 1,
  attachmentUrls: [],
  inspectionDescription: '检查装配区设备防护及消防通道',
  status: 'enabled',
  itemCount: 1,
  taskCount: 1,
  createBy: '验收管理员',
  createTime: timestamp,
  updateTime: timestamp
}
export const planDetail: SmisHiddenHazardInspectionPlanDetail = {
  ...plan,
  items: [
    {
      id: itemId,
      inspectionItemId: itemId,
      standardCode: 'STD-SMIS',
      standardName: '验收安全检查标准',
      itemCode: 'CHECK-001',
      inspectionContent: '防护罩完整且安装可靠',
      sort: 1
    }
  ]
}
export const planOptions = {
  inspectionTypes: [
    { id: operationTypeId, typeCode: 'DAILY', typeName: '日常检查', status: 'enabled' }
  ],
  organizations: [organization]
}

export const operationType: SmisSpecialOperationType = {
  id: operationTypeId,
  tenantId,
  typeCode: 'BLIND_PLATE',
  typeName: '盲板抽堵作业',
  remark: '验收特殊作业类型',
  sort: 10,
  textColor: null,
  tagStyle: 'primary',
  status: 'enabled',
  fieldCount: 1,
  fieldDefinitions: [
    {
      fieldCode: 'isolation_plan',
      fieldLabel: '隔离方案',
      fieldType: 'text',
      required: true,
      placeholder: '请填写隔离方案',
      unit: null,
      options: [],
      sort: 1
    }
  ],
  createBy: '验收管理员',
  createTime: timestamp,
  updateBy: '验收管理员',
  updateTime: timestamp
}
export const person = {
  employeeId,
  employeeName: '验收责任人',
  employeeNo: 'EMP-SMIS',
  organizationName: '验收安全部',
  phone: '13800000000',
  certificateName: '特种作业证',
  certificateNumber: 'CERT-SMIS'
}
export const permit: SmisSpecialOperationPermit = {
  id: recordId,
  tenantId,
  permitNo: 'SO-SMIS-0001',
  operationTypeId,
  operationTypeCode: 'BLIND_PLATE',
  operationTypeName: '盲板抽堵作业',
  workContent: '验收设备检修隔离',
  workStartTime: '2026-11-01T08:00:00+08:00',
  workEndTime: '2026-11-01T18:00:00+08:00',
  workLocation: '验收装配区',
  workUnit: '验收安全部',
  workSection: '一号管线',
  hotWorkLevel: null,
  hotWorkMethods: [],
  hazardFactors: [],
  responsibleEmployee: person,
  guardianEmployees: [person],
  verifierEmployees: [person],
  briefingGiverEmployees: [person],
  briefingReceiverEmployees: [person],
  workers: [person],
  analysts: [person],
  siteAnalysisRecords: [],
  relatedPermits: [],
  safetyMeasures: [{ id: itemId, itemName: '确认可靠隔离', involved: true }],
  customValues: {
    isolation_plan: '验收隔离方案 A',
    blind_plate_items: [
      {
        id: itemId,
        equipmentPipelineName: '验收一号管线',
        medium: '水',
        temperature: '20 ℃',
        pressure: '0.1 MPa',
        material: '碳钢',
        specification: 'DN100',
        blindPlateNo: 'BP-SMIS-001'
      }
    ]
  },
  workDescription: '验收作业过程说明',
  sitePhotoUrls: [],
  applicantName: '验收申请人',
  applicationTime: timestamp,
  currentNode: '草稿',
  status: 'draft',
  events: [
    {
      id: itemId,
      eventType: 'create',
      eventTitle: '创建验收作业票',
      operatorName: '验收管理员',
      createTime: timestamp
    }
  ],
  createTime: timestamp,
  updateTime: timestamp
}
