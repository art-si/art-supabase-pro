import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('打印样式必须由业务打印状态启用，不得隐藏其他业务文档', () => {
  const root = mkdtempSync(join(tmpdir(), 'art-print-style-'))
  const script = fileURLToPath(new URL('../../scripts/ui-audit.ts', import.meta.url))
  try {
    const directory = join(root, 'src', 'views')
    mkdirSync(directory, { recursive: true })
    const file = join(directory, 'print.vue')
    const audit = () =>
      spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000
      })
    writeFileSync(
      file,
      '<template><article>作业票</article></template><style scoped>@media print { :global(body *) { visibility: hidden !important; } }</style>'
    )
    const rejected = audit()
    assert.equal(rejected.status, 1, rejected.stderr)
    assert.match(rejected.stderr, /styles\/no-unconditional-body-print-hiding/)
    writeFileSync(
      file,
      '<template><article class="permit-print">作业票</article></template><style scoped>@media print { :global(body.is-permit-printing *) { visibility: hidden !important; } body.is-permit-printing .permit-print { visibility: visible !important; } }</style>'
    )
    const accepted = audit()
    assert.equal(accepted.status, 0, accepted.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
