import assert from 'node:assert/strict'
import test from 'node:test'
import TreeUtils from '../../src/utils/tree'

interface Node {
  id: number
  parentId?: number | null
  children?: Node[]
  detail?: { title: string }
  __depth?: number
  __parentChain?: number[]
}

const utils = new TreeUtils({ parentKey: 'parentId' })

test('mapTree changes business DTO types while rebuilding isolated hierarchy', () => {
  interface Option {
    id: number
    label: string
    children: Option[]
  }
  const source: Node[] = [
    { id: 1, detail: { title: '部门' }, children: [{ id: 2, detail: { title: '班组' } }] }
  ]
  const before = structuredClone(source)
  const options = utils.mapTree<Node, Option>(source, (node) => ({
    id: node.id,
    label: node.detail?.title ?? '',
    children: []
  }))
  assert.deepEqual(options, [
    { id: 1, label: '部门', children: [{ id: 2, label: '班组', children: [] }] }
  ])
  options[0].children[0].label = '已修改'
  assert.deepEqual(source, before)
})

test('label path indexes preserve branches, first matching IDs and input data in one traversal', () => {
  const tree: Node[] = [
    {
      id: 0,
      detail: { title: '根目录' },
      children: [
        {
          id: 1,
          detail: { title: '第一分支' },
          children: [{ id: 2, detail: { title: '叶节点' } }]
        },
        {
          id: 3,
          detail: { title: '第二分支' },
          children: [{ id: 2, detail: { title: '重复 ID' } }]
        }
      ]
    },
    { id: 4, detail: { title: '另一根目录' } }
  ]
  const before = structuredClone(tree)
  let calls = 0
  const paths = utils.getLabelPathIndex(tree, (node) => {
    calls += 1
    return node.detail?.title ?? ''
  })
  assert.equal(calls, 6)
  assert.equal(paths.get(0), '根目录')
  assert.equal(paths.get(2), '根目录 / 第一分支 / 叶节点')
  assert.equal(paths.get(3), '根目录 / 第二分支')
  assert.equal(paths.get(4), '另一根目录')
  assert.equal(paths.get(999), undefined)
  assert.deepEqual(tree, before)
  tree[0].detail!.title = '新目录'
  assert.equal(paths.get(0), '根目录')
  assert.equal(
    utils.getLabelPathIndex(tree, (node) => node.detail?.title ?? '', ' > ').get(1),
    '新目录 > 第一分支'
  )
})

test('label path indexes honor custom tree keys and reject structural cycles', () => {
  const custom = new TreeUtils({ idKey: 'key', childrenKey: 'nodes' })
  const tree = [{ key: 'root', label: '目录', nodes: [{ key: 'leaf', label: '页面' }] }]
  assert.equal(custom.getLabelPathIndex(tree, (node) => node.label).get('leaf'), '目录 / 页面')
  const cyclic: Node = { id: 1 }
  cyclic.children = [cyclic]
  assert.throws(() => utils.getLabelPathIndex([cyclic], () => '循环'), { code: 'TREE_CYCLE' })
})

test('descendant and ancestor queries return isolated flat records without repeated subtrees', () => {
  const tree: Node[] = [
    {
      id: 1,
      detail: { title: 'root' },
      children: [
        { id: 2, parentId: 1, detail: { title: 'branch' }, children: [{ id: 3, parentId: 2 }] },
        { id: 4, parentId: 1 }
      ]
    }
  ]
  const descendants = utils.getDescendants(tree, 1, true)
  assert.deepEqual(
    descendants.map((node) => node.id),
    [1, 2, 3, 4]
  )
  assert.ok(descendants.every((node) => !Object.hasOwn(node, 'children')))
  assert.deepEqual(
    utils.getDescendants(tree, 2).map((node) => node.id),
    [3]
  )
  assert.deepEqual(utils.getDescendants(tree, 3), [])
  assert.deepEqual(utils.getDescendants(tree, 999), [])
  const ancestors = utils.getAncestors(tree, 3)
  assert.deepEqual(
    ancestors.map((node) => node.id),
    [1, 2, 3]
  )
  assert.ok(ancestors.every((node) => !Object.hasOwn(node, 'children')))
  assert.deepEqual(utils.getAncestors(tree, 999), [])
  descendants[0].detail!.title = 'edited'
  ancestors[1].detail!.title = 'edited'
  assert.equal(tree[0].detail!.title, 'root')
  assert.equal(tree[0].children![0].detail!.title, 'branch')
  const shallow = new TreeUtils({ parentKey: 'parentId', deepClone: false })
  assert.equal(shallow.getDescendants(tree, 1, true)[0].detail, tree[0].detail)
  assert.equal(shallow.getAncestors(tree, 3)[0].detail, tree[0].detail)
})

