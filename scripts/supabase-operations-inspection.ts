import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { promisify } from 'node:util'
import type { OperationsSnapshot } from '../src/types/supabase-operations'
import { OPERATIONS_PROJECT_REF } from '../src/utils/supabase/operations-catalog'

const executeFile = promisify(execFile)
type Activity = OperationsSnapshot['externalActivity']
const dockerExecutable =
  process.platform === 'win32' &&
  existsSync('C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe')
    ? 'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe'
    : 'docker'
const dockerOptions = { windowsHide: true, timeout: 15_000, maxBuffer: 4 * 1024 * 1024 }
type DockerRunner = (args: string[]) => Promise<string>

async function runDocker(args: string[]): Promise<string> {
  const { stdout } = await executeFile(dockerExecutable, args, dockerOptions)
  return stdout
}

function runningPostgresIds(output: string): string[] {
  return output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([a-f\d]{12,64})\s+.*supabase\/postgres(?::|@)/)
    return match ? [match[1]] : []
  })
}

async function matchingExports(run: DockerRunner): Promise<{ ids: string[]; activity: Activity }> {
  const ids = runningPostgresIds(await run(['ps', '--format', '{{.ID}} {{.Image}}']))
  if (!ids.length) return { ids: [], activity: undefined }
  const matches: string[] = []
  const configurations: unknown[] = []
  for (let offset = 0; offset < ids.length; offset += 32) {
    const inspected = await run([
      'inspect',
      '--format',
      '{{json .}}',
      ...ids.slice(offset, offset + 32)
    ])
    for (const line of inspected.trim().split(/\r?\n/)) {
      const record: unknown = JSON.parse(line)
      if (!record || typeof record !== 'object') continue
      const id = Reflect.get(record, 'Id')
      const state = Reflect.get(record, 'State')
      const config = Reflect.get(record, 'Config')
      if (
        typeof id === 'string' &&
        ids.some((candidate) => id.startsWith(candidate)) &&
        state &&
        typeof state === 'object' &&
        Reflect.get(state, 'Running') === true &&
        describeDetachedExports([config])?.state === 'running'
      ) {
        matches.push(id)
        configurations.push(config)
      }
    }
  }
  return { ids: matches, activity: describeDetachedExports(configurations) }
}

export function describeDockerInspectionFailure(error: unknown): Activity {
  const code = error && typeof error === 'object' ? Reflect.get(error, 'code') : undefined
  const killed = error && typeof error === 'object' && Reflect.get(error, 'killed') === true
  const message =
    code === 'ENOENT'
      ? '执行端找不到 Docker 命令。请确认 Docker Desktop 已安装，然后重启执行端并刷新。'
      : code === 'ETIMEDOUT' || killed
        ? 'Docker 响应超时。请检查 Docker Desktop 是否正常运行，稍后刷新。'
        : '无法连接 Docker 或读取导出状态。请检查 Docker Desktop 和执行端使用的 Docker 环境，然后刷新。'
  return { state: 'unknown', stage: 'Docker 导出状态待核对', message }
}

/** Inspect only matching project exports. Docker environment/commands may contain secrets. */
export function describeDetachedExports(configurations: unknown[]): Activity {
  const matches = configurations.filter((config) => {
    if (!config || typeof config !== 'object') return false
    const serialized = JSON.stringify(config)
    return serialized.includes(OPERATIONS_PROJECT_REF) && /pg_dump\b/.test(serialized)
  })
  if (!matches.length) return undefined
  const dataOnly = matches.some((config) => /--data-only/.test(JSON.stringify(config)))
  return {
    state: 'running',
    stage: dataOnly ? 'Docker 正在导出数据库数据' : 'Docker 正在导出数据库',
    message:
      '上次执行端已退出，但本项目的数据库导出仍在 Docker 中运行。请勿重复创建或续跑；导出结束后仍需核对完整备份清单。'
  }
}

export async function inspectDetachedExports(): Promise<Activity> {
  try {
    return (await matchingExports(runDocker)).activity
  } catch (error) {
    return describeDockerInspectionFailure(error)
  }
}

/** Stops only currently running exports matched to this project's fixed ref. */
export async function cancelDetachedExports(
  run: DockerRunner = runDocker
): Promise<{ stopped: number }> {
  try {
    const { ids } = await matchingExports(run)
    if (!ids.length) return { stopped: 0 }
    let stopped = 0
    for (const id of ids) {
      // Re-check immediately before each stop; no caller-provided Docker ID is accepted.
      if (!(await matchingExports(run)).ids.includes(id)) continue
      await run(['stop', '--timeout', '10', id])
      stopped++
    }
    if ((await matchingExports(run)).ids.length) throw new Error('EXPORT_STILL_RUNNING')
    return { stopped }
  } catch (cause) {
    throw new Error(
      '无法确认导出容器已停止。请检查 Docker Desktop 中本项目导出状态，刷新页面后重试。',
      { cause }
    )
  }
}
