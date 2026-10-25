<template>
  <div class="art-empty-state" :class="`art-empty-state--${size}`" role="status" aria-live="polite">
    <div
      class="art-empty-state__visual"
      :style="{
        width: `${resolvedVisualSize}px`,
        height: `${Math.round(resolvedVisualSize * 0.72)}px`
      }"
      aria-hidden="true"
    >
      <svg viewBox="0 0 160 116" width="160" height="116" fill="none">
        <ellipse class="art-empty-state__halo" cx="80" cy="58" rx="64" ry="48" />
        <path class="art-empty-state__orbit" d="M22 72C43 96 112 102 140 62" />
        <circle class="art-empty-state__dot is-left" cx="25" cy="73" r="4" />
        <circle class="art-empty-state__dot is-right" cx="139" cy="61" r="4" />
        <rect class="art-empty-state__card is-back" x="47" y="25" width="72" height="58" rx="9" />
        <rect class="art-empty-state__card is-front" x="37" y="35" width="72" height="58" rx="9" />
        <rect class="art-empty-state__icon-bg" x="49" y="47" width="22" height="22" rx="6" />
        <path class="art-empty-state__icon-line" d="M55 58.5L59 62L66 54" />
        <path class="art-empty-state__content-line" d="M79 50H97" />
        <path class="art-empty-state__content-line is-short" d="M79 59H93" />
        <path class="art-empty-state__content-line is-muted" d="M49 78H93" />
        <circle class="art-empty-state__search" cx="112" cy="80" r="15" />
        <path class="art-empty-state__search-handle" d="M123 91L133 101" />
        <path class="art-empty-state__spark" d="M127 29V38M122.5 33.5H131.5" />
      </svg>
    </div>

    <div class="art-empty-state__copy">
      <strong>{{ title }}</strong>
      <p v-if="description">{{ description }}</p>
    </div>

    <div v-if="$slots.default" class="art-empty-state__action">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
  defineOptions({ name: 'ArtEmptyState' })

  const props = withDefaults(
    defineProps<{
      title?: string
      description?: string
      size?: 'compact' | 'default' | 'large'
      visualSize?: number
    }>(),
    {
      title: '暂无数据',
      description: '',
      size: 'default',
      visualSize: 112
    }
  )

  const resolvedVisualSize = computed(() => props.visualSize ?? 112)
</script>

<style scoped lang="scss">
  .art-empty-state {
    display: grid;
    gap: 12px;
    place-items: center;
    align-content: center;
    min-width: 0;
    padding: var(--art-space-5) var(--art-section-padding);
    text-align: center;

    &__visual {
      display: grid;
      place-items: center;
      max-width: 100%;

      svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
    }

    &__halo {
      opacity: 0.72;
      fill: var(--el-color-primary-light-9);
    }

    &__orbit {
      stroke: var(--el-border-color-light);
      stroke-linecap: round;
      stroke-dasharray: 4 6;
    }

    &__dot {
      fill: var(--el-color-primary-light-5);

      &.is-right {
        fill: var(--el-color-success-light-5);
      }
    }

    &__card {
      stroke: var(--el-border-color-lighter);

      &.is-back {
        fill: var(--el-fill-color-light);
      }

      &.is-front {
        filter: drop-shadow(0 8px 14px rgb(31 45 61 / 10%));
        fill: var(--el-bg-color);
      }
    }

    &__icon-bg {
      fill: var(--el-color-primary-light-9);
    }

    &__icon-line,
    &__content-line,
    &__search,
    &__search-handle,
    &__spark {
      stroke: var(--el-color-primary);
      stroke-width: 2.4;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    &__content-line {
      opacity: 0.72;

      &.is-short {
        opacity: 0.4;
      }

      &.is-muted {
        opacity: 0.7;
        stroke: var(--el-border-color);
      }
    }

    &__search {
      filter: drop-shadow(0 7px 12px rgb(31 45 61 / 12%));
      fill: var(--el-bg-color);
    }

    &__search-handle {
      stroke-width: 3;
    }

    &__spark {
      opacity: 0.6;
    }

    &__copy {
      display: grid;
      gap: 5px;
      max-width: 420px;

      strong {
        font-size: 14px;
        font-weight: 600;
        line-height: 1.5;
        color: var(--el-text-color-primary);
        text-wrap: balance;
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
        text-wrap: pretty;
      }
    }

    &__action {
      margin-top: 2px;
    }

    &--compact {
      gap: var(--art-space-2);
      padding: var(--art-space-4) var(--art-space-3);

      .art-empty-state__copy strong {
        font-size: 12px;
      }

      .art-empty-state__copy p {
        font-size: 11px;
      }
    }

    &--large {
      gap: var(--art-space-4);
      padding: var(--art-space-6) var(--art-space-5);

      .art-empty-state__copy strong {
        font-size: var(--art-font-size-section-title);
      }
    }
  }

  :global(html.dark .art-empty-state__halo) {
    opacity: 0.9;
    fill: color-mix(in srgb, var(--el-color-primary) 18%, var(--default-box-color));
  }

  :global(html.dark .art-empty-state__card.is-back) {
    fill: var(--el-fill-color);
    stroke: var(--el-border-color);
  }

  :global(html.dark .art-empty-state__card.is-front),
  :global(html.dark .art-empty-state__search) {
    filter: drop-shadow(0 8px 16px rgb(0 0 0 / 28%));
    fill: var(--art-gray-300);
  }

  :global(html.dark .art-empty-state__card.is-front) {
    stroke: var(--art-gray-500);
  }

  :global(html.dark .art-empty-state__icon-bg) {
    fill: var(--el-color-primary-light-7);
  }

  :global(html.dark .art-empty-state__dot) {
    opacity: 0.72;
  }
</style>
