import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeImportedEnabled,
  normalizeNonNullableText,
  normalizeNullableNumber,
  normalizeNullableText,
  normalizeSingleStringKey,
  normalizeStringList
} from '../../src/utils/form/normalize'
import { formatTenantLabel } from '../../src/utils/tenant-display'
import {
  createDateTimeFormatter,
  formatAvatarInitials,
  formatArtValue,
  formatCurrencyCodeValue,
  formatNumberValue,
  formatDurationMs,
  formatCnyCurrencyValue,
  formatCurrencyValue,
  formatSensitiveCurrencyValue,
  formatSensitiveCountValue,
  formatDateTimeValue,
  formatPercentValue
} from '../../src/utils/ui/format'

test('avatar initials preserve Unicode names, email prefixes and empty fallbacks', () => {
  assert.equal(formatAvatarInitials('张三'), '张三')
  assert.equal(formatAvatarInitials('  john.doe@example.test  '), 'JD')
  assert.equal(formatAvatarInitials('John Smith'), 'JS')
  assert.equal(formatAvatarInitials('👩‍🔧 Smith'), '👩‍🔧S')
  assert.equal(formatAvatarInitials('👩‍🔧赵'), '👩‍🔧赵')
  assert.equal(formatAvatarInitials('🇨🇳李'), '🇨🇳李')
  assert.equal(formatAvatarInitials(undefined), '?')
  assert.equal(formatAvatarInitials('  ', '待'), '待')
  assert.equal(formatAvatarInitials('@example.test', '待'), '待')
})

test('currency code amounts preserve protected text and operational currency precision', () => {
  assert.equal(formatCurrencyCodeValue(1234.5678), 'CNY 1,234.568')
  assert.equal(formatCurrencyCodeValue(0, 'USD'), 'USD 0.00')
  assert.equal(formatCurrencyCodeValue(-1234.5, 'EUR'), 'EUR -1,234.50')
  assert.equal(formatCurrencyCodeValue(null), '--')
  assert.equal(formatCurrencyCodeValue(undefined), '--')
  for (const text of ['***', '金额受控', '1234.500', '']) {
    assert.equal(formatCurrencyCodeValue(text), text)
  }
})

test('currency precision separates integer budgets from decimal amounts in the formatter cache', () => {
  assert.equal(formatSensitiveCurrencyValue(1234.5, 'CNY', 'zh-CN', 0), '¥1,235')
  assert.equal(formatSensitiveCurrencyValue(1234.5), '¥1,234.50')
  assert.equal(formatSensitiveCurrencyValue(0, 'USD', 'en-US', 0), '$0')
  assert.equal(formatSensitiveCurrencyValue(-1234.5, 'EUR', 'en-US', 0), '-€1,235')
  assert.equal(formatSensitiveCurrencyValue(null, 'CNY', 'zh-CN', 0), '--')
  assert.equal(formatSensitiveCurrencyValue('***', 'CNY', 'zh-CN', 0), '***')
  assert.equal(formatCurrencyValue(1234.5, 'CNY', 'zh-CN', 0), '¥1,235')
  assert.equal(formatCurrencyValue(1234.5), '¥1,234.50')
})

test('operational precision uses locale grouping without changing default number and percent policies', () => {
  const numberFormat = { maximumFractionDigits: 2 }
  assert.equal(formatNumberValue(1234.567, 'zh-CN', numberFormat), '1,234.57')
  assert.equal(formatNumberValue(1.2, 'zh-CN', numberFormat), '1.2')
  assert.equal(formatNumberValue(0, 'zh-CN', numberFormat), '0')
  assert.equal(formatNumberValue(1234.567), '1,234.567')
  assert.equal(formatArtValue(1234.567, 'number', { numberFormat }), '1,234.57')
  assert.equal(formatPercentValue(1234.567, { numberFormat }), '1,234.57%')
  assert.equal(formatPercentValue(1.2, { numberFormat }), '1.2%')
  assert.equal(formatPercentValue(0, { numberFormat }), '0%')
  assert.equal(formatPercentValue(null, { numberFormat }), '--')
  assert.equal(formatPercentValue('***', { numberFormat }), '***')
  assert.equal(formatPercentValue(1.2, { fractionDigits: 2 }), '1.20%')
})

