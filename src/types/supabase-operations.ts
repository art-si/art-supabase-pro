export type SupabaseOperationId =
  | 'diagnose'
  | 'syncFunctions'
  | 'backup'
  | 'resumeBackup'
  | 'previewBackupUpdate'
  | 'updateBackup'
  | 'verify'
  | 'package'
  | 'download'
  | 'restoreLocal'
  | 'resumeLocal'
  | 'restoreRemote'
  | 'publish'
  | 'setLocalLogin'
export type OperationStatus =
  'running' | 'cancelling' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'
export interface OperationField {
  key: string
  label: string
  kind?: 'secret' | 'switch'
  required?: boolean
  placeholder?: string
  help?: string
}
export interface SupabaseOperation {
  id: SupabaseOperationId
  title: string
  description: string
  script: string
  permission: string
  risk: 'read' | 'local' | 'remote'
  fields: OperationField[]
  stages: string[]
}
export interface OperationLog {
  sequence: number
  time: string
  level: 'info' | 'error'
  message: string
}
export interface BackupVerificationReport {
  formatVersion: 1
  status: 'passed' | 'failed'
  backupPath: string
  sourceProjectRef: string | null
  snapshotCreatedAt: string | null
  startedAt: string
  completedAt: string
  summary: {
    files: number
    verifiedFiles: number
    totalBytes: number
    issueCount: number
  }
  checks: Array<{
    id: string
    label: string
    status: 'passed' | 'failed' | 'warning' | 'skipped'
    detail: string
  }>
  groups: Array<{
    id: string
    label: string
    files: number
    verifiedFiles: number
    bytes: number
  }>
  issues: Array<{ code: string; path?: string; message: string }>
  limitations: string[]
}
export interface OperationRun {
  artifacts?: Array<{ label: string; value: string; kind: 'path' | 'link' }>
  id: string
  operationId: SupabaseOperationId
  title: string
  actorId: string
  status: OperationStatus
  startedAt: string
  endedAt?: string
  lastOutputAt: string
  stage: string
  parameters: Record<string, string | boolean>
  logs: OperationLog[]
  exitCode?: number | null
  error?: string
  verificationReport?: BackupVerificationReport
  updateReport?: BackupUpdateReport
}

export interface BackupUpdateReport {
  formatVersion: 1
  mode: 'preview' | 'apply'
  status: 'planned' | 'unchanged' | 'updated' | 'failed'
  backupPath: string
  sourceProjectRef: string
  planId: string
  baseManifestSha256: string
  resultManifestSha256?: string
  startedAt: string
  completedAt: string
  summary: { added: number; changed: number; removed: number; unchanged: number }
  items: Array<{
    kind:
      | 'table'
      | 'schema'
      | 'roles'
      | 'migrationHistory'
      | 'managedSchema'
      | 'function'
      | 'storage'
      | 'metadata'
    key: string
    label: string
    status: 'added' | 'changed' | 'removed' | 'unchanged' | 'check'
    detail?: string
  }>
  warnings: string[]
  historyPath?: string
  error?: string
}
export interface OperationsSnapshot {
  projectRef: string
  runs: OperationRun[]
  busy: boolean
  externalActivity?: {
    state: 'running' | 'unknown'
    stage: string
    message: string
  }
}
