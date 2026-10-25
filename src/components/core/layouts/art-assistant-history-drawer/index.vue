<template>
  <ArtDrawer
    :loading="loading"
    ref="drawerRef"
    class="art-assistant-history"
    size="md"
    :show-footer="false"
  >
    <div class="art-assistant-history__toolbar">
      <ElInput
        :model-value="query"
        clearable
        placeholder="搜索会话标题"
        aria-label="搜索会话标题"
        @update:model-value="emit('update:query', String($event))"
        @input="emit('search')"
      >
        <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
      </ElInput>
    </div>

    <ArtAsyncState
      :error="error"
      :empty="!loading && !error && !items.length"
      empty-text="暂无会话历史"
      empty-description="发起对话后，可在这里继续查看。"
      min-height="320px"
      @retry="emit('retry')"
    >
      <ElScrollbar class="art-assistant-history__scroll">
        <div class="art-assistant-history__list">
          <article
            v-for="item in items"
            :key="item.id"
            :class="{ 'is-active': item.id === activeId }"
          >
            <button
              type="button"
              class="history-select"
              :disabled="Boolean(selectingId)"
              :aria-busy="selectingId === item.id"
              :aria-pressed="item.id === activeId"
              @click="emit('select', item.id)"
            >
              <header>
                <strong>{{ item.title || '未命名会话' }}</strong>
                <ArtSvgIcon
                  v-if="selectingId === item.id"
                  icon="ri:loader-4-line"
                  class="shrink-0 animate-spin"
                />
              </header>
              <p>{{ item.lastMessage?.content || '暂无消息摘要' }}</p>
              <footer>
                <span>{{ formatHistoryTime(item.updateTime) }}</span>
                <span v-if="item.lastRun">
                  {{ item.lastRun.model }} · {{ formatDurationMs(item.lastRun.latencyMs) }}
                </span>
              </footer>
            </button>
            <ArtIconButton
              class="history-rename size-8! shrink-0 text-base!"
              icon="ri:edit-line"
              label="重命名会话"
              @click="emit('rename', item)"
            />
          </article>
        </div>
      </ElScrollbar>
    </ArtAsyncState>
  </ArtDrawer>
</template>

<script setup lang="ts" generic="T extends AssistantHistoryItem">
  import { formatDurationMs } from '@/utils/ui/format'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import type { AssistantHistoryItem } from './types'

  defineOptions({ name: 'ArtAssistantHistoryDrawer' })

  defineProps<{
    query: string
    loading: boolean
    error: string
    items: T[]
    activeId?: string
    selectingId?: string
  }>()

  const emit = defineEmits<{
    'update:query': [value: string]
    search: []
    retry: []
    select: [conversationId: string]
    rename: [item: T]
  }>()

  const drawerRef = ref<ArtDrawerExpose>()

  function formatHistoryTime(value?: string): string {
    if (!value) return '-'
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value))
  }

  async function handleOpen(): Promise<void> {
    await drawerRef.value?.handleOpen(undefined, {
      title: '会话历史',
      size: 'md',
      showFooter: false,
      contentHeight: 'calc(100vh - 90px)',
      drawerProps: { appendToBody: true }
    })
  }

  function handleClose(): void {
    drawerRef.value?.handleClose()
  }

  defineExpose({ handleOpen, handleClose })
</script>

<style scoped lang="scss">
  :global(.art-assistant-history .el-drawer__header) {
    padding-bottom: var(--art-space-3);
    margin-bottom: 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  :global(.art-assistant-history .art-drawer__content) {
    --art-drawer-content-padding: var(--art-space-3) var(--el-drawer-padding-primary)
      var(--el-drawer-padding-primary);

    display: flex;
    flex-direction: column;
    gap: var(--art-space-3);
    min-height: 0;
  }

  .art-assistant-history {
    &__toolbar {
      flex: 0 0 auto;
    }

    &__scroll {
      height: 100%;
    }

    &__list {
      display: flex;
      flex-direction: column;
      gap: var(--art-space-2);

      article {
        position: relative;
        background: var(--el-fill-color-blank);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--art-surface-radius);
        transition:
          background-color var(--el-transition-duration-fast),
          border-color var(--el-transition-duration-fast);

        &:hover,
        &.is-active {
          background: var(--el-color-primary-light-9);
          border-color: var(--el-color-primary-light-6);
        }

        &.is-active {
          box-shadow: inset 3px 0 0 var(--el-color-primary);
        }

        .history-select {
          display: block;
          width: 100%;
          padding: var(--art-space-3);
          color: inherit;
          text-align: left;
          cursor: pointer;
          background: transparent;
          border: 0;
          border-radius: inherit;

          &:focus-visible {
            outline: 2px solid var(--theme-color);
            outline-offset: -2px;
          }
        }

        .history-rename {
          position: absolute;
          top: 12px;
          right: 12px;
        }

        header {
          padding-right: 40px;
        }

        header,
        footer {
          display: flex;
          gap: var(--art-space-2);
          align-items: center;
          justify-content: space-between;
        }

        header :deep(.art-icon-button) {
          flex-shrink: 0;
        }

        header strong {
          flex: 1;
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        p {
          display: -webkit-box;
          margin: var(--art-space-2) 0;
          overflow: hidden;
          -webkit-line-clamp: 2;
          font-size: 13px;
          color: var(--el-text-color-regular);
          -webkit-box-orient: vertical;
        }

        footer {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }
    }
  }

  :deep(.art-async-state) {
    flex: 1;
    min-height: 0 !important;
  }
</style>
