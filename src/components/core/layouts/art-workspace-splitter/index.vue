<template>
  <ElSplitter
    class="art-workspace-splitter"
    :class="{
      'is-primary-hidden': primaryHidden,
      'is-stacked': narrowState === 'stack'
    }"
    :style="splitterStyle"
    lazy
  >
    <ElSplitterPanel
      :size="primarySize"
      :min="primaryMin"
      :max="primaryMax"
      :collapsible="primaryCollapsible"
    >
      <div class="art-workspace-splitter__primary">
        <slot name="primary" />
      </div>
    </ElSplitterPanel>

    <ElSplitterPanel :min="secondaryMin">
      <div class="art-workspace-splitter__secondary">
        <slot />
      </div>
    </ElSplitterPanel>
  </ElSplitter>
</template>

<script setup lang="ts">
  import type { CSSProperties } from 'vue'
  import { useMediaQuery } from '@vueuse/core'

  defineOptions({ name: 'ArtWorkspaceSplitter' })

  type SplitterSize = number | string
  type NarrowMode = 'hide' | 'stack' | 'none'

  const props = withDefaults(
    defineProps<{
      primarySize?: SplitterSize
      primaryMin?: SplitterSize
      primaryMax?: SplitterSize
      secondaryMin?: SplitterSize
      breakpoint?: number
      narrowMode?: NarrowMode
      primaryCollapsed?: boolean
      primaryCollapsible?: boolean
      stackedPrimarySize?: string
      stackedSecondaryMinSize?: string
    }>(),
    {
      primarySize: '280px',
      primaryMin: '248px',
      primaryMax: '380px',
      secondaryMin: '0px',
      breakpoint: 960,
      narrowMode: 'stack',
      primaryCollapsed: false,
      primaryCollapsible: true,
      stackedPrimarySize: '320px',
      stackedSecondaryMinSize: '520px'
    }
  )

  const isNarrow = useMediaQuery(() => `(max-width: ${props.breakpoint}px)`)
  const narrowState = computed<NarrowMode>(() => (isNarrow.value ? props.narrowMode : 'none'))
  const primaryHidden = computed(() => props.primaryCollapsed || narrowState.value === 'hide')
  const splitterStyle = computed<CSSProperties>(() => ({
    '--art-workspace-splitter-stacked-primary-size': props.stackedPrimarySize,
    '--art-workspace-splitter-stacked-secondary-min-size': props.stackedSecondaryMinSize
  }))
</script>

<style scoped lang="scss">
  .art-workspace-splitter {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    height: 100%;
    min-height: 0;
    overflow: hidden;

    &__primary,
    &__secondary {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      min-height: 0;
      overflow: hidden;

      > :deep(*) {
        flex: 1 1 auto;
        min-width: 0;
        min-height: 0;
      }
    }

    &__primary {
      padding-right: 8px;
    }

    &__secondary {
      padding-left: 8px;
    }

    :deep(.el-splitter-panel) {
      overflow: hidden;
    }

    :deep(.el-splitter-bar) {
      width: 16px;
      cursor: col-resize;
    }

    :deep(.el-splitter-bar__dragger) {
      width: 16px;
      height: 56px;
      border-radius: 999px;
      opacity: 0.28;
      transition:
        opacity 0.18s ease,
        background-color 0.18s ease,
        box-shadow 0.18s ease;
    }

    :deep(.el-splitter-bar__dragger::before) {
      width: 3px;
      height: 32px;
      background: var(--el-color-primary);
      border-radius: 999px;
    }

    :deep(.el-splitter-bar:hover .el-splitter-bar__dragger),
    :deep(.el-splitter-bar__dragger-active) {
      opacity: 1;
    }

    &.is-primary-hidden {
      :deep(.el-splitter-panel:first-child),
      :deep(.el-splitter-bar) {
        display: none;
      }

      :deep(.el-splitter-panel:last-child) {
        flex: 1 1 100% !important;
        width: 100% !important;
      }

      .art-workspace-splitter__secondary {
        padding-left: 0;
      }
    }

    &.is-stacked {
      display: block;
      height: auto;
      overflow: visible;

      :deep(.el-splitter-panel) {
        width: 100% !important;
        height: auto;
        overflow: visible;
      }

      :deep(.el-splitter-bar) {
        display: none;
      }

      .art-workspace-splitter__primary {
        height: var(--art-workspace-splitter-stacked-primary-size);
        padding-right: 0;
        margin-bottom: 20px;
      }

      .art-workspace-splitter__secondary {
        height: auto;
        min-height: var(--art-workspace-splitter-stacked-secondary-min-size);
        padding-left: 0;
      }
    }
  }
</style>
