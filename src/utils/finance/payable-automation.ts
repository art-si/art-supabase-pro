import type {
  PayableAutomationBook,
  PayableAutomationInput,
  PayableAutomationJob
} from '@/api/payable-automation.types'
import type { PayableReference, PayableWriteoffRelation } from '@/api/payable-reference'
import { normalizeNonNullableText } from '@/utils/form/normalize'
import { isPayableWriteoffRelation, payableSchemeApplies } from './payable-match'

export function newPayableAutomationConfiguration(
  scheme?: PayableReference,
  relation: PayableWriteoffRelation = 'payable_payment'
): PayableAutomationInput {
  const selected =
    scheme && !payableSchemeApplies(scheme, relation)
      ? scheme.relationRules?.[0]?.relation
      : relation
  return {
    name: '',
    schemeId: scheme?.id || '',
    expectedSchemeVersion: scheme?.version,
    accountSetId: '',
    enabled: false,
    relations: selected ? [selected] : [],
    allowCrossParty: false,
    crossCurrencyMode: 'same_currency',
    processExisting: false
  }
}

export function validatePayableAutomationConfiguration(
  configuration: PayableAutomationInput,
  schemes: PayableReference[],
  books: PayableAutomationBook[]
): string {
  const name = normalizeNonNullableText(configuration.name)
  if (!name || name.length > 100) return '请填写不超过 100 字的后台配置名称'
  const scheme = schemes.find((row) => row.id === configuration.schemeId)
  if (!scheme) return '请选择当前可用的核销方案'
  const book = books.find((row) => row.id === configuration.accountSetId)
  if (!book || (configuration.enabled && !book.active)) return '请选择当前可用的核算账套'
  if (!scheme.tenantId || book.tenantId !== scheme.tenantId) return '核销方案与账套必须属于同一租户'
  if (!configuration.relations.length || configuration.relations.length > 5)
    return '请选择 1 至 5 种后台核销关系'
  for (const [index, relation] of configuration.relations.entries()) {
    if (!isPayableWriteoffRelation(relation) || !payableSchemeApplies(scheme, relation))
      return '所选关系未在当前核销方案中配置'
    if (configuration.relations.indexOf(relation) !== index) return '后台核销关系不能重复'
  }
  if (!['same_currency', 'book_equivalent', 'full_pair'].includes(configuration.crossCurrencyMode))
    return '请选择有效的异币自动分配方式'
  if (configuration.enabled && (!scheme.enabled || !scheme.automatic))
    return '启用后台执行前，请先启用所选方案及其自动核销开关'
  if (configuration.enabled && configuration.expectedSchemeVersion !== scheme.version)
    return '匹配条件版本已变化，请刷新后重新核对'
  return ''
}

export function payableAutomationWritePayload(configuration: PayableAutomationInput) {
  return {
    configurationVersion: 1,
    id: configuration.id,
    name: normalizeNonNullableText(configuration.name),
    schemeId: configuration.schemeId,
    expectedSchemeVersion: configuration.expectedSchemeVersion,
    accountSetId: configuration.accountSetId,
    enabled: configuration.enabled,
    relations: [...configuration.relations],
    allowCrossParty: configuration.allowCrossParty,
    crossCurrencyMode: configuration.crossCurrencyMode,
    version: configuration.version,
    processExisting: configuration.processExisting === true
  }
}

export function canRetryPayableAutomationJob(job: PayableAutomationJob): boolean {
  return (
    job.configurationEnabled &&
    job.configurationVersion === job.automationVersion &&
    ['blocked', 'failed', 'no_match'].includes(job.status)
  )
}
