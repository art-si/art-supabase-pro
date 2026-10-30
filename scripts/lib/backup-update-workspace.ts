import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, lstat, mkdir, readdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { UPDATE_REPOSITORY_ROOT, exists, fileHash, readJson, writeJson } from './backup-update-io'
import { isObjectRecord } from '../../src/utils/record'

interface ManifestFile {
  path: string
  bytes: number
  sha256: string
}
interface SnapshotManifest {
  format_version: 1
  files: ManifestFile[]
  project_ref: string
}
interface Journal {
  version: 1
  backupPath: string
  phase: 'committing'
  historyPath: string
  oldManifestSha256: string
  newManifestSha256: string
  oldFiles: ManifestFile[]
  changed: string[]
  additions: string[]
  removals: string[]
  nonce: string
}
const GUID = /^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i
const HASH = /^[a-f\d]{64}$/i

async function noLinks(target: string): Promise<void> {
  for (let current = path.resolve(target); ; current = path.dirname(current)) {
    if ((await exists(current)) && (await lstat(current)).isSymbolicLink())
      throw new Error('备份工作目录不能使用符号链接或目录联接。')
    if (path.dirname(current) === current) break
  }
}
function relativePath(value: unknown): string {
  if (typeof value !== 'string' || !value || path.isAbsolute(value) || /[\0:\r\n]/.test(value))
    throw new Error('备份清单包含不安全的相对路径。')
  const normalized = value.replaceAll('\\', '/')
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..'))
    throw new Error('备份清单路径越出目录。')
  return normalized
}
function inside(root: string, relative: unknown): string {
  const target = path.resolve(root, ...relativePath(relative).split('/'))
  if (!target.toLowerCase().startsWith(path.resolve(root).toLowerCase() + path.sep))
    throw new Error('备份文件超出目标目录。')
  return target
}
function isManifest(value: unknown): value is SnapshotManifest {
  if (
    !isObjectRecord(value) ||
    value.format_version !== 1 ||
    typeof value.project_ref !== 'string' ||
    !/^[a-z0-9]{20}$/.test(value.project_ref) ||
    !Array.isArray(value.files) ||
    !value.files.length
  )
    return false
  const seen = new Set<string>()
  for (const entry of value.files) {
    if (
      !isObjectRecord(entry) ||
      !Number.isSafeInteger(entry.bytes) ||
      Number(entry.bytes) < 0 ||
      typeof entry.sha256 !== 'string' ||
      !HASH.test(entry.sha256)
    )
      return false
    const rel = relativePath(entry.path),
      key = rel.toLowerCase()
    if (seen.has(key) || rel === 'manifest.json') return false
    seen.add(key)
  }
  return true
}
async function validateSnapshot(root: string, expectedHash?: string): Promise<SnapshotManifest> {
  await noLinks(root)
  const manifestFile = path.join(root, 'manifest.json')
  if (expectedHash && (await fileHash(manifestFile)).toLowerCase() !== expectedHash.toLowerCase())
    throw new Error('本地备份版本已变化，请重新检查更新计划。')
  const manifest = await readJson(manifestFile)
  if (!isManifest(manifest)) throw new Error('备份完成清单无效，无法安全更新。')
  const paths = new Set(manifest.files.map((file) => relativePath(file.path).toLowerCase()))
  for (const entry of manifest.files) {
    const target = inside(root, entry.path)
    await noLinks(target)
    if (
      !(await exists(target)) ||
      (await lstat(target)).size !== entry.bytes ||
      (await fileHash(target)) !== entry.sha256.toLowerCase()
    )
      throw new Error('备份文件与完成清单不一致，已停止替换。')
  }
  async function scan(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isSymbolicLink()) throw new Error('备份目录中存在链接。')
      if (entry.isDirectory()) await scan(target)
      else if (entry.isFile()) {
        const rel = path.relative(root, target).split(path.sep).join('/').toLowerCase()
        if (rel !== 'manifest.json' && rel !== 'readme.md' && !paths.has(rel))
          throw new Error('备份存在未登记文件，已停止更新。')
      } else throw new Error('备份包含不支持的文件类型。')
    }
  }
  await scan(root)
  return manifest
}