test('ancestor records follow the actual branch instead of looking up repeated IDs elsewhere', () => {
  const tree: Node[] = [
    { id: 1, children: [{ id: 2, detail: { title: 'other branch' } }] },
    { id: 4, children: [{ id: 2, detail: { title: 'actual branch' }, children: [{ id: 3 }] }] }
  ]
  assert.deepEqual(
    utils.getAncestors(tree, 3).map((node) => [node.id, node.detail?.title]),
    [
      [4, undefined],
      [2, 'actual branch'],
      [3, undefined]
    ]
  )
})

test('mapping and relationship queries handle deep trees without recursive cloning', () => {
  const depth = 12_000
  const tree = utils.listToTree<Node>(
    Array.from({ length: depth }, (_, i) => ({ id: i + 1, parentId: i || null }))
  )
  const mapped = utils.mapTree(tree, (node) => ({ ...node, detail: { title: String(node.id) } }))
  assert.equal(utils.treeToList(mapped).length, depth)
  assert.equal(utils.findNode(mapped, depth)?.detail?.title, String(depth))
  assert.equal(utils.getDescendants(tree, 1).length, depth - 1)
  assert.equal(utils.getAncestors(tree, depth).length, depth)
  assert.equal(tree[0].detail, undefined)
})

test('mapping preserves preorder, readable source children and custom structural keys', () => {
  interface Entry {
    key: number
    nodes?: Entry[]
    childCount?: number
    label?: string
  }
  const custom = new TreeUtils({ idKey: 'key', childrenKey: 'nodes' })
  const tree: Entry[] = [{ key: 1, nodes: [{ key: 2 }, { key: 3 }] }]
  const seen: number[] = []
  const mapped = custom.mapTree(tree, (node) => {
    seen.push(node.key)
    return {
      ...node,
      childCount: node.nodes?.length ?? 0,
      label: `node-${node.key}`,
      nodes: [{ key: 999 }]
    }
  })
  assert.deepEqual(seen, [1, 2, 3])
  assert.equal(mapped[0].childCount, 2)
  assert.deepEqual(
    mapped[0].nodes?.map((node) => [node.key, node.childCount, node.nodes]),
    [
      [2, 0, []],
      [3, 0, []]
    ]
  )
  assert.deepEqual(
    custom.getDescendants(tree, 1).map((node) => node.key),
    [2, 3]
  )
  assert.deepEqual(
    custom.getAncestors(tree, 3).map((node) => node.key),
    [1, 3]
  )
  assert.ok(custom.getAncestors(tree, 3).every((node) => !Object.hasOwn(node, 'nodes')))
  assert.equal(tree[0].nodes![0].nodes, undefined)
})

test('mapping and related-node queries copy payloads only a constant number of times', () => {
  let reads = 0
  const count = 250
  const nodes: Node[] = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    get detail() {
      reads++
      return { title: 'payload' }
    }
  }))
  for (let i = 1; i < count; i++) nodes[i - 1].children = [nodes[i]]
  for (const action of [
    () => utils.mapTree([nodes[0]], (node) => ({ ...node })),
    () => utils.getDescendants([nodes[0]], 1, true),
    () => utils.getAncestors([nodes[0]], count)
  ]) {
    reads = 0
    action()
    assert.ok(reads <= count * 2, `Payload copied ${reads} times for ${count} nodes`)
  }
})

