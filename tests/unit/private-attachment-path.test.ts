import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPrivateAttachmentPath,
  privateAttachmentPathFromSignedUrl
} from '../../src/utils/supabase/private-attachment-path'

const path =
  '2824c2b5-2774-4781-b995-f55e8bcee920/0a872664-874c-447d-a256-d0dbdca6ed45/00000000-0000-4000-8000-000000000003.png'
const projectUrl = 'https://example.supabase.co'

test('private attachment parser retains only the immutable storage path', () => {
  const signed = `https://example.supabase.co/storage/v1/object/sign/tms-company-certification-private/${path}?token=short-lived`
  assert.equal(isPrivateAttachmentPath(path), true)
  assert.equal(
    privateAttachmentPathFromSignedUrl(signed, 'tms-company-certification-private', projectUrl),
    path
  )
})

test('private attachment parser rejects public, other-bucket and malformed paths', () => {
  assert.equal(isPrivateAttachmentPath('https://example.supabase.co/public/image.png'), false)
  assert.throws(
    () =>
      privateAttachmentPathFromSignedUrl(
        `https://example.supabase.co/storage/v1/object/public/tms-company-certification-private/${path}`,
        'tms-company-certification-private',
        projectUrl
      ),
    /私有附件/
  )
  assert.throws(
    () =>
      privateAttachmentPathFromSignedUrl(
        `https://example.supabase.co/storage/v1/object/sign/other-private/${path}?token=x`,
        'tms-company-certification-private',
        projectUrl
      ),
    /私有附件/
  )
  assert.throws(
    () =>
      privateAttachmentPathFromSignedUrl(
        `https://example.supabase.co/storage/v1/object/sign/tms-company-certification-private/${path}`,
        'tms-company-certification-private',
        projectUrl
      ),
    /私有附件/
  )
  assert.throws(
    () =>
      privateAttachmentPathFromSignedUrl(
        'https://example.supabase.co/storage/v1/object/sign/tms-company-certification-private/not-a-path?token=x',
        'tms-company-certification-private',
        projectUrl
      ),
    /附件路径/
  )
  assert.throws(
    () =>
      privateAttachmentPathFromSignedUrl(
        `https://evil.example/storage/v1/object/sign/tms-company-certification-private/${path}?token=x`,
        'tms-company-certification-private',
        projectUrl
      ),
    /附件来源/
  )
})
