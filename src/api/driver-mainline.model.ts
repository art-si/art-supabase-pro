import { isPlainObjectRecord } from '@/utils/type-guards'

export type DriverSafetyKind = 'violation' | 'accident'

export interface DriverSafetyRecord {
  id: string
  vehicleId: string | null
  plateNo: string
  occurredAt: string
  summary: string | null
  location: string | null
  penaltyPoints: string | null
  damageLevel: string | null
  processed: boolean
}

export interface DriverSafetyPage {
  available: boolean
  data: DriverSafetyRecord[]
  total: number
}

export interface DriverQualification {
  id: string
  name: string
  type: string | null
  status: string | null
  verificationStatus: string | null
  expiryDate: string | null
}

export interface DriverQualificationPage {
  available: boolean
  linkedEmployee: boolean
  data: DriverQualification[]
  total: number
}

export interface DriverTraining {
  id: string
  name: string
  type: string | null
  startDate: string | null
  endDate: string | null
  result: string | null
}

export interface DriverTrainingResult {
  available: boolean
  data: DriverTraining[]
}

function textValue(row: Record<string, unknown>, key: string): string | null {
  const value = row[key]
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new Error('司机主线记录格式异常，请刷新后重试')
}

function requiredText(row: Record<string, unknown>, key: string): string {
  const value = textValue(row, key)
  if (!value) throw new Error('司机主线记录不完整，请刷新后重试')
  return value
}

export function parseDriverSafetyPage(value: unknown, kind: DriverSafetyKind): DriverSafetyPage {
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('司机安全记录查询结果异常，请刷新后重试')
  }
  if (typeof value.available !== 'boolean') {
    throw new Error('司机安全记录权限结果异常，请刷新后重试')
  }
  if (typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Error('司机安全记录总数异常，请刷新后重试')
  }
  if (!value.available && (value.total !== 0 || value.records.length > 0)) {
    throw new Error('司机安全记录权限结果异常，请刷新后重试')
  }
  return {
    available: value.available,
    total: value.total,
    data: value.records.map((item: unknown) => {
      if (!isPlainObjectRecord(item) || typeof item.processed !== 'boolean') {
        throw new Error('司机安全记录格式异常，请刷新后重试')
      }
      return {
        id: requiredText(item, 'id'),
        vehicleId: textValue(item, 'vehicleId'),
        plateNo: requiredText(item, 'plateNo'),
        occurredAt: requiredText(item, kind === 'violation' ? 'violationTime' : 'accidentTime'),
        summary: textValue(item, kind === 'violation' ? 'violationBehavior' : 'accidentSummary'),
        location: textValue(item, kind === 'violation' ? 'violationLocation' : 'accidentLocation'),
        penaltyPoints: kind === 'violation' ? textValue(item, 'penaltyPoints') : null,
        damageLevel: kind === 'accident' ? textValue(item, 'damageLevel') : null,
        processed: item.processed
      } satisfies DriverSafetyRecord
    })
  }
}

export function parseDriverQualificationPage(value: unknown): DriverQualificationPage {
  if (!isPlainObjectRecord(value) || !Array.isArray(value.records)) {
    throw new Error('司机资质查询结果异常，请刷新后重试')
  }
  if (typeof value.available !== 'boolean' || typeof value.linkedEmployee !== 'boolean') {
    throw new Error('司机资质权限结果异常，请刷新后重试')
  }
  if (typeof value.total !== 'number' || !Number.isSafeInteger(value.total) || value.total < 0) {
    throw new Error('司机资质总数异常，请刷新后重试')
  }
  if (!value.available && (value.total !== 0 || value.records.length > 0)) {
    throw new Error('司机资质权限结果异常，请刷新后重试')
  }
  return {
    available: value.available,
    linkedEmployee: value.linkedEmployee,
    total: value.total,
    data: value.records.map((item: unknown) => {
      if (!isPlainObjectRecord(item)) throw new Error('司机资质数据格式异常，请刷新后重试')
      return {
        id: requiredText(item, 'id'),
        name: requiredText(item, 'qualificationName'),
        type: textValue(item, 'qualificationType'),
        status: textValue(item, 'status'),
        verificationStatus: textValue(item, 'verificationStatus'),
        expiryDate: textValue(item, 'expiryDate')
      } satisfies DriverQualification
    })
  }
}

export function parseDriverTrainingResult(value: unknown): DriverTrainingResult {
  if (!isPlainObjectRecord(value) || !isPlainObjectRecord(value.fieldAccess)) {
    throw new Error('司机培训查询结果异常，请刷新后重试')
  }
  const careerAccess = value.fieldAccess.careerRecords
  if (careerAccess !== 'read' && careerAccess !== 'edit') {
    return { available: false, data: [] }
  }
  if (!Array.isArray(value.trainings)) {
    throw new Error('司机培训数据格式异常，请刷新后重试')
  }
  return {
    available: true,
    data: value.trainings.map((item: unknown) => {
      if (!isPlainObjectRecord(item)) throw new Error('司机培训数据格式异常，请刷新后重试')
      return {
        id: requiredText(item, 'id'),
        name: requiredText(item, 'trainingName'),
        type: textValue(item, 'trainingType'),
        startDate: textValue(item, 'startDate'),
        endDate: textValue(item, 'endDate'),
        result: textValue(item, 'trainingResult')
      } satisfies DriverTraining
    })
  }
}
