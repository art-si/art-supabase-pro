import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOrganizationSelectTree } from '../../src/utils/organization-options'

const child = { id: 'company', tenantId: 'own', organizationCode: 'C', organizationName: '子公司' }
const tree = [
  {
    id: 'group',
    tenantId: 'own',
    organizationCode: 'G',
    organizationName: '集团',
    children: [child]
  }
]

test('unselectable ancestors retain an eligible default descendant and do not mutate source data', () => {
  const result = buildOrganizationSelectTree(tree, [
    { id: 'company', tenantId: 'own', isDefault: true }
  ])
  assert.equal(result[0].disabled, true)
  assert.equal(result[0].children?.[0].disabled, false)
  assert.equal(result[0].children?.[0].isDefault, true)
  assert.deepEqual(tree[0].children, [child])
  assert.equal('disabled' in child, false)
})

test('empty eligibility and mismatched tenant references do not enable a node or select a default', () => {
  assert.equal(buildOrganizationSelectTree(tree, [])[0].children?.[0].disabled, true)
  const node = buildOrganizationSelectTree(tree, [
    { id: 'company', tenantId: 'other', isDefault: true }
  ])[0].children?.[0]
  assert.equal(node?.disabled, true)
  assert.equal(node?.isDefault, false)
})

test('incomplete identities fail closed rather than creating selectable anonymous organizations', () => {
  assert.throws(
    () => buildOrganizationSelectTree([{ ...child, tenantId: undefined }], [{ id: 'company' }]),
    /组织资料不完整/
  )
})
