import assert from 'node:assert/strict'
import test from 'node:test'
import { MAX_OPENED_WORKTABS, limitWorktabs } from '../../src/store/modules/worktab-policy'

const makeTab = (path: string, fixedTab = false) => ({ path, fixedTab })

test('worktabs are capped at the configured maximum', () => {
  const tabs = Array.from({ length: MAX_OPENED_WORKTABS + 2 }, (_, index) =>
    makeTab(`/page-${index + 1}`)
  )
  const recentPaths = tabs.map((tab) => tab.path)
  const activePath = tabs.at(-1)?.path
  const result = limitWorktabs(tabs, recentPaths, activePath)

  assert.equal(result.kept.length, MAX_OPENED_WORKTABS)
  assert.deepEqual(
    result.removed.map((tab) => tab.path),
    ['/page-1', '/page-2']
  )
  assert.equal(
    result.kept.some((tab) => tab.path === activePath),
    true
  )
})

test('least recently used closable tab is evicted before an older-looking active tab', () => {
  const tabs = [makeTab('/a'), makeTab('/b'), makeTab('/c'), makeTab('/d')]
  const result = limitWorktabs(tabs, ['/a', '/c', '/b', '/d'], '/d', 3)

  assert.deepEqual(
    result.removed.map((tab) => tab.path),
    ['/a']
  )
  assert.deepEqual(
    result.kept.map((tab) => tab.path),
    ['/b', '/c', '/d']
  )
})

test('fixed and active worktabs are never evicted', () => {
  const tabs = [makeTab('/home', true), makeTab('/old'), makeTab('/active'), makeTab('/recent')]
  const result = limitWorktabs(tabs, ['/home', '/old', '/active', '/recent'], '/active', 2)

  assert.deepEqual(
    result.kept.map((tab) => tab.path),
    ['/home', '/active']
  )
  assert.deepEqual(
    result.removed.map((tab) => tab.path),
    ['/old', '/recent']
  )
})
