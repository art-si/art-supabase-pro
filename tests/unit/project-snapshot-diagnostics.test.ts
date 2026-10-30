import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

interface SourceManifest {
  sourceHash: string
  files: Record<string, string>
}

test('project snapshot diagnostics identify changed source without changing normal hash checks', () => {
  const temporaryRoot = resolve(tmpdir())
  const root = mkdtempSync(join(temporaryRoot, 'art-project-snapshot-'))
  const originalScript = fileURLToPath(
    new URL('../../scripts/generate-ai-project-snapshot.ts', import.meta.url)
  )
  const script = join(root, 'scripts', 'generate-ai-project-snapshot.ts')
  const output = join(
    root,
    'supabase',
    'functions',
    'ai-project-planner',
    'project-snapshot.generated.ts'
  )
  const manifestDirectory = join(root, '.artifacts', 'quality-audit', 'snapshot-diagnostic')
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script, ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 180_000
    })
  const readManifest = (name: string): SourceManifest =>
    JSON.parse(readFileSync(join(manifestDirectory, name), 'utf8')) as SourceManifest

  try {
    mkdirSync(dirname(script), { recursive: true })
    mkdirSync(dirname(output), { recursive: true })
    mkdirSync(join(root, 'src'), { recursive: true })
    copyFileSync(originalScript, script)
    writeFileSync(
      join(root, 'package.json'),
      '{"name":"snapshot-fixture","version":"1.0.0","type":"module"}\n'
    )
    writeFileSync(join(root, '.gitignore'), '.artifacts/\n')
    const sourceFile = join(root, 'src', 'example.ts')
    writeFileSync(sourceFile, 'export const value = 1\n')
    const initialized = spawnSync('git', ['init', '--quiet'], { cwd: root, encoding: 'utf8' })
    assert.ifError(initialized.error)
    assert.equal(initialized.status, 0, initialized.stderr)

    const normalGeneration = run()
    assert.ifError(normalGeneration.error)
    assert.equal(normalGeneration.status, 0, normalGeneration.stderr)
    assert.equal(existsSync(manifestDirectory), false, 'default mode must not write evidence')
    const normalCheck = run('--check')
    assert.ifError(normalCheck.error)
    assert.equal(normalCheck.status, 0, normalCheck.stderr)
    const normalHash = readFileSync(output, 'utf8').match(/"sourceHash":\s*"([a-f0-9]+)"/)?.[1]
    assert.ok(normalHash)
    const expectedHash = createHash('sha256')
    for (const path of [
      'package.json',
      'scripts/generate-ai-project-snapshot.ts',
      'src/example.ts'
    ]) {
      expectedHash.update(path)
      expectedHash.update('\0')
      expectedHash.update(readFileSync(join(root, path)))
      expectedHash.update('\0')
    }
    assert.equal(
      normalHash,
      expectedHash.digest('hex'),
      'sorted path and raw bytes must keep the original hash'
    )

    const diagnosticGeneration = run('--manifest')
    assert.ifError(diagnosticGeneration.error)
    assert.equal(diagnosticGeneration.status, 0, diagnosticGeneration.stderr)
    const diagnosticCheck = run('--check', '--manifest')
    assert.ifError(diagnosticCheck.error)
    assert.equal(diagnosticCheck.status, 0, diagnosticCheck.stderr)
    const generated = readManifest('generate.json')
    const checked = readManifest('check.json')
    assert.equal(generated.sourceHash, normalHash)
    assert.deepEqual(checked, generated)
    assert.equal(Object.keys(generated.files).length, 3)
    assert.ok(!Object.keys(generated.files).some((path) => path.startsWith('.artifacts/')))

    const generatedSource = readFileSync(output, 'utf8')
    writeFileSync(sourceFile, 'export const value = 2\n')
    const stale = run('--check', '--manifest')
    assert.ifError(stale.error)
    assert.equal(stale.status, 1)
    assert.match(stale.stderr, /快照哈希：已生成 [a-f0-9]{64}.*当前 [a-f0-9]{64}/)
    assert.equal(readFileSync(output, 'utf8'), generatedSource, 'check must not rewrite output')
    const changed = readManifest('check.json')
    assert.notEqual(changed.sourceHash, generated.sourceHash)
    assert.deepEqual(
      Object.keys(changed.files).filter((path) => changed.files[path] !== generated.files[path]),
      ['src/example.ts']
    )
    const duplicateFlag = run('--manifest', '--manifest')
    assert.ifError(duplicateFlag.error)
    assert.equal(duplicateFlag.status, 1, 'duplicate flags must fail')
    const pathArgument = run('--manifest=../outside')
    assert.ifError(pathArgument.error)
    assert.equal(pathArgument.status, 1, 'path arguments must fail')
  } finally {
    assert.equal(dirname(resolve(root)), temporaryRoot)
    rmSync(root, { recursive: true, force: true })
  }
})
