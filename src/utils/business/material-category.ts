import TreeUtils from '@/utils/tree'
import type { MaterialSelectCategory } from '@/components/business/art-material-select/types'
import type { DataSelectNavigation } from '@/components/core/forms/art-data-select/types'

const categoryTree = new TreeUtils({ parentKey: 'parentId', deepClone: false })
export function buildMaterialCategoryNavigation(
  categories: MaterialSelectCategory[]
): DataSelectNavigation {
  return {
    data: categories.map((category) => ({ ...category })),
    title: '物料分类',
    rowKey: 'id',
    parentKey: 'parentId',
    labelKey: 'categoryName',
    descriptionKey: 'categoryCode',
    filterKey: 'categoryId',
    allLabel: '全部分类',
    allDescription: `${categories.length} 个分类节点`,
    searchPlaceholder: '搜索分类名称或编码',
    emptyText: '暂无物料分类'
  }
}

export function getMaterialCategoryIds(
  categories: MaterialSelectCategory[],
  categoryId: string
): string[] | undefined {
  if (!categoryId) return undefined
  return categoryTree
    .getDescendants(categoryTree.listToTree(categories), categoryId, true)
    .map((category) => category.id)
}
