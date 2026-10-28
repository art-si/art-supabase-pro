import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

test('reuse audit rejects copied reference mapping but retains domain context and shared mapping', () => {
  const temporaryRoot = resolve(tmpdir())
  const root = mkdtempSync(join(temporaryRoot, 'art-reference-options-'))
  const script = fileURLToPath(new URL('../../scripts/audit-shared-reuse.ts', import.meta.url))
  try {
    const source = join(root, 'src', 'views')
    mkdirSync(source, { recursive: true })
    mkdirSync(join(root, 'modules'))
    cpSync(join(dirname(dirname(script)), 'src', 'utils'), join(root, 'src', 'utils'), {
      recursive: true
    })

    const cases = [
      {
        file: 'reference-options.ts',
        rejected:
          "rows.map(item => ({label: [item.name, item.code].filter(Boolean).join(' · '), value: item.id}))",
        accepted:
          'rows.map(toNameCodeOption); rows.map(item => ({label: `${item.name} · ${item.workDate ?? item.code}`, value: item.id}))'
      },
      {
        file: 'table-date.ts',
        rejected:
          "const columns = [{ formatter: row => dayjs(row.updatedAt).format('YYYY-MM-DD') }]",
        accepted:
          "const formatDate = createDateTimeFormatter({format: 'YYYY-MM-DD'}); const columns = [{formatter: row => formatDate(row.updatedAt)}]; const nextDate = dayjs().add(1, 'day').format('YYYY-MM-DD')"
      },
      {
        file: 'field-array.ts',
        rejected: "const readable = ['read', 'edit'].includes(getFieldAccess(access, 'amount'))",
        accepted:
          "const readable = isReadableFieldAccess(getFieldAccess(access, 'amount')); const other = status === 'read' || status === 'pending'; const levels = ['read', 'edit', 'masked'].includes(access)"
      },
      {
        file: 'field-level.ts',
        rejected: "const readable = access === 'edit' || access === 'read'",
        accepted: "const readable = isReadableFieldAccess(getFieldAccess(access, 'amount'))"
      },
      {
        file: 'currency-format.ts',
        rejected:
          "function amount(input: unknown, currency = 'CNY') { if (input === '' || input === null || input === undefined) return '--'; return formatCurrencyValue(input, currency) }; const optionalAmount = (input?: number) => (input === undefined ? '--' : formatCurrencyValue(input)); const boundAmount = (input: unknown) => formatSensitiveCurrencyValue(input, record.value.currencyCode)",
        accepted:
          "const display = formatSensitiveCurrencyValue(record.amount, record.currencyCode); function total(input: number) { return formatCurrencyValue(input + fee) }; function restricted(input: unknown) { if (!canRead || input === null || input === undefined || input === '') return '--'; return formatCurrencyValue(input) }"
      },
      {
        file: 'date-format.ts',
        rejected:
          "const dateText = (input?: string) => input ? dayjs(input).format('YYYY-MM-DD HH:mm') : '—'",
        accepted:
          "const dateText = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm', emptyText: '—', invalidText: '—' }); const nextDate = dayjs().add(1, 'day').format('YYYY-MM-DD')"
      },
      {
        file: 'options.ts',
        rejected:
          'export function normalizeExampleText(value: string) { return value.trim().toLowerCase() }',
        accepted:
          'export function normalizeExampleText(value: string) { return value.trim().toLowerCase() }'
      },
      {
        file: 'second-options.ts',
        rejected:
          'export function normalizeExampleText(value: string) { return value.trim().toLowerCase() }',
        accepted: "import { normalizeExampleText } from './options'; normalizeExampleText('code')"
      },
      {
        file: 'dictionary-lookup.ts',
        rejected:
          'getDictMap.value.status?.find(item => item.value === status); (getDictMap.value[code] ?? []).find(option => String(option.value) === String(value)); userStore.getDictMap[code]?.find(item => value === item.value)',
        accepted:
          "userStore.getDictItemByValue(code, value); userStore.getDictLabelByValue(code, value, '未维护'); getDictMap.value[code]?.find(item => item.value === input || item.label === input); getDictMap.value[code]?.find(item => String(item.value).startsWith(prefix))"
      }
    ] as const

    const audit = () => {
      const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
        cwd: root,
        encoding: 'utf8',
        timeout: 180_000
      })
      assert.ifError(
        result.error &&
          new Error(`${result.error.message}\n${result.stdout}\n${result.stderr}`, {
            cause: result.error
          })
      )
      return result
    }

    for (const entry of cases) writeFileSync(join(source, entry.file), entry.rejected)
    const rejected = audit()
    assert.equal(rejected.status, 1, rejected.stderr)
    assert.match(rejected.stderr, /Shared reuse audit failed with 12 finding\(s\):/)

    const findings = [...rejected.stderr.matchAll(/^- \[([^\]]+)\] ([^:]+): (.+)$/gm)].map(
      ([, rule, file, detail]) => ({ rule, file, detail })
    )
    assert.equal(findings.length, 12, rejected.stderr)
    const duplicate = findings.find(
      (finding) => finding.rule === 'within-repository-helper-duplication'
    )
    assert.ok(duplicate, rejected.stderr)
    assert.ok(
      ['src/views/options.ts', 'src/views/second-options.ts'].includes(duplicate.file),
      rejected.stderr
    )
    assert.match(duplicate.detail, /src\/views\/options\.ts/)
    assert.match(duplicate.detail, /src\/views\/second-options\.ts/)
    assert.deepEqual(
      findings
        .filter((finding) => finding !== duplicate)
        .map(({ rule, file }) => `${rule}:${file}`)
        .sort(),
      [
        'repeated-name-code-option-mapping:src/views/reference-options.ts',
        'raw-table-date-formatting:src/views/table-date.ts',
        'repeated-field-readability-check:src/views/field-array.ts',
        'repeated-field-readability-check:src/views/field-level.ts',
        'copied-currency-formatter:src/views/currency-format.ts',
        'copied-currency-formatter:src/views/currency-format.ts',
        'copied-currency-formatter:src/views/currency-format.ts',
        'copied-date-formatter:src/views/date-format.ts',
        'repeated-dictionary-value-lookup:src/views/dictionary-lookup.ts',
        'repeated-dictionary-value-lookup:src/views/dictionary-lookup.ts',
        'repeated-dictionary-value-lookup:src/views/dictionary-lookup.ts'
      ].sort(),
      rejected.stderr
    )

    for (const entry of cases) writeFileSync(join(source, entry.file), entry.accepted)
    const accepted = audit()
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.match(accepted.stdout, /Shared reuse audit passed/)
  } finally {
    assert.equal(dirname(resolve(root)), temporaryRoot)
    assert.ok(root.startsWith(join(temporaryRoot, 'art-reference-options-')))
    rmSync(root, { recursive: true, force: true })
  }
})
