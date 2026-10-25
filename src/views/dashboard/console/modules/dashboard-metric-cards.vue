<template>
  <section class="dashboard-overview" aria-labelledby="dashboard-overview-title">
    <header class="dashboard-overview__header">
      <div>
        <p>DAILY SNAPSHOT</p>
        <h2 id="dashboard-overview-title">今日运营概览</h2>
      </div>
      <span class="art-icon-label">
        <ArtSvgIcon icon="ri:cursor-line" aria-hidden="true" />
        点击指标查看业务明细
      </span>
    </header>

    <div class="metric-cards">
      <button
        v-for="item in items"
        :key="item.key"
        type="button"
        class="metric-card art-card-xs"
        :class="`metric-card--${item.tone}`"
        :aria-label="`查看${item.label}详情`"
        @click="emit('select', item.route)"
      >
        <span class="metric-card__icon">
          <ArtSvgIcon :icon="item.icon" aria-hidden="true" />
        </span>
        <div class="metric-card__copy">
          <p>{{ item.label }}</p>
          <strong :title="`${item.value}${item.unit ? ` ${item.unit}` : ''}`">
            {{ item.value }}
            <em v-if="item.unit">{{ item.unit }}</em>
          </strong>
          <small :title="item.hint">{{ item.hint }}</small>
        </div>
        <span class="metric-card__arrow" aria-hidden="true">
          <ArtSvgIcon icon="ri:arrow-right-up-line" />
        </span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
  import type { DashboardMetric } from './types'

  defineProps<{ items: DashboardMetric[] }>()
  const emit = defineEmits<{ select: [route: string] }>()
</script>

<style scoped lang="scss">
  .dashboard-overview {
    display: grid;
    gap: 12px;
    min-width: 0;
    container-type: inline-size;

    &__header {
      display: flex;
      gap: 16px;
      align-items: flex-end;
      justify-content: space-between;
      padding: 0 2px;

      > div {
        min-width: 0;
      }

      p {
        margin: 0 0 3px;
        font-size: 10px;
        font-weight: 700;
        color: var(--theme-color);
        letter-spacing: 0.1em;
      }

      h2 {
        margin: 0;
        font-size: 17px;
        line-height: 1.35;
        color: var(--el-text-color-primary);
      }

      > span {
        display: inline-flex;
        flex: 0 0 auto;
        gap: 5px;
        align-items: center;
        padding-bottom: 2px;
        font-size: 11px;
        color: var(--el-text-color-placeholder);
      }
    }
  }

  .metric-cards {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 12px;
    min-width: 0;
  }

  .metric-card {
    --metric-color: var(--theme-color);

    position: relative;
    display: flex;
    gap: 13px;
    align-items: center;
    min-width: 0;
    min-height: 102px;
    padding: 17px 16px;
    overflow: hidden;
    font: inherit;
    text-align: left;
    touch-action: manipulation;
    cursor: pointer;
    background:
      radial-gradient(
        circle at 100% 0%,
        color-mix(in srgb, var(--metric-color) 8%, transparent),
        transparent 42%
      ),
      var(--default-box-color);
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;

    &--warning {
      --metric-color: var(--el-color-warning);
    }

    &--success {
      --metric-color: var(--el-color-success);
    }

    &--danger {
      --metric-color: var(--el-color-danger);
    }

    &--info {
      --metric-color: var(--el-color-info);
    }

    &:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
      outline-offset: 2px;
    }

    &:hover .metric-card__arrow,
    &:focus-visible .metric-card__arrow {
      color: var(--metric-color);
      opacity: 1;
      transform: translate(2px, -2px);
    }

    &__icon {
      display: inline-flex;
      flex: 0 0 42px;
      align-items: center;
      justify-content: center;
      width: 42px;
      height: 42px;
      font-size: 19px;
      color: var(--metric-color);
      background: color-mix(in srgb, var(--metric-color) 12%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);
    }

    &__copy {
      display: grid;
      gap: 3px;
      min-width: 0;

      p,
      small {
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: clamp(19px, 1.35vw, 23px);
        line-height: 1.25;
        color: var(--el-text-color-primary);
        white-space: nowrap;

        em {
          font-size: 12px;
          font-style: normal;
          font-weight: 500;
          color: var(--el-text-color-placeholder);
        }
      }

      small {
        line-height: 1.35;
        color: var(--el-text-color-placeholder);
        overflow-wrap: anywhere;
        white-space: normal;
      }
    }

    &__arrow {
      position: absolute;
      top: 13px;
      right: 13px;
      font-size: 15px;
      color: var(--el-text-color-placeholder);
      opacity: 0.45;
      transition:
        color 0.18s ease,
        opacity 0.18s ease,
        transform 0.18s ease;
    }
  }

  :global([data-box-mode='border-mode'] .metric-card:hover),
  :global([data-box-mode='border-mode'] .metric-card:focus-visible) {
    background-color: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
    border-color: color-mix(in srgb, var(--theme-color) 28%, var(--el-border-color-lighter));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 8%, transparent);
    transform: translateY(-2px);
  }

  :global([data-box-mode='shadow-mode'] .metric-card:hover),
  :global([data-box-mode='shadow-mode'] .metric-card:focus-visible) {
    background-color: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
    border-color: transparent;
    box-shadow: 0 12px 28px color-mix(in srgb, var(--theme-color) 14%, transparent);
    transform: translateY(-2px);
  }

  @container (width <= 1100px) {
    .metric-cards {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (width <= 620px) {
    .metric-cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-overview__header > span {
      display: none;
    }

    .metric-card {
      gap: 10px;
      min-height: 82px;
      padding: 12px;

      &__icon {
        flex-basis: 36px;
        width: 36px;
        height: 36px;
        font-size: 17px;
      }

      &__copy {
        gap: 1px;

        strong {
          font-size: 19px;
        }

        small {
          display: none;
        }
      }

      &__arrow {
        top: 8px;
        right: 8px;
      }
    }
  }

  @container (width <= 320px) {
    .metric-cards {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .metric-card,
    .metric-card__arrow {
      transition: none;
    }
  }
</style>
