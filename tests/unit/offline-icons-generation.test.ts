import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

test('offline icon generation rejects invalid names and stale data across module sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'art-offline-icons-'))
  const script = fileURLToPath(new URL('../../scripts/generate-offline-icons.ts', import.meta.url))
  const run = (...args: string[]) =>
    spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script, ...args], {
      cwd: root,
      encoding: 'utf8'
    })
  try {
    mkdirSync(join(root, 'src'))
    mkdirSync(join(root, 'modules', 'sample', 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'page.ts'), "export const icon = 'ri:home-line'")
    const moduleFile = join(root, 'modules', 'sample', 'src', 'page.vue')
    writeFileSync(
      moduleFile,
      '<ArtSvgIcon icon="ri:file-check-line" /><ArtSvgIcon icon="vaadin:ctrl-a" /><ArtSvgIcon icon="dashicons:fullscreen-alt" />'
    )
    const configuredDirectory = join(root, 'src', 'assets', 'icons')
    mkdirSync(configuredDirectory, { recursive: true })
    writeFileSync(
      join(configuredDirectory, 'configured-icons.json'),
      JSON.stringify([
        'ri:attachment-line',
        'iconamoon:arrow-down-2-thin',
        'fluent:arrow-enter-left-20-filled',
        'icon-park-outline:auto-width',
        'ix:width',
        'solar:double-alt-arrow-right-linear'
      ])
    )
    const generated = run()
    assert.equal(generated.status, 0, generated.stderr)
    const data: Array<{ prefix: string; icons: Record<string, { body: string }> }> = JSON.parse(
      readFileSync(join(root, 'src', 'assets', 'icons', 'collections.generated.json'), 'utf8')
    )
    assert.deepEqual(
      data.map((collection) => collection.prefix),
      ['ri', 'vaadin', 'dashicons', 'iconamoon', 'fluent', 'icon-park-outline', 'ix', 'solar']
    )
    assert.deepEqual(Object.keys(data[0].icons), [
      'attachment-line',
      'file-check-line',
      'home-line'
    ])
    assert.ok(data[0].icons['file-check-line'].body.includes('<path'))
    assert.ok(data[3].icons['arrow-down-2-thin'].body.includes('<path'))
    assert.equal(run('--check').status, 0)
    const collectionFile = join(root, 'src', 'assets', 'icons', 'collections.generated.json')
    writeFileSync(collectionFile, readFileSync(collectionFile, 'utf8').replaceAll('\n', '\r\n'))
    assert.equal(run('--check').status, 0, 'Windows checkout line endings must not mark data stale')
    writeFileSync(moduleFile, '<ArtSvgIcon icon="ri:camera-line" />')
    const stale = run('--check')
    assert.notEqual(stale.status, 0)
    assert.match(stale.stderr, /本地图标数据已过期/)
    writeFileSync(moduleFile, '<ArtSvgIcon icon="ri:this-icon-does-not-exist" />')
    const invalid = run()
    assert.notEqual(invalid.status, 0)
    assert.match(invalid.stderr, /不存在的 ri 图标：this-icon-does-not-exist/)
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    rmSync(root, { recursive: true, force: true })
  }
})
