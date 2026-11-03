import { isObjectRecord } from '../record'
import type { BackupUpdateReport } from '@/types/supabase-operations'

export function isBackupUpdateReport(value: unknown): value is BackupUpdateReport {
  if (
    !isObjectRecord(value) ||
    value.formatVersion !== 1 ||
    typeof value.mode !== 'string' ||
    !['preview', 'apply'].includes(value.mode) ||
    typeof value.status !== 'string' ||
    !['planned', 'unchanged', 'updated', 'failed'].includes(value.status) ||
    (value.mode === 'preview' && value.status === 'updated') ||
    (value.mode === 'apply' && value.status === 'planned') ||
    typeof value.backupPath !== 'string' ||
    !value.backupPath ||
    value.backupPath.length > 2048 ||
    value.sourceProjectRef !== 'ckbftoopuyophiebamwy' ||
    typeof value.planId !== 'string' ||
    !/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(value.planId) ||
    typeof value.baseManifestSha256 !== 'string' ||
    !/^[a-f\d]{64}$/i.test(value.baseManifestSha256) ||
    (value.resultManifestSha256 !== undefined &&
      (typeof value.resultManifestSha256 !== 'string' ||
        !/^[a-f\d]{64}$/i.test(value.resultManifestSha256))) ||
    typeof value.startedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    typeof value.completedAt !== 'string' ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    !isObjectRecord(value.summary) ||
    !Array.isArray(value.items) ||
    value.items.length > 5000 ||
    !Array.isArray(value.warnings) ||
    value.warnings.length > 64
  )
    return false
  for (const key of ['added', 'changed', 'removed', 'unchanged'])
    if (!Number.isSafeInteger(value.summary[key]) || Number(value.summary[key]) < 0) return false
  if (
    !value.items.every(
      (item: unknown) =>
        isObjectRecord(item) &&
        typeof item.kind === 'string' &&
        typeof item.status === 'string' &&
        [
          'table',
          'schema',
          'roles',
          'migrationHistory',
          'managedSchema',
          'function',
          'storage',
          'metadata'
        ].includes(item.kind) &&
        ['added', 'changed', 'removed', 'unchanged', 'check'].includes(item.status) &&
        typeof item.key === 'string' &&
        item.key.length <= 2048 &&
        typeof item.label === 'string' &&
        item.label.length <= 2048 &&
        (item.detail === undefined ||
          (typeof item.detail === 'string' && item.detail.length <= 4096))
    )
  )
    return false
  if (
    !value.warnings.every(
      (warning: unknown) => typeof warning === 'string' && warning.length <= 4096
    )
  )
    return false
  for (const key of ['historyPath', 'error', 'errorStage'])
    if (
      value[key] !== undefined &&
      (typeof value[key] !== 'string' || String(value[key]).length > 4096)
    )
      return false
  if (
    value.errorCode !== undefined &&
    (typeof value.errorCode !== 'string' || !/^[A-Z0-9_]{2,64}$/.test(value.errorCode))
  )
    return false
  return true
}
