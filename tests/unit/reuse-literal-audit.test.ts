import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('reuse audit preserves literal data while detecting copies across formatting and comments', () => {
  const temporaryRoot = resolve(tmpdir())
  const root = mkdtempSync(join(temporaryRoot, 'art-reuse-literals-'))
  const script = fileURLToPath(new URL('../../scripts/audit-shared-reuse.ts', import.meta.url))
  try {
    const source = join(root, 'src', 'views')
    mkdirSync(source, { recursive: true })
    mkdirSync(join(root, 'modules'))
    cpSync(join(dirname(dirname(script)), 'src', 'utils'), join(root, 'src', 'utils'), {
      recursive: true
    })
    const pairs = [
      {
        name: 'parseAuditEndpoint',
        left: "return new URL('https://alpha.invalid/' + normalized).href",
        right: "return new URL('https://beta.invalid/' + normalized).href"
      },
      {
        name: 'formatAuditLabel',
        left: "return 'a b' + normalized",
        right: "return 'ab' + normalized"
      },
      {
        name: 'parseAuditMarker',
        left: "return normalized + '/*alpha*/'",
        right: "return normalized + '/*beta*/'"
      },
      {
        name: 'isAuditPattern',
        left: 'return /a b/.test(normalized)',
        right: 'return /ab/.test(normalized)'
      },
      {
        name: 'formatAuditTemplate',
        left: 'return `a b:${normalized}`',
        right: 'return `ab:${normalized}`'
      },
      {
        name: 'formatAuditNode',
        left: 'return <span>a b{normalized}</span>',
        right: 'return <span>ab{normalized}</span>'
      }
    ]
    for (const side of ['left', 'right'] as const) {
      writeFileSync(
        join(source, `${side}.tsx`),
        pairs
          .map(
            (entry) =>
              `export function ${entry.name}(value: string) { const normalized = value.trim(); ${entry[side]} }`
          )
          .join('\n')
      )
    }
    const audit = () => {
      const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
        cwd: root,
        encoding: 'utf8',
        timeout: 180_000
      })
      assert.ifError(result.error)
      return result
    }
    const distinct = audit()
    assert.equal(distinct.status, 0, distinct.stderr)
    assert.match(distinct.stdout, /Shared reuse audit passed/)

    writeFileSync(
      join(source, 'copied-a.ts'),
      'export function normalizeAuditDuplicate(value: string) { /* note */ const normalized = value.trim(); return normalized.toUpperCase() }'
    )
    writeFileSync(
      join(source, 'copied-b.ts'),
      'export function normalizeAuditDuplicate ( value: string ) {\n// another note\nconst normalized = value.trim();\nreturn normalized.toUpperCase()\n}'
    )
    const copied = audit()
    assert.equal(copied.status, 1, copied.stderr)
    assert.match(copied.stderr, /Shared reuse audit failed with 1 finding\(s\):/)
    assert.match(copied.stderr, /\[within-repository-helper-duplication\]/)
    assert.match(copied.stderr, /normalizeAuditDuplicate/)
  } finally {
    assert.equal(dirname(resolve(root)), temporaryRoot)
    assert.ok(root.startsWith(join(temporaryRoot, 'art-reuse-literals-')))
    rmSync(root, { recursive: true, force: true })
  }
})
