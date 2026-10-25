import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface CommandResult {
  output: string
  status: number
}

interface Repository {
  branch?: string
  name: string
  path: string
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rootRepository: Repository = {
  name: basename(projectRoot),
  path: projectRoot
}
const gitNetworkOptions = ['-c', 'http.version=HTTP/1.1', '-c', 'submodule.fetchJobs=1']

function formatCommand(command: string, args: string[]): string {
  return [command, ...args].join(' ')
}

function execute(
  command: string,
  args: string[],
  cwd: string,
  options: { print?: boolean; stream?: boolean; env?: NodeJS.ProcessEnv } = {}
): CommandResult {
  const { print = false, stream = false, env = process.env } = options
  const result = spawnSync(command, args, {
    cwd,
    encoding: stream ? undefined : 'utf8',
    env,
    stdio: stream ? 'inherit' : 'pipe'
  })

  if (result.error) throw result.error
  const output = stream ? '' : [result.stdout, result.stderr].filter(Boolean).join('')
  if (print && output) process.stdout.write(output.endsWith('\n') ? output : `${output}\n`)
  return { output, status: result.status ?? 1 }
}

function run(
  command: string,
  args: string[],
  cwd: string,
  options: { env?: NodeJS.ProcessEnv; stream?: boolean } = {}
): void {
  const result = execute(command, args, cwd, { ...options, print: !options.stream })
  if (result.status !== 0) {
    throw new Error(`${formatCommand(command, args)} 执行失败，退出码 ${result.status}`)
  }
}

function git(repository: Repository, args: string[], stream = false): void {
  run('git', [...gitNetworkOptions, ...args], repository.path, { stream })
}

function gitOutput(repository: Repository, args: string[]): string {
  const result = execute('git', args, repository.path)
  if (result.status !== 0) {
    throw new Error(
      `${repository.name} 无法执行 ${formatCommand('git', args)}：${result.output.trim()}`
    )
  }
  return result.output.trim()
}

function readModules(): Repository[] {
  const result = execute(
    'git',
    ['config', '--file', '.gitmodules', '--get-regexp', '^submodule\\..*\\.path$'],
    projectRoot
  )
  if (result.status !== 0) throw new Error('读取 .gitmodules 失败。')

  return result.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separatorIndex = line.indexOf(' ')
      const key = line.slice(0, separatorIndex)
      const modulePath = line.slice(separatorIndex + 1).trim()
      const name = key.slice('submodule.'.length, -'.path'.length)
      const absoluteModulePath = resolve(projectRoot, modulePath)
      const relativeModulePath = relative(projectRoot, absoluteModulePath)
      if (
        !relativeModulePath ||
        relativeModulePath.startsWith('..') ||
        isAbsolute(relativeModulePath)
      ) {
        throw new Error(`子仓 ${name} 的路径超出主仓目录：${modulePath}`)
      }
      const branchResult = execute(
        'git',
        ['config', '--file', '.gitmodules', '--get', `submodule.${name}.branch`],
        projectRoot
      )
      return {
        branch: branchResult.status === 0 ? branchResult.output.trim() : undefined,
        name,
        path: absoluteModulePath
      }
    })
}

function isInitialized(repository: Repository): boolean {
  if (!existsSync(resolve(repository.path, '.git'))) return false
  const result = execute('git', ['rev-parse', '--is-inside-work-tree'], repository.path)
  return result.status === 0 && result.output.trim() === 'true'
}

function status(repository: Repository, includeSubmodules = true): string {
  return gitOutput(repository, [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    `--ignore-submodules=${includeSubmodules ? 'none' : 'all'}`
  ])
}

function currentBranch(repository: Repository): string {
  return gitOutput(repository, ['branch', '--show-current'])
}

function ensureNoGitOperation(repository: Repository): void {
  const gitDirectory = gitOutput(repository, ['rev-parse', '--git-dir'])
  const absoluteGitDirectory = resolve(repository.path, gitDirectory)
  const operationMarkers = [
    'MERGE_HEAD',
    'CHERRY_PICK_HEAD',
    'REVERT_HEAD',
    'rebase-merge',
    'rebase-apply'
  ]
  if (operationMarkers.some((marker) => existsSync(resolve(absoluteGitDirectory, marker)))) {
    throw new Error(`${repository.name} 正在执行合并、变基或拣选，请先完成或中止该操作。`)
  }
}

