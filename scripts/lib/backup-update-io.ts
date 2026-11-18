import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, readdir, rm, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BackupVerificationReport } from '../../src/types/supabase-operations'
import { isBackupVerificationReport } from '../../src/utils/supabase/operations-verification'

export const UPDATE_REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const MAX_SOURCE_DURATION_MS = 15 * 60_000
const MAX_SCHEMA_DUMP_DURATION_MS = 45 * 60_000

export interface UpdateCommandResult {
  code: number
  stdout: string
  stderr: string
}
export interface UpdateCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
  timeoutMs?: number
  keepStdinOpen?: boolean
}
export type UpdateCommand = (
  command: string,
  args: string[],
  options?: UpdateCommandOptions
) => Promise<UpdateCommandResult>

export const runUpdateCommand: UpdateCommand = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || UPDATE_REPOSITORY_ROOT,
      windowsHide: true,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CI: 'true', NO_COLOR: '1', ...options.env }
    })
    let stdout = '',
      stderr = '',
      settled = false
    const finish = (error?: Error, code = 1) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.stdin.end()
      if (error) reject(error)
      else resolve({ code, stdout, stderr })
    }
    const timer = setTimeout(() => {
      child.stdin.end()
      child.kill()
      finish(
        Object.assign(new Error('当前步骤等待超时，原备份尚未替换；请检查网络和 Docker 后重试。'), {
          code: 'BACKUP_COMMAND_TIMEOUT'
        })
      )
    }, options.timeoutMs || 180_000)
    child.stdout.setEncoding('utf8').on('data', (value: string) => {
      stdout += value
      if (stdout.length > 32 * 1024 * 1024) {
        child.kill()
        finish(new Error('来源命令输出异常，已停止更新。'))
      }
    })
    child.stderr.setEncoding('utf8').on('data', (value: string) => {
      stderr = (stderr + value).slice(-256 * 1024)
    })
    child.on('error', (cause) =>
      finish(
        Object.assign(
          new Error('无法启动本机更新步骤，请检查 Supabase CLI、Node 和 Docker 安装。', {
            cause
          }),
          { code: 'BACKUP_COMMAND_START_FAILED' }
        )
      )
    )
    child.on('close', (code) => finish(undefined, code ?? 1))
    child.stdin.on('error', () => {
      /* close/error owns the process outcome */
    })
    if (options.keepStdinOpen) {
      if (options.input) child.stdin.write(options.input)
    } else child.stdin.end(options.input || '')
  })

export async function dumpBackupComponent(
  file: string,
  destination: string,
  password: string,
  run: UpdateCommand,
  logStage: (message: string) => void
): Promise<void> {
  const argumentsByFile: Record<string, string[]> = {
    'schema.sql': ['--keep-comments'],
    'roles.sql': ['--role-only'],
    'managed-schema-snapshot.sql': ['--schema', 'auth,storage', '--keep-comments'],
    'migration-history-schema.sql': ['--schema', 'supabase_migrations']
  }
  logStage(`校对结构文件 ${file}`)
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await run(
      'supabase',
      ['db', 'dump', '--linked', ...argumentsByFile[file], '--file', destination],
      {
        env: { SUPABASE_DB_PASSWORD: password, PGPASSWORD: password },
        timeoutMs: file === 'schema.sql' ? MAX_SCHEMA_DUMP_DURATION_MS : MAX_SOURCE_DURATION_MS
      }
    )
    if (result.code !== 0) {
      const diagnostic = `${result.stderr}\n${result.stdout}`
      let code = 'BACKUP_DUMP_FAILED'
      if (/\b28P01\b|password authentication failed|invalid password/i.test(diagnostic))
        code = '28P01'
      else if (/\b42501\b|permission denied|must be owner/i.test(diagnostic)) code = '42501'
      else if (/\b57014\b|canceling statement due to statement timeout/i.test(diagnostic))
        code = '57014'
      else if (
        /cache lookup failed|\b(?:relation|function|type|schema)\b[^\n]*\bdoes not exist\b/i.test(
          diagnostic
        )
      )
        code = 'BACKUP_DUMP_SOURCE_CHANGED'
      else if (
        /\b08[A-Z0-9]{3}\b|connect(?:ion)?[^\n]*(?:failed|refused|closed|reset|timed out|timeout)|server closed the connection|could not receive data from server|SSL SYSCALL[^\n]*EOF|unexpected EOF|broken pipe|no route to host|could not translate host name|network is unreachable/i.test(
          diagnostic
        )
      )
        code = 'BACKUP_DUMP_CONNECTION_FAILED'
      if (code === 'BACKUP_DUMP_CONNECTION_FAILED' && attempt === 0) {
        await rm(destination, { force: true })
        logStage(`结构文件 ${file} 连接中断，清理暂存文件后重试`)
        continue
      }
      throw Object.assign(
        new Error(`结构文件 ${file} 导出失败，原备份保持不变。`, { cause: result }),
        {
          code
        }
      )
    }
    const content = (await exists(destination)) ? await readFile(destination, 'utf8') : ''
    const tail = content.trimEnd().split(/\r?\n/).slice(-16).join('\n')
    const complete =
      content.trim().length > 0 &&
      (file === 'roles.sql'
        ? /^RESET ALL;\s*$/m.test(tail)
        : file === 'migration-history-schema.sql'
          ? /ADD CONSTRAINT .* PRIMARY KEY|^-- PostgreSQL database dump complete\s*$/m.test(tail)
          : /^-- PostgreSQL database dump complete\s*$/m.test(tail))
    if (!complete)
      throw Object.assign(new Error(`结构文件 ${file} 导出不完整，原备份保持不变。`), {
        code: 'BACKUP_DUMP_INCOMPLETE'
      })
    return
  }
}

