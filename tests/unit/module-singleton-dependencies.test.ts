import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { hostedApplicationSourceDirectories } from '../../scripts/hosted-module-dependencies.mjs'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const dependencies = { vue: '^3.5.43', pinia: '4.0.3', 'vue-router': '^5.4.0' }

test('module audit rejects missing framework singletons even for auto-imported hooks', async () => {
  const parent = path.join(projectRoot, '.artifacts/unit-module-singletons')
  await mkdir(parent, { recursive: true })
  const directory = await mkdtemp(path.join(parent, 'audit-'))
  const writeJson = (filename: string, value: object) =>
    writeFile(path.join(directory, filename), JSON.stringify(value))
  const run = () =>
    spawnSync(
      process.execPath,
      [
        path.join(projectRoot, 'node_modules/tsx/dist/cli.mjs'),
        path.join(projectRoot, 'scripts/audit-module-dependencies.ts')
      ],
      { cwd: directory, encoding: 'utf8', timeout: 60_000 }
    )
  try {
    await mkdir(path.join(directory, 'patches'))
    await writeJson('package.json', { type: 'module', files: [], dependencies })
    await writeFile(path.join(directory, 'pnpm-workspace.yaml'), '')
    for (const source of Object.values(hostedApplicationSourceDirectories)) {
      const moduleRoot = path.dirname(source)
      await mkdir(path.join(directory, source), { recursive: true })
      await writeJson(path.join(moduleRoot, 'package.json'), { peerDependencies: dependencies })
      await writeJson(path.join(moduleRoot, 'tsconfig.json'), { include: ['src/**/*.ts'] })
      await writeFile(
        path.join(directory, source, 'probe.ts'),
        'const route = useRoute()\nconst state = storeToRefs(store)\nvoid [route, state]\n'
      )
    }
    const complete = run()
    assert.ifError(complete.error)
    assert.equal(complete.status, 0, complete.stderr)
    assert.match(complete.stdout, /模块依赖审计通过/)

    const pmisManifest = 'modules/art-supabase-pmis/package.json'
    await writeJson(pmisManifest, { peerDependencies: { vue: dependencies.vue } })
    const missing = run()
    assert.ifError(missing.error)
    assert.equal(missing.status, 1, missing.stdout)
    const stderr = missing.stderr.replaceAll('\\', '/')
    assert.match(stderr, /art-supabase-pmis: 独立应用缺少共享单例依赖 pinia/)
    assert.match(stderr, /art-supabase-pmis: 独立应用缺少共享单例依赖 vue-router/)

    // A direct dependency is also a valid local resolver, not only a peer declaration.
    await writeJson(pmisManifest, { dependencies })
    const restored = run()
    assert.ifError(restored.error)
    assert.equal(restored.status, 0, restored.stderr)
    assert.match(restored.stdout, /模块依赖审计通过/)
    assert.deepEqual(
      JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')).dependencies,
      dependencies
    )
  } finally {
    const target = await realpath(directory)
    assert.equal(path.dirname(target), await realpath(parent))
    await rm(target, { recursive: true, force: true })
  }
})
