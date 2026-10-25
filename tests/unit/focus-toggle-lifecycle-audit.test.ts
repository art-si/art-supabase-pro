import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('UI audit rejects focus switches destroyed by their own state and permits persistent controls', () => {
  const temporaryRoot = resolve(tmpdir())
  const fixtureRoot = mkdtempSync(join(temporaryRoot, 'art-focus-lifecycle-'))
  try {
    const directory = join(fixtureRoot, 'src', 'views')
    mkdirSync(directory, { recursive: true })
    const file = join(directory, 'focus.vue')
    const script = fileURLToPath(new URL('../../scripts/ui-audit.ts', import.meta.url))
    const audit = () =>
      spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
        cwd: fixtureRoot,
        encoding: 'utf8',
        timeout: 60_000
      })
    writeFileSync(
      file,
      `<template>
      <BusinessWorkspaceFocusToggle v-if="focusMode" v-model="focusMode" />
      <BusinessWorkspaceFocusToggle v-model="workspace.focus" v-if="! (workspace.focus)" />
    </template>`
    )
    const rejected = audit()
    assert.equal(rejected.status, 1, rejected.stderr)
    assert.equal((rejected.stderr.match(/interaction\/focus-toggle-lifecycle/g) ?? []).length, 2)
    writeFileSync(
      file,
      `<template>
      <BusinessWorkspaceFocusToggle v-show="focusMode" v-model="focusMode" />
      <BusinessWorkspaceFocusToggle v-model="workspace.focus" />
      <BusinessWorkspaceFocusToggle v-if="canViewWorkspace" v-model="focusMode" />
    </template>`
    )
    const accepted = audit()
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.match(accepted.stdout, /UI audit passed/)
  } finally {
    assert.equal(dirname(resolve(fixtureRoot)), temporaryRoot)
    assert.ok(fixtureRoot.startsWith(join(temporaryRoot, 'art-focus-lifecycle-')))
    rmSync(fixtureRoot, { recursive: true, force: true })
  }
})
