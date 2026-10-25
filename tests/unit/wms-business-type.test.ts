import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isWmsBusinessTypeAvailable } from '../../src/utils/wms/business-type'

test('business type is available only for its enabled document and menu assignment', () => {
  const businessType = {
    documentTypeIds: ['document-a', 'document-b'],
    menuIds: ['menu-a', 'menu-b'],
    enabled: true
  }
  assert.equal(isWmsBusinessTypeAvailable(businessType, 'document-b', 'menu-b'), true)
  assert.equal(isWmsBusinessTypeAvailable(businessType, 'document-c', 'menu-b'), false)
  assert.equal(isWmsBusinessTypeAvailable(businessType, 'document-b', 'menu-c'), false)
  assert.equal(
    isWmsBusinessTypeAvailable({ ...businessType, enabled: false }, 'document-b', 'menu-b'),
    false
  )
})