test('number formatting keeps locale, option mutations and cache turnover independent', () => {
  const options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  assert.equal(formatNumberValue(1234.5, 'de-DE', options), '1.234,50')
  assert.equal(formatNumberValue(1234.5, 'zh-CN', options), '1,234.50')
  options.useGrouping = false
  assert.equal(formatNumberValue(1234.5, 'zh-CN', options), '1234.50')
  for (let digits = 0; digits <= 20; digits++) {
    for (const locale of ['zh-CN', 'de-DE', 'en-US', 'fr-FR']) {
      const precision = { minimumFractionDigits: digits, maximumFractionDigits: digits }
      assert.equal(
        formatNumberValue(1234.5, locale, precision),
        (1234.5).toLocaleString(locale, precision)
      )
    }
  }
  assert.equal(formatNumberValue(1234.5, 'de-DE', options), '1234,50')
  assert.equal(formatNumberValue('***'), '***')
  assert.equal(formatNumberValue(Infinity), 'Infinity')
  assert.equal(formatNumberValue(NaN), 'NaN')
})

test('displayed measurements distinguish missing values from a valid zero', () => {
  for (const value of [undefined, null, '']) assert.equal(formatArtValue(value, 'number'), '--')
  assert.equal(formatArtValue(0, 'number'), '0')
  assert.equal(formatArtValue('***', 'number'), '***')
})

test('business timestamps reject time-only input without changing time-control formatting', () => {
  const date = createDateTimeFormatter({
    format: 'YYYY-MM-DD',
    invalidText: '--',
    allowTimeOnly: false
  })
  const receipt = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '未识别',
    invalidText: '未识别',
    allowTimeOnly: false
  })
  assert.equal(date('2026-10-09 12:34:56'), '2026-10-09')
  assert.equal(receipt('2026-10-09 12:34:56'), '2026-10-09 12:34')
  for (const value of [undefined, null, '', '***', 'invalid', '12:34', '12:34:56']) {
    assert.equal(date(value), '--')
    assert.equal(receipt(value), '未识别')
  }
  assert.equal(formatDateTimeValue('12:34', { format: 'HH:mm', invalidText: '--' }), '12:34')
})

test('imported status preserves explicit disabled values and defaults omitted status to enabled', () => {
  for (const value of [false, 'false', '停用', '否'])
    assert.equal(normalizeImportedEnabled(value), false)
  for (const value of [true, 'true', '启用', '是', undefined, null, '', 0])
    assert.equal(normalizeImportedEnabled(value), true)
})

test('millisecond telemetry uses one precision, unit and unavailable-value policy', () => {
  for (const value of [undefined, null, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatDurationMs(value), '--')
  }
  assert.equal(formatDurationMs(0), '0 ms')
  assert.equal(formatDurationMs(34.6), '35 ms')
  assert.equal(formatDurationMs(999), '999 ms')
  assert.equal(formatDurationMs(820), '820 ms')
  assert.equal(formatDurationMs(1000), '1.00 s')
  assert.equal(formatDurationMs(1234), '1.23 s')
  assert.equal(formatDurationMs(1250), '1.25 s')
  assert.equal(formatDurationMs(9999), '10.00 s')
  assert.equal(formatDurationMs(10_000), '10.0 s')
  assert.equal(formatDurationMs(12345), '12.3 s')
})

test('shared form normalizers preserve database nullability semantics', () => {
  assert.equal(normalizeNonNullableText(null), '')
  assert.equal(normalizeNonNullableText(undefined), '')
  assert.equal(normalizeNonNullableText('  '), '')
  assert.equal(normalizeNonNullableText('  说明  '), '说明')
  assert.equal(normalizeNullableText('  '), null)
  assert.equal(normalizeNullableText(null), null)
  assert.equal(normalizeNullableText('  备注  '), '备注')
  assert.equal(normalizeNullableNumber(''), null)
  assert.equal(normalizeNullableNumber(null), null)
  assert.equal(normalizeNullableNumber('invalid'), null)
  assert.equal(normalizeNullableNumber('12.5'), 12.5)
  assert.equal(normalizeNullableNumber(' \t\n '), null)
  assert.equal(normalizeNullableNumber(0), 0)
  assert.equal(normalizeNullableNumber(' 0 '), 0)
  for (const value of [true, false, [], [12], {}, Number.NaN, Number.POSITIVE_INFINITY])
    assert.equal(normalizeNullableNumber(value), null)
  assert.deepEqual(normalizeStringList(undefined), [])
  assert.deepEqual(normalizeStringList(42), ['42'])
  assert.deepEqual(normalizeStringList([1, 'two']), ['1', 'two'])
})

