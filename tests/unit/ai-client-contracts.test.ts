import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isPlannerCapabilities,
  isPlannerState,
  isProjectCatalogResult,
  isSuggestionEventResponse
} from '../../src/api/contracts/ai-client-contracts'

test('project catalog contracts reject malformed remote payloads by action', () => {
  assert.equal(
    isProjectCatalogResult('overview', { projectRef: 'project', databaseVersion: '17' }),
    true
  )
  assert.equal(isProjectCatalogResult('schemas', ['public', 'storage']), true)
  assert.equal(isProjectCatalogResult('schemas', ['public', null]), false)
  assert.equal(
    isProjectCatalogResult('relationships', [
      {
        constraintName: 'fk_order_customer',
        sourceSchema: 'public',
        sourceTable: 'orders',
        sourceColumns: ['customer_id'],
        targetSchema: 'public',
        targetTable: 'customers',
        targetColumns: ['id']
      }
    ]),
    true
  )
  assert.equal(isProjectCatalogResult('relationships', [{ sourceColumns: 'customer_id' }]), false)
})

test('planner contracts keep malformed SDK data out of application state', () => {
  assert.equal(
    isPlannerCapabilities({
      version: '1',
      categories: [],
      efforts: [],
      events: [],
      access: {},
      repositorySnapshot: {}
    }),
    true
  )
  assert.equal(isPlannerCapabilities({ version: '1', categories: null }), false)
  assert.equal(
    isPlannerState({ suggestions: [], preferenceSummary: {}, statusCounts: {}, snapshot: {} }),
    true
  )
  assert.equal(isPlannerState({ suggestions: {}, preferenceSummary: {} }), false)
  assert.equal(
    isSuggestionEventResponse({ ok: true, suggestionId: 's-1', eventType: 'accepted' }),
    true
  )
  assert.equal(isSuggestionEventResponse({ ok: true, suggestionId: 1 }), false)
})
