import type { OperationLog, OperationRun } from '../../types/supabase-operations'

export function getOperationBackupPath(run: OperationRun | null): string | undefined {
  if (!run || !['backup', 'resumeBackup'].includes(run.operationId)) return undefined
  if (typeof run.parameters.ResumeBackupPath === 'string') return run.parameters.ResumeBackupPath
  for (const line of [...run.logs].reverse()) {
    const explicit = line.message.match(/^备份目录[:：]\s*(.+)$/)?.[1]
    if (explicit) return explicit
  }
  const artifact = [...(run.artifacts || [])]
    .reverse()
    .find((item) => item.kind === 'path' && !isStagingExportPath(item.value))
  if (artifact) return artifact.value
  for (const line of [...run.logs].reverse()) {
    const dump = line.message.match(
      /^Dumped (?:schema|data) to (.+)[\\/]database[\\/](?:roles|schema|data)\.sql\.?$/i
    )?.[1]
    if (dump && !isStagingExportPath(dump)) return dump
  }
  return undefined
}

function isStagingExportPath(value: string): boolean {
  return /(?:^|[\\/])[^\\/]*\.incomplete(?:[\\/]|$)/i.test(value)
}

/** CLI progress is often written to stderr. Only known progress lines override a recorded error. */
export function getOperationLogLevel(
  message: string,
  recordedLevel: OperationLog['level']
): OperationLog['level'] {
  const plain = stripOperationLogAnsi(message).trim()
  if (
    /^Downloading Function: [a-z0-9][a-z0-9_-]*$/i.test(plain) ||
    /^Downloaded Function [a-z0-9][a-z0-9_-]* from project [a-z0-9]{20}\.$/i.test(plain) ||
    /^Extracting file: supabase[\\/]functions[\\/]/i.test(plain)
  )
    return 'info'
  if (
    /\b(?:ERROR|FATAL|Exception|failed|failure)\b/i.test(plain) ||
    /^(?:ParserError|CategoryInfo|FullyQualifiedErrorId)\b/i.test(plain) ||
    /\bSSL\b.*\bclosed\b/i.test(plain)
  )
    return 'error'
  if (/^WARNING\b/i.test(plain)) return 'info'
  if (/^pg_dump: warning:/i.test(plain)) return 'info'
  if (/^pg_dump: detail: [a-z_][\w.]*$/i.test(plain)) return 'info'
  if (
    /^pg_dump: hint: (?:You might not be able to restore the dump without using --disable-triggers\b|Consider using a full dump instead of a --data-only dump\b)/i.test(
      plain
    )
  )
    return 'info'
  if (
    /^(?:Dumping|Dumped) (?:roles?|schemas?|data|database|migration history)\b/i.test(plain) ||
    /^Exporting database roles, schema, and data\b/i.test(plain)
  )
    return 'info'
  return recordedLevel
}

/** Remove terminal control sequences before displaying saved or live plain-text logs. */
export function stripOperationLogAnsi(message: string): string {
  // eslint-disable-next-line no-control-regex
  return message.replace(/\u001b(?:\][^\u0007]*(?:\u0007|\u001b\\)|\[[0-?]*[ -/]*[@-~])/g, '')
}
