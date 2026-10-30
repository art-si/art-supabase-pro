import type { BackupVerificationReport } from '@/types/supabase-operations'
import { isObjectRecord } from '../record'

function isText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    !value.includes('\0')
  )
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

function isTime(value: unknown): value is string {
  return (
    isText(value, 64) && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value))
  )
}

export function isBackupVerificationReport(value: unknown): value is BackupVerificationReport {
  if (
    !isObjectRecord(value) ||
    value.formatVersion !== 1 ||
    typeof value.status !== 'string' ||
    !['passed', 'failed'].includes(value.status)
  )
    return false
  if (
    !isText(value.backupPath, 2048) ||
    (value.sourceProjectRef !== null &&
      (typeof value.sourceProjectRef !== 'string' ||
        !/^[a-z0-9]{20}$/.test(value.sourceProjectRef))) ||
    (value.snapshotCreatedAt !== null && !isTime(value.snapshotCreatedAt)) ||
    !isTime(value.startedAt) ||
    !isTime(value.completedAt) ||
    !isObjectRecord(value.summary)
  )
    return false

  const { files, verifiedFiles, totalBytes, issueCount } = value.summary
  if (
    ![files, verifiedFiles, totalBytes, issueCount].every(isCount) ||
    Number(verifiedFiles) > Number(files)
  )
    return false
  if (
    !Array.isArray(value.checks) ||
    value.checks.length > 128 ||
    !Array.isArray(value.groups) ||
    value.groups.length > 64 ||
    !Array.isArray(value.issues) ||
    value.issues.length > 100 ||
    !Array.isArray(value.limitations) ||
    value.limitations.length > 32 ||
    Number(issueCount) < value.issues.length
  )
    return false

  if (
    !value.checks.every(
      (check: unknown) =>
        isObjectRecord(check) &&
        isText(check.id, 128) &&
        isText(check.label, 256) &&
        typeof check.status === 'string' &&
        ['passed', 'failed', 'warning', 'skipped'].includes(check.status) &&
        isText(check.detail, 4096)
    )
  )
    return false
  if (
    !value.groups.every(
      (group: unknown) =>
        isObjectRecord(group) &&
        isText(group.id, 128) &&
        isText(group.label, 256) &&
        isCount(group.files) &&
        isCount(group.verifiedFiles) &&
        Number(group.verifiedFiles) <= Number(group.files) &&
        isCount(group.bytes)
    )
  )
    return false
  if (
    !value.issues.every(
      (issue: unknown) =>
        isObjectRecord(issue) &&
        isText(issue.code, 128) &&
        isText(issue.message, 4096) &&
        (issue.path === undefined || isText(issue.path, 2048))
    )
  )
    return false
  if (!value.limitations.every((item: unknown) => isText(item, 4096))) return false

  if (
    value.status === 'passed' &&
    (files === 0 ||
      value.checks.length === 0 ||
      value.groups.length === 0 ||
      issueCount !== 0 ||
      files !== verifiedFiles ||
      value.checks.some((check: { status: string }) => check.status === 'failed'))
  )
    return false
  return true
}
