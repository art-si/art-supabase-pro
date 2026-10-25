import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hostedModuleSharedDependencies } from './hosted-module-dependencies.mjs'

type ModuleAction = 'pull' | 'update' | 'install' | 'check' | 'build' | 'setup' | 'status'
type ModulePackageAction = 'install' | 'check' | 'build'

interface ModuleDefinition {
  name: string
  path: string
}

interface CommandResult {
  output: string
  status: number
}

interface PackageManifest {
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
  peerDependencies?: Record<string, unknown>
  name?: string
  version?: string
}

interface OperationLock {
  action: string
  pid: number
  startedAt: string
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const gitRetryLimit = 3
const gitNetworkOptions = ['-c', 'http.version=HTTP/1.1', '-c', 'submodule.fetchJobs=1']
const pnpmRegistryOption = '--registry=https://registry.npmjs.org/'
const pnpmNetworkOptions = [
  pnpmRegistryOption,
  '--fetch-timeout=60000',
  '--fetch-retries=2',
  '--fetch-retry-mintimeout=10000',
  '--fetch-retry-maxtimeout=30000'
]
const pnpmInstallOptions = [
  ...pnpmNetworkOptions,
  '--package-import-method=copy',
  '--side-effects-cache=false'
]
const preparedEsbuildBinaries = new Map<string, string>()
const useWorkspacePlatform = process.argv.includes('--workspace-platform')
let preparedWorkspacePlatformPackage: string | undefined

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ')
}

function executeCommand(
  command: string,
  args: string[],
  cwd = projectRoot,
  printOutput = true,
  streamOutput = false
): CommandResult {
  if (streamOutput) {
    const result = spawnSync(command, args, {
      cwd,
      env: process.env,
      stdio: 'inherit'
    })
    if (result.error) throw result.error
    return { output: '', status: result.status ?? 1 }
  }

  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: process.env
  })

  if (result.error) throw result.error

  const output = [result.stdout, result.stderr].filter(Boolean).join('')
  if (printOutput && output) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)

  return {
    output,
    status: result.status ?? 1
  }
}

function runCommand(
  command: string,
  args: string[],
  cwd = projectRoot,
  printOutput = true,
  streamOutput = false
): void {
  const result = executeCommand(command, args, cwd, printOutput, streamOutput)
  if (result.status !== 0) {
    if (!printOutput && result.output) process.stdout.write(result.output)
    throw new Error(`${formatCommand(command, args)} 执行失败，退出码 ${result.status}`)
  }
}

function runGit(args: string[], cwd = projectRoot): void {
  runCommand('git', [...gitNetworkOptions, ...args], cwd)
}

function runPackageManager(
  args: string[],
  cwd: string,
  localPlatformPackage?: string,
  printOutput = true
): void {
  const localOverride = localPlatformPackage
    ? [
        `--config.overrides.art-supabase-pro=file:${relative(cwd, localPlatformPackage).replaceAll('\\', '/')}`
      ]
    : []
  const pnpmArgs =
    args[0] === 'install'
      ? [...pnpmInstallOptions, ...localOverride, ...args]
      : [...localOverride, ...args]
  const pnpmCliPath = process.env.npm_execpath
  if (pnpmCliPath?.toLowerCase().includes('pnpm')) {
    runCommand(process.execPath, [pnpmCliPath, ...pnpmArgs], cwd, printOutput, printOutput)
    return
  }

  if (process.platform === 'win32') {
    runCommand(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'pnpm.cmd', ...pnpmArgs],
      cwd,
      printOutput,
      printOutput
    )
    return
  }

  runCommand('pnpm', pnpmArgs, cwd, printOutput, printOutput)
}

function ensurePathInside(parentPath: string, candidatePath: string, label: string): void {
  const relativePath = relative(parentPath, candidatePath)
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`${label} 超出允许目录：${candidatePath}`)
  }
}

function readModuleDefinitions(): ModuleDefinition[] {
  const result = executeCommand(
    'git',
    ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'],
    projectRoot,
    false
  )

  if (result.status !== 0) throw new Error('读取 .gitmodules 失败，请确认当前目录是主工程根目录。')

  const modules = result.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(' ')
      const key = line.slice(0, separatorIndex)
      const modulePath = line.slice(separatorIndex + 1).trim()
      const name = key.slice('submodule.'.length, -'.path'.length)
      const absoluteModulePath = resolve(projectRoot, modulePath)

      ensurePathInside(projectRoot, absoluteModulePath, `子仓 ${name}`)
      return { name, path: modulePath }
    })

  if (modules.length === 0) throw new Error('.gitmodules 中没有配置子仓。')
  return modules
}

