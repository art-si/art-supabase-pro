<template>
  <div class="business-table-row-actions">
    <slot />
    <ArtButtonMore v-if="!hasParentOwner && hasCommands && !hasMoreButton()" :list="[]" />
  </div>
</template>

<script setup lang="ts">
  import { computed, inject, isVNode, provide, useSlots, type VNode } from 'vue'
  import ArtButtonMore from '@/components/core/forms/art-button-more/index.vue'
  import {
    tableActionRowKey,
    tableRowCommandsKey,
    tableRowActionOwnerKey
  } from '@/components/core/tables/art-table-query/row-action-context'
  defineOptions({ name: 'BusinessTableRowActions' })
  const props = defineProps<{ row?: object }>()
  const inheritedRow = inject(tableActionRowKey, undefined)
  const row = computed(() => props.row ?? inheritedRow?.value)
  provide(tableActionRowKey, row)
  const hasParentOwner = inject(tableRowActionOwnerKey, false)
  provide(tableRowActionOwnerKey, true)
  const commands = inject(tableRowCommandsKey, undefined)
  const slots = useSlots()
  const hasCommands = computed(() => Boolean(row.value && commands?.items(row.value).length))
  function containsMore(nodes: VNode[]): boolean {
    return nodes.some((node) => {
      if (
        node.type === ArtButtonMore ||
        (typeof node.type === 'object' && 'name' in node.type && node.type.name === 'ArtButtonMore')
      )
        return true
      if (Array.isArray(node.children)) return containsMore(node.children.filter(isVNode))
      if (
        node.children &&
        typeof node.children === 'object' &&
        'default' in node.children &&
        typeof node.children.default === 'function'
      ) {
        const children: unknown = node.children.default()
        return isVNode(children)
          ? containsMore([children])
          : Array.isArray(children) && containsMore(children.filter(isVNode))
      }
      return false
    })
  }
  function hasMoreButton(): boolean {
    return containsMore(slots.default?.() ?? [])
  }
</script>

<style scoped lang="scss">
  .business-table-row-actions {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-start;
    min-width: 0;
    white-space: nowrap;

    :deep(.art-button-table) {
      flex: 0 0 auto;
      margin-right: 0;
    }

    :deep(.el-button + .el-button) {
      margin-left: 0;
    }

    :deep(.el-dropdown) {
      display: inline-flex;
    }

    // 兼容存量 formatter 的单层布局容器；新代码直接把按钮作为插槽子项。
    :deep(> :is(div, span):has(> .art-button-table, > .el-dropdown)) {
      display: contents;
    }
  }
</style>
