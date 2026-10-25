<template>
  <div
    class="screen-stage-chart"
    role="img"
    :aria-label="`阶段分布：${items.map((item) => `${item.label} ${item.value}${unit}`).join('，')}`"
    :style="{ '--stage-accent': `var(${accentVar})`, '--stage-count': Math.max(1, items.length) }"
  >
    <div
      v-for="(item, index) in items"
      :key="item.label"
      class="screen-stage-chart__item"
      :class="{ 'has-value': item.value > 0 }"
    >
      <span class="screen-stage-chart__step">{{ String(index + 1).padStart(2, '0') }}</span>
      <strong
        >{{ item.value }}<em>{{ unit }}</em></strong
      >
      <span class="screen-stage-chart__label">{{ item.label }}</span>
      <small v-if="item.caption">{{ item.caption }}</small>
      <i><b :style="{ width: `${Math.max(0, (item.value / maxValue) * 100)}%` }" /></i>
    </div>
  </div>
</template>

<script setup lang="ts">
  export interface ScreenStageChartItem {
    label: string
    value: number
    caption?: string
  }

  interface Props {
    items: ScreenStageChartItem[]
    unit?: string
    accentVar?: string
  }

  const props = withDefaults(defineProps<Props>(), {
    unit: '单',
    accentVar: '--screen-accent'
  })
  const maxValue = computed(() => Math.max(1, ...props.items.map((item) => item.value)))
</script>

<style scoped lang="scss">
  .screen-stage-chart {
    display: grid;
    grid-template-columns: repeat(var(--stage-count, 5), minmax(0, 1fr));
    align-items: stretch;
    width: 100%;
    height: 100%;
    min-height: 0;

    &__item {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      padding: 10px 14px;
      border-right: 1px solid var(--screen-line);

      &:last-child {
        border-right: 0;
      }

      &::before {
        position: absolute;
        top: 22px;
        right: -4px;
        z-index: 1;
        width: 7px;
        height: 7px;
        content: '';
        background: var(--screen-surface);
        border-top: 1px solid var(--screen-line-strong);
        border-right: 1px solid var(--screen-line-strong);
        transform: rotate(45deg);
      }

      &:last-child::before {
        display: none;
      }

      &.has-value strong {
        color: var(--screen-text-strong);
      }
    }

    &__step {
      margin-bottom: 14px;
      font-size: 11px;
      font-weight: 700;
      color: var(--screen-accent-soft);
      letter-spacing: 1px;
    }

    strong {
      font-size: clamp(22px, 1.8vw, 34px);
      line-height: 1;
      color: var(--screen-text-muted);
    }

    em {
      margin-left: 3px;
      font-size: 12px;
      font-style: normal;
      font-weight: 500;
      color: var(--screen-text-muted);
    }

    &__label {
      margin-top: 12px;
      font-size: 13px;
      font-weight: 650;
      color: var(--screen-text-strong);
    }

    small {
      margin-top: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--screen-text-muted);
      white-space: nowrap;
    }

    i {
      display: block;
      width: 100%;
      height: 4px;
      margin-top: 16px;
      overflow: hidden;
      background: var(--screen-chart-track);
      border-radius: 3px;
    }

    b {
      display: block;
      height: 100%;
      background: var(--stage-accent);
      border-radius: inherit;
    }
  }

  @media (width <= 640px) {
    .screen-stage-chart {
      min-width: 560px;
    }
  }
</style>
