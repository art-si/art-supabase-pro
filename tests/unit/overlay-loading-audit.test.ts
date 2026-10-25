import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('UI audit enforces loading owners and safe reads of public overlay state', () => {
  const temporaryRoot = resolve(tmpdir())
  const fixtureRoot = mkdtempSync(join(temporaryRoot, 'art-overlay-loading-'))
  const script = fileURLToPath(new URL('../../scripts/ui-audit.ts', import.meta.url))
  const directory = join(fixtureRoot, 'src', 'views')
  try {
    mkdirSync(directory, { recursive: true })
    const file = join(directory, 'loading-owner.vue')
    writeFileSync(
      file,
      `<template>
        <ArtDrawer><template #header><strong>标题</strong></template><div><ArtAsyncState :loading="busy" /></div></ArtDrawer>
        <ArtDialog><template #default><ArtOverlayLoading :loading="busy" /></template></ArtDialog>
      </template>`
    )
    const audit = () =>
      spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        timeout: 60_000
      })
    const rejected = audit()
    assert.equal(rejected.status, 1, rejected.stderr)
    assert.equal((rejected.stderr.match(/feedback\/whole-overlay-loading-owner/g) ?? []).length, 2)
    writeFileSync(
      file,
      `<template>
        <ArtDrawer :loading="busy"><ArtAsyncState :error="error" /></ArtDrawer>
        <ArtDialog :loading="busy"><ArtAsyncState :empty="empty" empty-description="请重新选择记录后重试。" /></ArtDialog>
        <ArtDrawer><div><p>独立区域</p><ArtSectionCard :loading="rowsLoading" /></div></ArtDrawer>
        <ArtDrawer><div><p>筛选</p><ArtAsyncState :loading="rowsLoading" /></div></ArtDrawer>
      </template>`
    )
    const accepted = audit()
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.match(accepted.stdout, /UI audit passed/)
    writeFileSync(
      file,
      `<template><ArtDialog ref="modal" /><ArtDrawer :ref="slide" /></template>
      <script setup lang="ts">
        const modal = ref<ArtDialogExpose<void>>()
        const slide = shallowRef<ArtDrawerExpose>()
        const shown = modal.value?.visible.value
        const full = modal.value?.fullscreen.value
        const busy = slide.value?.loading.value
        const confirming = slide.value?.confirmLoading.value
      </script>`
    )
    const invalidState = audit()
    assert.equal(invalidState.status, 1, invalidState.stderr)
    assert.equal(
      (invalidState.stderr.match(/quality\/no-double-unref-overlay-state/g) ?? []).length,
      4
    )
    writeFileSync(
      file,
      `<template><ArtDialog ref="modal" /><ArtDrawer ref="slide" /></template>
      <script setup lang="ts">
        const modal = ref<ArtDialogExpose<void>>()
        const slide = shallowRef<ArtDrawerExpose>()
        const shown = unref(modal.value?.visible)
        const busy = unref(slide.value?.loading)
        const local = ref<{ visible: Ref<boolean> }>()
        const nestedState = local.value?.visible.value
        function opened(api: ArtDialogExpose) { return api.visible.value }
        const cachedApi = shallowRef<ArtDialogExpose>()
        const internalState = cachedApi.value?.visible.value
        const example = 'modal.value?.visible.value'
        // modal.value?.fullscreen.value
      </script>`
    )
    const validState = audit()
    assert.equal(validState.status, 0, validState.stderr)
    assert.match(validState.stdout, /UI audit passed/)
  } finally {
    assert.equal(dirname(resolve(fixtureRoot)), temporaryRoot)
    assert.ok(fixtureRoot.startsWith(join(temporaryRoot, 'art-overlay-loading-')))
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})

test('UI audit rejects skeleton strips among overlay siblings and preserves page skeletons', () => {
  const temporaryRoot = resolve(tmpdir())
  const fixtureRoot = mkdtempSync(join(temporaryRoot, 'art-overlay-loading-'))
  const directory = join(fixtureRoot, 'src', 'views')
  const script = fileURLToPath(new URL('../../scripts/ui-audit.ts', import.meta.url))
  try {
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, 'overlay-skeleton.vue'),
      `<template>
      <ArtDialog><div><p>业务表单</p><ArtAsyncState :loading="busy" loading-mode="skeleton" /></div></ArtDialog>
      <ArtDrawer><div><p>详情</p><ElSkeleton :rows="2" /></div></ArtDrawer>
      <section><ElSkeleton :rows="4" /></section>
    </template>`
    )
    const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      timeout: 60_000
    })
    assert.equal(result.status, 1, result.stderr)
    assert.equal((result.stderr.match(/feedback\/use-overlay-shared-loading/g) ?? []).length, 2)
  } finally {
    assert.equal(dirname(resolve(fixtureRoot)), temporaryRoot)
    assert.ok(fixtureRoot.startsWith(join(temporaryRoot, 'art-overlay-loading-')))
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
