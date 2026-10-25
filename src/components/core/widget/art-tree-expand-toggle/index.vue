<template>
  <ArtIconButton
    :icon="allExpanded ? 'ri:contract-up-down-line' : 'ri:expand-up-down-line'"
    :label="allExpanded ? `全部收起${label}` : `全部展开${label}`"
    :disabled="!tree || !expandableNodeKeys.length"
    @click="toggleAll"
  />
</template>

<script setup lang="ts">
  import type { TreeKey } from 'element-plus'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'

  defineOptions({ name: 'ArtTreeExpandToggle' })

  interface ExpandableTreeNodeController {
    expanded?: boolean
    expand: () => void
    collapse: () => void
  }

  interface ExpandableTreeController {
    getNode: (key: TreeKey) => ExpandableTreeNodeController | undefined
  }

  const props = withDefaults(
    defineProps<{
      tree?: ExpandableTreeController
      data?: unknown[]
      nodeKey?: string
      childrenKey?: string
      label?: string
      defaultExpanded?: boolean
    }>(),
    {
      data: () => [],
      nodeKey: 'id',
      childrenKey: 'children',
      label: '树形结构',
      defaultExpanded: false
    }
  )

  const refreshVersion = ref(0)

  const expandableNodeKeys = computed<TreeKey[]>(() => {
    const keys: TreeKey[] = []
    const visit = (nodes: unknown[]): void => {
      nodes.forEach((item) => {
        if (!item || typeof item !== 'object') return
        const node = item as Record<string, unknown>
        const children = node[props.childrenKey]
        if (!Array.isArray(children) || children.length === 0) return
        const key = node[props.nodeKey]
        if (typeof key === 'string' || typeof key === 'number') keys.push(key)
        visit(children)
      })
    }

    visit(props.data)
    return keys
  })

  const allExpanded = computed(() => {
    void refreshVersion.value
    if (!expandableNodeKeys.value.length || !props.tree) return props.defaultExpanded
    return expandableNodeKeys.value.every((key) => props.tree?.getNode(key)?.expanded === true)
  })

  const refresh = (): void => {
    refreshVersion.value += 1
  }

  const toggleAll = async (): Promise<void> => {
    if (!props.tree || !expandableNodeKeys.value.length) return
    const shouldExpand = !allExpanded.value
    const keys = shouldExpand ? expandableNodeKeys.value : [...expandableNodeKeys.value].reverse()

    keys.forEach((key) => {
      const node = props.tree?.getNode(key)
      if (shouldExpand) node?.expand()
      else node?.collapse()
    })
    refresh()
    await nextTick()
    refresh()
  }

  watch(() => props.data, refresh, { flush: 'post' })

  defineExpose({ refresh })
</script>