test('mapping rejects cycles before invoking mappers and related queries report visited cycles', () => {
  const root: Node = { id: 1, children: [] }
  root.children!.push(root)
  let called = false
  for (const action of [
    () =>
      utils.mapTree([root], (node) => {
        called = true
        return node
      }),
    () => utils.getDescendants([root], 1),
    () => utils.getAncestors([root], 999)
  ])
    assert.throws(action, { name: 'TreeDataError', code: 'TREE_CYCLE' })
  assert.equal(called, false)
  const shared: Node = { id: 3, detail: { title: 'shared' } }
  const mapped = utils.mapTree(
    [
      { id: 1, children: [shared] },
      { id: 2, children: [shared] }
    ],
    (node) => node
  )
  assert.notEqual(mapped[0].children![0], mapped[1].children![0])
  mapped[0].children![0].detail!.title = 'changed'
  assert.equal(mapped[1].children![0].detail!.title, 'shared')
  assert.equal(shared.detail!.title, 'shared')
})

test('editing methods isolate nodes and child arrays even in shallow payload mode', () => {
  const shallow = new TreeUtils({ parentKey: 'parentId', deepClone: false })
  const source: Node[] = [{ id: 1, children: [{ id: 3, detail: { title: 'shared' } }, { id: 2 }] }]
  const before = structuredClone(source)
  const updated = shallow.updateNode(source, 3, { parentId: 1 })
  assert.notEqual(updated.updatedNode, source[0].children![0])
  assert.equal(updated.updatedNode!.detail, source[0].children![0].detail)
  assert.equal(shallow.addNode(source, { id: 4, parentId: 1 })[0].children!.length, 3)
  assert.equal(shallow.removeNode(source, 3).tree[0].children!.length, 1)
  assert.deepEqual(
    shallow.sortTree(source, (a, b) => a.id - b.id)[0].children!.map((n) => n.id),
    [2, 3]
  )
  assert.deepEqual(
    shallow.sortTreeByField(source, 'id')[0].children!.map((n) => n.id),
    [2, 3]
  )
  const filtered = shallow.removeNodesByCondition(source, (node) => node.id === 3)
  filtered.removed[0].id = 99
  assert.deepEqual(source, before)
})

test('tree editing supports deep structures and rejects cycles before callbacks', () => {
  const depth = 12_000
  const source = utils.listToTree<Node>(
    Array.from({ length: depth }, (_, i) => ({ id: i + 1, parentId: i || null }))
  )
  assert.equal(
    utils.updateNode(source, depth, { detail: { title: 'last' } }).updatedNode?.detail?.title,
    'last'
  )
  assert.equal(
    utils.findNode(utils.addNode(source, { id: depth + 1, parentId: depth }), depth + 1)?.id,
    depth + 1
  )
  assert.equal(utils.removeNode(source, depth).removed?.id, depth)
  assert.equal(utils.treeToList(utils.sortTree(source, (a, b) => a.id - b.id)).length, depth)
  assert.equal(utils.treeToList(utils.sortTreeByField(source, 'id')).length, depth)
  assert.equal(
    utils.removeNodesByCondition(source, (node) => node.id === depth).removed[0].id,
    depth
  )
  const cyclic: Node = { id: 1, children: [] }
  cyclic.children!.push(cyclic)
  let callbacks = 0
  for (const action of [
    () => utils.updateNode([cyclic], 1, {}),
    () => utils.addNode([cyclic], { id: 2 }),
    () => utils.addNode([], cyclic),
    () => utils.updateNode([{ id: 2 }], 2, { children: [cyclic] }),
    () => utils.removeNode([cyclic], 1),
    () => utils.sortTree([cyclic], () => ++callbacks),
    () => utils.sortTreeByField([cyclic], 'id'),
    () =>
      utils.removeNodesByCondition([cyclic], () => {
        callbacks++
        return true
      })
  ])
    assert.throws(action, { name: 'TreeDataError', code: 'TREE_CYCLE' })
  assert.equal(callbacks, 0)
  assert.equal(utils.treeToList(source).length, depth)
})

