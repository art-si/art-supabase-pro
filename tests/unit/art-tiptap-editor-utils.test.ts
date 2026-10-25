import assert from 'node:assert/strict'
import test from 'node:test'
import { isAcceptedFileType } from '../../src/utils/file/accept'
import { normalizeEditorUrl } from '../../src/components/core/forms/art-tiptap-editor/utils'

test('normalizeEditorUrl normalizes safe links and rejects unsafe protocols', () => {
  assert.equal(
    normalizeEditorUrl('example.com/path', ['http:', 'https:']),
    'https://example.com/path'
  )
  assert.equal(normalizeEditorUrl('/announcement/1', ['http:', 'https:']), '/announcement/1')
  assert.equal(normalizeEditorUrl('javascript:alert(1)', ['http:', 'https:']), '')
  assert.equal(normalizeEditorUrl('data:text/html,test', ['http:', 'https:']), '')
})

test('isAcceptedFileType supports mime types, wildcards and extensions', () => {
  const pngFile = new File(['image'], 'announcement.png', { type: 'image/png' })
  const svgFile = new File(['image'], 'diagram.svg', { type: 'image/svg+xml' })
  const documentFile = new File(['document'], 'notice.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  })

  assert.equal(isAcceptedFileType(pngFile, 'image/png,image/jpeg'), true)
  assert.equal(isAcceptedFileType(svgFile, 'image/*'), true)
  assert.equal(isAcceptedFileType(svgFile, '.svg'), true)
  assert.equal(isAcceptedFileType(svgFile, 'image/png'), false)
  assert.equal(isAcceptedFileType(documentFile, '.pdf,.docx'), true)
})
