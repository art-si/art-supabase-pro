import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getSafeUploadDisplayName,
  normalizeUploadModelUrls,
  shouldSyncUploadFileList
} from '../../src/components/core/forms/upload-model-utils'

test('父组件传入内容相同的新数组时不重建上传列表', () => {
  const lastSyncedUrls = ['https://example.com/first.png', 'https://example.com/second.png']
  const recreatedModel = [...lastSyncedUrls]

  assert.notEqual(recreatedModel, lastSyncedUrls)
  assert.equal(shouldSyncUploadFileList(recreatedModel, lastSyncedUrls), false)
})

test('签名附件名称只来自 URL 路径，不包含访问令牌', () => {
  const signed =
    'https://example.supabase.co/storage/v1/object/sign/private/tenant/%E8%90%A5%E4%B8%9A%E6%89%A7%E7%85%A7.png?token=secret-value#preview'
  assert.equal(getSafeUploadDisplayName(signed), '营业执照.png')
  assert.equal(getSafeUploadDisplayName('/folder/demo.pdf?token=secret-value'), 'demo.pdf')
  assert.equal(getSafeUploadDisplayName('https://example.com/folder/'), '附件')
  assert.equal(getSafeUploadDisplayName('https://example.com/%ZZ?token=secret-value'), '附件')
  assert.equal(getSafeUploadDisplayName('data:image/png;base64,secret-value'), '附件')
})

test('URL 内容、顺序或清空发生变化时重新同步上传列表', () => {
  const lastSyncedUrls = ['https://example.com/first.png', 'https://example.com/second.png']

  assert.equal(shouldSyncUploadFileList([...lastSyncedUrls].reverse(), lastSyncedUrls), true)
  assert.equal(shouldSyncUploadFileList(['https://example.com/third.png'], lastSyncedUrls), true)
  assert.equal(shouldSyncUploadFileList(null, lastSyncedUrls), true)
})

test('标准化模型时生成独立快照，并统一空值与单值格式', () => {
  const urls = ['https://example.com/first.png']
  const snapshot = normalizeUploadModelUrls(urls)

  assert.deepEqual(snapshot, urls)
  assert.notEqual(snapshot, urls)
  assert.deepEqual(normalizeUploadModelUrls('https://example.com/only.png'), [
    'https://example.com/only.png'
  ])
  assert.deepEqual(normalizeUploadModelUrls(''), [])
  assert.deepEqual(normalizeUploadModelUrls(undefined), [])
})
