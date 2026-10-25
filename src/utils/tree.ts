import { clone as shallowClone, cloneDeep, get, omit } from 'lodash-es'

type ID = string | number

export interface TreeNode {
  [key: string]: unknown
  // must include id and parent id fields but names are configurable
}
type TreeRecord = Record<string, unknown>

interface TreeVisit {
  node: TreeNode
  depth: number
  parent: TreeVisit | null
}

export class TreeDataError extends Error {
  readonly code = 'TREE_CYCLE'

  constructor() {
    super('树形数据存在循环关联，请检查上级关系后重试')
    this.name = 'TreeDataError'
  }
}

interface TreeUtilsOptions {
  idKey?: string
  parentKey?: string
  childrenKey?: string
  rootParentValues?: unknown[] // values considered "root", default [null, 0, '']
  deepClone?: boolean // default true for safety
}

export default class TreeUtils {
  idKey: string
  parentKey: string
  childrenKey: string
  rootParentValues: unknown[]
  deepClone: boolean

  constructor(opts: TreeUtilsOptions = {}) {
    this.idKey = opts.idKey ?? 'id'
    this.parentKey = opts.parentKey ?? 'parent_id'
    this.childrenKey = opts.childrenKey ?? 'children'
    this.rootParentValues = opts.rootParentValues ?? [null, 0, '']
    this.deepClone = opts.deepClone ?? true
  }

  // shallow or deep clone utility
  private clone<T>(obj: T): T {
    return this.deepClone ? cloneDeep(obj) : shallowClone(obj)
  }

  // is value considered root parent
  private isRootParent(value: unknown) {
    return this.rootParentValues.includes(value) || value === undefined
  }

  private isId(value: unknown): value is ID {
    return typeof value === 'string' || typeof value === 'number'
  }

  private getValue(node: TreeNode, key: string): unknown {
    return (node as TreeRecord)[key]
  }

  private setValue(node: TreeNode, key: string, value: unknown): void {
    ;(node as TreeRecord)[key] = value
  }

  private getNodeId(node: TreeNode, key = this.idKey): ID {
    return this.getValue(node, key) as ID
  }

  private getChildren(node: TreeNode): TreeNode[] {
    const children = this.getValue(node, this.childrenKey)

    return Array.isArray(children) ? (children as TreeNode[]) : []
  }

  private ensureChildren(node: TreeNode): TreeNode[] {
    if (!Array.isArray(this.getValue(node, this.childrenKey))) {
      this.setValue(node, this.childrenKey, [])
    }

    return this.getValue(node, this.childrenKey) as TreeNode[]
  }

  // Clone fields once, never deep-clone a subtree that is immediately discarded.
  private cloneFields(node: TreeNode): TreeNode {
    return this.clone(omit(node, [this.childrenKey]))
  }

  /** Iterative preorder; active-path identity detects cycles without dropping DAG branches. */
  private *walk(tree: TreeNode[]): Generator<TreeVisit> {
    const frames: { nodes: TreeNode[]; index: number; parent: TreeVisit | null }[] = [
      { nodes: tree, index: 0, parent: null }
    ]
    const active = new WeakSet<TreeNode>()
    while (frames.length) {
      const frame = frames[frames.length - 1]
      if (frame.index >= frame.nodes.length) {
        if (frame.parent) active.delete(frame.parent.node)
        frames.pop()
        continue
      }
      const node = frame.nodes[frame.index++]
      if (!node || typeof node !== 'object' || Array.isArray(node)) continue
      if (active.has(node)) throw new TreeDataError()
      const visit: TreeVisit = {
        node,
        parent: frame.parent,
        depth: frame.parent ? frame.parent.depth + 1 : 0
      }
      active.add(node)
      yield visit
      const children = this.getChildren(node)
      if (children.length) frames.push({ nodes: children, index: 0, parent: visit })
      else active.delete(node)
    }
  }

  private ancestorIds(visit: TreeVisit): ID[] {
    const path: ID[] = []
    for (let parent = visit.parent; parent; parent = parent.parent) {
      path.push(this.getNodeId(parent.node))
    }
    return path.reverse()
  }

