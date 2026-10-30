import { validateOperationInput } from '../src/utils/supabase/operations-input'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { stripVTControlCharacters } from 'node:util'
import {
  isOperationRun,
  operationNeedsInspectionAfterCancel
} from '../src/utils/supabase/operations-catalog'
import { getOperationLogLevel } from '../src/utils/supabase/operations-log'
import { isBackupVerificationReport } from '../src/utils/supabase/operations-verification'
import { isBackupUpdateReport } from '../src/utils/supabase/operations-update'
import type {
  BackupVerificationReport,
  BackupUpdateReport,
  OperationRun,
  SupabaseOperation
} from '../src/types/supabase-operations'

const MAX_VERIFICATION_REPORT_BYTES = 256 * 1024

export function readOperationVerificationReport(
  file: string,
  expectedBackupPath: string
): BackupVerificationReport | undefined {
  try {
    const stat = lstatSync(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_VERIFICATION_REPORT_BYTES) return
    const content = new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file))
    const parsed: unknown = JSON.parse(content.replace(/^\uFEFF/, ''))
    if (!isBackupVerificationReport(parsed)) return
    if (
      path.win32.resolve(parsed.backupPath).toLowerCase() !==
      path.win32.resolve(expectedBackupPath).toLowerCase()
    )
      return
    return parsed
  } catch {
    return
  }
}

export function readOperationUpdateReport(
  file: string,
  expectedBackupPath: string
): BackupUpdateReport | undefined {
  try {
    const information = lstatSync(file)
    if (!information.isFile() || information.isSymbolicLink() || information.size > 2 * 1024 * 1024)
      return
    const value: unknown = JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file)).replace(/^\uFEFF/, '')
    )
    if (
      !isBackupUpdateReport(value) ||
      path.win32.resolve(value.backupPath).toLowerCase() !==
        path.win32.resolve(expectedBackupPath).toLowerCase()
    )
      return
    return value
  } catch {
    return
  }
}

export function redactOperationOutput(text: string, secrets: string[] = []): string {
  let message = stripVTControlCharacters(text)
  for (const secret of secrets.filter(Boolean).sort((a, b) => b.length - a.length))
    message = message.split(secret).join('[已隐藏]')
  return message
    .replace(/\b(?:sbp_|sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, '[凭据已隐藏]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[令牌已隐藏]')
    .replace(/(postgres(?:ql)?:\/\/)[^\s]+/gi, '$1[数据库连接已隐藏]')
    .replace(/https?:\/\/[^\s]+[?][^\s]+/gi, '[带凭据链接已隐藏，请查看本机脚本输出文件]')
    .slice(0, 2000)
}

export async function authorizeOperationsIdentity(
  call: (route: string, body?: object) => Promise<unknown>,
  permission: string
): Promise<string> {
  if ((await call('/rest/v1/rpc/current_is_super', {})) !== true)
    throw new Error('只有平台超级管理员可以使用项目运维执行端。')
  if ((await call('/rest/v1/rpc/current_has_permission', { p_permission: permission })) !== true)
    throw new Error('没有该运维操作权限，请联系平台管理员。')
  const user = await call('/auth/v1/user')
  if (!user || typeof user !== 'object' || !('id' in user) || typeof user.id !== 'string')
    throw new Error('当前账号身份无效，请重新登录。')
  return user.id
}

export function stopOperationProcess(child: ChildProcess): void {
  if (!child.pid) return
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore'
    })
    killer.on('error', () => child.kill())
  } else {
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      child.kill('SIGTERM')
    }
  }
}

export class OperationsRunner {
  readonly runs: OperationRun[] = []
  private child?: ChildProcess
  private active?: OperationRun
  private sequence = 0
  private readonly stateRoot: string

  constructor(private readonly root: string) {
    this.stateRoot = path.join(root, '.artifacts/supabase-operations')
    mkdirSync(this.stateRoot, { recursive: true, mode: 0o700 })
    for (const file of readdirSync(this.stateRoot).filter((name) =>
      /^[a-f\d-]{36}\.json$/.test(name)
    )) {
      try {
        const saved: unknown = JSON.parse(readFileSync(path.join(this.stateRoot, file), 'utf8'))
        if (!isOperationRun(saved)) continue
        if (saved.status === 'running' || saved.status === 'cancelling') {
          saved.status = 'interrupted'
          saved.endedAt = new Date().toISOString()
          saved.error =
            '执行端曾退出，Docker 或目标侧任务可能仍在运行。请核对环境和产物后决定重试或续跑。'
          this.save(saved)
        }
        this.runs.push(saved)
      } catch {
        console.error('一份运维历史记录无法读取，已跳过。')
      }
    }
    this.runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  }