function ensureBranchAndUpstream(repository: Repository): { branch: string; upstream: string } {
  ensureNoGitOperation(repository)
  const branch = currentBranch(repository)
  if (!branch) throw new Error(`${repository.name} 当前是 detached HEAD，不能自动提交或拉取。`)

  const upstreamResult = execute(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    repository.path
  )
  const upstream = upstreamResult.output.trim()
  if (upstreamResult.status !== 0 || !upstream) {
    throw new Error(`${repository.name} 的 ${branch} 分支没有上游分支，请先手动设置 upstream。`)
  }
  return { branch, upstream }
}

function ensureNotBehind(repository: Repository): void {
  const { upstream } = ensureBranchAndUpstream(repository)
  const remote = upstream.split('/')[0]
  git(repository, ['fetch', remote], true)
  const divergence = gitOutput(repository, [
    'rev-list',
    '--left-right',
    '--count',
    `HEAD...${upstream}`
  ])
    .split(/\s+/)
    .map(Number)
  const behind = divergence[1] ?? 0
  if (behind > 0) {
    throw new Error(
      `${repository.name} 落后 ${upstream} ${behind} 个提交，请先执行 pnpm repo:pull。`
    )
  }
}

function runPnpm(repository: Repository, args: string[], env = process.env): void {
  // 发布只验证现有依赖；构建时自动安装会改写子仓锁文件并依赖远端归档可用性。
  const publishArgs = ['--config.verify-deps-before-run=warn', ...args]
  const pnpmCliPath = process.env.npm_execpath
  if (pnpmCliPath?.toLowerCase().includes('pnpm')) {
    run(process.execPath, [pnpmCliPath, ...publishArgs], repository.path, { env, stream: true })
    return
  }
  if (process.platform === 'win32') {
    run(
      process.env.ComSpec ?? 'cmd.exe',
      ['/d', '/s', '/c', 'pnpm.cmd', ...publishArgs],
      repository.path,
      {
        env,
        stream: true
      }
    )
    return
  }
  run('pnpm', publishArgs, repository.path, { env, stream: true })
}

function readBuildCommand(repository: Repository): string {
  const manifestPath = resolve(repository.path, 'package.json')
  if (!existsSync(manifestPath)) throw new Error(`${repository.name} 缺少 package.json。`)
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    !('scripts' in manifest) ||
    !manifest.scripts ||
    typeof manifest.scripts !== 'object' ||
    !('build' in manifest.scripts)
  ) {
    throw new Error(`${repository.name} 的 package.json 缺少 scripts。`)
  }
  const build = manifest.scripts.build
  if (typeof build !== 'string' || !build.trim()) {
    throw new Error(`${repository.name} 没有 build 命令。`)
  }
  return build
}

function buildDocs(repository: Repository): void {
  const buildCommand = readBuildCommand(repository)
  console.log(`\n[build] ${repository.name} -> docs`)
  runPnpm(repository, ['run', 'build'], { ...process.env, VITE_OUT_DIR: 'docs' })

  const outputIndex = buildCommand.includes('vitepress')
    ? resolve(repository.path, 'docs', '.vitepress', 'dist', 'index.html')
    : resolve(repository.path, 'docs', 'index.html')
  if (!existsSync(outputIndex)) {
    throw new Error(`${repository.name} 构建结束，但未找到预期产物 ${outputIndex}。`)
  }
}

function commit(repository: Repository, message: string): void {
  console.log(`\n[commit] ${repository.name}`)
  git(repository, ['add', '--all'])
  if (repository.path === projectRoot) {
    run(process.execPath, ['scripts/cloudbase-modules.mjs', 'write'], projectRoot)
    git(repository, ['add', '--', 'scripts/cloudbase-modules.json'])
  }
  const staged = execute('git', ['diff', '--cached', '--quiet'], repository.path)
  if (staged.status === 0) {
    console.log(`[commit] ${repository.name} 没有需要提交的变化。`)
    return
  }
  if (staged.status !== 1) throw new Error(`${repository.name} 无法检查暂存区。`)
  git(repository, ['commit', '-m', message], true)
}

function push(repository: Repository): void {
  console.log(`\n[push] ${repository.name}`)
  git(repository, ['push'], true)
}

function ensureClean(repository: Repository, includeSubmodules = true): void {
  const repositoryStatus = status(repository, includeSubmodules)
  if (repositoryStatus) {
    throw new Error(`${repository.name} 操作后仍有未提交内容：\n${repositoryStatus}`)
  }
}

function parseCommitMessage(args: string[]): string {
  const values = args.filter((argument) => argument !== '--' && argument !== '-m')
  const message = values.join(' ').trim()
  if (!message) {
    throw new Error('缺少提交说明，例如：pnpm repo:publish -- "feat: 更新生产计划"')
  }
  return message
}

