import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import {
  getAttachmentNameFromUrl,
  getAttachmentDisplayName,
  getFileExtension,
  removeAttachmentRow
} from '../../src/utils/file/attachment'

test('URL names use decoded path segments without signed query or fragment data', () => {
  const signed =
    'https://example.supabase.co/storage/v1/object/sign/private/tenant/%E8%90%A5%E4%B8%9A%E6%89%A7%E7%85%A7.png?token=secret-value#preview'
  assert.equal(getAttachmentNameFromUrl(signed), '营业执照.png')
  assert.equal(getAttachmentDisplayName(signed), '营业执照.png')
  assert.equal(getAttachmentNameFromUrl('/folder/demo.pdf?token=secret-value'), 'demo.pdf')
  assert.equal(getAttachmentNameFromUrl('https://example.com/report.pdf#fragment'), 'report.pdf')
  assert.equal(getAttachmentNameFromUrl('https://example.com/a%3Fb%23c.pdf?token=x'), 'a?b#c.pdf')
})

test('invalid URLs and missing names preserve the caller fallback without throwing', () => {
  for (const url of [
    '',
    'https://example.com/folder/',
    'https://example.com/%ZZ?token=secret-value',
    'https://example.com/%E4.pdf',
    'data:image/png;base64,secret-value',
    'javascript:alert(1)',
    'file:///private/report.pdf',
    'https://[invalid/report.pdf'
  ]) {
    assert.equal(getAttachmentNameFromUrl(url, '文档 2'), '文档 2')
    assert.equal(getAttachmentNameFromUrl(url, ''), '')
    assert.equal(getAttachmentDisplayName(url, '图片'), '图片')
  }
  for (const value of [undefined, null, 0, [], {}])
    assert.equal(Reflect.apply(getAttachmentNameFromUrl, undefined, [value, '文档 2']), '文档 2')
})

test('stored names remain complete while upload labels retain their 120-character boundary', () => {
  const boundaryName = `${'a'.repeat(116)}.pdf`
  const longName = `报告${'文'.repeat(125)}.pdf`
  assert.equal(getAttachmentDisplayName(`https://example.com/${boundaryName}`), boundaryName)
  assert.equal(getAttachmentDisplayName(`https://example.com/a${boundaryName}`, '附件 3'), '附件 3')
  assert.equal(
    getAttachmentNameFromUrl(`https://example.com/${encodeURIComponent(longName)}?token=x`),
    longName
  )
  assert.equal(
    getAttachmentDisplayName(`https://example.com/${encodeURIComponent(longName)}?token=x`),
    '附件'
  )
})

test('file extensions use resource metadata before the actual filename suffix', () => {
  assert.equal(getFileExtension('report.PDF'), 'pdf')
  assert.equal(getFileExtension('report.tar.gz'), 'gz')
  assert.equal(getFileExtension('.pdf'), 'pdf')
  assert.equal(getFileExtension('.env'), 'env')
  assert.equal(getFileExtension('报告', '.PDF'), 'pdf')
  assert.equal(getFileExtension('report.csv', ' .XLSX '), 'xlsx')
  for (const name of [undefined, '', 'report', 'report.']) assert.equal(getFileExtension(name), '')
})

test('removing one duplicate URL keeps the other attachment and its order', () => {
  const first = { name: '旧保险单', url: '/same.pdf', fileType: 'pdf', fileSize: '10' }
  const selected = { name: '新保险单', url: '/same.pdf', fileType: 'pdf', fileSize: '20' }
  const last = { name: '行驶证', url: '/other.pdf', fileType: 'pdf', fileSize: '30' }
  const attachments = [first, selected, last]

  assert.deepEqual(removeAttachmentRow(attachments, selected), [first, last])
  assert.deepEqual(attachments, [first, selected, last])
})

test('row identity takes priority when legacy duplicates have identical fields', () => {
  const first = { name: '保险单', url: '/same.pdf' }
  const selected = { name: '保险单', url: '/same.pdf' }
  const form = reactive({ attachments: [first, selected] })

  const remaining = removeAttachmentRow(form.attachments, form.attachments[1])
  assert.equal(remaining.length, 1)
  assert.equal(remaining[0], form.attachments[0])
})

test('cloned table rows match stable fields, then fall back to one URL match', () => {
  const first = { name: '旧资料', url: '/same.pdf', fileSize: '10' }
  const second = { name: '新资料', url: '/same.pdf', fileSize: '20' }
  const attachments = [first, second]

  assert.deepEqual(removeAttachmentRow(attachments, { ...second }), [first])
  assert.deepEqual(removeAttachmentRow(attachments, { name: '未知', url: '/same.pdf' }), [second])
  assert.deepEqual(
    removeAttachmentRow(attachments, { name: '未知', url: '/absent.pdf' }),
    attachments
  )
})

test('legacy attachment without a URL only matches its own fields', () => {
  const attachments = [
    { name: '旧资料', url: undefined },
    { name: '待补资料', url: undefined }
  ]

  assert.deepEqual(removeAttachmentRow(attachments, { ...attachments[1] }), [attachments[0]])
  assert.deepEqual(removeAttachmentRow(attachments, { name: '未知', url: undefined }), attachments)
})
