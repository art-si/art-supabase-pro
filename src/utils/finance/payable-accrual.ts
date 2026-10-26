import dayjs from 'dayjs'
import { normalizeNonNullableText } from '@/utils/form/normalize'
import type { PayableAccrualInput } from '@/api/payable-accrual'

export function newPayableAccrualPolicy(): PayableAccrualInput {
  return {
    id: undefined,
    code: '',
    name: '',
    organizationId: '',
    accountSetId: '',
    effectiveFrom: dayjs().format('YYYY-MM-DD'),
    enabled: false,
    autoApprove: false,
    taxExcludedFromCost: true,
    remark: '',
    version: 0
  }
}

export function buildPayableAccrualPolicyPayload(policy: PayableAccrualInput): PayableAccrualInput {
  return {
    id: policy.id,
    code: normalizeNonNullableText(policy.code).toUpperCase(),
    name: normalizeNonNullableText(policy.name),
    organizationId: policy.organizationId,
    accountSetId: policy.accountSetId,
    effectiveFrom: policy.effectiveFrom,
    enabled: policy.enabled,
    autoApprove: policy.autoApprove,
    taxExcludedFromCost: policy.taxExcludedFromCost,
    remark: normalizeNonNullableText(policy.remark),
    version: policy.version
  }
}
