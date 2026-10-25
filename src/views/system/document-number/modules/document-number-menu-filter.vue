<template>
  <BusinessMenuFilter
    class="number-menu-filter"
    :data="filterTree"
    :labels="labels"
    :summary="`${menuPageCount} 个功能页 · ${sceneCount} 项编号`"
    :all-count="sceneCount"
    :count="(node) => node.sceneCount"
    :direct-count="(node) => node.directSceneCount"
    :search-terms="(node) => node.sceneNames"
    :selected-menu-id="selectedMenuId"
    :loading="loading"
    @select="emit('select', $event)"
    @refresh="emit('refresh')"
  />
</template>
<script setup lang="ts">
  import BusinessMenuFilter from '@/components/business/business-menu-filter/index.vue'
  import { groupBy } from 'lodash-es'
  import type { BusinessMenuFilterLabels } from '@/components/business/business-menu-filter/types'

  import type { AppRouteRecord } from '@/types/router'

  import TreeUtils from '@/utils/tree'

  interface FilterMenuNode extends AppRouteRecord {
    directSceneCount: number
    sceneCount: number
    sceneNames: string[]
    children?: FilterMenuNode[]
  }

  const props = withDefaults(
    defineProps<{
      data: AppRouteRecord[]
      scenes: Api.SystemManage.DocumentNumberSceneItem[]
      selectedMenuId?: string
      loading?: boolean
    }>(),
    {
      selectedMenuId: '',
      loading: false
    }
  )

  const emit = defineEmits<{
    select: [menuId: string]
    refresh: []
  }>()

  const sceneMap = computed(() => groupBy(props.scenes, 'menuId'))

  const toFilterNode = (menu: AppRouteRecord): FilterMenuNode | null => {
    const children = (menu.children ?? [])
      .map(toFilterNode)
      .filter((item): item is FilterMenuNode => Boolean(item))
    const directScenes = menu.id ? (sceneMap.value[menu.id] ?? []) : []
    const sceneCount =
      directScenes.length + children.reduce((total, item) => total + item.sceneCount, 0)

    if (!sceneCount) return null
    return {
      ...menu,
      directSceneCount: directScenes.length,
      sceneCount,
      sceneNames: directScenes.flatMap((scene) => [
        scene.ruleName,
        scene.fieldLabel,
        scene.ruleKey
      ]),
      children
    }
  }

  const filterTree = computed<FilterMenuNode[]>(() =>
    props.data.map(toFilterNode).filter((item): item is FilterMenuNode => Boolean(item))
  )
  const filterTreeUtils = new TreeUtils({ idKey: 'id', childrenKey: 'children', deepClone: false })
  const flatFilterTree = computed<FilterMenuNode[]>(() =>
    filterTreeUtils.treeToList(filterTree.value)
  )
  const sceneCount = computed(() => props.scenes.length)
  const menuPageCount = computed(
    () => flatFilterTree.value.filter((item) => item.directSceneCount > 0).length
  )

  const labels: BusinessMenuFilterLabels = {
    ariaLabel: '编号规则功能菜单筛选',
    heading: '功能导航',
    refresh: '刷新菜单目录',
    search: '搜索菜单或编号功能',
    allAriaLabel: '全部编号功能',
    all: '全部功能',
    allDescription: '查看当前权限范围内全部编号规则',
    treeHint: '点击目录包含下级',
    errorTitle: '编号菜单加载失败',
    emptyTitle: '暂无已接入编号的菜单',
    emptyDescription: '请先在编号规则中接入业务菜单。',
    current: '当前筛选',
    unit: '项',
    direct: '直接接入'
  }
</script>
