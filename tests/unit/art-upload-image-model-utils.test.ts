import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeUploadModelUrls,
  shouldSyncUploadFileList
} from '../../src/components/core/forms/upload-model-utils'

test('父组件传入内容相同的新数组时不重建上传列表', () => {
  const lastSyncedUrls = ['https://example.com/first.png', 'https://example.com/second.png']
  const recreatedModel = [...lastSyncedUrls]

  assert.notEqual(recreatedModel, lastSyncedUrls)
  assert.equal(shouldSyncUploadFileList(recreatedModel, lastSyncedUrls), false)
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
