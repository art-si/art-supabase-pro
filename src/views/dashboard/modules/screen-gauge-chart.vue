<template>
  <div
    class="screen-gauge-chart"
    :class="`is-${tone}`"
    role="img"
    :aria-label="`${label} ${safeValue}${suffix}`"
  >
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <circle class="screen-gauge-chart__track" cx="60" cy="60" r="49" />
      <circle
        class="screen-gauge-chart__progress"
        cx="60"
        cy="60"
        r="49"
        pathLength="100"
        :stroke-dasharray="`${safeValue} 100`"
      />
    </svg>
    <div class="screen-gauge-chart__value">
      <strong
        >{{ safeValue }}<em>{{ suffix }}</em></strong
      >
      <span>{{ label }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  interface Props {
    value: number
    label: string
    suffix?: string
  }

  const props = withDefaults(defineProps<Props>(), { suffix: '分' })
  const safeValue = computed(() => Math.max(0, Math.min(100, Math.round(props.value))))
  const tone = computed(() => {
    if (safeValue.value >= 75) return 'healthy'
    if (safeValue.value >= 60) return 'warning'
    return 'danger'
  })
</script>

<style scoped lang="scss">
  .screen-gauge-chart {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-height: 0;
    color: var(--screen-accent);

    &.is-warning {
      color: var(--screen-warning);
    }

    &.is-danger {
      color: var(--screen-danger);
    }

    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
      transform: rotate(-90deg);
    }

    circle {
      fill: none;
      stroke-width: 8;
    }

    &__track {
      stroke: var(--screen-chart-track);
    }

    &__progress {
      stroke: currentcolor;
      stroke-linecap: round;
    }

    &__value {
      position: absolute;
      inset: 0;
      display: grid;
      gap: 3px;
      align-content: center;
      justify-items: center;
      text-align: center;

      strong {
        font-size: clamp(24px, 2vw, 38px);
        line-height: 1;
        color: var(--screen-text-strong);
      }

      em {
        margin-left: 2px;
        font-size: 12px;
        font-style: normal;
        font-weight: 500;
        color: var(--screen-text-muted);
      }

      span {
        max-width: 90%;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--screen-text-muted);
        white-space: nowrap;
      }
    }
  }
</style>
