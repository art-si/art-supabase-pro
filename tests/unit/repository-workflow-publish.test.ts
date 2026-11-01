import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const tsx = resolve(projectRoot, 'node_modules/tsx/dist/cli.mjs')

test(
  'publish pins committed child revisions before generating the final root snapshot and pushing both local remotes',
  { timeout: 120_000 },
  () => {
    assert.ok(
      existsSync(tsx),
      'Use the installed workspace CLI without installing or linking dependencies'
    )
    const sandbox = mkdtempSync(join(tmpdir(), 'art-repository-publish-'))
    const root = join(sandbox, 'workspace')
    const child = join(root, 'modules/fixture-child')
    const rootRemote = join(sandbox, 'root.git')
    const childRemote = join(sandbox, 'child.git')
    const artifacts = resolve(projectRoot, '.artifacts/repo-publish')
    mkdirSync(artifacts, { recursive: true })
    const artifact = join(artifacts, `workflow-regression-${process.pid}-${Date.now()}`)
    // Explicitly selecting the archived script lets the same behavioral assertion
    // demonstrate the regression before a fix; normal runs always copy production.
    const workflowSource = resolve(
      process.env.REPOSITORY_WORKFLOW_PUBLISH_TEST_SOURCE ||
        join(projectRoot, 'scripts/repository-workflow.ts')
    )
    const evidence: Record<string, unknown> = { sandbox, workflowSource }
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      npm_execpath: join(root, 'scripts/fixture-pnpm.mjs'),
      REPOSITORY_FIXTURE_TSX: tsx,
      GIT_TERMINAL_PROMPT: '0',
      GIT_CONFIG_COUNT: '2',
      GIT_CONFIG_KEY_0: 'protocol.allow',
      GIT_CONFIG_VALUE_0: 'never',
      GIT_CONFIG_KEY_1: 'protocol.file.allow',
      GIT_CONFIG_VALUE_1: 'always'
    }
    const git = (cwd: string, args: string[]) =>
      execFileSync('git', args, {
        cwd,
        env,
        encoding: 'utf8',
        timeout: 30_000,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim()
    const initialize = (cwd: string) => {
      mkdirSync(cwd, { recursive: true })
      git(cwd, ['init', '--quiet', '--initial-branch=main'])
      for (const [key, value] of [
        ['user.name', 'Publish fixture'],
        ['user.email', 'publish-fixture@example.invalid'],
        ['commit.gpgsign', 'false'],
        ['core.autocrlf', 'false'],
        ['core.hooksPath', join(sandbox, 'no-hooks')]
      ])
        git(cwd, ['config', key, value])
    }
    const runNode = (args: string[]) =>
      spawnSync(process.execPath, args, {
        cwd: root,
        env,
        encoding: 'utf8',
        timeout: 90_000,
        windowsHide: true
      })
    try {
      mkdirSync(root, { recursive: true })
      git(sandbox, ['init', '--quiet', '--bare', '--initial-branch=main', rootRemote])
      git(sandbox, ['init', '--quiet', '--bare', '--initial-branch=main', childRemote])
      initialize(child)
      writeFileSync(
        join(child, 'package.json'),
        JSON.stringify({
          name: 'fixture-child',
          version: '1.0.0',
          type: 'module',
          scripts: { build: 'vite build' }
        })
      )
      writeFileSync(join(child, 'source.ts'), 'export const childValue = 1\n')
      git(child, ['add', '--all'])
      git(child, ['commit', '--quiet', '-m', 'initial child'])
      git(child, ['remote', 'add', 'origin', childRemote])
      git(child, ['push', '--quiet', '--set-upstream', 'origin', 'main'])

      initialize(root)
      mkdirSync(join(root, 'scripts'), { recursive: true })
      mkdirSync(join(root, 'supabase/functions/ai-project-planner'), { recursive: true })
      for (const name of ['cloudbase-modules.mjs', 'generate-ai-project-snapshot.ts'])
        copyFileSync(join(projectRoot, 'scripts', name), join(root, 'scripts', name))
      copyFileSync(workflowSource, join(root, 'scripts/repository-workflow.ts'))
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({
          name: 'publish-root-fixture',
          version: '1.0.0',
          type: 'module',
          scripts: {
            build: 'vite build',
            'snapshot:ai': 'tsx scripts/generate-ai-project-snapshot.ts'
          }
        })
      )
      writeFileSync(join(root, '.gitignore'), 'node_modules/\n.artifacts/\n')
      writeFileSync(
        join(root, '.gitmodules'),
        '[submodule "fixture-child"]\n\tpath = modules/fixture-child\n\turl = https://gitee.com/art-si/fixture-child.git\n\tbranch = main\n'
      )
      writeFileSync(join(root, 'source.ts'), 'export const rootValue = 1\n')
      writeFileSync(join(root, 'supabase/functions/ai-project-planner/index.ts'), 'export {}\n')
      writeFileSync(
        join(root, 'scripts/fixture-pnpm.mjs'),
        [
          "import { mkdirSync, writeFileSync } from 'node:fs'",
          "import { resolve } from 'node:path'",
          "import { execFileSync } from 'node:child_process'",
          "const args = process.argv.slice(2).filter(arg => arg !== '--config.verify-deps-before-run=warn')",
          "if (args.length !== 2 || args[0] !== 'run') throw new Error('Unexpected package-manager command: ' + args.join(' '))",
          "if (args[1] === 'build') {",
          "  mkdirSync('docs', { recursive: true })",
          "  writeFileSync('docs/index.html', '<!doctype html><title>Isolated publish build</title>')",
          "} else if (args[1] === 'snapshot:ai') {",
          "  execFileSync(process.execPath, [process.env.REPOSITORY_FIXTURE_TSX, resolve('scripts/generate-ai-project-snapshot.ts')], { stdio: 'inherit' })",
          "} else throw new Error('Unexpected package-manager task: ' + args[1])"
        ].join('\n')
      )
      git(root, ['add', '--all'])
      const manifest = runNode(['scripts/cloudbase-modules.mjs', 'write'])
      assert.equal(manifest.status, 0, `${manifest.stdout}${manifest.stderr}`)
      const initialSnapshot = runNode([tsx, 'scripts/generate-ai-project-snapshot.ts'])
      assert.equal(initialSnapshot.status, 0, `${initialSnapshot.stdout}${initialSnapshot.stderr}`)
      git(root, ['add', '--all'])
      git(root, ['commit', '--quiet', '-m', 'initial root'])
      git(root, ['remote', 'add', 'origin', rootRemote])
      git(root, ['push', '--quiet', '--set-upstream', 'origin', 'main'])

      const originalChild = git(child, ['rev-parse', 'HEAD'])
      writeFileSync(join(child, 'source.ts'), 'export const childValue = 2\n')
      writeFileSync(join(root, 'source.ts'), 'export const rootValue = 2\n')
      const published = runNode([
        tsx,
        'scripts/repository-workflow.ts',
        'publish',
        'test: publish isolated root and child'
      ])
      writeFileSync(`${artifact}.log`, `${published.stdout || ''}${published.stderr || ''}`)
      evidence.publishExit = published.status
      assert.equal(published.status, 0, `${published.stdout}${published.stderr}`)
      const rootHead = git(root, ['rev-parse', 'HEAD'])
      const childHead = git(child, ['rev-parse', 'HEAD'])
      assert.notEqual(childHead, originalChild)
      assert.equal(git(root, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0], rootHead)
      assert.equal(
        git(child, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0],
        childHead
      )
      assert.equal(git(root, ['rev-parse', ':modules/fixture-child']), childHead)
      const recorded: unknown = JSON.parse(
        readFileSync(join(root, 'scripts/cloudbase-modules.json'), 'utf8')
      )
      assert.deepEqual(recorded, [
        {
          path: 'modules/fixture-child',
          url: 'https://gitee.com/art-si/fixture-child.git',
          ref: childHead
        }
      ])
      const checked = runNode([tsx, 'scripts/generate-ai-project-snapshot.ts', '--check'])
      evidence.snapshotExit = checked.status
      evidence.snapshotOutput = `${checked.stdout || ''}${checked.stderr || ''}`
      evidence.rootHead = rootHead
      evidence.childHead = childHead
      evidence.rootStatus = git(root, [
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
        '--ignore-submodules=none'
      ])
      evidence.childStatus = git(child, ['status', '--porcelain=v1', '--untracked-files=all'])
      assert.equal(checked.status, 0, `${checked.stdout}${checked.stderr}`)
      assert.equal(evidence.rootStatus, '')
      assert.equal(evidence.childStatus, '')
    } finally {
      writeFileSync(`${artifact}.json`, `${JSON.stringify(evidence, null, 2)}\n`)
      // Only the unique mkdtemp directory directly inside the resolved OS temp root
      // may be recursively removed; no shell traversal or dependency junction exists.
      const target = realpathSync(sandbox)
      assert.equal(dirname(target), realpathSync(tmpdir()))
      assert.ok(basename(target).startsWith('art-repository-publish-'))
      rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
    }
  }
)