test('single-select string keys preserve zero and use only the first selected key', () => {
  for (const value of [null, undefined, []])
    assert.equal(normalizeSingleStringKey(value), undefined)
  assert.equal(normalizeSingleStringKey(0), '0')
  assert.equal(normalizeSingleStringKey(''), '')
  assert.equal(normalizeSingleStringKey('employee-id'), 'employee-id')
  assert.equal(normalizeSingleStringKey([0, 'second-id']), '0')
  assert.equal(normalizeSingleStringKey(['first-id', 'second-id']), 'first-id')
  const keys = ['first-id', 'second-id'] as const
  assert.equal(normalizeSingleStringKey(keys), 'first-id')
  assert.deepEqual(keys, ['first-id', 'second-id'])
})

test('shared UI formatters keep repeated display policies consistent', () => {
  assert.equal(formatCnyCurrencyValue(null), '¥0.00')
  assert.equal(formatCurrencyValue(1234.5, 'USD', 'en-US'), '$1,234.50')
  assert.equal(formatCurrencyValue('invalid'), 'invalid')
  assert.equal(formatSensitiveCurrencyValue(null), '--')
  assert.equal(formatSensitiveCurrencyValue(''), '--')
  assert.equal(formatSensitiveCurrencyValue('***'), '***')
  assert.equal(formatSensitiveCurrencyValue(1234.5), '¥1,234.50')
  assert.equal(formatSensitiveCurrencyValue(1234.5, 'USD', 'en-US'), '$1,234.50')
  assert.equal(formatSensitiveCurrencyValue('***', 'USD'), '***')
  assert.equal(formatSensitiveCurrencyValue(undefined, 'USD'), '--')
  assert.equal(formatSensitiveCurrencyValue(0, 'USD', 'en-US'), '$0.00')
  assert.equal(formatSensitiveCurrencyValue(-1234.5, 'USD', 'en-US'), '-$1,234.50')
  assert.equal(formatSensitiveCurrencyValue('01234.50', 'USD', 'en-US'), '$1,234.50')
  assert.equal(formatSensitiveCurrencyValue('不可用', 'USD', 'en-US'), '不可用')
  assert.equal(formatSensitiveCurrencyValue(1234.5, 'EUR', 'en-US'), '€1,234.50')
  assert.equal(formatPercentValue(null), '--')
  assert.equal(formatPercentValue(12.34), '12.3%')
  assert.equal(formatDateTimeValue(null), '--')
  assert.equal(formatDateTimeValue(''), '--')
  assert.equal(formatDateTimeValue('2026-09-13 08:30:00'), '2026-09-13 08:30:00')

  const formatMinute = createDateTimeFormatter({
    format: 'YYYY-MM-DD HH:mm',
    emptyText: '—',
    invalidText: '—'
  })
  assert.equal(formatMinute(null), '—')
  assert.equal(formatMinute(undefined), '—')
  assert.equal(formatMinute('invalid'), '—')
  assert.equal(formatMinute('2026-09-13T08:30:00Z').length, 16)
  assert.equal(createDateTimeFormatter({ format: 'YYYY-MM-DD' })('2026-09-13'), '2026-09-13')
})

test('sensitive counts preserve masks, numeric strings and unavailable values', () => {
  assert.equal(formatSensitiveCountValue(undefined), '--')
  assert.equal(formatSensitiveCountValue(null), '--')
  assert.equal(formatSensitiveCountValue(''), '--')
  assert.equal(formatSensitiveCountValue('***'), '***')
  assert.equal(formatSensitiveCountValue('01234'), '01234')
  assert.equal(formatSensitiveCountValue('不可用'), '不可用')
  assert.equal(formatSensitiveCountValue(1234), '1,234')
  assert.equal(formatSensitiveCountValue(0), '0')
  assert.equal(formatSensitiveCountValue(Infinity), '∞')
  assert.equal(formatSensitiveCountValue(-Infinity), '-∞')
  assert.equal(formatSensitiveCountValue(NaN), 'NaN')
})

test('tenant labels share one fallback and composition rule', () => {
  assert.equal(
    formatTenantLabel({ tenant: { tenantName: ' 亿企 ', tenantCode: ' YQ ' } }),
    '亿企（YQ）'
  )
  assert.equal(formatTenantLabel({ tenantId: 'tenant-id' }), 'tenant-id')
  assert.equal(formatTenantLabel({}), '未识别租户')
})
