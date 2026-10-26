import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getOrganizationTypeIcon,
  matchesOrganizationKeyword,
  matchesOrganizationNodeKeyword
} from '../../src/utils/organization-display'

test('organization icons use one canonical mapping and a safe fallback', () => {
  assert.equal(getOrganizationTypeIcon('company'), 'ri:building-4-line')
  assert.equal(getOrganizationTypeIcon('division'), 'ri:git-branch-line')
  assert.equal(getOrganizationTypeIcon('department'), 'ri:team-line')
  assert.equal(getOrganizationTypeIcon('team'), 'ri:group-2-line')
  assert.equal(getOrganizationTypeIcon(undefined), 'ri:node-tree')
  assert.equal(getOrganizationTypeIcon('unknown', 'ri:question-line'), 'ri:question-line')
  for (const type of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    assert.equal(getOrganizationTypeIcon(type), 'ri:node-tree')
  }
})

test('organization search matches names and codes without leaking null sentinels', () => {
  assert.equal(matchesOrganizationKeyword(' 研发 ', '研发中心', 'RD'), true)
  assert.equal(matchesOrganizationKeyword('rd', '研发中心', 'RD'), true)
  assert.equal(matchesOrganizationKeyword('null', null, undefined), false)
  assert.equal(matchesOrganizationKeyword(' ', null, undefined), true)
  assert.equal(
    matchesOrganizationNodeKeyword('ops', {
      organizationName: '运营中心',
      organizationCode: 'OPS'
    }),
    true
  )
})
