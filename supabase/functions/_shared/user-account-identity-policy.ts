export const USER_ACCOUNT_IDENTITY_TYPES = [
  'employee',
  'external',
  'service',
  'platform',
  'pending_review'
] as const

export type UserAccountIdentityType = (typeof USER_ACCOUNT_IDENTITY_TYPES)[number]

export interface UserAccountIdentityPolicyInput {
  identityType: unknown
  employeeId: unknown
  remark: unknown
  tenantBuiltinType: unknown
  callerIsPlatformSuper: boolean
}

export function isUserAccountIdentityType(value: unknown): value is UserAccountIdentityType {
  return (
    typeof value === 'string' &&
    USER_ACCOUNT_IDENTITY_TYPES.includes(value as UserAccountIdentityType)
  )
}

export function validateUserAccountIdentity(
  input: UserAccountIdentityPolicyInput
): string | null {
  if (!isUserAccountIdentityType(input.identityType)) return '请选择有效的账号身份'
  if (input.identityType === 'pending_review') return '历史待确认账号必须先完成人员身份归类'

  const employeeId = typeof input.employeeId === 'string' ? input.employeeId.trim() : ''
  if (input.identityType === 'employee') {
    if (!employeeId) return '员工账号必须关联员工花名册'
    if (input.tenantBuiltinType === 'platform' || input.tenantBuiltinType === 'public_register') {
      return '系统预置租户不能创建员工账号'
    }
    return null
  }

  if (employeeId) return '非员工账号不能关联员工花名册'

  if (input.identityType === 'platform') {
    if (input.tenantBuiltinType !== 'platform' || !input.callerIsPlatformSuper) {
      return '平台治理账号只能由平台超级管理员在平台租户内维护'
    }
    return null
  }

  const remark = typeof input.remark === 'string' ? input.remark.trim() : ''
  if (!remark) return '请填写非员工账号的用途说明'
  return null
}