  /**
   * Normalize unknown tree data into a safe tree array.
   * Accepts an array or a JSON string containing an array.
   */
  normalizeTreeData<T extends object = TreeNode>(data: unknown): T[] {
    let source = data

    if (typeof source === 'string') {
      try {
        source = JSON.parse(source) as unknown
      } catch {
        return []
      }
    }

    if (!Array.isArray(source)) return []

    const roots: TreeNode[] = []
    const normalized = new WeakMap<TreeVisit, TreeNode>()
    for (const visit of this.walk(source)) {
      const node = this.cloneFields(visit.node)
      if (Array.isArray(this.getValue(visit.node, this.childrenKey))) {
        this.setValue(node, this.childrenKey, [])
      }
      normalized.set(visit, node)
      if (visit.parent) this.ensureChildren(normalized.get(visit.parent)!).push(node)
      else roots.push(node)
    }
    return roots as T[]
  }

  /**
   * listToTree
   * Convert flat list -> tree (O(n))
   * - items: array of objects containing id & parent_id
   * - sortFn: optional sort function for children arrays
   * Returns array of root nodes (with children arrays)
   */
  listToTree<T extends object = TreeNode>(items: T[], sortFn?: (a: T, b: T) => number): T[] {
    if (!Array.isArray(items)) return []
    if (this.detectCycle(items).hasCycle) throw new TreeDataError()

    const map = new Map<ID, TreeNode>()
    const roots: TreeNode[] = []

    // 1) build map with cloned nodes and init children
    for (const raw of items) {
      const node = this.cloneFields(raw as TreeNode)
      this.setValue(node, this.childrenKey, [])
      map.set(this.getNodeId(node), node)
    }

    // 2) assemble
    for (const node of map.values()) {
      const parentId = this.getValue(node, this.parentKey)
      if (this.isRootParent(parentId) || !this.isId(parentId) || !map.has(parentId)) {
        // treat as root when parent is rootValue or parent not in list
        roots.push(node)
      } else {
        const parent = map.get(parentId)!
        this.ensureChildren(parent).push(node)
      }
    }

    // 3) sort if sortFn provided
    if (sortFn) {
      const compare = (a: TreeNode, b: TreeNode): number => sortFn(a as T, b as T)
      roots.sort(compare)
      for (const { node } of this.walk(roots)) {
        this.getChildren(node).sort(compare)
      }
    }

    return roots as T[]
  }

  /**
   * treeToList
   * Flatten tree -> list (preorder)
   * - preserve parent relationship
   * - optionally include depth and parentChain
   */
  treeToList<T extends object = TreeNode>(
    tree: T[],
    opts?: { includeDepth?: boolean; includeParentChain?: boolean }
  ): T[] {
    const result: TreeNode[] = []
    const includeDepth = opts?.includeDepth ?? false
    const includeParentChain = opts?.includeParentChain ?? false

    for (const visit of this.walk(tree as TreeNode[])) {
      const node = this.cloneFields(visit.node)
      if (includeDepth) node.__depth = visit.depth
      if (includeParentChain) node.__parentChain = this.ancestorIds(visit)
      result.push(node)
    }
    return result as T[]
  }

  /**
   * findNode
   * Find node by id in tree (DFS)
   * Returns the first matching reference from the supplied tree (does not clone).
   */
  findNode<T extends object = TreeNode>(tree: T[], id: ID): T | null {
    for (const { node } of this.walk(tree as TreeNode[])) {
      if (this.getNodeId(node) === id) return node as T
    }
    return null
  }

  /**
   * updateNode
   * Update a node by id with partial data.
   * - returns updated tree (cloned) and updated node reference
   */
  updateNode<T extends object = TreeNode>(
    tree: T[],
    id: ID,
    patch: Partial<T>
  ): { tree: T[]; updatedNode: T | null } {
    const t = this.normalizeTreeData<TreeNode>(tree)
    const target = this.findNode(t, id)
    if (!target) return { tree: t as T[], updatedNode: null }
    const fields = this.cloneFields(patch as TreeNode)
    if (Object.hasOwn(patch, this.childrenKey)) {
      const children = this.getValue(patch as TreeNode, this.childrenKey)
      this.setValue(
        fields,
        this.childrenKey,
        Array.isArray(children) ? this.normalizeTreeData(children) : this.clone(children)
      )
    }
    Object.assign(target, fields)
    return { tree: t as T[], updatedNode: target as T }
  }