  get busy(): boolean {
    return Boolean(this.active)
  }

  start(operation: SupabaseOperation, input: unknown, actorId: string): OperationRun {
    if (this.active) throw new Error('已有任务正在执行，请等待完成或取消后再操作。')
    const parameters = validateOperationInput(operation, input)
    const secrets = operation.fields
      .filter((field) => field.kind === 'secret')
      .map((field) => String(parameters[field.key] || ''))
    const visibleParameters = Object.fromEntries(
      Object.entries(parameters).filter(
        ([key]) => !operation.fields.some((field) => field.key === key && field.kind === 'secret')
      )
    )
    const now = new Date().toISOString()
    const run: OperationRun = {
      id: randomUUID(),
      operationId: operation.id,
      title: operation.title,
      actorId,
      status: 'running',
      startedAt: now,
      lastOutputAt: now,
      stage: '启动脚本，等待首次输出',
      parameters: visibleParameters,
      logs: []
    }
    this.save(run)
    this.runs.unshift(run)
    this.active = run
    this.sequence = 0
    const verificationPath =
      operation.id === 'verify'
        ? path.join(this.stateRoot, `${run.id}.verification.json`)
        : undefined
    const updatePath = ['previewBackupUpdate', 'updateBackup'].includes(operation.id)
      ? path.join(this.stateRoot, `${run.id}.update.json`)
      : undefined
    const child = spawn(
      process.env.SUPABASE_OPS_POWERSHELL || 'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        path.join(this.root, 'supabase/operations-task.ps1'),
        '-Operation',
        operation.id
      ],
      {
        cwd: this.root,
        windowsHide: true,
        detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CI: 'true',
          NO_COLOR: '1',
          SUPABASE_OPS_REPORT_PATH: verificationPath || '',
          SUPABASE_OPS_UPDATE_REPORT_PATH: updatePath || ''
        }
      }
    )
    this.child = child
    const append = (message: string, level: 'info' | 'error') => {
      const signedLink = stripVTControlCharacters(message).match(
        /^Signed URL: (https:\/\/[^\s]+)$/
      )?.[1]
      if (
        signedLink &&
        operation.id === 'publish' &&
        signedLink.startsWith(
          `https://${parameters.DistributionProjectRef}.supabase.co/storage/v1/object/sign/`
        )
      ) {
        run.artifacts = [
          { label: '短期下载链接（请仅分享给授权接收者）', value: signedLink, kind: 'link' }
        ]
      }
      const localArtifact = stripVTControlCharacters(message).match(
        /^(?:Backup completed|Archive|Local Supabase project|源码快照|备份目录)[:：]\s*(.+)$/
      )?.[1]
      if (localArtifact) {
        run.artifacts ||= []
        run.artifacts.push({ label: '本机产物路径', value: localArtifact, kind: 'path' })
      }
      const safe = redactOperationOutput(message, secrets).trim()
      if (!safe) return
      run.lastOutputAt = new Date().toISOString()
      const stage = safe.match(/^阶段：(.+)$/)?.[1]
      if (stage) run.stage = stage
      else {
        const stages: Array<[RegExp, string]> = [
          [/Exporting database|Restoring database/, '处理数据库'],
          [/Capturing deployed Edge|Downloading.*function/i, '下载函数源码'],
          [/Storage bucket/, '处理 Storage 文件'],
          [/Starting.*local Supabase/, '启动本地 Supabase'],
          [/Uploading verified archive/, '上传分发包'],
          [/Backup verified/, '备份校验通过']
        ]
        const matched = stages.find(([pattern]) => pattern.test(safe))
        if (matched) run.stage = matched[1]
      }
      run.logs.push({
        sequence: ++this.sequence,
        time: run.lastOutputAt,
        level: getOperationLogLevel(safe, level),
        message: safe
      })
      if (run.logs.length > 1000) run.logs.splice(0, run.logs.length - 1000)
    }
    let output = ''
    let errors = ''
    child.stdout?.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
      const lines = output.split(/\r?\n|\r/)
      output = (lines.pop() || '').slice(-16000)
      for (const line of lines) append(line, 'info')
    })
    child.stderr?.setEncoding('utf8').on('data', (chunk: string) => {
      errors += chunk
      const lines = errors.split(/\r?\n|\r/)
      errors = (lines.pop() || '').slice(-16000)
      for (const line of lines) append(line, 'error')
    })
    let finished = false
    const timeout = setTimeout(
      () => {
        run.error = '任务已达到两小时执行上限，正在停止。请检查产物后续跑。'
        run.status = 'cancelling'
        stopOperationProcess(child)
      },
      2 * 60 * 60 * 1000
    )
    const checkpoint = setInterval(() => {
      try {
        this.save(run)
      } catch {
        run.error = '执行记录无法保存，已停止任务。请检查磁盘空间和目录权限。'
        run.status = 'cancelling'
        stopOperationProcess(child)
      }
    }, 5000)
    const finish = (code: number | null, startupError = false) => {
      if (finished) return
      finished = true
      clearTimeout(timeout)
      clearInterval(checkpoint)
      append(output, 'info')
      append(errors, 'error')
      if (verificationPath) {
        const report = readOperationVerificationReport(
          verificationPath,
          String(parameters.BackupPath || '')
        )
        if (report) {
          run.verificationReport = report
          run.artifacts ||= []
          run.artifacts.push({ label: '备份校验报告', value: verificationPath, kind: 'path' })
        }
      }
      if (updatePath) {
        const report = readOperationUpdateReport(
          updatePath,
          String(parameters.UpdateBackupPath || '')
        )
        if (report) {
          run.updateReport = report
          run.artifacts ||= []
          run.artifacts.push({ label: '备份更新报告', value: updatePath, kind: 'path' })
        }
      }
      run.exitCode = code
      run.endedAt = new Date().toISOString()
      const cancelled = run.status === 'cancelling'
      run.status = startupError
        ? 'failed'
        : cancelled && operationNeedsInspectionAfterCancel(operation)
          ? 'interrupted'
          : run.error
            ? 'failed'
            : cancelled
              ? 'cancelled'
              : code === 0
                ? 'succeeded'
                : 'failed'
      if (run.status === 'interrupted') {
        run.stage = '本机进程已停止，目标状态待核对'
        run.error =
          `${run.error || ''} 本机进程已停止，但 Docker 或目标侧任务可能仍在运行。请检查 Docker Desktop 和目标环境；已完成步骤不会自动回滚。`.trim()
      }
      if (run.status === 'failed' && !run.error)
        run.error = startupError
          ? '无法启动 PowerShell，请检查安装和执行端配置。'
          : '脚本执行失败，请查看执行日志并修复提示的问题；未完成的备份不可用于恢复。'
      if (operation.id === 'verify' && !startupError && !cancelled) {
        if (!run.verificationReport) {
          run.status = 'failed'
          run.error = '校验脚本未生成有效报告，不能判定备份完整。请查看执行日志并重新校验。'
        } else if (run.verificationReport.status !== 'passed') {
          run.status = 'failed'
          run.error = '备份校验未通过，请查看报告中的失败检查和问题后修复。'
        }
      }
      if (updatePath && !startupError && !cancelled) {
        const report = run.updateReport
        if (!report) {
          run.status = 'failed'
          run.error = '未取得有效更新报告，请检查执行端版本和日志；不能判定更新完成。'
        } else if (
          report.status === 'failed' ||
          (operation.id === 'previewBackupUpdate' && report.mode !== 'preview') ||
          (operation.id === 'updateBackup' && report.mode !== 'apply')
        ) {
          run.status = 'failed'
          run.error = report.error || '备份更新未完成，请查看更新报告。'
        }
      }
      if (run.status === 'succeeded') run.stage = '执行完成'
      this.active = undefined
      this.child = undefined
      for (const field of operation.fields) if (field.kind === 'secret') parameters[field.key] = ''
      secrets.fill('')
      try {
        this.save(run)
      } catch {
        run.error = '执行结束，但记录无法保存。请保留页面并检查执行端磁盘空间和目录权限。'
      }
    }
    child.on('error', () => finish(null, true))
    child.on('close', (code) => finish(code))
    child.stdin?.on('error', () => {
      /* 子进程启动失败由 error/close 统一收口。 */
    })
    child.stdin?.end(JSON.stringify(parameters) + '\n')
    return run
  }

  cancel(id: string): void {
    if (!this.active || this.active.id !== id || !this.child)
      throw new Error('该任务已结束，请刷新任务状态。')
    this.active.status = 'cancelling'
    this.save(this.active)
    stopOperationProcess(this.child)
  }

  private save(run: OperationRun): void {
    const target = path.join(this.stateRoot, `${run.id}.json`)
    writeFileSync(`${target}.tmp`, JSON.stringify(run), { mode: 0o600 })
    renameSync(`${target}.tmp`, target)
  }
}
