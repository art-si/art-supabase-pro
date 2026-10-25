import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMenuEditOrderUpdates,
  buildMenuTreeOrderUpdates,
  filterMenuParentTree,
  isMenuParentAvailable
} from '../../src/views/system/menu/modules/menu-order'

const tree = [
  {
    id: 'root-a',
    sort: 1,
    children: [
      { id: 'a-1', parentId: 'root-a', sort: 1 },
      { id: 'a-2', parentId: 'root-a', sort: 2 },
      { id: 'a-3', parentId: 'root-a', sort: 3 }
    ]
  },
  {
    id: 'root-b',
    sort: 2,
    children: [{ id: 'b-1', parentId: 'root-b', sort: 1 }]
  }
]

test('editing sort reindexes the complete sibling group', () => {
  const updates = buildMenuEditOrderUpdates({
    tree,
    id: 'a-3',
    sourceParentId: 'root-a',
    targetParentId: 'root-a',
    targetSort: 1
  })

  assert.deepEqual(updates, [
    { id: 'a-3', sort: 1 },
    { id: 'a-1', sort: 2 },
    { id: 'a-2', sort: 3 }
  ])
})

test('editing parent reindexes source and target groups without moving descendants separately', () => {
  const updates = buildMenuEditOrderUpdates({
    tree,
    id: 'a-2',
    sourceParentId: 'root-a',
    targetParentId: 'root-b',
    targetSort: 2
  })

  assert.deepEqual(updates, [
    { id: 'a-1', sort: 1 },
    { id: 'a-3', sort: 2 },
    { id: 'b-1', sort: 1 },
    { id: 'a-2', sort: 2 }
  ])
})

test('complete tree order derives root parent ids and dense sibling sorts from structure', () => {
  const updates = buildMenuTreeOrderUpdates([
    tree[1],
    {
      ...tree[0],
      children: [tree[0].children[2], tree[0].children[0], tree[0].children[1]]
    }
  ])

  assert.deepEqual(updates, [
    { id: 'root-b', parentId: null, sort: 1 },
    { id: 'b-1', parentId: 'root-b', sort: 1 },
    { id: 'root-a', parentId: null, sort: 2 },
    { id: 'a-3', parentId: 'root-a', sort: 1 },
    { id: 'a-1', parentId: 'root-a', sort: 2 },
    { id: 'a-2', parentId: 'root-a', sort: 3 }
  ])
})

test('sort values are clamped to the available sibling range', () => {
  const updates = buildMenuEditOrderUpdates({
    tree,
    id: 'a-1',
    sourceParentId: 'root-a',
    targetParentId: 'root-a',
    targetSort: 99
  })

  assert.deepEqual(updates, [
    { id: 'a-2', sort: 1 },
    { id: 'a-3', sort: 2 },
    { id: 'a-1', sort: 3 }
  ])
})

test('parent selector excludes the edited menu and its complete subtree', () => {
  const filtered = filterMenuParentTree(tree, 'root-a')

  assert.deepEqual(filtered, [tree[1]])
  assert.equal(isMenuParentAvailable(tree, 'root-a', 'a-1'), false)
  assert.equal(isMenuParentAvailable(tree, 'root-a', 'root-b'), true)
})