test('patch child structures and payloads do not leak back to patch inputs', () => {
  const patch: Partial<Node> = { children: [{ id: 2 }], detail: { title: 'patch' } }
  const updated = utils.updateNode<Node>([{ id: 1 }], 1, patch).updatedNode!
  updated.children![0].id = 3
  updated.detail!.title = 'changed'
  assert.deepEqual(patch, { children: [{ id: 2 }], detail: { title: 'patch' } })
})

test('editing honors custom structural keys and independently copies shared branches', () => {
  interface Entry {
    key: number
    parent?: number
    nodes?: Entry[]
    title?: string
  }
  const custom = new TreeUtils({
    idKey: 'key',
    parentKey: 'parent',
    childrenKey: 'nodes',
    deepClone: false
  })
  const shared: Entry = { key: 3, title: 'shared' }
  const source: Entry[] = [
    { key: 1, nodes: [shared] },
    { key: 2, nodes: [shared] }
  ]
  const updated = custom.updateNode(source, 3, { title: 'first only' }).tree
  assert.equal(updated[0].nodes![0].title, 'first only')
  assert.equal(updated[1].nodes![0].title, 'shared')
  assert.equal(shared.title, 'shared')
  const added = custom.addNode(source, { key: 4, parent: 1, nodes: [{ key: 5 }] })
  assert.equal(added[0].nodes![1].nodes![0].key, 5)
  assert.equal(source[0].nodes!.length, 1)
  const removed = custom.removeNodesByCondition(added, (node) => node.key === 4)
  assert.equal(removed.removed[0].nodes![0].key, 5)
  assert.equal(removed.tree[0].nodes!.length, 1)
})

test('callback failures and empty results leave caller-owned structures intact', () => {
  const source: Node[] = [{ id: 2, children: [{ id: 4 }, { id: 3 }] }, { id: 1 }]
  const before = structuredClone(source)
  const failure = new Error('test callback failure')
  assert.throws(
    () =>
      utils.sortTree(source, (a) => {
        a.id = 99
        throw failure
      }),
    failure
  )
  assert.throws(
    () =>
      utils.removeNodesByCondition(source, (node) => {
        node.id = 99
        throw failure
      }),
    failure
  )
  assert.deepEqual(source, before)
  assert.deepEqual(
    utils.removeNodesByCondition([], () => true),
    { tree: [], removed: [] }
  )
  assert.deepEqual(utils.sortTreeByField([], 'id'), [])
  assert.equal(utils.addNode<Node>([], { id: 1, parentId: 999 })[0].id, 1)
})

test('removal preserves reverse sibling lookup and prunes matching subtrees once', () => {
  const source: Node[] = [
    { id: 1, children: [{ id: 2 }] },
    { id: 1, detail: { title: 'last' } }
  ]
  assert.equal(utils.removeNode(source, 1).removed?.detail?.title, 'last')
  const seen: number[] = []
  const result = utils.removeNodesByCondition(source, (node) => {
    seen.push(node.id)
    return node.id === 1
  })
  assert.deepEqual(seen, [1, 1])
  assert.deepEqual(result.tree, [])
  assert.equal(result.removed[0].children![0].id, 2)
  assert.equal(utils.removeNode(source, 999).removed, null)
  assert.equal(utils.updateNode(source, 999, {}).updatedNode, null)
})

test('field sorting supports nested paths, stable missing values and custom comparators', () => {
  const rows = [
    { id: 1, meta: { rank: null } },
    { id: 2 },
    { id: 3, meta: { rank: 2 } },
    { id: 4, meta: { rank: 1 } }
  ]
  assert.deepEqual(
    utils.sortTreeByField(rows, 'meta.rank').map((n) => n.id),
    [4, 3, 1, 2]
  )
  assert.deepEqual(
    utils.sortTreeByField(rows, 'meta.rank', 'desc').map((n) => n.id),
    [3, 4, 1, 2]
  )
  assert.deepEqual(
    utils.sortTreeByField(rows, 'meta.rank', 'asc', (a, b) => b.id - a.id).map((n) => n.id),
    [4, 3, 2, 1]
  )
})