  /**
   * addNode
   * Add a new node (object must include id; parent may be rootParentValue)
   * - if parent not found and not root, will push to roots
   * - returns new tree (cloned)
   */
  addNode<T extends object = TreeNode>(tree: T[], node: T): T[] {
    const t = this.normalizeTreeData<TreeNode>(tree)
    const [newNode] = this.normalizeTreeData<TreeNode>([node])
    this.ensureChildren(newNode)

    // try to find parent
    const parentId = this.getValue(newNode, this.parentKey)
    if (this.isRootParent(parentId)) {
      t.push(newNode)
      return t as T[]
    }
    if (!this.isId(parentId)) {
      t.push(newNode)
      return t as T[]
    }
    const parent = this.findNode(t, parentId)
    if (parent) {
      this.ensureChildren(parent).push(newNode)
    } else {
      // if parent not found, treat as root
      t.push(newNode)
    }
    return t as T[]
  }

  /**
   * removeNode
   * Remove node by id. Returns new tree and removed node (or null).
   * - This will remove the node and its entire subtree.
   */
  removeNode<T extends object = TreeNode>(tree: T[], id: ID): { tree: T[]; removed: T | null } {
    const t = this.normalizeTreeData<TreeNode>(tree)
    // Keep the established reverse-sibling lookup when duplicate IDs exist.
    const frames = [{ nodes: t, index: t.length - 1 }]
    while (frames.length) {
      const frame = frames[frames.length - 1]
      if (frame.index < 0) {
        frames.pop()
        continue
      }
      const index = frame.index--
      const node = frame.nodes[index]
      if (this.getNodeId(node) === id) {
        frame.nodes.splice(index, 1)
        return { tree: t as T[], removed: node as T }
      }
      const children = this.getChildren(node)
      if (children.length) frames.push({ nodes: children, index: children.length - 1 })
    }
    return { tree: t as T[], removed: null }
  }

  /**
   * mapTree
   * Map in preorder over one isolated snapshot, preserving the input structure.
   * Mappers may read children but must not mutate them; returned children are rebuilt.
   */
  mapTree<T extends object = TreeNode, TResult extends object = T>(
    tree: T[],
    mapper: (node: T) => TResult
  ): TResult[] {
    const snapshot = this.normalizeTreeData<TreeNode>(tree)
    const roots: TreeNode[] = []
    const mappedNodes = new WeakMap<TreeVisit, TreeNode>()
    for (const visit of this.walk(snapshot)) {
      // Own both callback/result shells so assigning children never rewrites the snapshot
      // or an object returned from an external closure. Payloads were cloned above.
      const mapped = shallowClone(mapper(shallowClone(visit.node) as T)) as TreeNode
      this.setValue(mapped, this.childrenKey, [])
      mappedNodes.set(visit, mapped)
      if (visit.parent) this.ensureChildren(mappedNodes.get(visit.parent)!).push(mapped)
      else roots.push(mapped)
    }
    return roots as TResult[]
  }

  /**
   * traverse (preorder)
   * Execute callback on each node. If callback returns false, halt traversal.
   */
  traverse<T extends object = TreeNode>(
    tree: T[],
    callback: (node: T, depth: number, parentChain: ID[]) => boolean | void
  ): boolean {
    for (const visit of this.walk(tree as TreeNode[])) {
      if (callback(visit.node as T, visit.depth, this.ancestorIds(visit)) === false) return false
    }
    return true
  }

