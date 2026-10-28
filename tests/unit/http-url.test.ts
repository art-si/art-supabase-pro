import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveHttpUrl } from '../../src/utils/http-url'

test('HTTP URL resolution accepts absolute and relative browser links', () => {
  assert.equal(
    resolveHttpUrl('https://files.example.com/a.pdf', 'https://app.example.com'),
    'https://files.example.com/a.pdf'
  )
  assert.equal(
    resolveHttpUrl('/attachments/a.pdf', 'https://app.example.com/path'),
    'https://app.example.com/attachments/a.pdf'
  )
})

test('HTTP URL resolution rejects executable, local and malformed schemes', () => {
  for (const value of [
    '',
    '   ',
    '\n\t',
    'javascript:alert(1)',
    'data:text/html,test',
    'file:///tmp/a',
    'http://[invalid'
  ]) {
    assert.equal(resolveHttpUrl(value, 'https://app.example.com'), null)
  }
  for (const value of [undefined, null, 0, [], {}])
    assert.equal(Reflect.apply(resolveHttpUrl, undefined, [value, 'https://app.example.com']), null)
})
