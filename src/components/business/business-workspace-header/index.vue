<template>
  <section
    class="business-workspace-header art-card-xs"
    :class="`business-workspace-header--${density}`"
  >
    <header class="business-workspace-header__hero">
      <div class="business-workspace-header__identity">
        <div class="business-workspace-header__brand" aria-hidden="true">
          <ArtSvgIcon :icon="icon" />
        </div>
        <div class="business-workspace-header__copy">
          <span>{{ eyebrow }}</span>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
      </div>

      <div
        v-if="tags.length || refreshable || $slots.actions"
        class="business-workspace-header__aside"
        aria-label="业务特性与操作"
      >
        <div v-if="tags.length" class="business-workspace-header__tags">
          <ElTag
            v-for="tag in tags"
            :key="tag.label"
            :type="tag.type"
            :effect="tag.effect ?? 'plain'"
            round
          >
            {{ tag.label }}
          </ElTag>
        </div>
        <div
          v-if="refreshable || $slots.actions"
          class="business-workspace-header__actions"
          aria-label="页面操作"
        >
          <ArtTooltip v-if="refreshable" :content="refreshLabel" placement="bottom">
            <ArtIconButton
              icon="ri:refresh-line"
              :label="refreshLabel"
              :loading="refreshLoading"
              :disabled="refreshDisabled"
              @click="emit('refresh')"
            />
          </ArtTooltip>
          <slot name="actions" />
        </div>
      </div>
    </header>

    <div v-if="metrics.length" class="business-workspace-header__metrics" aria-label="业务概览">
      <component
        :is="metric.interactive ? 'button' : 'article'"
        v-for="metric in metrics"
        :key="metric.key ?? metric.label"
        class="business-workspace-header__metric"
        :class="{
          'is-interactive': metric.interactive,
          'is-selected': metric.selected
        }"
        :type="metric.interactive ? 'button' : undefined"
        :disabled="metric.interactive ? metric.loading : undefined"
        :aria-busy="metric.loading || undefined"
        :aria-pressed="metric.interactive ? Boolean(metric.selected) : undefined"
        @click="handleMetricClick(metric)"
      >
        <div
          class="business-workspace-header__metric-icon"
          :class="`is-${metric.tone ?? 'primary'}`"
          aria-hidden="true"
        >
          <ArtSvgIcon :icon="metric.icon" />
        </div>
        <div class="business-workspace-header__metric-copy">
          <span :title="metric.label">{{ metric.label }}</span>
          <ElSkeleton v-if="metric.loading" animated :rows="0">
            <template #template><ElSkeletonItem variant="text" /></template>
          </ElSkeleton>
          <strong v-else :title="String(metric.value)">{{ metric.value }}</strong>
          <small :title="metric.description">{{ metric.description }}</small>
        </div>
      </component>
    </div>
  </section>
</template>

<script setup lang="ts">
  import type { TagProps } from 'element-plus'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'

  export interface BusinessWorkspaceTag {
    label: string
    type?: TagProps['type']
    effect?: TagProps['effect']
  }

  export interface BusinessWorkspaceMetric {
    key?: string
    label: string
    value: string | number
    description: string
    icon: string
    tone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    interactive?: boolean
    selected?: boolean
    loading?: boolean
  }

  withDefaults(
    defineProps<{
      title: string
      description: string
      icon: string
      eyebrow?: string
      tags?: BusinessWorkspaceTag[]
      metrics?: BusinessWorkspaceMetric[]
      density?: 'default' | 'compact'
      refreshable?: boolean
      refreshLabel?: string
      refreshLoading?: boolean
      refreshDisabled?: boolean
    }>(),
    {
      eyebrow: 'BUSINESS OPERATIONS',
      tags: () => [],
      metrics: () => [],
      density: 'default',
      refreshable: false,
      refreshLabel: '刷新页面数据',
      refreshLoading: false,
      refreshDisabled: false
    }
  )

  const emit = defineEmits<{
    'metric-click': [metric: BusinessWorkspaceMetric]
    refresh: []
  }>()

  const handleMetricClick = (metric: BusinessWorkspaceMetric): void => {
    if (metric.interactive && !metric.loading) emit('metric-click', metric)
  }
