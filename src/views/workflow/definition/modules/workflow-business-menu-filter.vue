<template>
  <BusinessMenuFilter
    class="workflow-menu-filter"
    :data="filterTree"
    :labels="labels"
    :summary="`${menuPageCount} 个功能页 · ${contractCount} 类审批`"
    :all-count="contractCount"
    :count="(node) => node.businessTypes.length"
    :direct-count="(node) => node.directCount"
    :search-terms="(node) => node.searchTerms"
    :selected-menu-id="selectedMenuId"
    :loading="loading"
    :error="error"
    @select="handleSelect"
    @refresh="emit('refresh')"
  />
</template>
<script setup lang="ts">
  import BusinessMenuFilter from '@/components/business/business-menu-filter/index.vue'
  import { groupBy } from 'lodash-es'
  import type { BusinessMenuFilterLabels } from '@/components/business/business-menu-filter/types'

  import type { AppRouteRecord } from '@/types/router'
  import { resolveMenuLabel } from '@/utils/navigation/menu'
  import TreeUtils from '@/utils/tree'
  import { workflowBusinessContracts } from '../../modules/workflow-business-contracts'

  interface WorkflowMenuNode extends AppRouteRecord {
    directCount: number
    businessTypes: string[]
    searchTerms: string[]
    children?: WorkflowMenuNode[]
  }

  const props = withDefaults(
    defineProps<{
      data: AppRouteRecord[]
      selectedMenuId?: string
      loading?: boolean
      error?: string
    }>(),
    { selectedMenuId: '', loading: false, error: '' }
  )
  const emit = defineEmits<{
    select: [menuId: string, businessTypes: string[], label: string]
    refresh: []
  }>()

  const treeUtils = new TreeUtils({ idKey: 'id', parentKey: 'parentId', childrenKey: 'children' })

  const contractsByMenuName = computed(() => groupBy(workflowBusinessContracts, 'menuName'))

  const toWorkflowNode = (menu: AppRouteRecord): WorkflowMenuNode | null => {
    const children = (menu.children ?? [])
      .map(toWorkflowNode)
      .filter((item): item is WorkflowMenuNode => Boolean(item))
    const directContracts = contractsByMenuName.value[String(menu.name ?? '')] ?? []
    const businessTypes = [
      ...directContracts.map((contract) => contract.businessType),
      ...children.flatMap((child) => child.businessTypes)
    ]
    if (!businessTypes.length) return null
    return {
      ...menu,
      directCount: directContracts.length,
      businessTypes,
      searchTerms: directContracts.flatMap((contract) => [contract.label, contract.businessType]),
      children
    }
  }

  const filterTree = computed<WorkflowMenuNode[]>(() =>
    props.data.map(toWorkflowNode).filter((item): item is WorkflowMenuNode => Boolean(item))
  )
  const flatTree = computed(() => treeUtils.treeToList<WorkflowMenuNode>(filterTree.value))

  const contractCount = computed(() => workflowBusinessContracts.length)
  const menuPageCount = computed(() => flatTree.value.filter((item) => item.directCount > 0).length)

  function handleSelect(menuId: string): void {
    if (!menuId) {
      emit(
        'select',
        '',
        workflowBusinessContracts.map((contract) => contract.businessType),
        '全部业务'
      )
      return
    }
    const menu = flatTree.value.find((node) => node.id === menuId)
    if (menu) emit('select', menuId, menu.businessTypes, resolveMenuLabel(menu))
  }

  const labels: BusinessMenuFilterLabels = {
    ariaLabel: '审批业务菜单筛选',
    heading: '业务导航',
    refresh: '刷新业务目录',
    search: '搜索菜单或审批业务',
    allAriaLabel: '全部审批业务',
    all: '全部业务',
    allDescription: '查看全部已接入审批的业务',
    treeHint: '选择目录包含下级',
    errorTitle: '业务菜单加载失败',
    emptyTitle: '暂无已接入审批的菜单',
    emptyDescription: '请先在流程目录接入可审批菜单。',
    current: '当前范围',
    unit: '类',
    direct: '直接接入'
  }
</script>
