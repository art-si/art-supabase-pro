import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formatSize } from '../../src/utils/file/format-size'

test('byte formatting retains existing default precision and binary boundaries', () => {
  for (const [bytes, expected] of [
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.00 KB'],
    [1536, '1.50 KB'],
    [1024 ** 2, '1.00 MB'],
    [1024 ** 3, '1.00 GB']
  ] as const)
    assert.equal(formatSize(bytes), expected)
})

test('invalid byte counts use the caller empty state', () => {
  for (const bytes of [undefined, null, -1, NaN, Infinity, -Infinity]) {
    assert.equal(formatSize(bytes), '—')
    assert.equal(formatSize(bytes, { emptyText: '大小未知' }), '大小未知')
  }
})

test('display precision and upload limit labels share the same units', () => {
  assert.equal(formatSize(1536, { precision: 1 }), '1.5 KB')
  assert.equal(formatSize(20 * 1024 ** 2, { precision: 1, trimZeros: true }), '20 MB')
  assert.equal(formatSize(1024 ** 3, { precision: 1 }), '1.0 GB')
  assert.equal(formatSize(1024, { precision: NaN }), '1.00 KB')
  assert.equal(formatSize(1024, { precision: -1 }), '1 KB')
})