async function acquireMutex(scope: string): Promise<() => Promise<void>> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-File',
        path.join(UPDATE_REPOSITORY_ROOT, 'supabase/backup-update-lock.ps1'),
        '-BackupPath',
        scope
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: UPDATE_REPOSITORY_ROOT
      }
    )
    let output = '',
      granted = false,
      closed = false
    const closedPromise = new Promise<void>((done) =>
      child.on('close', () => {
        closed = true
        done()
      })
    )
    const timer = setTimeout(() => {
      child.stdin.end()
      child.kill()
      reject(new Error('备份目录正被其他命令使用，请等待任务结束后重试。'))
    }, 15_000)
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk
      if (!granted && output.includes('BACKUP_LOCK_ACQUIRED')) {
        granted = true
        clearTimeout(timer)
        resolve(async () => {
          if (!closed) child.stdin.end()
          await closedPromise
        })
      }
    })
    child.stderr.on('data', () => {
      /* Never expose raw PowerShell process details. */
    })
    child.on('error', () => {
      clearTimeout(timer)
      reject(new Error('无法取得本地备份保护锁，请检查 PowerShell。'))
    })
    child.on('close', () => {
      clearTimeout(timer)
      if (!granted) reject(new Error('备份目录正在使用或保护锁不可用，请稍后重试。'))
    })
    child.stdin.on('error', () => {})
  })
}
export async function acquireBackupUpdateSession(backupPath: string): Promise<() => Promise<void>> {
  await noLinks(backupPath)
  return acquireMutex(path.resolve(backupPath) + '.update-session')
}

export async function createBackupUpdateWorkspace(
  backupPath: string,
  planId: string
): Promise<{ root: string; snapshot: string }> {
  if (!GUID.test(planId)) throw new Error('更新计划编号无效。')
  const backup = path.resolve(backupPath)
  const key = createHash('sha256')
    .update(backup.toLowerCase() + '\n' + planId)
    .digest('hex')
    .slice(0, 16)
  const root = path.resolve(tmpdir(), `abu-${key}`),
    snapshot = path.join(root, 's')
  const release = await acquireMutex(backup)
  try {
    await validateSnapshot(backup)
    await noLinks(root)
    await mkdir(root, { recursive: true, mode: 0o700 })
    const ownerFile = path.join(root, 'owner.json')
    if (await exists(ownerFile)) {
      const owner = await readJson(ownerFile)
      if (!isObjectRecord(owner) || owner.backupPath !== backup || owner.planId !== planId)
        throw new Error('更新暂存目录身份不匹配。')
    } else await writeJson(ownerFile, { backupPath: backup, planId })
    if (
      path.dirname(snapshot) !== root ||
      !path.basename(root).startsWith('abu-') ||
      path.dirname(root) !== path.resolve(tmpdir())
    )
      throw new Error('更新暂存路径不安全。')
    await rm(snapshot, { recursive: true, force: true })
    await mkdir(snapshot, { recursive: true })
    async function clone(source: string, target: string): Promise<void> {
      for (const entry of await readdir(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name),
          to = path.join(target, entry.name)
        if (entry.isSymbolicLink()) throw new Error('备份中存在链接，不能创建更新快照。')
        if (entry.isDirectory()) {
          await mkdir(to, { recursive: true })
          await clone(from, to)
        } else if (entry.isFile()) await copyFile(from, to)
        else throw new Error('备份存在不支持的文件类型。')
      }
    }
    await clone(backup, snapshot)
    return { root, snapshot }
  } finally {
    await release()
  }
}

