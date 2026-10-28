import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveFileActionUrl } from '../../src/utils/file/url'

const baseUrl = 'https://app.example.test/workbench#/file-preview'

test('file actions accept web, relative and same-origin Blob URLs without dropping signatures', () => {
  const signed = 'https://files.example.test/object/report.pdf?token=a%2Fb&expires=60#preview'
  assert.equal(resolveFileActionUrl(signed, baseUrl), signed)
  assert.equal(
    resolveFileActionUrl('../files/report.pdf?token=a%2Fb#page=2', baseUrl),
    'https://app.example.test/files/report.pdf?token=a%2Fb#page=2'
  )
  assert.equal(
    resolveFileActionUrl('//files.example.test/report.pdf?token=secret', baseUrl),
    'https://files.example.test/report.pdf?token=secret'
  )
  assert.equal(
    resolveFileActionUrl(
      'blob:https://app.example.test/3bb015d1-17a0-4aaf-9f3b-49208aa501b6',
      baseUrl
    ),
    'blob:https://app.example.test/3bb015d1-17a0-4aaf-9f3b-49208aa501b6'
  )
})

test('file actions reject executable, opaque, foreign Blob and empty-object URLs', () => {
  for (const value of [
    null,
    undefined,
    '',
    '  ',
    '#preview',
    'javascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'data:image/png;base64,iVBORw0KGgo=',
    'file:///tmp/report.pdf',
    'mailto:person@example.test',
    'blob:null/abc',
    'blob:https://foreign.example.test/abc',
    'blob:https://app.example.test/',
    'blob:https://app.example.test/folder/'
  ]) {
    assert.equal(resolveFileActionUrl(value, baseUrl), null, String(value))
  }
  assert.equal(resolveFileActionUrl(42 as unknown as string, baseUrl), null)
  assert.equal(resolveFileActionUrl('/report.pdf', 'invalid-base'), null)
})