function selectModules(modules: ModuleDefinition[], selectors: string[]): ModuleDefinition[] {
  if (selectors.length === 0) return modules

  const normalizedSelectors = selectors.map((selector) => selector.trim().toLowerCase())
  const matchesSelector = (module: ModuleDefinition, selector: string): boolean => {
    const moduleBaseName = basename(module.path).toLowerCase()
    return [
      module.name.toLowerCase(),
      module.path.toLowerCase(),
      moduleBaseName,
      moduleBaseName.replace(/^art-supabase-/, '')
    ].includes(selector)
  }
  const unknownSelectors = normalizedSelectors.filter(
    (selector) => !modules.some((module) => matchesSelector(module, selector))
  )

  if (unknownSelectors.length > 0) {
    throw new Error(
      `未找到子仓：${unknownSelectors.join('、')}。可用简称：${modules
        .map((module) => basename(module.path).replace(/^art-supabase-/, ''))
        .join('、')}`
    )
  }

  const selectedModules = modules.filter((module) =>
    normalizedSelectors.some((selector) => matchesSelector(module, selector))
  )
  console.log(`[module] 本次作用子仓：${selectedModules.map((module) => module.path).join('、')}`)
  return selectedModules
}

function readGitCommonDirectory(): string {
  const result = executeCommand('git', ['rev-parse', '--git-common-dir'], projectRoot, false)
  if (result.status !== 0) throw new Error('无法读取主仓 Git 目录。')
  return resolve(projectRoot, result.output.trim())
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function readOperationLock(lockPath: string): OperationLock | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (
      value &&
      typeof value === 'object' &&
      'pid' in value &&
      typeof value.pid === 'number' &&
      'action' in value &&
      typeof value.action === 'string' &&
      'startedAt' in value &&
      typeof value.startedAt === 'string'
    ) {
      return { action: value.action, pid: value.pid, startedAt: value.startedAt }
    }
  } catch {
    return undefined
  }
  return undefined
}

function acquireOperationLock(action: ModuleAction): () => void {
  const commonGitDirectory = readGitCommonDirectory()
  const lockPath = resolve(commonGitDirectory, 'module-operation.lock')
  ensurePathInside(commonGitDirectory, lockPath, '子仓操作锁')

  if (existsSync(lockPath)) {
    const currentLock = readOperationLock(lockPath)
    if (currentLock && isProcessRunning(currentLock.pid)) {
      throw new Error(
        `已有子仓命令正在运行：${currentLock.action}（PID ${currentLock.pid}，开始于 ${currentLock.startedAt}）。请等待它完成后重试。`
      )
    }
    unlinkSync(lockPath)
    console.warn('[module] 已清理上次异常退出留下的子仓操作锁。')
  }

  const descriptor = openSync(lockPath, 'wx')
  const operationLock: OperationLock = {
    action,
    pid: process.pid,
    startedAt: new Date().toISOString()
  }
  try {
    writeFileSync(descriptor, `${JSON.stringify(operationLock)}\n`)
  } finally {
    closeSync(descriptor)
  }

  return () => {
    const currentLock = readOperationLock(lockPath)
    if (currentLock?.pid === process.pid && existsSync(lockPath)) unlinkSync(lockPath)
  }
}

function readPackageManifest(packageRoot: string): PackageManifest {
  const manifestPath = join(packageRoot, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`${relative(projectRoot, manifestPath)} 不存在。`)

  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`${relative(projectRoot, manifestPath)} 格式无效。`)
  }
  return manifest as PackageManifest
}

function readPlatformPackageReference(manifest: PackageManifest): string | undefined {
  const reference =
    manifest.dependencies?.['art-supabase-pro'] ||
    manifest.devDependencies?.['art-supabase-pro'] ||
    manifest.peerDependencies?.['art-supabase-pro']
  return typeof reference === 'string' ? reference : undefined
}

function listMissingDirectDependencies(moduleRoot: string, manifest: PackageManifest): string[] {
  const dependencyNames = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {})
  ])

  return [...dependencyNames].filter(
    (dependencyName) =>
      !existsSync(join(moduleRoot, 'node_modules', ...dependencyName.split('/'), 'package.json'))
  )
}

function hasInstalledPlatformTypes(moduleRoot: string, manifest: PackageManifest): boolean {
  if (!readPlatformPackageReference(manifest)) return true

  const platformRoot = join(moduleRoot, 'node_modules', 'art-supabase-pro')
  const platformManifestPath = join(platformRoot, 'package.json')
  if (!existsSync(platformManifestPath)) return false

  try {
    const platformManifest: unknown = JSON.parse(readFileSync(platformManifestPath, 'utf8'))
    if (
      !platformManifest ||
      typeof platformManifest !== 'object' ||
      !('types' in platformManifest)
    ) {
      return false
    }

    const typesPath = platformManifest.types
    return typeof typesPath === 'string' && existsSync(resolve(platformRoot, typesPath))
  } catch {
    return false
  }
}

