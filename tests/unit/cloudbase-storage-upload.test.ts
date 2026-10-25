import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { resolveBucketRoot, toObjectKey } from '../../scripts/upload-cloudbase-storage'

test('removes the backup bucket wrapper from CloudBase object keys', () => {
  const root = resolveBucketRoot('D:/backup/storage', 'attachments')
  assert.equal(
    toObjectKey(root, path.join(root, 'tenant', '2026', 'file.png')),
    'tenant/2026/file.png'
  )
})

test('rejects files outside the selected bucket root', () => {
  const root = resolveBucketRoot('D:/backup/storage', 'attachments')
  assert.throws(() => toObjectKey(root, 'D:/backup/storage/other/file.png'))
})