async function atomicCopy(source: string, destination: string,tag= randomUUID().slice(0,8)): Promise<void> {
  await noLinks(destination)
  await mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.update-${tag}.tmp`
  try {
    await copyFile(source, temporary)
    await rename(temporary, destination)
  } finally {
    await rm(temporary, { force: true })
  }
}
async function journalFile(root: string): Promise<string> {
  const directory = root + '.update-work'
  await noLinks(directory)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  return path.join(directory, 'transaction.json')
}
async function persistJournal(file: string, journal: Journal): Promise<void> {
  const temporary = file + '.tmp'
  await writeJson(temporary, journal)
  await rename(temporary, file)
}
function readJournal(value: unknown, root: string): Journal {
  if (
    !isObjectRecord(value) ||
    value.version !== 1 ||
    value.backupPath !== root ||
    value.phase !== 'committing' ||
    typeof value.historyPath !== 'string' ||
    !value.historyPath.toLowerCase().startsWith((root + '.history' + path.sep).toLowerCase()) ||
    typeof value.oldManifestSha256 !== 'string' ||
    !HASH.test(value.oldManifestSha256) ||
    typeof value.newManifestSha256 !== 'string' ||
    !HASH.test(value.newManifestSha256) ||
    !Array.isArray(value.oldFiles) ||
    !Array.isArray(value.changed) ||
    !Array.isArray(value.additions) ||
    !Array.isArray(value.removals)
    ||typeof value.nonce!=='string'||!/^[a-f\d]{12}$/.test(value.nonce)
  )
    throw new Error('更新恢复记录无效，请保留历史归档并人工核对。')
  const oldManifest = {
    format_version: 1,
    project_ref: 'ckbftoopuyophiebamwy',
    files: value.oldFiles
  }
  if (!isManifest(oldManifest)) throw new Error('旧版本恢复清单无效。')
  const strings = (items: unknown[]) => items.map(relativePath)
  return {
    version: 1,
    backupPath: root,
    phase: 'committing',
    historyPath: path.resolve(value.historyPath),
    oldManifestSha256: value.oldManifestSha256,
    newManifestSha256: value.newManifestSha256,
    oldFiles: oldManifest.files,
    changed: strings(value.changed),
    additions: strings(value.additions),
    removals: strings(value.removals)
    ,nonce:value.nonce
  }
}
async function restoreJournal(root: string, journal: Journal, file: string): Promise<void> {
  await noLinks(journal.historyPath)
  const archivedManifest = path.join(journal.historyPath, 'manifest.json')
  if ((await fileHash(archivedManifest)) !== journal.oldManifestSha256.toLowerCase())
    throw new Error('旧版本归档清单损坏，不能自动恢复。')
  const oldByPath = new Map(journal.oldFiles.map((entry) => [relativePath(entry.path), entry]))
  for(const relative of [...journal.changed,...journal.additions,'manifest.json'])
    for(const phase of ['c','r'])await rm(inside(root,relative)+`.update-${phase}-${journal.nonce}.tmp`,{force:true})
  for (const relative of [...journal.changed, ...journal.removals]) {
    const entry = oldByPath.get(relative),
      archived = inside(journal.historyPath, relative)
    if (
      !entry ||
      !(await exists(archived)) ||
      (await fileHash(archived)) !== entry.sha256.toLowerCase()
    )
      throw new Error('旧文件归档不完整，不能继续回滚。')
  }
  for (const relative of journal.additions) {
    if (oldByPath.has(relative)) throw new Error('恢复记录的新增文件与旧清单冲突。')
    await rm(inside(root, relative), { force: true })
  }
  for (const relative of [...journal.changed, ...journal.removals]) {
    const target=inside(root,relative), entry=oldByPath.get(relative)!
    if(!await exists(target)||await fileHash(target)!==entry.sha256.toLowerCase())
      await atomicCopy(inside(journal.historyPath, relative), target,`r-${journal.nonce}`)
  }
  if(!await exists(path.join(root,'manifest.json'))||await fileHash(path.join(root,'manifest.json'))!==journal.oldManifestSha256.toLowerCase())
    await atomicCopy(archivedManifest, path.join(root, 'manifest.json'),`r-${journal.nonce}`)
  await validateSnapshot(root, journal.oldManifestSha256)
  await rm(file, { force: true })
}
export async function recoverBackupUpdate(backupPath: string): Promise<boolean> {
  const root = path.resolve(backupPath),
    file = path.join(root + '.update-work', 'transaction.json')
  await noLinks(file)
  if (!(await exists(file))) return false
  const release = await acquireMutex(root)
  try {
    if (!(await exists(file))) return false
    await restoreJournal(root, readJournal(await readJson(file), root), file)
    return true
  } finally {
    await release()
  }
}

export async function commitBackupUpdate(
  backupPath: string,
  stagedPath: string,
  expectedBaseSha256: string
): Promise<{ changedFiles: number; removedFiles: number; historyPath: string }> {
  const root = path.resolve(backupPath),
    stage = path.resolve(stagedPath)
  if (!HASH.test(expectedBaseSha256)) throw new Error('原备份版本标识无效。')
  const stageParent = path.dirname(stage),
    owner = await readJson(path.join(stageParent, 'owner.json'))
  if (
    path.basename(stage) !== 's' ||
    path.dirname(stageParent) !== path.resolve(tmpdir()) ||
    !/^abu-[a-f\d]{16}$/.test(path.basename(stageParent)) ||
    !isObjectRecord(owner) ||
    owner.backupPath !== root ||
    typeof owner.planId !== 'string' ||
    !GUID.test(owner.planId)
  )
    throw new Error('更新快照目录不属于本次任务。')
  const release = await acquireMutex(root)
  try {
    const old = await validateSnapshot(root, expectedBaseSha256),
      fresh = await validateSnapshot(stage)
    if (old.project_ref !== fresh.project_ref) throw new Error('新旧快照来源项目不一致。')
    const oldFiles = new Map(old.files.map((entry) => [relativePath(entry.path), entry]))
    const newFiles = new Map(fresh.files.map((entry) => [relativePath(entry.path), entry]))
    const changed = [...newFiles]
      .filter(
        ([rel, entry]) =>
          oldFiles.has(rel) &&
          oldFiles.get(rel)!.sha256.toLowerCase() !== entry.sha256.toLowerCase()
      )
      .map(([rel]) => rel)
    const additions = [...newFiles.keys()].filter((rel) => !oldFiles.has(rel))
    const removals = [...oldFiles.keys()].filter((rel) => !newFiles.has(rel))
    if (!changed.length && !additions.length && !removals.length)
      return { changedFiles: 0, removedFiles: 0, historyPath: '' }
    const historyPath = path.join(root + '.history', expectedBaseSha256.toLowerCase(), randomUUID())
    await noLinks(historyPath)
    await mkdir(historyPath, { recursive: true, mode: 0o700 })
    await copyFile(path.join(root, 'manifest.json'), path.join(historyPath, 'manifest.json'))
    for (const relative of [...changed, ...removals]) {
      const target = inside(historyPath, relative)
      await mkdir(path.dirname(target), { recursive: true })
      await copyFile(inside(root, relative), target)
      if ((await fileHash(target)) !== oldFiles.get(relative)!.sha256.toLowerCase())
        throw new Error('旧版本文件归档校验失败，原备份未替换。')
    }
    const file = await journalFile(root)
    if (await exists(file)) throw new Error('存在尚未完成的更新，请先恢复。')
    const journal: Journal = {
      version: 1,
      backupPath: root,
      phase: 'committing',
      historyPath,
      oldManifestSha256: expectedBaseSha256,
      newManifestSha256: await fileHash(path.join(stage, 'manifest.json')),
      oldFiles: old.files,
      changed,
      additions,
      removals
      ,nonce:randomUUID().replaceAll('-','').slice(0,12)
    }
    await persistJournal(file, journal)
    try {
      for (const relative of [...changed, ...additions])
        await atomicCopy(inside(stage, relative), inside(root, relative),`c-${journal.nonce}`)
      for (const relative of removals) await rm(inside(root, relative), { force: true })
      await atomicCopy(path.join(stage, 'manifest.json'), path.join(root, 'manifest.json'),`c-${journal.nonce}`)
      await validateSnapshot(root, journal.newManifestSha256)
      await rm(file, { force: true })
      return {
        changedFiles: changed.length + additions.length,
        removedFiles: removals.length,
        historyPath
      }
    } catch (cause) {
      await restoreJournal(root, journal, file)
      throw new Error('更新文件提交失败，已恢复原完整备份；请检查磁盘和目录占用后重试。', { cause })
    }
  } finally {
    await release()
  }
}