</script>

<style lang="scss">
  .business-workspace-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;

    > .el-alert {
      flex: 0 0 auto;
    }

    > .art-table-query,
    > .el-tabs,
    > .business-workspace-content {
      flex: 1;
      min-height: 0;
    }
  }
</style>

<style scoped lang="scss">
  .business-workspace-header {
    flex: 0 0 auto;
    min-width: 0;
    overflow: hidden;

    &__hero,
    &__identity,
    &__aside,
    &__tags,
    &__actions,
    &__metric,
    &__brand,
    &__metric-icon {
      display: flex;
      align-items: center;
    }

    &__hero {
      gap: 20px;
      justify-content: space-between;
      padding: 20px 24px 18px;
      background: linear-gradient(
        115deg,
        transparent 58%,
        color-mix(in srgb, var(--theme-color) 7%, transparent)
      );
    }

    &__identity,
    &__copy {
      min-width: 0;
    }

    &__copy {
      > span {
        display: block;
        margin-bottom: 3px;
        font-size: 10px;
        font-weight: 700;
        color: var(--el-color-primary);
        letter-spacing: 0.14em;
      }

      h1 {
        margin: 0 0 3px;
        font-size: 22px;
        line-height: 1.35;
        color: var(--el-text-color-primary);
      }

      p {
        max-width: 760px;
        margin: 0;
        font-size: 13px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
        overflow-wrap: anywhere;
      }
    }

    &--compact {
      .business-workspace-header__aside {
        max-width: min(64%, 900px);
      }

      .business-workspace-header__hero {
        gap: 16px;
        padding: 14px 18px 13px;
      }

      .business-workspace-header__brand {
        flex-basis: 42px;
        width: 42px;
        height: 42px;
        margin-right: 12px;
        border-radius: var(--el-border-radius-base);

        :deep(svg) {
          width: 20px;
          height: 20px;
        }
      }

      .business-workspace-header__copy {
        > span {
          margin-bottom: 1px;
          font-size: 9px;
        }

        h1 {
          margin-bottom: 1px;
          font-size: 20px;
        }

        p {
          font-size: 12px;
          line-height: 1.5;
        }
      }

      .business-workspace-header__aside {
        gap: 6px;
      }

      .business-workspace-header__tags,
      .business-workspace-header__actions {
        gap: 6px;
      }

      .business-workspace-header__metric {
        gap: 10px;
        padding: 10px 16px;
      }

      .business-workspace-header__metric-icon {
        flex-basis: 32px;
        width: 32px;
        height: 32px;

        :deep(svg) {
          width: 16px;
          height: 16px;
        }
      }

      .business-workspace-header__metric-copy {
        strong {
          margin: 0;
          font-size: 18px;
        }

        span {
          font-size: 11px;
        }

        small {
          font-size: 10px;
        }
      }
    }

    &__brand {
      flex: 0 0 50px;
      justify-content: center;
      width: 50px;
      height: 50px;
      margin-right: 16px;
      color: white;
      background: linear-gradient(145deg, var(--el-color-primary), var(--el-color-primary-dark-2));
      border-radius: var(--custom-radius);

      :deep(svg) {
        width: 23px;
        height: 23px;
      }
    }

    &__aside {
      flex: none;
      flex-direction: column;
      gap: 10px;
      align-items: flex-end;
      min-width: 0;
      max-width: min(48%, 640px);
    }

    &__tags,
    &__actions {
      flex: none;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      min-width: 0;
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      border-top: 1px solid var(--el-border-color-lighter);

      .business-workspace-header__metric {
        gap: 12px;
        min-width: 0;
        padding: 14px 24px;
        color: inherit;
        text-align: left;
        background: transparent;
        border: 0;

        &:not(:last-child) {
          border-right: 1px solid var(--el-border-color-lighter);
        }

        &.is-interactive {
          cursor: pointer;
          transition:
            color 0.18s ease,
            background-color 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease;

          &:hover {
            color: var(--theme-color);
            background: color-mix(in srgb, var(--theme-color) 7%, transparent);
          }

          &:focus-visible {
            z-index: 1;
            color: var(--theme-color);
            outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
            outline-offset: -2px;
            background: color-mix(in srgb, var(--theme-color) 7%, transparent);
          }

          &:disabled {
            cursor: progress;
            opacity: 0.72;
          }
        }
      }
    }

    &__metric-copy {
      display: grid;
      min-width: 0;

      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      strong {
        margin: 1px 0;
        font-size: 20px;
        font-variant-numeric: tabular-nums;
        line-height: 1.25;
        color: var(--el-text-color-primary);
      }

      small {
        font-size: 11px;
      }
    }

    &__metric-icon {
      flex: 0 0 38px;
      justify-content: center;
      width: 38px;
      height: 38px;
      border-radius: var(--el-border-radius-base);

      :deep(svg) {
        width: 18px;
        height: 18px;
      }

      &.is-primary {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }

      &.is-success {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
      }

      &.is-warning {
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
      }

      &.is-danger {
        color: var(--el-color-danger);
        background: var(--el-color-danger-light-9);
      }

      &.is-info {
        color: var(--el-color-info);
        background: var(--el-color-info-light-9);
      }
    }

    @media (width <= 900px) {
      &__hero {
        flex-wrap: wrap;
        align-items: flex-start;
      }

      &__aside {
        flex-flow: row wrap;
        align-items: center;
        justify-content: space-between;
        width: calc(100% - 66px);
        max-width: none;
        margin-left: 66px;
      }

      &__actions {
        flex: 1 1 100%;
        width: 100%;
        max-width: 100%;
      }

      &--compact .business-workspace-header__aside {
        width: calc(100% - 54px);
        max-width: none;
        margin-left: 54px;
      }

      &__metric {
        padding-inline: 16px;
      }
    }

    @media (width <= 640px) {
      &__hero {
        flex-direction: column;
        padding: 18px;
      }

      &__aside {
        flex-direction: column;
        align-items: flex-start;
        width: 100%;
        margin-left: 0;
      }

      &__tags {
        justify-content: flex-start;
      }

      &__metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));

        .business-workspace-header__metric {
          gap: 8px;
          padding: 12px;

          &:not(:last-child) {
            border-right: 0;
          }

          &:nth-child(odd):not(:last-child) {
            border-right: 1px solid var(--el-border-color-lighter);
          }

          &:nth-child(n + 3) {
            border-top: 1px solid var(--el-border-color-lighter);
          }

          &:only-child {
            grid-column: 1 / -1;
          }
        }
      }

      &__metric-icon {
        flex-basis: 28px;
        width: 28px;
        height: 28px;
      }

      &__metric-copy strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 18px;
        white-space: nowrap;
      }

      &--compact {
        .business-workspace-header__hero {
          gap: 10px;
          padding: 14px;
        }

        .business-workspace-header__aside {
          width: 100%;
          max-width: none;
          margin-left: 0;
        }

        .business-workspace-header__metric {
          padding: 9px 12px;
        }

        .business-workspace-header__metric-copy small {
          display: none;
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &__metric.is-interactive {
        transition: none;
      }
    }
  }

  :global(
    html[data-box-mode='border-mode'] .business-workspace-header__metric.is-interactive.is-selected
  ) {
    background: color-mix(in srgb, var(--theme-color) 9%, transparent);
    box-shadow: inset 0 -2px 0 var(--theme-color);
  }

  :global(
    html[data-box-mode='shadow-mode'] .business-workspace-header__metric.is-interactive.is-selected
  ) {
    background: color-mix(in srgb, var(--theme-color) 8%, transparent);
    box-shadow: 0 8px 20px color-mix(in srgb, var(--theme-color) 16%, transparent);
  }
</style>