  /**
   * sortTree
   * Sort a structural copy at every level.
   * - compareFn same as Array.prototype.sort
   * - deepClone controls business-field cloning, never structural isolation.
   */
  sortTree<T extends object = TreeNode>(tree: T[], compareFn: (a: T, b: T) => number): T[] {
    const t = this.normalizeTreeData<TreeNode>(tree)
    const compare = (a: TreeNode, b: TreeNode): number => compareFn(a as T, b as T)
    t.sort(compare)
    for (const { node } of this.walk(t)) {
      this.getChildren(node).sort(compare)
    }
    return t as T[]
  }

  /**
   * detectCycle
   * Detect cycles in flat list representation (useful before building tree)
   * Returns { hasCycle: boolean, cycles: Array<Array<ID>> }
   */
  detectCycle<T extends object = TreeNode>(items: T[]): { hasCycle: boolean; cycles: ID[][] } {
    // Build adjacency map id -> parentId
    const parentMap = new Map<ID, ID | null>()
    for (const it of items) {
      const node = it as TreeNode
      const parentId = this.getValue(node, this.parentKey)
      parentMap.set(
        this.getNodeId(node),
        !this.isRootParent(parentId) && this.isId(parentId) ? parentId : null
      )
    }

    const visited = new Set<ID>()
    const cycles: ID[][] = []
    for (const start of parentMap.keys()) {
      if (visited.has(start)) continue
      const path: ID[] = []
      const offsets = new Map<ID, number>()
      let current: ID | null | undefined = start
      while (
        current !== null &&
        current !== undefined &&
        parentMap.has(current) &&
        !visited.has(current)
      ) {
        const cycleStart = offsets.get(current)
        if (cycleStart !== undefined) {
          cycles.push(path.slice(cycleStart))
          break
        }
        offsets.set(current, path.length)
        path.push(current)
        current = parentMap.get(current)
      }
      for (const id of path) visited.add(id)
    }

    return { hasCycle: cycles.length > 0, cycles }
  }

  /**
   * getPathToNode
   * Return array of nodes ids from root -> target (inclusive).
   * - Build using tree (not flat list)
   */
  getPathToNode<T extends object = TreeNode>(tree: T[], targetId: ID): ID[] | null {
    for (const visit of this.walk(tree as TreeNode[])) {
      if (this.getNodeId(visit.node) === targetId) return [...this.ancestorIds(visit), targetId]
    }
    return null
  }

  /**
   * getDescendants
   * Return flat cloned records without children (including node if includeSelf).
   */
  getDescendants<T extends object = TreeNode>(tree: T[], id: ID, includeSelf = false): T[] {
    const node = this.findNode(tree, id)
    if (!node) return []
    const records = this.treeToList([node])
    return includeSelf ? records : records.slice(1)
  }

  /**
   * getAncestors
   * Return flat cloned records from root to target (inclusive), without children.
   * Use the actual visited path, not independent ID lookups across other branches.
   */
  getAncestors<T extends object = TreeNode>(tree: T[], targetId: ID): T[] {
    for (const visit of this.walk(tree as TreeNode[])) {
      if (this.getNodeId(visit.node) !== targetId) continue
      const records: TreeNode[] = []
      for (let current: TreeVisit | null = visit; current; current = current.parent) {
        records.push(this.cloneFields(current.node))
      }
      return records.reverse() as T[]
    }
    return []
  }

  /** Index display paths in one traversal, preserving the first occurrence of each ID. */
  getLabelPathIndex<T extends object = TreeNode>(
    tree: T[],
    resolveLabel: (node: T) => string,
    separator = ' / '
  ): Map<ID, string> {
    const paths = new Map<ID, string>()
    const labels: string[] = []
    this.traverse(tree, (node, depth) => {
      labels.length = depth
      labels.push(resolveLabel(node))
      const id = this.getNodeId(node as TreeNode)
      if (id !== undefined && id !== null && !paths.has(id)) paths.set(id, labels.join(separator))
    })
    return paths
  }

  /**
   * mergeTrees (merge node lists into a single tree)
   * - items can be mixed; result is tree roots array
   */
  mergeListToTree<T extends object = TreeNode>(...lists: T[][]): T[] {
    const merged = ([] as T[]).concat(...lists)
    return this.listToTree(merged)
  }