export async function fileHash(file: string, algorithm = 'sha256'): Promise<string> {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

export async function readJson(file: string): Promise<unknown> {
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, '')) as unknown
}
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 })
}
export async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export function assertExternalUpdateReportPath(reportPath: string, backupPath: string): void {
  const destination = path.resolve(reportPath).toLowerCase()
  const backup = path.resolve(backupPath).toLowerCase()
  if (destination === backup || destination.startsWith(backup + path.sep))
    throw new Error('更新报告不能写入备份目录。')
}

export async function verifyUpdateSnapshot(
  root: string,
  reportFile: string,
  run: UpdateCommand
): Promise<BackupVerificationReport> {
  const result = await run(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-File',
      path.join(UPDATE_REPOSITORY_ROOT, 'supabase/operations-task.ps1'),
      '-Operation',
      'verify'
    ],
    {
      timeoutMs: 180_000,
      input: JSON.stringify({ BackupPath: root }) + '\n',
      env: { SUPABASE_OPS_REPORT_PATH: reportFile }
    }
  )
  if (!(await exists(reportFile))) throw new Error('本地备份校验没有生成报告，已停止更新。')
  const report = await readJson(reportFile)
  if (!isBackupVerificationReport(report) || report.status !== 'passed' || result.code !== 0)
    throw new Error('本地备份完整性校验未通过。请先查看校验报告，原备份不会被覆盖。')
  return report
}

export async function makeSnapshotManifest(
  root: string,
  original: Record<string, unknown>,
  baseHash: string
): Promise<void> {
  const files: Array<{ path: string; bytes: number; sha256: string }> = []
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('更新快照包含链接，已停止。')
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile()) {
        const relative = path.relative(root, file).split(path.sep).join('/')
        if (relative === 'manifest.json' || relative === 'README.md') continue
        files.push({ path: relative, bytes: (await stat(file)).size, sha256: await fileHash(file) })
      } else throw new Error('更新快照中存在不支持的文件类型。')
    }
  }
  await visit(root)
  files.sort((a, b) => a.path.localeCompare(b.path))
  await writeJson(path.join(root, 'manifest.json'), {
    ...original,
    created_at: new Date().toISOString(),
    update: { method: 'changed-components-and-copy-tables', previous_manifest_sha256: baseHash },
    consistency: {
      method: 'repeatable-read-table-comparison',
      note: 'Database rows use one read-only source snapshot. Edge Functions and Storage are verified separately; restore validation is still required.'
    },
    files
  })
}
