import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('reuse audit rejects empty component aliases while retaining configured components and route entries', () => {
  const temporaryRoot = resolve(tmpdir())
  const root = mkdtempSync(join(temporaryRoot, 'art-component-wrapper-'))
  const script = fileURLToPath(new URL('../../scripts/audit-shared-reuse.ts', import.meta.url))
  try {
    const source = join(root, 'modules', 'feature', 'src', 'views')
    mkdirSync(source, { recursive: true })
    cpSync(join(dirname(dirname(script)), 'src', 'utils'), join(root, 'src', 'utils'), {
      recursive: true
    })
    const imported =
      "import Shared from '@/components/business/business-table-row-actions/index.vue'"
    const alias = join(source, 'alias.vue')
    writeFileSync(
      alias,
      `<template><!-- alias --><Shared><slot /></Shared></template><script setup lang="ts">${imported}; defineOptions({ name: 'Alias' })</script>`
    )
    writeFileSync(
      join(source, 'styled.vue'),
      `<template><Shared><slot /></Shared></template><script setup>${imported}</script><style scoped>.layout { gap: 4px }</style>`
    )
    writeFileSync(
      join(source, 'configured.vue'),
      `<template><Shared :compact="compact"><slot /></Shared></template><script setup>${imported}; defineProps({ compact: Boolean })</script>`
    )
    writeFileSync(
      join(source, 'route-entry.vue'),
      `<template><Shared /></template><script setup>${imported}</script>`
    )
    writeFileSync(
      join(source, 'local-domain.vue'),
      '<template><Domain><slot /></Domain></template><script setup>import Domain from "./domain.vue"</script>'
    )
    writeFileSync(
      join(source, 'behavior.vue'),
      `<template><Shared><slot /></Shared></template><script setup>${imported}; defineEmits(['changed'])</script>`
    )
    const audit = () =>
      spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000
      })
    const rejected = audit()
    assert.equal(rejected.status, 1, rejected.stderr)
    assert.match(rejected.stderr, /transparent-main-component-wrapper/)
    assert.match(rejected.stderr, /feature\/src\/views\/alias.vue/)
    assert.doesNotMatch(
      rejected.stderr,
      /(?:styled|configured|route-entry|local-domain|behavior)\.vue/
    )
    unlinkSync(alias)
    const accepted = audit()
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.match(accepted.stdout, /Shared reuse audit passed/)
    const duplicate = join(source, 'duplicate.ts')
    writeFileSync(
      duplicate,
      'export function formatCurrencyCodeValue(value: number) { return String(value) }'
    )
    const duplicateRejected = audit()
    assert.equal(duplicateRejected.status, 1, duplicateRejected.stderr)
    assert.match(duplicateRejected.stderr, /canonical-helper-redeclared/)
    unlinkSync(duplicate)
    writeFileSync(
      alias,
      '<template><button @click="print">打印</button></template><script setup>const print = () => window.print()</script>'
    )
    const privatePrint = audit()
    assert.equal(privatePrint.status, 1, privatePrint.stderr)
    assert.match(privatePrint.stderr, /reuse\/shared-print-lifecycle/)
    writeFileSync(
      alias,
      '<template><button @click="print">打印</button></template><script setup>import { usePrintSheet } from "@/hooks/core/usePrintSheet"; const { print } = usePrintSheet("is-fixture-printing", () => {}); const example = "window.print()";</script>'
    )
    const sharedPrint = audit()
    assert.equal(sharedPrint.status, 0, sharedPrint.stderr)
  } finally {
    assert.ok(root.startsWith(temporaryRoot + '/') || root.startsWith(temporaryRoot + '\\'))
    rmSync(root, { recursive: true, force: true })
  }
})
