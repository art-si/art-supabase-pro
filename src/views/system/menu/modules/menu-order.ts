import { clamp } from 'lodash-es'
import TreeUtils from '@/utils/tree'

export interface MenuOrderNode {
  id?: string
  parentId?: string | null
  sort?: number | null
  children?: MenuOrderNode[]
}

export interface MenuSortUpdate {
  id: string
  sort: number
}

export interface MenuTreeOrderUpdate extends MenuSortUpdate {
  parentId: string | null
}

interface BuildMenuEditOrderParams<T extends MenuOrderNode> {
  tree: T[]
  id: string
  sourceParentId?: string | null
  targetParentId?: string | null
  targetSort: number
}

const menuTreeUtils = new TreeUtils({
  idKey: 'id',
  parentKey: 'parentId',
  childrenKey: 'children',
  deepClone: true
})

export const normalizeMenuParentId = (parentId?: string | null): string | null => parentId || null

const getSiblingMenus = <T extends MenuOrderNode>(tree: T[], parentId: string | null): T[] => {
  if (parentId == null) return tree
  const parent = menuTreeUtils.findNode(tree, parentId) as T | null
  return (parent?.children ?? []) as T[]
}

const reindexMenus = (rows: MenuOrderNode[]): MenuSortUpdate[] =>
  rows
    .filter((row): row is MenuOrderNode & { id: string } => !!row.id)
    .map((row, index) => ({ id: row.id, sort: index + 1 }))

export const buildMenuEditOrderUpdates = <T extends MenuOrderNode>({
  tree,
  id,
  sourceParentId,
  targetParentId,
  targetSort
}: BuildMenuEditOrderParams<T>): MenuSortUpdate[] => {
  const sourceParent = normalizeMenuParentId(sourceParentId)
  const targetParent = normalizeMenuParentId(targetParentId)
  const sourceSiblings = getSiblingMenus(tree, sourceParent).filter((row) => row.id !== id)
  const targetSiblings =
    sourceParent === targetParent
      ? sourceSiblings
      : getSiblingMenus(tree, targetParent).filter((row) => row.id !== id)
  const insertIndex = clamp(
    Number.isFinite(targetSort) ? Math.trunc(targetSort) - 1 : 0,
    0,
    targetSiblings.length
  )

  targetSiblings.splice(insertIndex, 0, { id } as T)

  if (sourceParent === targetParent) return reindexMenus(targetSiblings)
  return [...reindexMenus(sourceSiblings), ...reindexMenus(targetSiblings)]
}

interface FlatMenuOrderNode extends MenuOrderNode {
  __parentChain?: Array<string | number>
}

export const buildMenuTreeOrderUpdates = <T extends MenuOrderNode>(
  tree: T[]
): MenuTreeOrderUpdate[] => {
  const siblingIndexes = new Map<string, number>()
  const flatNodes = menuTreeUtils.treeToList<FlatMenuOrderNode>(tree, {
    includeParentChain: true
  })

  return flatNodes
    .filter((node): node is FlatMenuOrderNode & { id: string } => !!node.id)
    .map((node) => {
      const parentChain = node.__parentChain ?? []
      const parentId = parentChain.length ? String(parentChain[parentChain.length - 1]) : null
      const siblingKey = parentId ?? '__ROOT__'
      const sort = (siblingIndexes.get(siblingKey) ?? 0) + 1
      siblingIndexes.set(siblingKey, sort)

      return { id: node.id, parentId, sort }
    })
}

export const filterMenuParentTree = <T extends MenuOrderNode>(tree: T[], id?: string): T[] => {
  if (!id) return tree
  return menuTreeUtils.removeNode(tree, id).tree as T[]
}

export const isMenuParentAvailable = <T extends MenuOrderNode>(
  tree: T[],
  id: string | undefined,
  parentId: string | null
): boolean => !parentId || !!menuTreeUtils.findNode(filterMenuParentTree(tree, id), parentId)
