import { uniq } from 'lodash-es'

type AccessLevel = Api.Common.FieldAccessLevel
type PermissionField = Api.SystemManage.FieldPermissionField
type AuditLog = Api.SystemManage.FieldPermissionAuditLog

export interface FieldPermissionAuditChange {
  fieldKey: string
  fieldLabel: string
  beforeAccess: AccessLevel | null
  afterAccess: AccessLevel | null
}

export function getFieldPermissionAuditChanges(
  auditLog: AuditLog,
  fields: PermissionField[]
): FieldPermissionAuditChange[] {
  const fieldLabelByKey = new Map(fields.map((field) => [field.fieldKey, field.fieldLabel]))
  const fieldKeys = uniq([
    ...Object.keys(auditLog.beforeValue),
    ...Object.keys(auditLog.afterValue)
  ])

  return fieldKeys
    .filter((fieldKey) => auditLog.beforeValue[fieldKey] !== auditLog.afterValue[fieldKey])
    .map((fieldKey) => ({
      fieldKey,
      fieldLabel: fieldLabelByKey.get(fieldKey) ?? fieldKey,
      beforeAccess: auditLog.beforeValue[fieldKey] ?? null,
      afterAccess: auditLog.afterValue[fieldKey] ?? null
    }))
}
