<template>
  <div
    class="art-async-state"
    :class="{ 'is-full-height': fullHeight, 'is-compact': size === 'compact' }"
    :style="{ minHeight: normalizedMinHeight }"
    :aria-busy="loading"
  >
    <span
      v-if="statusAnnouncement"
      class="sr-only"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {{ statusAnnouncement }}
    </span>

    <ArtOverlayLoading
      v-if="isMaskLoading"
      loading
      overlay
      text="正在加载内容…"
      description="正在获取最新数据，请稍候"
    />

    <template v-if="loading && loadingMode === 'skeleton'">
      <slot name="loading">
        <ElSkeleton
          animated
          aria-hidden="true"
          :rows="skeletonRows"
          class="art-async-state__skeleton"
        />
      </slot>
    </template>

    <ElResult
      v-else-if="errorMessage"
      icon="error"
      :title="errorTitle"
      :sub-title="errorMessage"
      class="art-async-state__result"
    >
      <template #extra>
        <slot name="error-action">
          <ElButton v-if="retryable" type="primary" @click="emit('retry')">重新加载</ElButton>
        </slot>
      </template>
    </ElResult>

    <ArtEmptyState
      v-else-if="empty"
      :title="emptyText"
      :description="emptyDescription"
      :visual-size="emptyImageSize"
      :size="emptyStateSize"
      class="art-async-state__empty"
    >
      <slot name="empty-action" />
    </ArtEmptyState>

    <slot v-else />
  </div>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'

  defineOptions({ name: 'ArtAsyncState' })

  interface Props {
    loading?: boolean
    loadingMode?: 'mask' | 'skeleton'
    skeletonRows?: number
    error?: string | Error | null
    errorTitle?: string
    retryable?: boolean
    empty?: boolean
    emptyText?: string
    emptyDescription?: string
    emptyImageSize?: number
    fullHeight?: boolean
    minHeight?: string | number
    size?: 'default' | 'compact'
  }

  type EmptyStateSize = 'compact' | 'default'

  const props = withDefaults(defineProps<Props>(), {
    loading: false,
    loadingMode: 'mask',
    skeletonRows: 6,
    error: null,
    errorTitle: '内容加载失败',
    retryable: true,
    empty: false,
    emptyText: '暂无数据',
    emptyDescription: '',
    emptyImageSize: 96,
    fullHeight: false,
    minHeight: 180,
    size: 'default'
  })

  const emit = defineEmits<{ retry: [] }>()

  const isMaskLoading = computed(() => Boolean(props.loading && props.loadingMode === 'mask'))
  const errorMessage = computed(() => {
    if (!props.error) return ''
    return getFriendlySupabaseErrorMessage(props.error, '内容加载失败，请稍后重试')
  })

  const normalizedMinHeight = computed(() =>
    typeof props.minHeight === 'number' ? `${props.minHeight}px` : props.minHeight
  )

  const statusAnnouncement = computed(() => {
    if (props.loading) return '正在加载…'
    if (errorMessage.value) return `${props.errorTitle}：${errorMessage.value}`
    return ''
  })

  const emptyStateSize = computed<EmptyStateSize>(() =>
    props.emptyImageSize <= 72 ? 'compact' : 'default'
  )
</script>

<style scoped lang="scss">
  .art-async-state {
    position: relative;
    min-width: 0;

    &.is-full-height {
      height: 100%;
    }

    &__skeleton {
      padding: var(--art-space-4);
    }

    &__result {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: inherit;
      padding: var(--art-space-5) var(--art-section-padding);

      :deep(.el-result__icon svg) {
        width: 64px;
        height: 64px;
      }

      :deep(.el-result__title p) {
        font-size: var(--art-font-size-section-title);
        font-weight: 600;
        line-height: var(--art-line-height-body);
      }

      :deep(.el-result__subtitle p) {
        max-width: 520px;
        font-size: var(--art-font-size-body);
        line-height: var(--art-line-height-body);
        color: var(--art-gray-600);
      }
    }

    &__empty {
      min-height: inherit;
    }

    &.is-compact &__result {
      --el-result-title-margin-top: 12px;
      --el-result-subtitle-margin-top: 8px;
      --el-result-extra-margin-top: 16px;

      padding: var(--art-space-3);

      :deep(.el-result__icon svg) {
        width: 40px;
        height: 40px;
      }
    }
  }
</style>