function listDependencyProblems(moduleRoot: string, manifest: PackageManifest): string[] {
  const problems = listMissingDirectDependencies(moduleRoot, manifest).map(
    (dependencyName) => `缺少 ${dependencyName}`
  )
  const duplicatedSharedDependencies = readPlatformPackageReference(manifest)
    ? hostedModuleSharedDependencies.filter(
        (dependencyName) => dependencyName in (manifest.dependencies ?? {})
      )
    : []
  for (const dependencyName of duplicatedSharedDependencies) {
    problems.push(`公共运行时 ${dependencyName} 必须由主仓提供，请改为 peerDependencies`)
  }
  if (!hasInstalledPlatformTypes(moduleRoot, manifest)) {
    problems.push('art-supabase-pro 类型入口不可用')
  }
  return problems
}

function createPinnedPlatformPackage(module: ModuleDefinition, reference: string): string {
  if (useWorkspacePlatform) return createWorkspacePlatformPackage()

  const commit = /\/archive\/([0-9a-f]{40})\.tar\.gz(?:$|[?#])/i.exec(reference)?.[1]
  if (!commit) {
    throw new Error(`${module.path} 的 art-supabase-pro 依赖不是可识别的锁定提交。`)
  }

  const commitCheck = executeCommand(
    'git',
    ['cat-file', '-e', `${commit}^{commit}`],
    projectRoot,
    false
  )
  if (commitCheck.status !== 0) {
    throw new Error(`${module.path} 锁定的主仓提交 ${commit} 不在本地 Git 历史中。`)
  }

  const commonGitDirectory = readGitCommonDirectory()
  const packageDirectory = resolve(commonGitDirectory, 'module-packages')
  ensurePathInside(commonGitDirectory, packageDirectory, '本地主仓包目录')
  mkdirSync(packageDirectory, { recursive: true })

  const packagePath = join(packageDirectory, `art-supabase-pro-${commit}.tgz`)
  if (existsSync(packagePath)) return packagePath

  console.log(`[module] 从本地 Git 生成主仓锁定提交包：${commit.slice(0, 12)}`)
  runCommand(
    'git',
    ['archive', '--format=tar.gz', '--prefix=package/', `--output=${packagePath}`, commit],
    projectRoot,
    false
  )
  if (!existsSync(packagePath)) throw new Error(`本地主仓包生成失败：${packagePath}`)
  return packagePath
}

function createWorkspacePlatformPackage(): string {
  if (preparedWorkspacePlatformPackage) return preparedWorkspacePlatformPackage

  const manifest = readPackageManifest(projectRoot)
  if (!manifest.name || !manifest.version) {
    throw new Error('主仓 package.json 缺少 name 或 version，无法生成工作区包。')
  }

  const commonGitDirectory = readGitCommonDirectory()
  const packageDirectory = resolve(commonGitDirectory, 'module-packages', 'workspace')
  ensurePathInside(commonGitDirectory, packageDirectory, '工作区主仓包目录')
  mkdirSync(packageDirectory, { recursive: true })

  const packageName = manifest.name.replace(/^@/, '').replaceAll('/', '-')
  const packedPath = resolve(packageDirectory, `${packageName}-${manifest.version}.tgz`)
  ensurePathInside(packageDirectory, packedPath, '工作区主仓临时包')
  if (existsSync(packedPath)) unlinkSync(packedPath)

  console.log('[module] 从当前主仓工作区生成集成验证包。')
  runPackageManager(
    ['pack', '--json', '--pack-destination', packageDirectory],
    projectRoot,
    undefined,
    false
  )
  if (!existsSync(packedPath)) throw new Error(`工作区主仓包生成失败：${packedPath}`)

  const contentHash = createHash('sha256')
    .update(readFileSync(packedPath))
    .digest('hex')
    .slice(0, 12)
  const packagePath = resolve(
    packageDirectory,
    `${packageName}-${manifest.version}-workspace-${contentHash}.tgz`
  )
  ensurePathInside(packageDirectory, packagePath, '工作区主仓包')
  if (existsSync(packagePath)) unlinkSync(packagePath)
  renameSync(packedPath, packagePath)
  preparedWorkspacePlatformPackage = packagePath
  return packagePath
}

function moduleInstallBackupDirectory(module: ModuleDefinition): string {
  const commonGitDirectory = readGitCommonDirectory()
  const backupRoot = resolve(commonGitDirectory, 'module-install-backups')
  ensurePathInside(commonGitDirectory, backupRoot, '子仓安装备份目录')

  const safeName = module.name.replace(/[^a-zA-Z0-9._-]/g, '-')
  const backupDirectory = resolve(backupRoot, safeName)
  ensurePathInside(backupRoot, backupDirectory, `子仓安装备份 ${module.name}`)
  return backupDirectory
}

function restoreInterruptedModuleInstall(module: ModuleDefinition): void {
  const backupDirectory = moduleInstallBackupDirectory(module)
  const markerPath = join(backupDirectory, 'status.txt')
  if (!existsSync(markerPath) || readFileSync(markerPath, 'utf8').trim() !== 'active') return

  const moduleRoot = resolve(projectRoot, module.path)
  const lockfileBackup = join(backupDirectory, 'pnpm-lock.yaml')
  const workspaceBackup = join(backupDirectory, 'pnpm-workspace.yaml')
  if (!existsSync(lockfileBackup) || !existsSync(workspaceBackup)) {
    throw new Error(`${module.path} 的安装恢复文件不完整，请检查 ${backupDirectory}。`)
  }

  writeFileSync(join(moduleRoot, 'pnpm-lock.yaml'), readFileSync(lockfileBackup))
  writeFileSync(join(moduleRoot, 'pnpm-workspace.yaml'), readFileSync(workspaceBackup))
  writeFileSync(markerPath, 'restored\n')
  console.warn(`[module] 已恢复上次中断安装前的 ${module.path} 锁文件。`)
}

function addPlatformOverride(workspace: string, packageReference: string): string {
  const newline = workspace.includes('\r\n') ? '\r\n' : '\n'
  const lines = workspace.split(/(?<=\n)/)
  const overridesIndex = lines.findIndex((line) => /^overrides:\s*(?:#.*)?(?:\r?\n)?$/.test(line))
  const overrideLine = `  art-supabase-pro: "file:${packageReference}"${newline}`

  if (overridesIndex === -1) {
    return `${workspace.trimEnd()}${newline}${newline}overrides:${newline}${overrideLine}`
  }

  const blockEndIndex = lines.findIndex(
    (line, index) => index > overridesIndex && /^[^\s#][^:]*:/.test(line)
  )
  const overridesEnd = blockEndIndex === -1 ? lines.length : blockEndIndex
  const existingOverrideIndex = lines.findIndex(
    (line, index) =>
      index > overridesIndex &&
      index < overridesEnd &&
      /^\s{2}(?:['"])?art-supabase-pro(?:['"])?\s*:/.test(line)
  )

  if (existingOverrideIndex !== -1) {
    lines[existingOverrideIndex] = overrideLine
    return lines.join('')
  }

  lines.splice(overridesIndex + 1, 0, overrideLine)
  return lines.join('')
}

function prepareLocalPlatformOverride(
  module: ModuleDefinition,
  localPlatformPackage: string
): () => void {
  const moduleRoot = resolve(projectRoot, module.path)
  const lockfilePath = join(moduleRoot, 'pnpm-lock.yaml')
  const workspacePath = join(moduleRoot, 'pnpm-workspace.yaml')
  if (!existsSync(lockfilePath) || !existsSync(workspacePath)) {
    throw new Error(`${module.path} 缺少 pnpm-lock.yaml 或 pnpm-workspace.yaml。`)
  }

  const lockfile = readFileSync(lockfilePath)
  const workspace = readFileSync(workspacePath, 'utf8')

  const backupDirectory = moduleInstallBackupDirectory(module)
  mkdirSync(backupDirectory, { recursive: true })
  const markerPath = join(backupDirectory, 'status.txt')
  writeFileSync(join(backupDirectory, 'pnpm-lock.yaml'), lockfile)
  writeFileSync(join(backupDirectory, 'pnpm-workspace.yaml'), workspace)
  writeFileSync(markerPath, 'active\n')

  const packageReference = relative(moduleRoot, localPlatformPackage).replaceAll('\\', '/')
  writeFileSync(workspacePath, addPlatformOverride(workspace, packageReference))

  return () => {
    writeFileSync(lockfilePath, lockfile)
    writeFileSync(workspacePath, workspace)
    writeFileSync(markerPath, 'complete\n')
  }
}

function prepareEsbuildPlatformPackage(moduleRoot: string): string | undefined {
  if (process.platform !== 'win32') return undefined

  const lockfilePath = join(moduleRoot, 'pnpm-lock.yaml')
  if (!existsSync(lockfilePath)) return undefined

  const lockfile = readFileSync(lockfilePath, 'utf8')
  const esbuildVersion = /^\s{2}'?@esbuild\/win32-x64@([^':]+)'?:/m.exec(lockfile)?.[1]
  if (!esbuildVersion) return undefined

  const preparedBinary = preparedEsbuildBinaries.get(esbuildVersion)
  if (preparedBinary) return preparedBinary

  console.log(`[module] 准备 esbuild Windows 二进制：${esbuildVersion}`)
  runPackageManager(
    [
      pnpmRegistryOption,
      'store',
      'add',
      `esbuild@${esbuildVersion}`,
      `@esbuild/win32-x64@${esbuildVersion}`
    ],
    projectRoot
  )

  const commonGitDirectory = readGitCommonDirectory()
  const toolsRoot = resolve(commonGitDirectory, 'module-platform-tools')
  const toolRoot = resolve(toolsRoot, `esbuild-${esbuildVersion}`)
  ensurePathInside(commonGitDirectory, toolsRoot, '子仓平台工具目录')
  ensurePathInside(toolsRoot, toolRoot, 'esbuild 平台工具目录')
  mkdirSync(toolRoot, { recursive: true })
  writeFileSync(
    join(toolRoot, 'package.json'),
    `${JSON.stringify(
      {
        name: `art-supabase-esbuild-${esbuildVersion}`,
        private: true,
        dependencies: { '@esbuild/win32-x64': esbuildVersion }
      },
      undefined,
      2
    )}\n`
  )
  writeFileSync(join(toolRoot, 'pnpm-workspace.yaml'), 'packages: []\n')
  runPackageManager(['install', '--offline', '--ignore-scripts'], toolRoot)

  const binaryPath = join(toolRoot, 'node_modules', '@esbuild', 'win32-x64', 'esbuild.exe')
  if (!existsSync(binaryPath)) throw new Error(`esbuild Windows 二进制准备失败：${binaryPath}`)

  const versionResult = executeCommand(binaryPath, ['--version'], toolRoot, false)
  if (versionResult.status !== 0 || versionResult.output.trim() !== esbuildVersion) {
    throw new Error(
      `esbuild Windows 二进制版本不匹配：期望 ${esbuildVersion}，实际 ${versionResult.output.trim() || '无法读取'}`
    )
  }

  preparedEsbuildBinaries.set(esbuildVersion, binaryPath)
  return binaryPath
}

function isModuleInitialized(modulePath: string): boolean {
  const moduleRoot = join(projectRoot, modulePath)
  if (!existsSync(join(moduleRoot, '.git'))) return false
  if (hasOnlyGitPointer(moduleRoot)) return false

  const result = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: moduleRoot,
    encoding: 'utf8'
  })
  return result.status === 0 && result.stdout.trim() === 'true'
}

function hasOnlyGitPointer(moduleRoot: string): boolean {
  return (
    existsSync(join(moduleRoot, '.git')) &&
    readdirSync(moduleRoot).every((entry) => entry === '.git')
  )
}

function isTransientGitFailure(output: string): boolean {
  return /early EOF|RPC failed|schannel|TLS|timed? ?out|server closed abruptly|unexpected disconnect|remote end hung up|connection (?:was )?reset|could not resolve host/i.test(
    output
  )
}

function isRepairableGitFailure(output: string): boolean {
  return /transport 'file' not allowed|did not contain [0-9a-f]{7,}|unable to find current revision|not our ref|bad object|invalid object|index-pack (?:failed|output)/i.test(
    output
  )
}

function quarantineBrokenModule(module: ModuleDefinition): void {
  const moduleRoot = resolve(projectRoot, module.path)
  const nonGitEntries = existsSync(moduleRoot)
    ? readdirSync(moduleRoot).filter((entry) => entry !== '.git')
    : []

  if (nonGitEntries.length > 0) {
    throw new Error(
      `${module.path} 存在工作文件，为避免覆盖数据，未自动修复。请先提交或备份该子仓。`
    )
  }

  executeCommand('git', ['submodule', 'deinit', '--force', '--', module.path])

  const commonGitDirectory = readGitCommonDirectory()
  const modulesCacheRoot = resolve(commonGitDirectory, 'modules')
  const moduleCache = resolve(modulesCacheRoot, module.name)
  ensurePathInside(modulesCacheRoot, moduleCache, `子仓缓存 ${module.name}`)

  const quarantineRoot = resolve(commonGitDirectory, 'module-recovery')
  ensurePathInside(commonGitDirectory, quarantineRoot, '子仓缓存隔离目录')
  mkdirSync(quarantineRoot, { recursive: true })

  const suffix = new Date().toISOString().replace(/\D/g, '')
  const safeName = module.name.replace(/[^a-zA-Z0-9._-]/g, '-')

  if (existsSync(moduleCache)) {
    const cacheDestination = join(quarantineRoot, `${safeName}-${suffix}`)
    renameSync(moduleCache, cacheDestination)
    console.log(`[module] 已将损坏缓存隔离到 ${relative(projectRoot, cacheDestination)}`)
  }

  const gitPointer = join(moduleRoot, '.git')
  if (existsSync(gitPointer)) {
    const pointerDestination = join(quarantineRoot, `${safeName}-${suffix}.git-pointer`)
    renameSync(gitPointer, pointerDestination)
  }
}

function updateOneModule(module: ModuleDefinition, remote: boolean): void {
  let repaired = false

  for (let attempt = 1; attempt <= gitRetryLimit; attempt += 1) {
    const args = ['submodule', 'update', '--init', '--recursive', '--jobs', '1']
    if (remote) args.push('--remote')
    if (
      existsSync(resolve(projectRoot, module.path)) &&
      hasOnlyGitPointer(resolve(projectRoot, module.path))
    ) {
      args.push('--force')
    }
    args.push('--', module.path)

    const result = executeCommand('git', [...gitNetworkOptions, ...args])
    if (result.status === 0) return

    if (!repaired && isRepairableGitFailure(result.output)) {
      console.warn(`[module] ${module.path} 的 Git 缓存不完整，正在安全隔离后重试。`)
      quarantineBrokenModule(module)
      repaired = true
      continue
    }

    if (attempt < gitRetryLimit && isTransientGitFailure(result.output)) {
      console.warn(
        `[module] ${module.path} 网络传输中断，自动重试 ${attempt}/${gitRetryLimit - 1}。`
      )
      continue
    }

    throw new Error(`${module.path} 拉取失败（Git 退出码 ${result.status}）。`)
  }
}

function checkoutModuleMaster(module: ModuleDefinition): void {
  const moduleRoot = resolve(projectRoot, module.path)
  const remoteMaster = executeCommand(
    'git',
    ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/master'],
    moduleRoot,
    false
  )
  if (remoteMaster.status !== 0) throw new Error(`${module.path} 的 origin/master 不存在。`)

  const localMaster = executeCommand(
    'git',
    ['show-ref', '--verify', '--quiet', 'refs/heads/master'],
    moduleRoot,
    false
  )
  const currentBranch = executeCommand(
    'git',
    ['symbolic-ref', '--quiet', '--short', 'HEAD'],
    moduleRoot,
    false
  ).output.trim()
  if (localMaster.status === 0 && currentBranch !== 'master') {
    const fastForward = executeCommand(
      'git',
      ['merge-base', '--is-ancestor', 'master', 'origin/master'],
      moduleRoot,
      false
    )
    if (fastForward.status !== 0) {
      throw new Error(`${module.path} 的本地 master 含有未推送提交，不能自动改写分支。`)
    }
    runGit(['branch', '-f', 'master', 'origin/master'], moduleRoot)
  }

  if (localMaster.status === 0) runGit(['checkout', 'master'], moduleRoot)
  else runGit(['checkout', '--track', '-b', 'master', 'origin/master'], moduleRoot)

  runGit(['merge', '--ff-only', 'origin/master'], moduleRoot)
  runGit(['branch', '--set-upstream-to=origin/master', 'master'], moduleRoot)
}

function runForEveryModule(
  modules: ModuleDefinition[],
  actionLabel: string,
  operation: (module: ModuleDefinition) => void
): void {
  const failures: string[] = []

  for (const [index, module] of modules.entries()) {
    console.log(`\n[module ${index + 1}/${modules.length}] ${module.path} · ${actionLabel}`)
    try {
      operation(module)
      console.log(`[module] ${module.path} · 完成`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误'
      failures.push(`${module.path}：${message}`)
      console.error(`[module] ${module.path} · 失败：${message}`)
    }
  }

  if (failures.length > 0) {
    throw new Error(`${actionLabel}未全部完成：\n- ${failures.join('\n- ')}`)
  }
}

function pullModules(modules: ModuleDefinition[], remote = false, checkoutMaster = false): void {
  console.log(
    remote
      ? '\n[module] 更新到各子仓配置分支的最新提交。完成后请检查主仓 gitlink 变化。'
      : '\n[module] 初始化子仓并拉取主仓锁定版本。'
  )
  runGit(['submodule', 'sync', '--recursive'])
  runForEveryModule(modules, remote ? '更新' : '拉取', (module) => {
    updateOneModule(module, remote)
    if (checkoutMaster) checkoutModuleMaster(module)
  })
}

function syncIdeGitMappings(modules: ModuleDefinition[]): void {
  const mappingPath = join(projectRoot, '.idea', 'vcs.xml')
  if (!existsSync(mappingPath)) return

  const contents = readFileSync(mappingPath, 'utf8')
  const componentStart = contents.indexOf('<component name="VcsDirectoryMappings">')
  const componentEnd = contents.indexOf('</component>', componentStart)
  if (componentStart < 0 || componentEnd < 0) {
    throw new Error('.idea/vcs.xml 缺少 VcsDirectoryMappings，无法登记新增子仓。')
  }

  const existingMappings = contents.slice(componentStart, componentEnd)
  const missingModules = modules.filter(
    (module) => !existingMappings.includes(`directory="$PROJECT_DIR$/${module.path}"`)
  )
  if (missingModules.length === 0) {
    console.log(`[module] IDE Git 映射文件已包含全部 ${modules.length} 个子仓。`)
    return
  }
  const newline = contents.includes('\r\n') ? '\r\n' : '\n'
  const additions = missingModules
    .map((module) => `    <mapping directory="$PROJECT_DIR$/${module.path}" vcs="Git" />${newline}`)
    .join('')
  const insertionIndex = contents.lastIndexOf('\n', componentEnd - 1) + 1
  writeFileSync(
    mappingPath,
    `${contents.slice(0, insertionIndex)}${additions}${contents.slice(insertionIndex)}`
  )
  console.log(`[module] IDE Git 映射文件新增 ${missingModules.length} 个子仓。`)
}

function pullLatestRepositories(selectors: string[]): void {
  const currentModules = readModuleDefinitions()
  const dirtyModules = new Set<string>()
  for (const module of currentModules) {
    if (!isModuleInitialized(module.path)) continue
    const moduleRoot = resolve(projectRoot, module.path)
    const changes = executeCommand(
      'git',
      ['status', '--porcelain=v1', '--untracked-files=all'],
      moduleRoot,
      false
    )
    if (changes.status !== 0) throw new Error(`无法检查 ${module.path} 的工作区状态。`)
    if (changes.output.trim()) {
      const head = executeCommand('git', ['rev-parse', 'HEAD'], moduleRoot, false)
      const remoteMaster = executeCommand('git', ['rev-parse', 'origin/master'], moduleRoot, false)
      if (
        head.status !== 0 ||
        remoteMaster.status !== 0 ||
        head.output.trim() !== remoteMaster.output.trim()
      ) {
        throw new Error(`${module.path} 存在未提交的文件变更，且当前提交不是 origin/master。`)
      }
      dirtyModules.add(module.path)
      console.warn(
        `[module] ${module.path} 有未提交文件，当前提交已是 origin/master；将保留这些文件。`
      )
    }
  }

  const pointerChanges = executeCommand(
    'git',
    ['diff', '--name-only', '--', ...currentModules.map((module) => module.path)],
    projectRoot,
    false
  )
  if (pointerChanges.status !== 0) throw new Error('无法检查主仓子仓指针状态。')
  const changedPaths = new Set(pointerChanges.output.split(/\r?\n/).filter(Boolean))
  const cleanChangedModules = currentModules.filter(
    (module) => changedPaths.has(module.path) && !dirtyModules.has(module.path)
  )
  if (cleanChangedModules.length > 0) {
    console.log('\n[module] 对齐无本地文件变更的子仓指针，准备快进主仓。')
    for (const module of cleanChangedModules) {
      runGit(['submodule', 'update', '--init', '--recursive', '--', module.path])
    }
  }
  console.log('\n[module] 拉取主仓上游分支的最新提交。')
  for (let attempt = 1; attempt <= gitRetryLimit; attempt += 1) {
    const result = executeCommand('git', [
      ...gitNetworkOptions,
      'pull',
      '--ff-only',
      '--no-recurse-submodules'
    ])
    if (result.status === 0) break
    if (attempt === gitRetryLimit || !isTransientGitFailure(result.output)) {
      if (
        /local changes .* would be overwritten by merge|would be overwritten by merge/i.test(
          result.output
        )
      ) {
        throw new Error(
          '主仓与本地文件同时有改动，Git 已保留本地文件。请处理上方列出的冲突文件后重试。'
        )
      }
      throw new Error('主仓拉取失败，请确认上游分支已配置且本地可以快进。')
    }
    console.warn(`[module] 主仓网络传输中断，自动重试 ${attempt}/${gitRetryLimit - 1}。`)
  }

  const modules = selectModules(readModuleDefinitions(), selectors)
  pullModules(modules, true, true)
  syncIdeGitMappings(readModuleDefinitions())
  console.log('\n[module] 主仓和子仓已更新；子仓新提交会显示为主仓 gitlink 变化。')
}

function initializeMissingModules(modules: ModuleDefinition[]): void {
  const missingModules = modules.filter((module) => !isModuleInitialized(module.path))
  if (missingModules.length === 0) return

  console.log(
    `\n[module] 检测到 ${missingModules.length} 个子仓尚未初始化，先自动拉取主仓锁定版本。`
  )
  pullModules(missingModules)
}

function runModulePackageAction(
  module: ModuleDefinition,
  action: ModulePackageAction,
  manifest: PackageManifest
): void {
  const moduleRoot = join(projectRoot, module.path)
  const args = action === 'install' ? ['install', '--frozen-lockfile'] : ['run', action]
  const platformReference = readPlatformPackageReference(manifest)
  const platformPackage =
    (action === 'install' || useWorkspacePlatform) && platformReference
      ? createPinnedPlatformPackage(module, platformReference)
      : undefined

  if (platformPackage || action === 'install') {
    console.log(
      platformPackage
        ? `[module] ${module.path} 使用本地主仓精简包${action === 'install' ? '' : '进行联调校验'}。`
        : `[module] ${module.path} 不依赖主仓包，按自身锁文件安装。`
    )
  }
  if (!platformPackage) {
    runPackageManager(args, moduleRoot)
    return
  }

  const esbuildBinaryPath = prepareEsbuildPlatformPackage(moduleRoot)
  const restoreFiles = prepareLocalPlatformOverride(module, platformPackage)
  const previousEsbuildBinaryPath = process.env.ESBUILD_BINARY_PATH
  const previousPlatformRoot = process.env.ART_SUPABASE_PLATFORM_ROOT
  if (esbuildBinaryPath) process.env.ESBUILD_BINARY_PATH = esbuildBinaryPath
  try {
    runPackageManager(['install', '--no-frozen-lockfile', '--prefer-offline'], moduleRoot)
    if (action === 'build' && useWorkspacePlatform) {
      // Verify the packed runtime instead of silently resolving the adjacent workspace.
      process.env.ART_SUPABASE_PLATFORM_ROOT = join(moduleRoot, 'node_modules/art-supabase-pro')
    }
    if (action !== 'install') runPackageManager(args, moduleRoot)
  } finally {
    if (previousPlatformRoot === undefined) delete process.env.ART_SUPABASE_PLATFORM_ROOT
    else process.env.ART_SUPABASE_PLATFORM_ROOT = previousPlatformRoot
    if (previousEsbuildBinaryPath === undefined) delete process.env.ESBUILD_BINARY_PATH
    else process.env.ESBUILD_BINARY_PATH = previousEsbuildBinaryPath
    restoreFiles()
  }
}

function ensureModuleDependencies(
  module: ModuleDefinition,
  moduleRoot: string,
  manifest: PackageManifest
): void {
  const problems = listDependencyProblems(moduleRoot, manifest)
  if (problems.length === 0) return

  console.warn(`[module] ${module.path} 依赖不完整（${problems.join('、')}），构建前自动修复。`)
  runModulePackageAction(module, 'install', manifest)

  const remainingProblems = listDependencyProblems(moduleRoot, manifest)
  if (remainingProblems.length > 0) {
    throw new Error(`依赖修复后仍不可用：${remainingProblems.join('、')}`)
  }
}

function runPackageAction(modules: ModuleDefinition[], action: ModulePackageAction): void {
  initializeMissingModules(modules)

  runForEveryModule(modules, action, (module) => {
    const moduleRoot = join(projectRoot, module.path)
    const manifest = readPackageManifest(moduleRoot)
    if (action !== 'install' && !useWorkspacePlatform) {
      ensureModuleDependencies(module, moduleRoot, manifest)
    }
    if (action !== 'build') {
      runModulePackageAction(module, action, manifest)
      return
    }

    const previousOutputDirectory = process.env.VITE_OUT_DIR
    process.env.VITE_OUT_DIR = resolve(
      projectRoot,
      '.artifacts',
      'module-builds',
      basename(module.path)
    )
    try {
      runModulePackageAction(module, action, manifest)
    } finally {
      if (previousOutputDirectory === undefined) delete process.env.VITE_OUT_DIR
      else process.env.VITE_OUT_DIR = previousOutputDirectory
    }
  })
}

function printStatus(modules: ModuleDefinition[]): void {
  console.log('\n[module] 子仓状态：')
  runCommand('git', ['submodule', 'status', '--', ...modules.map((module) => module.path)])

  const missingCount = modules.filter((module) => !isModuleInitialized(module.path)).length
  console.log(
    missingCount === 0
      ? '[module] 所选子仓均已初始化。'
      : `[module] 还有 ${missingCount} 个子仓未初始化，可执行 pnpm modules:pull。`
  )
}

function printUsage(): void {
  console.log(`
统一子仓管理命令（每条命令默认作用于 .gitmodules 中的全部子仓）：
  pnpm modules:status   查看全部子仓状态
  pnpm modules:pull     快进主仓，发现新增子仓，拉取最新提交并切到各子仓 master
  pnpm modules:update   更新到各子仓远端配置分支的最新提交
  pnpm modules:install  自动初始化并按各仓 lockfile 安装依赖
  pnpm modules:check    自动初始化并执行全部子仓质量门禁
  pnpm modules:build    自动初始化、修复不完整依赖并构建全部子仓
  pnpm modules:setup    一次完成拉取、安装和构建
  pnpm build:all        构建全部子仓和主仓，产物保留在各仓自己的发布目录

也可以使用 npm run modules:<action>，实际安装始终由项目锁定的 pnpm 执行。
命令末尾可指定子仓简称，例如：pnpm modules:install -- vms fms。
跨主仓与子仓的未提交联调可追加 --workspace-platform，先打包当前主仓工作区再验证。
`)
}

function main(): void {
  const action = process.argv[2] as ModuleAction | undefined
  const supportedActions: ModuleAction[] = [
    'pull',
    'update',
    'install',
    'check',
    'build',
    'setup',
    'status'
  ]

  if (!action || !supportedActions.includes(action)) {
    printUsage()
    if (action) process.exitCode = 1
    return
  }

  let releaseOperationLock: (() => void) | undefined
  try {
    releaseOperationLock = acquireOperationLock(action)
    const allModules = readModuleDefinitions()
    allModules.forEach(restoreInterruptedModuleInstall)
    const selectors = process.argv
      .slice(3)
      .filter((argument) => argument !== '--' && argument !== '--workspace-platform')
    const modules = action === 'pull' ? [] : selectModules(allModules, selectors)

    switch (action) {
      case 'pull':
        pullLatestRepositories(selectors)
        break
      case 'update':
        pullModules(modules, true)
        break
      case 'install':
      case 'check':
      case 'build':
        runPackageAction(modules, action)
        break
      case 'setup':
        pullModules(modules)
        runPackageAction(modules, 'install')
        runPackageAction(modules, 'build')
        break
      case 'status':
        printStatus(modules)
        break
    }

    console.log('\n[module] 全部操作已完成。')
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error(`\n[module] 操作失败：${message}`)
    process.exitCode = 1
  } finally {
    releaseOperationLock?.()
  }
}

main()
