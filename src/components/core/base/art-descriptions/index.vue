<template>
  <ElDescriptions
    class="art-descriptions"
    :column="resolvedColumns"
    :border="border"
    :direction="direction"
    :size="size"
    :label-width="labelWidth"
  >
    <ElDescriptionsItem
      v-for="item in visibleItems"
      :key="item.key"
      :label="item.label"
      :span="item.span"
      :class-name="item.className"
    >
      <slot :name="`item-${item.key}`" :item="item" :value="resolveRawValue(item)" :data="data">
        <span class="art-descriptions__value">
          <ArtDescriptionValue v-if="item.render" :render="() => resolveRenderedValue(item)" />
          <ArtDictDisplay
            v-else-if="item.dictCode"
            :dict-code="item.dictCode"
            :value="normalizeDictValue(resolveRawValue(item))"
            :display="item.dictDisplay ?? 'auto'"
            :empty-text="emptyText"
          />
          <template v-else>{{ resolveDisplayValue(item) }}</template>
        </span>
        <ElButton
          v-if="item.copyable && canCopy(item)"
          class="art-descriptions__copy"
          link
          type="primary"
          aria-label="复制"
          @click="handleCopy(item)"
        >
          <ArtSvgIcon icon="ri:file-copy-line" />
        </ElButton>
      </slot>
    </ElDescriptionsItem>
  </ElDescriptions>
</template>

<script setup lang="ts" generic="TData extends object = Record<string, unknown>">
  import { get } from 'lodash-es'
  import { ElMessage, type ComponentSize } from 'element-plus'
  import { useBreakpoints } from '@vueuse/core'
  import { type PropType, type VNodeChild } from 'vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import { formatArtValue } from '@/utils/ui'
  import type { ArtDescriptionItem } from './types'
  import { storeToRefs } from 'pinia'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { filterTenantDimensionDescriptors } from '@/utils/tenant-dimension-visibility'

  defineOptions({ name: 'ArtDescriptions' })

  const ArtDescriptionValue = defineComponent({
    name: 'ArtDescriptionValue',
    props: {
      render: {
        type: Function as PropType<() => VNodeChild>,
        required: true
      }
    },
    setup: (renderProps) => () => renderProps.render()
  })

  const props = withDefaults(
    defineProps<{
      data: TData
      items: ArtDescriptionItem<TData>[]
      columns?: number
      tabletColumns?: number
      mobileColumns?: number
      border?: boolean
      direction?: 'horizontal' | 'vertical'
      size?: ComponentSize
      labelWidth?: string | number
      emptyText?: string
    }>(),
    {
      columns: 3,
      tabletColumns: 2,
      mobileColumns: 1,
      border: true,
      direction: 'horizontal',
      size: 'default',
      labelWidth: undefined,
      emptyText: '--'
    }
  )

  const breakpoints = useBreakpoints({ mobile: 0, tablet: 768, desktop: 1200 })
  const activeBreakpoint = breakpoints.active()
  const { isPlatformScope } = storeToRefs(useTenantScopeStore())
  const visibleItems = computed(() =>
    filterTenantDimensionDescriptors(props.items, isPlatformScope.value)
  )

  const resolvedColumns = computed(() => {
    if (activeBreakpoint.value === 'mobile') return props.mobileColumns
    if (activeBreakpoint.value === 'tablet') return props.tabletColumns
    return props.columns
  })

  const resolveRawValue = (item: ArtDescriptionItem<TData>): unknown => {
    if (typeof item.value === 'function') return item.value(props.data)
    if (item.value !== undefined) return item.value
    return item.field ? get(props.data, item.field) : undefined
  }

  const resolveDisplayValue = (item: ArtDescriptionItem<TData>): string => {
    const value = resolveRawValue(item)
    if (item.formatter) return item.formatter(value, props.data)
    return formatArtValue(value, item.format ?? 'text', { emptyText: props.emptyText })
  }

  const resolveRenderedValue = (item: ArtDescriptionItem<TData>): VNodeChild =>
    item.render?.(resolveRawValue(item), props.data)

  const normalizeDictValue = (value: unknown): string | number | null | undefined => {
    if (value === null || value === undefined) return value
    return typeof value === 'number' ? value : String(value)
  }

  const canCopy = (item: ArtDescriptionItem<TData>): boolean => {
    const value = resolveRawValue(item)
    return value !== undefined && value !== null && value !== ''
  }

  const handleCopy = async (item: ArtDescriptionItem<TData>): Promise<void> => {
    try {
      await copyTextToClipboard(String(resolveRawValue(item)))
      ElMessage.success('复制成功')
    } catch {
      ElMessage.warning('复制失败，请手动选择文字复制')
    }
  }
</script>

<style scoped lang="scss">
  .art-descriptions {
    width: 100%;

    :deep(.el-descriptions__table) {
      table-layout: fixed;
    }

    &__value {
      min-width: 0;
      overflow-wrap: anywhere;
    }

    &__copy {
      margin-left: var(--art-space-1);
      vertical-align: middle;
    }

    :deep(.el-descriptions__label) {
      font-weight: 500;
      color: var(--el-text-color-secondary);
      overflow-wrap: anywhere;
    }

    :deep(.el-descriptions__content) {
      min-width: 0;
      color: var(--el-text-color-primary);
    }
  }
</style>