function publish(message: string): void {
  const modules = readModules()
  const initializedModules = modules.filter(isInitialized)
  const missingModules = modules.filter((module) => !isInitialized(module))
  if (missingModules.length > 0) {
    throw new Error(
      `以下子仓尚未初始化，请先执行 pnpm repo:pull：${missingModules.map((item) => item.name).join('、')}`
    )
  }

  const changedModules = initializedModules.filter((module) => status(module, false))
  const rootChanged = Boolean(status(rootRepository, true))
  if (!rootChanged && changedModules.length === 0) {
    console.log('[publish] 主仓和全部子仓均无改动，无需构建或发布。')
    return
  }

  const repositoriesToPublish = [...changedModules, rootRepository]
  console.log(
    `[publish] 本次仓库：${repositoriesToPublish.map((repository) => repository.name).join('、')}`
  )
  for (const repository of repositoriesToPublish) ensureNotBehind(repository)

  for (const repository of changedModules) buildDocs(repository)
  buildDocs(rootRepository)
  console.log('\n[snapshot] 更新主仓 AI 项目快照')
  runPnpm(rootRepository, ['run', 'snapshot:ai'])

  // 子仓必须先形成新提交，主仓随后才能记录正确的 gitlink。
  for (const repository of changedModules) commit(repository, message)
  commit(rootRepository, message)

  for (const repository of changedModules) ensureClean(repository, false)
  ensureClean(rootRepository, true)

  // 远端也按子仓在前、主仓在后发布，避免主仓引用尚不存在的子仓提交。
  for (const repository of changedModules) push(repository)
  push(rootRepository)

  for (const repository of initializedModules) ensureClean(repository, false)
  ensureClean(rootRepository, true)
  console.log('\n[publish] docs、源码和子仓指针均已提交并推送，整个工作区状态干净。')
}

function checkoutPullBranch(repository: Repository, preferredBranch?: string): void {
  git(repository, ['fetch', 'origin'], true)
  const branch = preferredBranch || currentBranch(repository) || 'master'
  const localBranch = execute(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
    repository.path
  )
  if (localBranch.status === 0) git(repository, ['checkout', branch], true)
  else git(repository, ['checkout', '--track', '-b', branch, `origin/${branch}`], true)

  const upstreamResult = execute(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'],
    repository.path
  )
  if (upstreamResult.status !== 0) {
    git(repository, ['branch', '--set-upstream-to', `origin/${branch}`, branch], true)
  }
  git(repository, ['pull', '--ff-only'], true)
  git(repository, ['submodule', 'update', '--init', '--recursive'], true)
}

function pullAll(): void {
  const beforePullModules = readModules()
  for (const module of beforePullModules.filter(isInitialized)) ensureClean(module, false)
  ensureClean(rootRepository, true)
  ensureBranchAndUpstream(rootRepository)

  console.log(`[pull] 更新主仓 ${rootRepository.name}`)
  git(rootRepository, ['pull', '--ff-only'], true)
  git(rootRepository, ['submodule', 'sync', '--recursive'], true)
  git(rootRepository, ['submodule', 'update', '--init', '--recursive'], true)

  const modules = readModules()
  for (const module of modules) {
    if (!isInitialized(module)) throw new Error(`${module.name} 初始化失败。`)
    console.log(`\n[pull] 更新子仓 ${module.name}`)
    checkoutPullBranch(module, module.branch)
    ensureClean(module, false)
  }

  const rootStatus = status(rootRepository, true)
  if (rootStatus) {
    console.log(
      '\n[pull] 子仓远端提交已前进，主仓现有新的 gitlink。确认代码后执行 repo:publish 即可发布主仓指针。'
    )
    process.stdout.write(`${rootStatus}\n`)
  } else {
    console.log('\n[pull] 主仓与全部子仓均已更新，工作区状态干净。')
  }
}

function printUsage(): void {
  console.log(`
主仓与子仓统一工作流：
  pnpm repo:pull
      快进拉取主仓，初始化并拉取全部子仓的配置分支。

  pnpm repo:publish -- "feat: 提交说明"
      构建有改动子仓的 docs，同时构建主仓 docs；依次提交、推送并检查工作区干净。
`)
}

function main(): void {
  const action = process.argv[2]
  try {
    if (action === 'pull') pullAll()
    else if (action === 'publish') publish(parseCommitMessage(process.argv.slice(3)))
    else {
      printUsage()
      if (action) process.exitCode = 1
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误'
    console.error(`\n[repo] 操作失败：${message}`)
    process.exitCode = 1
  }
}

main()
