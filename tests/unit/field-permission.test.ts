import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canEditField,
  canViewField,
  formatSensitiveNumber,
  formatSensitiveNumberWithAffix,
  getFieldAccess,
  isMaskedValue,
  isReadableFieldAccess,
  mergeFieldAccessMaps,
  omitNonEditableFields,
  parseReadableSensitiveNumber
} from '../../src/utils/field-permission'

test('field access defaults to hidden and keeps explicit levels', () => {
  assert.equal(getFieldAccess(undefined, 'amount'), 'hidden')
  assert.equal(getFieldAccess(undefined, 'amount', 'edit'), 'edit')
  assert.equal(getFieldAccess({ amount: 'masked' }, 'amount'), 'masked')
})

test('field permissions ignore inherited fields and unsupported runtime levels', () => {
  const access = JSON.parse('{"amount":"unsupported"}')
  assert.equal(canViewField(access, 'constructor'), false)
  assert.equal(getFieldAccess(access, 'amount'), 'hidden')
  assert.equal(getFieldAccess(Object.create({ amount: 'edit' }), 'amount'), 'hidden')
})

test('permission merges preserve explicit special fields and ignore invalid levels', () => {
  const access = JSON.parse('{"__proto__":"read","constructor":"edit","amount":"invalid"}')
  const result = mergeFieldAccessMaps(access, { amount: 'masked' })
  assert.equal(Object.getPrototypeOf(result), Object.prototype)
  assert.equal(getFieldAccess(result, '__proto__'), 'read')
  assert.equal(getFieldAccess(result, 'constructor'), 'edit')
  assert.equal(getFieldAccess(result, 'amount'), 'masked')
})

test('view and edit checks distinguish hidden, masked, read and edit', () => {
  const access = {
    secret: 'hidden',
    phone: 'masked',
    amount: 'read',
    price: 'edit'
  } as const

  assert.equal(canViewField(access, 'secret'), false)
  assert.equal(canViewField(access, 'phone'), true)
  assert.equal(canViewField(access, 'amount'), true)
  assert.equal(canEditField(access, 'amount'), false)
  assert.equal(canEditField(access, 'price'), true)
})

test('source-data readability rejects masks, missing grants and malformed runtime levels', () => {
  for (const access of ['read', 'edit']) assert.equal(isReadableFieldAccess(access), true)
  for (const access of [
    'hidden',
    'masked',
    'unsupported',
    '',
    null,
    undefined,
    true,
    1,
    ['read'],
    { level: 'edit' }
  ]) {
    assert.equal(isReadableFieldAccess(access), false)
  }
})

test('sensitive number formatting preserves masks and formats numeric values', () => {
  assert.equal(isMaskedValue('***'), true)
  assert.equal(formatSensitiveNumber('***'), '***')
  assert.equal(formatSensitiveNumber(null), '--')
  assert.equal(formatSensitiveNumber(1234.5), '1,234.50')
  assert.equal(formatSensitiveNumber('12.3456', { maximumFractionDigits: 4 }), '12.3456')
})

test('masked or invalid sensitive amounts cannot enter financial aggregates', () => {
  assert.equal(parseReadableSensitiveNumber(1234.5), 1234.5)
  assert.equal(parseReadableSensitiveNumber(' 1234.5 '), 1234.5)
  assert.equal(parseReadableSensitiveNumber(0), 0)
  for (const value of [null, undefined, '', '  ', '***', '12*4', 'invalid', Infinity, NaN, true]) {
    assert.equal(parseReadableSensitiveNumber(value), undefined)
  }
})

test('adds currency and unit affixes without decorating masked or empty values', () => {
  assert.equal(formatSensitiveNumberWithAffix(0, { prefix: '¥' }), '¥0.00')
  assert.equal(formatSensitiveNumberWithAffix('1234.5', { suffix: ' 元' }), '1,234.50 元')
  assert.equal(formatSensitiveNumberWithAffix('***', { prefix: '¥' }), '***')
  assert.equal(formatSensitiveNumberWithAffix(null, { suffix: ' km' }), '--')
  assert.equal(formatSensitiveNumberWithAffix(null, { prefix: '¥', emptyText: '—' }), '—')
  assert.equal(formatSensitiveNumberWithAffix('invalid', { suffix: ' 元', emptyText: '—' }), '—')
  assert.equal(formatSensitiveNumberWithAffix('***', { prefix: '¥', emptyText: '—' }), '***')
})

test('write payload helper removes every field without edit permission', () => {
  const payload = { name: '合同 A', amount: 1200, phone: '13800001234' }
  const result = omitNonEditableFields(payload, { amount: 'read', phone: 'edit' }, [
    'amount',
    'phone'
  ])

  assert.deepEqual(result, { name: '合同 A', phone: '13800001234' })
  assert.deepEqual(payload, { name: '合同 A', amount: 1200, phone: '13800001234' })
})

test('field access maps merge by the highest effective permission', () => {
  const result = mergeFieldAccessMaps(
    { phone: 'masked', amount: 'read' },
    { phone: 'read', amount: 'hidden', address: 'edit' },
    undefined
  )

  assert.deepEqual(result, { phone: 'read', amount: 'read', address: 'edit' })
})
