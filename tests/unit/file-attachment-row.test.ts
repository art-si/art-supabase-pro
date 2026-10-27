import assert from 'node:assert/strict'
import { test } from 'node:test'
import { reactive } from 'vue'
import { removeAttachmentRow } from '../../src/utils/file/attachment'

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
