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
    const file = join(source, 'options.ts')
    writeFileSync(
      file,
      "rows.map(item => ({label: [item.name, item.code].filter(Boolean).join(' · '), value: item.id}))"
    )
    const audit = () =>
      spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), script], {
        cwd: root,
        encoding: 'utf8',
        timeout: 60_000
      })
    const rejected = audit()
    assert.equal(rejected.status, 1, rejected.stderr)
    assert.match(rejected.stderr, /repeated-name-code-option-mapping/)
    writeFileSync(
      file,
      'rows.map(toNameCodeOption); rows.map(item => ({label: `${item.name} · ${item.workDate ?? item.code}`, value: item.id}))'
    )
    const accepted = audit()
    assert.equal(accepted.status, 0, accepted.stderr)
    assert.match(accepted.stdout, /Shared reuse audit passed/)
    writeFileSync(
      file,
      "const columns = [{ formatter: row => dayjs(row.updatedAt).format('YYYY-MM-DD') }]"
    )
    const dateRejected = audit()
    assert.equal(dateRejected.status, 1, dateRejected.stderr)
    assert.match(dateRejected.stderr, /raw-table-date-formatting/)
    writeFileSync(
      file,
      "const formatDate = createDateTimeFormatter({format: 'YYYY-MM-DD'}); const columns = [{formatter: row => formatDate(row.updatedAt)}]; const nextDate = dayjs().add(1, 'day').format('YYYY-MM-DD')"
    )
    const dateAccepted = audit()
    assert.equal(dateAccepted.status, 0, dateAccepted.stderr)
    writeFileSync(
      file,
      "const readable = ['read', 'edit'].includes(getFieldAccess(access, 'amount'))"
    )
    const arrayAccessRejected = audit()
    assert.equal(arrayAccessRejected.status, 1, arrayAccessRejected.stderr)
    assert.match(arrayAccessRejected.stderr, /repeated-field-readability-check/)
    writeFileSync(file, "const readable = access === 'edit' || access === 'read'")
    const levelAccessRejected = audit()
    assert.equal(levelAccessRejected.status, 1, levelAccessRejected.stderr)
    assert.match(levelAccessRejected.stderr, /repeated-field-readability-check/)
    writeFileSync(
      file,
      "const readable = isReadableFieldAccess(getFieldAccess(access, 'amount')); const other = status === 'read' || status === 'pending'; const levels = ['read', 'edit', 'masked'].includes(access)"
    )
    const sharedAccessAccepted = audit()
    assert.equal(sharedAccessAccepted.status, 0, sharedAccessAccepted.stderr)
    writeFileSync(
      file,
      "function amount(input: unknown, currency = 'CNY') { if (input === '' || input === null || input === undefined) return '--'; return formatCurrencyValue(input, currency) }; const optionalAmount = (input?: number) => (input === undefined ? '--' : formatCurrencyValue(input)); const boundAmount = (input: unknown) => formatSensitiveCurrencyValue(input, record.value.currencyCode)"
    )
    const copiedCurrencyRejected = audit()
    assert.equal(copiedCurrencyRejected.status, 1, copiedCurrencyRejected.stderr)
    assert.equal(
      (copiedCurrencyRejected.stderr.match(/copied-currency-formatter/g) ?? []).length,
      3
    )
    writeFileSync(
      file,
      "const display = formatSensitiveCurrencyValue(record.amount, record.currencyCode); function total(input: number) { return formatCurrencyValue(input + fee) }; function restricted(input: unknown) { if (!canRead || input === null || input === undefined || input === '') return '--'; return formatCurrencyValue(input) }"
    )
    const domainCurrencyAccepted = audit()
    assert.equal(domainCurrencyAccepted.status, 0, domainCurrencyAccepted.stderr)
    writeFileSync(
      file,
      "const dateText = (input?: string) => input ? dayjs(input).format('YYYY-MM-DD HH:mm') : '—'"
    )
    const copiedDateRejected = audit()
    assert.equal(copiedDateRejected.status, 1, copiedDateRejected.stderr)
    assert.match(copiedDateRejected.stderr, /copied-date-formatter/)
    writeFileSync(
      file,
      "const dateText = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm', emptyText: '—', invalidText: '—' }); const nextDate = dayjs().add(1, 'day').format('YYYY-MM-DD')"
    )
    const sharedDateAccepted = audit()
    assert.equal(sharedDateAccepted.status, 0, sharedDateAccepted.stderr)
    const copiedHelper =
      'export function normalizeExampleText(value: string) { return value.trim().toLowerCase() }'
    const secondFile = join(source, 'second-options.ts')
    writeFileSync(file, copiedHelper)
    writeFileSync(secondFile, copiedHelper)
    const sameRepositoryRejected = audit()
    assert.equal(sameRepositoryRejected.status, 1, sameRepositoryRejected.stderr)
    assert.match(sameRepositoryRejected.stderr, /within-repository-helper-duplication/)
    writeFileSync(
      secondFile,
      "import { normalizeExampleText } from './options'; normalizeExampleText('code')"
    )
    const sameRepositoryAccepted = audit()
    assert.equal(sameRepositoryAccepted.status, 0, sameRepositoryAccepted.stderr)
    writeFileSync(
      file,
      'getDictMap.value.status?.find(item => item.value === status); (getDictMap.value[code] ?? []).find(option => String(option.value) === String(value)); userStore.getDictMap[code]?.find(item => value === item.value)'
    )
    const dictionaryLookupRejected = audit()
    assert.equal(dictionaryLookupRejected.status, 1, dictionaryLookupRejected.stderr)
    assert.equal(
      (dictionaryLookupRejected.stderr.match(/repeated-dictionary-value-lookup/g) ?? []).length,
      3
    )
    writeFileSync(
      file,
      "userStore.getDictItemByValue(code, value); userStore.getDictLabelByValue(code, value, '未维护'); getDictMap.value[code]?.find(item => item.value === input || item.label === input); getDictMap.value[code]?.find(item => String(item.value).startsWith(prefix))"
    )
    const sharedDictionaryAccepted = audit()
    assert.equal(sharedDictionaryAccepted.status, 0, sharedDictionaryAccepted.stderr)
  } finally {
    assert.equal(dirname(resolve(root)), temporaryRoot)
    assert.ok(root.startsWith(join(temporaryRoot, 'art-reference-options-')))
    rmSync(root, { recursive: true, force: true })
  }
})
