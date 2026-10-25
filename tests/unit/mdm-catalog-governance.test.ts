import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mdmCatalogSourceDefinitions,
  mdmCatalogSourceKindCounts
} from '../../modules/art-supabase-mdm/src/api/modules/catalog-source-definitions'

test('MDM catalog distinguishes independent masters from relationship records', () => {
  assert.deepEqual(mdmCatalogSourceKindCounts, { master: 24, relation: 2 })

  const relationTypes = Object.values(mdmCatalogSourceDefinitions)
    .flat()
    .filter((source) => source.kind === 'relation')
    .map((source) => source.type)
    .sort()

  assert.deepEqual(relationTypes, ['customer_address', 'employee_assignment'])
  assert.equal(
    Object.values(mdmCatalogSourceDefinitions)
      .flat()
      .some((source) => source.type === 'business_partner_role'),
    false
  )
})
