<template>
  <section
    class="art-section-card art-card-xs"
    :class="[
      rootClass,
      {
        'is-scrollable': hasScrollBody,
        'has-header': hasScrollBody && hasCardHeader,
        'has-replacement-state': hasScrollBody && hasReplacementState
      }
    ]"
    :aria-busy="loading"
  >
    <slot v-if="$slots.header" name="header" />
    <header v-else-if="hasHeader" class="art-section-card__header">
      <div class="art-section-card__identity">
        <ArtSectionTitle :show-line="false" :show-marker="showMarker">{{ title }}</ArtSectionTitle>
        <p v-if="subtitle" class="art-section-card__subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="art-section-card__actions">
        <slot name="actions" />
      </div>
    </header>

    <slot v-if="preserveContentStructure && !hasActiveState" />
    <ElScrollbar
      v-else-if="hasScrollBody"
      class="art-section-card__scrollbar"
      :max-height="scrollMaxHeight"
      :always="scrollbarAlways"
    >
      <ArtAsyncState
        class="art-section-card__body"
        :class="bodyClass"
        v-bind="asyncStateProps"
        @retry="emit('retry')"
      >
        <slot />

        <template v-if="$slots.loading" #loading>
          <slot name="loading" />
        </template>

        <template v-if="$slots['empty-action']" #empty-action>
          <slot name="empty-action" />
        </template>
        <template v-if="$slots['error-action']" #error-action>
          <slot name="error-action" />
        </template>
      </ArtAsyncState>
    </ElScrollbar>

    <ArtAsyncState
      v-else
      class="art-section-card__body"
      :class="bodyClass"
      v-bind="asyncStateProps"
      @retry="emit('retry')"
    >
      <slot />

      <template v-if="$slots.loading" #loading>
        <slot name="loading" />
      </template>

      <template v-if="$slots['empty-action']" #empty-action>
        <slot name="empty-action" />
      </template>
      <template v-if="$slots['error-action']" #error-action>
        <slot name="error-action" />
      </template>
    </ArtAsyncState>
  </section>
</template>

<script setup lang="ts">
  import { ElScrollbar } from 'element-plus'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'

  defineOptions({ name: 'ArtSectionCard' })

  type SectionClass = string | Record<string, boolean> | SectionClass[]

  interface Props {
    title?: string
    subtitle?: string
    rootClass?: SectionClass
    bodyClass?: SectionClass
    showMarker?: boolean
    loading?: boolean
    loadingMode?: 'mask' | 'skeleton'
    skeletonRows?: number
    error?: string | Error | null
    errorTitle?: string
    retryable?: boolean
    empty?: boolean
    emptyTitle?: string
    emptyDescription?: string
    emptyVisualSize?: number
    minHeight?: string | number
    preserveContentStructure?: boolean
    showScrollbar?: boolean
    scrollbarAlways?: boolean
    scrollMaxHeight?: string | number
  }

  const props = withDefaults(defineProps<Props>(), {
    title: '',
    subtitle: '',
    rootClass: '',
    bodyClass: '',
    showMarker: true,
    loading: false,
    loadingMode: 'skeleton',
    skeletonRows: 6,
    error: null,
    errorTitle: '内容加载失败',
    retryable: true,
    empty: false,
    emptyTitle: '暂无数据',
    emptyDescription: '',
    emptyVisualSize: 96,
    minHeight: 180,
    preserveContentStructure: false,
    showScrollbar: true,
    scrollbarAlways: false
  })

  const emit = defineEmits<{ retry: [] }>()
  const slots = useSlots()
  const hasHeader = computed(() => Boolean(props.title || props.subtitle || slots.actions))
  const hasCardHeader = computed(() => Boolean(slots.header || hasHeader.value))
  const hasScrollBody = computed(() => props.showScrollbar && !props.preserveContentStructure)
  const stateMinHeight = computed(() => {
    if (props.loading || props.error || props.empty) return props.minHeight
    return hasScrollBody.value ? 'auto' : 0
  })
  const hasActiveState = computed(() => Boolean(props.loading || props.error || props.empty))
  const hasReplacementState = computed(
    () => (props.loading && props.loadingMode === 'skeleton') || Boolean(props.error || props.empty)
  )
  const asyncStateProps = computed(() => ({
    loading: props.loading,
    loadingMode: props.loadingMode,
    skeletonRows: props.skeletonRows,
    error: props.error,
    errorTitle: props.errorTitle,
    retryable: props.retryable,
    empty: props.empty,
    emptyText: props.emptyTitle,
    emptyDescription: props.emptyDescription,
    emptyImageSize: props.emptyVisualSize,
    minHeight: stateMinHeight.value
  }))
</script>

<style scoped lang="scss">
  .art-section-card {
    min-width: 0;
    padding: var(--art-section-padding);

    &__header {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-1) var(--art-space-3);
      align-items: flex-start;
      justify-content: space-between;
      min-width: 0;
      margin-bottom: var(--art-space-4);
    }

    &__identity {
      flex: 1 1 140px;
      min-width: min(140px, 100%);

      :deep(.art-section-title) {
        margin: 0;
        font-size: var(--art-font-size-section-title);
      }
    }

    &__subtitle {
      min-width: 0;
      padding-left: 11px;
      margin: 2px 0 0;
      font-size: var(--art-font-size-caption);
      line-height: 20px;
      color: var(--el-text-color-secondary);
      overflow-wrap: anywhere;
    }

    &__actions {
      display: flex;
      flex: 0 0 auto;
      flex-wrap: nowrap;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
      max-width: 100%;
      margin-left: auto;
    }

    &__body {
      min-width: 0;
    }

    &__scrollbar {
      flex: 1 1 auto;
      width: 100%;
      min-height: 0;

      :deep(> .el-scrollbar__wrap > .el-scrollbar__view) {
        display: flex;
        flex-direction: column;
        min-height: 100%;
      }
    }

    &.is-scrollable {
      display: flex;
      flex-direction: column;
      min-height: 0;
      padding: 0;

      .art-section-card__header {
        padding: var(--art-section-padding) var(--art-section-padding) 0;
      }

      .art-section-card__body {
        box-sizing: border-box;
        flex: 1 1 auto;
        min-height: 100%;
        padding: 0 var(--art-section-padding) var(--art-section-padding);
      }

      &:not(.has-header) .art-section-card__body {
        padding-top: var(--art-section-padding);
      }

      &.has-replacement-state .art-section-card__body {
        padding: 0;
      }
    }

    @media (width <= 640px) {
      padding: var(--art-space-4);

      &.is-scrollable {
        padding: 0;

        .art-section-card__header {
          padding: var(--art-space-4) var(--art-space-4) 0;
        }

        .art-section-card__body {
          padding-right: var(--art-space-4);
          padding-bottom: var(--art-space-4);
          padding-left: var(--art-space-4);
        }

        &:not(.has-header) .art-section-card__body {
          padding-top: var(--art-space-4);
        }

        &.has-replacement-state .art-section-card__body {
          padding: 0;
        }
      }
    }
  }
</style>
