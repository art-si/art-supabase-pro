<template>
  <div class="art-process-timeline">
    <div class="art-process-timeline__heading">
      <ArtSectionTitle>{{ title }}</ArtSectionTitle>
      <span class="art-process-timeline__summary">{{ resolvedSummary }}</span>
    </div>

    <ElScrollbar
      v-if="items.length"
      :max-height="maxHeight"
      always
      class="art-process-timeline__scrollbar"
    >
      <ElTimeline class="art-process-timeline__list">
        <ElTimelineItem v-for="item in items" :key="item.id" class="art-process-timeline__item">
          <template #dot>
            <ElAvatar
              :size="36"
              :src="item.actorAvatar || undefined"
              :aria-label="`${getActorName(item)}的头像`"
              :class="['art-process-timeline__avatar', `is-${item.tone || 'primary'}`]"
            >
              <ArtSvgIcon v-if="item.system" icon="ri:robot-2-line" />
              <span v-else>{{ formatAvatarInitials(item.actorName) }}</span>
            </ElAvatar>
          </template>

          <article class="art-process-timeline__card">
            <header class="art-process-timeline__card-header">
              <div class="art-process-timeline__actor">
                <strong>{{ getActorName(item) }}</strong>
                <time v-if="item.time" :datetime="item.time">{{ formatTime(item.time) }}</time>
              </div>
              <ArtDictDisplay
                v-if="actionDictCode && item.actionValue"
                :dict-code="actionDictCode"
                :value="item.actionValue"
                display="tag"
              />
              <ElTag v-else-if="item.actionLabel" :type="item.tone || 'primary'" effect="light">
                {{ item.actionLabel }}
              </ElTag>
            </header>

            <div v-if="item.title || item.description" class="art-process-timeline__content">
              <p v-if="item.title">{{ item.title }}</p>
              <small v-if="item.description">{{ item.description }}</small>
            </div>
          </article>
        </ElTimelineItem>
      </ElTimeline>
    </ElScrollbar>

    <ArtEmptyState
      v-else
      :title="emptyTitle"
      :description="emptyDescription"
      size="compact"
      :visual-size="72"
    />
  </div>
</template>

<script setup lang="ts">
  import { ElAvatar, ElScrollbar, ElTag, ElTimeline, ElTimelineItem } from 'element-plus'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import { createDateTimeFormatter, formatAvatarInitials } from '@/utils/ui/format'
  import type { ArtProcessTimelineItem } from './types'

  defineOptions({ name: 'ArtProcessTimeline' })

  const props = withDefaults(
    defineProps<{
      items: ArtProcessTimelineItem[]
      title?: string
      summary?: string
      actionDictCode?: string
      emptyTitle?: string
      emptyDescription?: string
      maxHeight?: string | number
    }>(),
    {
      title: '处理记录',
      summary: '',
      actionDictCode: '',
      emptyTitle: '暂无处理记录',
      emptyDescription: '业务发生处理动作后，记录会自动展示在这里。',
      maxHeight: '480px'
    }
  )

  const resolvedSummary = computed(() => props.summary || `共 ${props.items.length} 条记录`)

  function getActorName(item: ArtProcessTimelineItem): string {
    return item.actorName?.trim() || (item.system ? '系统' : '未知处理人')
  }

  const formatTime = createDateTimeFormatter()
</script>

<style scoped lang="scss">
  .art-process-timeline {
    width: 100%;
    min-width: 0;

    &__heading {
      display: flex;
      gap: var(--art-space-3);
      align-items: flex-start;
      justify-content: space-between;
    }

    &__heading :deep(.art-section-title) {
      min-width: 0;
    }

    &__summary {
      flex: 0 0 auto;
      margin-top: 7px;
      font-size: 11px;
      line-height: 18px;
      color: var(--el-text-color-secondary);
    }

    &__scrollbar {
      padding-top: 2px;
      margin: 0 -4px -2px 0;
    }

    &__list {
      padding: 4px 14px 0 4px;
      margin: 0;
    }

    &__item {
      padding-bottom: 18px;
    }

    &__avatar {
      font-size: 12px;
      font-weight: 700;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border: 3px solid var(--el-bg-color);
      box-shadow: 0 0 0 1px var(--el-color-primary-light-7);

      &.is-success {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
        box-shadow: 0 0 0 1px var(--el-color-success-light-7);
      }

      &.is-warning {
        color: var(--el-color-warning);
        background: var(--el-color-warning-light-9);
        box-shadow: 0 0 0 1px var(--el-color-warning-light-7);
      }

      &.is-danger {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
        box-shadow: 0 0 0 1px var(--el-color-danger-light-7);
      }

      &.is-info {
        color: var(--el-color-info);
        background: var(--el-color-info-light-9);
        box-shadow: 0 0 0 1px var(--el-color-info-light-7);
      }
    }

    &__card {
      min-width: 0;
      padding: 13px 14px;
      background: linear-gradient(145deg, var(--el-bg-color), var(--el-fill-color-blank));
      border: 1px solid var(--el-border-color-lighter);
      border-radius: calc(var(--el-border-radius-base) + 3px);
      box-shadow: 0 5px 18px rgb(31 45 61 / 4%);
    }

    &__card-header {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;
      min-width: 0;
    }

    &__actor {
      display: grid;
      gap: 2px;
      min-width: 0;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        font-weight: 600;
        line-height: 20px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      time {
        font-size: 11px;
        line-height: 17px;
        color: var(--el-text-color-secondary);
      }
    }

    &__content {
      display: grid;
      gap: 4px;
      padding-top: 9px;
      margin-top: 9px;
      border-top: 1px dashed var(--el-border-color-lighter);

      p,
      small {
        margin: 0;
        overflow-wrap: anywhere;
      }

      p {
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-regular);
      }

      small {
        font-size: 11px;
        line-height: 1.65;
        color: var(--el-text-color-secondary);
        white-space: pre-wrap;
      }
    }
  }

  :deep(.art-process-timeline__item .el-timeline-item__tail) {
    left: 17px;
    border-left: 1px dashed var(--el-border-color-light);
  }

  :deep(.art-process-timeline__item .el-timeline-item__node) {
    left: 0;
    width: 36px;
    height: 36px;
    background: transparent;
  }

  :deep(.art-process-timeline__item .el-timeline-item__wrapper) {
    top: -1px;
    min-width: 0;
    padding-left: 50px;
  }

  :deep(.art-process-timeline__item:last-child) {
    padding-bottom: 2px;
  }

  :deep(.art-process-timeline__card .el-tag) {
    flex: 0 0 auto;
    max-width: 42%;
  }

  @media only screen and (width <= 640px) {
    .art-process-timeline {
      &__summary {
        display: none;
      }

      &__list {
        padding-right: 8px;
      }

      &__card {
        padding: 12px;
      }

      &__card-header {
        align-items: center;
      }

      &__actor time {
        white-space: nowrap;
      }
    }

    :deep(.art-process-timeline__item .el-timeline-item__wrapper) {
      padding-left: 46px;
    }
  }
</style>
