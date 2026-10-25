import assert from 'node:assert/strict'
import test from 'node:test'
import { parseSerialNumberText } from '../../src/utils/file/serial-number-text'

test('序列号文本支持换行、逗号和 Windows 换行，并忽略空白项', () => {
  assert.deepEqual(parseSerialNumberText(' SN-001, SN-002\r\n\n SN-003 , '), [
    'SN-001',
    'SN-002',
    'SN-003'
  ])
  assert.deepEqual(parseSerialNumberText(' \n,  \r\n '), [])
})