test('flatten preserves preorder, parent IDs, optional paths and clone isolation', () => {
  const source: Node[] = [{ id: 1, children: [{ id: 2, parentId: 1, detail: { title: 'child' } }] }]
  const result = utils.treeToList(source, { includeDepth: true, includeParentChain: true })
  assert.deepEqual(result, [
    { id: 1, __depth: 0, __parentChain: [] },
    { id: 2, parentId: 1, detail: { title: 'child' }, __depth: 1, __parentChain: [1] }
  ])
  result[1].detail!.title = 'edited'
  result[1].__parentChain!.push(100)
  assert.equal(source[0].children![0].detail!.title, 'child')
  assert.equal(source[0].children!.length, 1)
  assert.deepEqual(result[0].__parentChain, [])
})

test('flat input owns its child relationships; converting again does not duplicate descendants', () => {
  const source: Node[] = [
    { id: 1, children: [{ id: 2, parentId: 1 }] },
    { id: 2, parentId: 1 }
  ]
  const result = utils.listToTree(source)
  assert.deepEqual(
    utils.treeToList(result).map((row) => row.id),
    [1, 2]
  )
  assert.equal(source[0].children!.length, 1)
})

test('flat parent cycles fail explicitly instead of disappearing from the root list', () => {
  assert.throws(
    () =>
      utils.listToTree([
        { id: 1, parentId: 2 },
        { id: 2, parentId: 1 }
      ]),
    { name: 'TreeDataError', code: 'TREE_CYCLE' }
  )
  assert.throws(() => utils.listToTree([{ id: 1, parentId: 1 }]), {
    name: 'TreeDataError',
    code: 'TREE_CYCLE'
  })
})

test('deep flat conversion, flattening, lookup and path do not exhaust the call stack', () => {
  const depth = 12_000
  const source = Array.from({ length: depth }, (_, i) => ({ id: i + 1, parentId: i || null }))
  const tree = utils.listToTree(source, (a, b) => a.id - b.id)
  assert.equal(utils.treeToList(utils.normalizeTreeData(tree)).length, depth)
  assert.equal(utils.treeToList(tree).length, depth)
  assert.equal(utils.findNode(tree, depth)?.id, depth)
  assert.equal(utils.getPathToNode(tree, depth)?.length, depth)
  assert.deepEqual(utils.detectCycle(source.toReversed()), { hasCycle: false, cycles: [] })
})

test('all shared read paths reject object cycles but keep shared non-cyclic branches', () => {
  const root: Node = { id: 1, children: [] }
  root.children!.push({ id: 2, children: [root] })
  for (const action of [
    () => utils.normalizeTreeData([root]),
    () => utils.treeToList([root]),
    () => utils.findNode([root], 99),
    () => utils.getPathToNode([root], 99),
    () => utils.traverse([root], () => undefined)
  ])
    assert.throws(action, { name: 'TreeDataError', code: 'TREE_CYCLE' })
  const shared: Node = { id: 3 }
  const branches = [
    { id: 1, children: [shared] },
    { id: 2, children: [shared] }
  ]
  const rows = utils.treeToList(branches, { includeParentChain: true })
  assert.deepEqual(
    rows.map((row) => row.id),
    [1, 3, 2, 3]
  )
  assert.deepEqual(
    rows.map((row) => row.__parentChain),
    [[], [1], [], [2]]
  )
})