  /**
   * sortTreeByField
   * 对树按照指定字段进行排序，支持多层嵌套排序
   * - field: 排序字段名，支持点号表示法如 'meta.title'
   * - order: 排序顺序，'asc' 升序，'desc' 降序
   * - sortFn: 自定义排序函数，优先级高于 field 和 order
   */
  sortTreeByField<T extends object = TreeNode>(
    tree: T[],
    field: string,
    order: 'asc' | 'desc' = 'asc',
    sortFn?: (a: T, b: T) => number
  ): T[] {
    // 默认排序函数
    const defaultSortFn = (a: T, b: T): number => {
      const aValue: unknown = get(a, field)
      const bValue: unknown = get(b, field)

      // 处理 undefined 和 null
      if (aValue === undefined || aValue === null) {
        return bValue === undefined || bValue === null ? 0 : 1
      }
      if (bValue === undefined || bValue === null) return -1

      // 根据类型比较
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return order === 'asc' ? aValue - bValue : bValue - aValue
      }

      // 字符串比较
      const aStr = String(aValue)
      const bStr = String(bValue)
      return order === 'asc' ? aStr.localeCompare(bStr) : bStr.localeCompare(aStr)
    }

    return this.sortTree(tree, sortFn ?? defaultSortFn)
  }

  /**
   * removeNodesByCondition
   * 根据条件函数删除节点
   * - condition: 条件函数，返回 true 的节点将被删除（包括其子节点）
   * - 返回新树和删除的节点数组
   */
  removeNodesByCondition<T extends object = TreeNode>(
    tree: T[],
    condition: (node: T) => boolean
  ): { tree: T[]; removed: T[] } {
    const t = this.normalizeTreeData<TreeNode>(tree)
    const removed: TreeNode[] = []
    const result: TreeNode[] = []
    const frames = [{ nodes: t, index: 0, kept: result }]
    while (frames.length) {
      const frame = frames[frames.length - 1]
      if (frame.index >= frame.nodes.length) {
        frames.pop()
        continue
      }
      const node = frame.nodes[frame.index++]
      if (condition(node as T)) {
        removed.push(node)
        continue
      }
      frame.kept.push(node)
      const children = this.getChildren(node)
      if (children.length) {
        const kept: TreeNode[] = []
        this.setValue(node, this.childrenKey, kept)
        frames.push({ nodes: children, index: 0, kept })
      }
    }
    return { tree: result as T[], removed: removed as T[] }
  }
}

/*
// 假设 items 来自后端
const items = [
  { id: 1, parent_id: null, name: 'root1' },
  { id: 2, parent_id: 1, name: 'child1' },
  { id: 3, parent_id: 1, name: 'child2' },
  { id: 4, parent_id: 2, name: 'grandchild' },
];

const utils = new TreeUtils({ idKey: 'id', parentKey: 'parent_id', childrenKey: 'children', deepClone: true });

// list -> tree
const tree = utils.listToTree(items);

// flatten with depth
const flat = utils.treeToList(tree, { includeDepth: true, includeParentChain: true });

// find
const node = utils.findNode(tree, 2);

// update
const { tree: updatedTree } = utils.updateNode(tree, 2, { name: 'child1-updated' });

// add node
const newTree = utils.addNode(tree, { id: 5, parent_id: 1, name: 'child3' });

// remove node
const { tree: afterRemove, removed } = utils.removeNode(tree, 4);

// detect cycles
const cycleInfo = utils.detectCycle(items);

// get path
const path = utils.getPathToNode(tree, 4); // [1,2,4]

// get descendants
const descendants = utils.getDescendants(tree, 1, false);

// merge lists
const mergedTree = utils.mergeListToTree(items, moreItems)

// 按嵌套字段排序（如 meta.title）
const sortedTree3 = utils.sortTreeByField(tree, 'meta.title', 'asc')

// 也可以删除多个条件的节点
const { tree: filteredTree2 } = utils.removeNodesByCondition(
  tree,
  (node) => node.meta?.menuType === 'button' || node.hidden === true
)
*/
