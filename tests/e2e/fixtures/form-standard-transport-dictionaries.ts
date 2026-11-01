import { formStandardDictionaries } from './form-standard-modules-data'

export const formStandardTransportDictionaries: Record<string, { label: string; value: string }[]> =
  {
    ...formStandardDictionaries,
    commonBoolean: [
      { label: '是', value: 'true' },
      { label: '否', value: 'false' }
    ],
    fuelCardEntryType: [
      { label: '期初', value: 'opening' },
      { label: '充值', value: 'recharge' },
      { label: '消费', value: 'consume' },
      { label: '冲正', value: 'reversal' }
    ],
    fuelCardStatus: [
      { label: '正常', value: 'active' },
      { label: '停用', value: 'disabled' }
    ],
    hrEthnicity: [{ label: '汉族', value: '汉族' }],
    parts_unit: [{ label: '件', value: '件' }],
    sex: [
      { label: '男', value: 'male' },
      { label: '女', value: 'female' }
    ],
    status: [
      { label: '启用', value: '1' },
      { label: '停用', value: '0' }
    ],
    tmsCargoUnit: [{ label: '件', value: '件' }],
    tmsCarrierType: [{ label: '企业', value: 'enterprise' }],
    tmsCarrierDispatchChannel: [{ label: '线下', value: 'offline' }],
    tmsComplaintType: [{ label: '时效', value: 'timeliness' }],
    tmsContractBillingMethod: [{ label: '月结', value: 'monthly' }],
    tmsContractBusinessType: [
      { label: '客户业务', value: 'customer' },
      { label: '承运业务', value: 'carrier' }
    ],
    tmsContractCategory: [
      { label: '运输合同', value: 'transport' },
      { label: '年度框架', value: 'annual_framework' }
    ],
    tmsContractTransportMode: [{ label: '公路', value: 'road' }],
    tmsCustomerIndustry: [{ label: '制造业', value: 'manufacturing' }],
    tmsCustomerLevel: [{ label: '普通客户', value: 'general' }],
    tmsCustomerTag: [{ label: '长期合作', value: 'long_term' }],
    tmsDriverAuthStatus: [
      { label: '待认证', value: 'pending' },
      { label: '已认证', value: 'approved' }
    ],
    tmsDriverLicenseType: [{ label: 'A2', value: 'A2' }],
    tmsDriverOwnership: [
      { label: '自有司机', value: 'self' },
      { label: '承运商司机', value: 'carrier' }
    ],
    tmsDriverQualificationType: [{ label: '道路运输', value: 'road_transport' }],
    tmsDriverRegistrationStatus: [{ label: '已登记', value: 'registered' }],
    tmsDriverStatus: [{ label: '在岗', value: 'on_duty' }],
    tmsDriverType: [
      { label: '主司机', value: 'primary' },
      { label: '副司机', value: 'secondary' }
    ],
    tmsElectronicContractStatus: [
      { label: '已签署', value: 'signed' },
      { label: '待签署', value: 'pending_signed' }
    ],
    tmsOrderQuoteExpenseItem: [{ label: '停车费', value: 'parking' }],
    tmsOrderQuoteStatus: [{ label: '草稿', value: 'draft' }],
    tmsServiceCaseStatus: [{ label: '待回复', value: 'pending' }],
    tmsServiceType: [
      { label: '咨询', value: 'inquiry' },
      { label: '投诉', value: 'complaint' }
    ],
    tmsStationType: [{ label: '发货', value: 'shipping' }],
    tmsWaybillStatus: [{ label: '运输中', value: 'transporting' }],
    vehicleAccidentDataSource: [{ label: '自行上报', value: 'self' }],
    vehicleAccidentResponsibility: [{ label: '全责', value: 'full' }],
    vehicleMaintenanceType: [
      { label: '维修', value: 'repair' },
      { label: '保养', value: 'maintenance' }
    ],
    vehicleOwnership: [{ label: '自营', value: 'self_operated' }],
    vehiclePartQualityCategory: [{ label: '原厂', value: 'original' }],
    vehiclePartType: [{ label: '原厂', value: 'original' }],
    vehiclePartEnableMode: [
      { label: '随车辆启用', value: 'vehicle' },
      { label: '指定日期', value: 'date' }
    ],
    vehiclePartWarrantyMode: [
      { label: '随车辆质保', value: 'vehicle' },
      { label: '单独质保', value: 'self' }
    ],
    vehiclePartUsageStatus: [
      { label: '正常使用', value: 'normal' },
      { label: '已报废', value: 'scrapped' }
    ],
    vehiclePlateColor: [{ label: '黄牌', value: 'yellow' }],
    vehicleRoutineInspectionResult: [{ label: '合格', value: 'qualified' }],
    vehicleRoutineInspectionType: [{ label: '日常例检', value: 'daily' }],
    vehicleTypeCategory: [{ label: '验收车型', value: '验收车型' }]
  }