test('normalization rejects invalid entries without changing JSON and shallow-clone contracts', () => {
  const custom = new TreeUtils({ childrenKey: 'nodes', deepClone: false })
  const detail = { title: 'source' }
  const input = [{ id: 1, detail, nodes: [null, false, [], { id: 2, nodes: 'bad' }] }]
  const normalized = custom.normalizeTreeData<{
    id: number
    detail?: typeof detail
    nodes?: object[]
  }>(input)
  assert.deepEqual(normalized, [{ id: 1, detail, nodes: [{ id: 2 }] }])
  assert.equal(normalized[0].detail, detail)
  assert.notEqual(normalized[0].nodes, input[0].nodes)
  assert.equal(input[0].nodes.length, 4)
  assert.deepEqual(custom.normalizeTreeData('{invalid'), [])
  assert.deepEqual(custom.normalizeTreeData('null'), [])
  assert.deepEqual(custom.normalizeTreeData('[null,{"id":2}]'), [{ id: 2 }])
})

test('flatten clones each payload once instead of once for every ancestor', () => {
  let reads = 0
  const count = 300
  const nodes: Node[] = Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    get detail() {
      reads++
      return { title: 'payload' }
    }
  }))
  for (let i = 1; i < count; i++) nodes[i - 1].children = [nodes[i]]
  assert.equal(utils.treeToList([nodes[0]]).length, count)
  assert.ok(reads <= count * 2, `Payload was read ${reads} times for ${count} nodes`)
})

test('wide lookup avoids argument-spread limits and returns source references in preorder', () => {
  const children = Array.from({ length: 150_000 }, (_, index) => ({ id: index + 2 }))
  const tree: Node[] = [{ id: 1, children }]
  assert.equal(utils.findNode(tree, 150_001), children[149_999])
  const repeatedId = [
    { id: 1, detail: { title: 'first' } },
    { id: 1, detail: { title: 'last' } }
  ]
  assert.equal(utils.findNode(repeatedId, 1), repeatedId[0])
})

test('traversal respects early stop and independent ancestor arrays', () => {
  const tree = utils.listToTree([{ id: 1 }, { id: 2, parentId: 1 }, { id: 3, parentId: 1 }])
  const paths: number[][] = []
  assert.equal(
    utils.traverse(tree, (_row, _depth, path) => {
      paths.push(path as number[])
    }),
    true
  )
  assert.deepEqual(paths, [[], [1], [1]])
  paths[1].push(99)
  assert.deepEqual(paths[2], [1])
  const seen: number[] = []
  assert.equal(
    utils.traverse(tree, (row) => {
      seen.push(row.id)
      return false
    }),
    false
  )
  assert.deepEqual(seen, [1])
})

test('root sentinels, orphan roots, duplicate replacement and custom children keys stay compatible', () => {
  const tree = new TreeUtils({ idKey: 'key', parentKey: 'parent', childrenKey: 'nodes' })
  const data = [
    { key: 0, parent: null, title: 'root' },
    { key: 1, parent: 0, title: 'before' },
    { key: 1, parent: 0, title: 'after' },
    { key: 2, parent: 99, title: 'orphan' }
  ]
  assert.equal(tree.listToTree(data).length, 3)
  assert.deepEqual(tree.detectCycle(data), { hasCycle: false, cycles: [] })
  assert.equal(tree.treeToList(tree.listToTree(data))[1].title, 'after')
})

test('cycle detection honors root-parent configuration and reports independent cycles once', () => {
  const strictRoots = new TreeUtils({ parentKey: 'parentId', rootParentValues: [null] })
  assert.deepEqual(strictRoots.detectCycle([{ id: 0, parentId: 0 }]), {
    hasCycle: true,
    cycles: [[0]]
  })
  assert.deepEqual(utils.detectCycle([{ id: 0, parentId: 0 }]), { hasCycle: false, cycles: [] })
  assert.deepEqual(
    utils.detectCycle([
      { id: 1, parentId: 2 },
      { id: 2, parentId: 1 },
      { id: 3, parentId: 4 },
      { id: 4, parentId: 3 },
      { id: 5, parentId: 4 }
    ]),
    {
      hasCycle: true,
      cycles: [
        [1, 2],
        [3, 4]
      ]
    }
  )
})
