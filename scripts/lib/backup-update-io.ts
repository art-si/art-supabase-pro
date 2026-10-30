import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { access, mkdir, readFile, readdir, writeFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BackupVerificationReport } from '../../src/types/supabase-operations'
import { isBackupVerificationReport } from '../../src/utils/supabase/operations-verification'

export const UPDATE_REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url))
export interface UpdateCommandResult { code: number; stdout: string; stderr: string }
export interface UpdateCommandOptions {
  cwd?: string
  env?: NodeJS.ProcessEnv
  input?: string
  timeoutMs?: number
  keepStdinOpen?: boolean
}
export type UpdateCommand = (command: string, args: string[], options?: UpdateCommandOptions) => Promise<UpdateCommandResult>

export const runUpdateCommand: UpdateCommand = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd: options.cwd || UPDATE_REPOSITORY_ROOT,
    windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CI: 'true', NO_COLOR: '1', ...options.env }
  })
  let stdout = '', stderr = '', settled = false
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
    finish(new Error('当前步骤等待超时，原备份尚未替换；请检查网络和 Docker 后重试。'))
  }, options.timeoutMs || 180_000)
  child.stdout.setEncoding('utf8').on('data', (value: string) => {
    stdout += value
    if (stdout.length > 32 * 1024 * 1024) { child.kill(); finish(new Error('来源命令输出异常，已停止更新。')) }
  })
  child.stderr.setEncoding('utf8').on('data', (value: string) => { stderr = (stderr + value).slice(-256 * 1024) })
  child.on('error', () => finish(new Error('无法启动本机更新步骤，请检查 Supabase CLI、Node 和 Docker 安装。')))
  child.on('close', (code) => finish(undefined, code ?? 1))
  child.stdin.on('error', () => { /* close/error owns the process outcome */ })
  if (options.keepStdinOpen) {
    if (options.input) child.stdin.write(options.input)
  } else child.stdin.end(options.input || '')
})

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
  try { await access(file); return true } catch { return false }
}

export async function verifyUpdateSnapshot(root: string, reportFile: string, run: UpdateCommand): Promise<BackupVerificationReport> {
  const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-File',
    path.join(UPDATE_REPOSITORY_ROOT, 'supabase/restore-local-supabase.ps1'),
    '-BackupPath', root, '-LocalRoot', path.dirname(root), '-VerifyBackupOnly', '-VerificationReportPath', reportFile], { timeoutMs: 180_000 })
  if (!await exists(reportFile)) throw new Error('本地备份校验没有生成报告，已停止更新。')
  const report = await readJson(reportFile)
  if (!isBackupVerificationReport(report) || report.status !== 'passed' || result.code !== 0)
    throw new Error('本地备份完整性校验未通过。请先查看校验报告，原备份不会被覆盖。')
  return report
}

export async function makeSnapshotManifest(root: string, original: Record<string, unknown>, baseHash: string): Promise<void> {
  const files: Array<{path: string; bytes: number; sha256: string}> = []
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
  files.sort((a,b) => a.path.localeCompare(b.path))
  await writeJson(path.join(root, 'manifest.json'), {
    ...original,
    created_at: new Date().toISOString(),
    update: { method: 'changed-components-and-copy-tables', previous_manifest_sha256: baseHash },
    consistency: { method: 'repeatable-read-table-comparison', note: 'Database rows use one read-only source snapshot. Edge Functions and Storage are verified separately; restore validation is still required.' },
    files
  })
}
