import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { basename, extname, join, relative } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const outputPath = join(
  projectRoot,
  'supabase/functions/ai-project-planner/project-snapshot.generated.ts'
)
const outputRelativePath = toPosix(relative(projectRoot, outputPath))

const SAFE_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.scss',
  '.sql',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.yaml',
  '.yml'
])

const EXCLUDED_PATH_PREFIXES = [
  '.git/',
  '.idea/',
  'coverage/',
  'dist/',
  'docs/',
  'node_modules/',
  'playwright-report/',
  'test-results/'
]

interface PackageManifest {
  name: string
  version: string
  description?: string
  repository?: string | { url?: string }
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  scripts?: Record<string, string>
}

function toPosix(path: string): string {
  return path.replaceAll('\\', '/')
}

function runGit(args: string[], fallback = ''): string {
  try {
    return execFileSync('git', args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
  } catch {
    return fallback
  }
}

function isSafeRepositoryPath(path: string): boolean {
  if (!path || path === outputRelativePath) return false
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) return false
  return SAFE_EXTENSIONS.has(extname(path).toLowerCase())
}

function listRepositoryFiles(): string[] {
  const output = runGit(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
  return output
    .split('\0')
    .map(toPosix)
    .filter(isSafeRepositoryPath)
    .filter((path) => existsSync(join(projectRoot, path)))
    .sort((left, right) => left.localeCompare(right, 'en'))
}

function listDirectories(path: string): string[] {
  if (!existsSync(path)) return []
  return readdirSync(path)
    .filter((entry) => statSync(join(path, entry)).isDirectory())
    .sort((left, right) => left.localeCompare(right, 'en'))
}

function createSourceHash(paths: string[]): string {
  const hash = createHash('sha256')
  paths.forEach((path) => {
    hash.update(path)
    hash.update('\0')
    hash.update(readFileSync(join(projectRoot, path)))
    hash.update('\0')
  })
  return hash.digest('hex')
}

function getRepositoryUrl(manifest: PackageManifest): string {
  const configuredUrl =
    typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
  return configuredUrl || runGit(['remote', 'get-url', 'origin'])
}

function getViewModules(paths: string[]): string[] {
  const prefix = 'src/views/'
  return Array.from(
    new Set(
      paths
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length).split('/')[0])
        .map((entry) => (entry.endsWith('.vue') ? basename(entry, '.vue') : entry))
    )
  ).sort((left, right) => left.localeCompare(right, 'en'))
}

const manifest = JSON.parse(
  readFileSync(join(projectRoot, 'package.json'), 'utf8')
) as PackageManifest
const repositoryFiles = listRepositoryFiles()
const unitTests = repositoryFiles.filter((path) => path.startsWith('tests/unit/'))
const migrationFiles = repositoryFiles.filter(
  (path) => path.startsWith('supabase/migrations/') && path.endsWith('.sql')
)
const edgeFunctions = listDirectories(join(projectRoot, 'supabase/functions')).filter(
  (name) =>
    !name.startsWith('_') && existsSync(join(projectRoot, 'supabase/functions', name, 'index.ts'))
)

const snapshot = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  sourceHash: createSourceHash(repositoryFiles),
  facts: {
    project: {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      repositoryUrl: getRepositoryUrl(manifest),
      branch: runGit(['branch', '--show-current']),
      head: runGit(['rev-parse', 'HEAD'])
    },
    stack: {
      runtimeDependencies: Object.keys(manifest.dependencies || {}).sort(),
      developmentDependencies: Object.keys(manifest.devDependencies || {}).sort(),
      scripts: manifest.scripts || {}
    },
    architecture: {
      viewModules: getViewModules(repositoryFiles),
      edgeFunctions,
      tests: unitTests,
      repositoryConventions: [
        'Vue 3 + TypeScript + Element Plus；业务页面通过 src/api 访问后端。',
        'Supabase 共享错误、过滤与后续通用能力统一放在 src/utils/supabase。',
        '业务菜单由 Supabase sys_menu 与 sys_role_menu 驱动，不使用静态业务路由。',
        '公开 schema 的业务表必须启用 RLS、租户隔离、审计字段与审计触发器。',
        '数据库、认证、RLS、生命周期和跨系统变更必须先做影响评估。',
        '修改代码前必须应用 project-code-quality；用户界面同时应用项目约定与专业 UI 质量规范。',
        '用户界面优先复用 Art* 核心组件；有标题的业务内容卡片统一使用 ArtSectionCard，原始 art-card-xs 仅用于无标题紧凑表面。'
      ]
    },
    fileSignals: {
      totalTrackedSafeFiles: repositoryFiles.length,
      srcFiles: repositoryFiles.filter((path) => path.startsWith('src/')).length,
      viewFiles: repositoryFiles.filter((path) => path.startsWith('src/views/')).length,
      apiFiles: repositoryFiles.filter((path) => path.startsWith('src/api/')).length,
      supabaseFunctionFiles: repositoryFiles.filter((path) =>
        path.startsWith('supabase/functions/')
      ).length,
      migrationSqlFiles: migrationFiles.length,
      testFiles: unitTests.length,
      trackedPaths: repositoryFiles
    },
    gitSignals: {
      recentCommits: runGit(['log', '-8', '--pretty=format:%h %s']).split(/\r?\n/).filter(Boolean),
      // Bundled snapshots must stay reproducible after commit; transient worktree state is not persisted.
      dirtyFiles: []
    },
    productSummary: existsSync(join(projectRoot, 'llms.txt'))
      ? readFileSync(join(projectRoot, 'llms.txt'), 'utf8')
      : ''
  }
}

const source = `// This file is generated by pnpm snapshot:ai. Do not edit it manually.\nexport const BUNDLED_PROJECT_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)} as const\n`

async function writeSnapshotSource(): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await writeFile(outputPath, source, 'utf8')
      return
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
      if (
        process.platform !== 'win32' ||
        attempt === 2 ||
        !['EBUSY', 'EACCES', 'EPERM', 'UNKNOWN'].includes(code)
      ) {
        throw error
      }
      await delay(250 * (attempt + 1))
    }
  }
}

if (process.argv.includes('--check')) {
  const currentSource = existsSync(outputPath) ? readFileSync(outputPath, 'utf8') : ''
  const currentHash = currentSource.match(/"sourceHash":\s*"([a-f0-9]+)"/)?.[1]

  if (currentHash !== snapshot.sourceHash) {
    console.error(`项目快照已过期，请运行 pnpm snapshot:ai 后重新提交 ${outputRelativePath}`)
    process.exitCode = 1
  } else {
    console.log(`项目快照有效 (${snapshot.sourceHash.slice(0, 12)})`)
  }
} else {
  await writeSnapshotSource()

  console.log(
    `Generated ${outputRelativePath} (${repositoryFiles.length} safe files, ${snapshot.sourceHash.slice(0, 12)})`
  )
}
