<template>
  <div
    class="art-entity-summary"
    :class="{
      'art-entity-summary--compact': compact,
      'art-entity-summary--spaced': spaced
    }"
    role="group"
    :aria-label="ariaLabel || title || undefined"
  >
    <span v-if="icon || $slots.icon" class="art-entity-summary__icon" aria-hidden="true">
      <slot name="icon">
        <ArtSvgIcon :icon="icon" />
      </slot>
    </span>

    <div class="art-entity-summary__content">
      <slot>
        <small v-if="eyebrow">{{ eyebrow }}</small>
        <strong>{{ title }}</strong>
        <p v-if="description">{{ description }}</p>
      </slot>
    </div>

    <div v-if="$slots.aside" class="art-entity-summary__aside">
      <slot name="aside" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  defineOptions({ name: 'ArtEntitySummary' })

  withDefaults(
    defineProps<{
      title?: string
      description?: string
      eyebrow?: string
      icon?: string
      ariaLabel?: string
      compact?: boolean
      spaced?: boolean
    }>(),
    {
      title: '',
      description: '',
      eyebrow: '',
      icon: '',
      ariaLabel: '',
      compact: false,
      spaced: false
    }
  )
</script>

<style scoped lang="scss">
  .art-entity-summary {
    display: grid;
    grid-template-columns: 44px minmax(0, 1fr) auto;
    gap: var(--art-space-3);
    align-items: center;
    min-width: 0;
    padding: var(--art-space-3) var(--art-space-4);
    background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
    border: 1px solid color-mix(in srgb, var(--theme-color) 16%, var(--art-card-border));
    border-radius: var(--art-control-radius);

    &__icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      font-size: 20px;
      color: var(--theme-color);
      background: var(--default-box-color);
      border: 1px solid color-mix(in srgb, var(--theme-color) 10%, var(--art-card-border));
      border-radius: var(--art-control-radius);
    }

    &__content {
      min-width: 0;

      :deep(small),
      :deep(strong),
      :deep(p) {
        display: block;
        margin: 0;
      }

      :deep(small) {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        font-weight: 700;
        line-height: 16px;
        color: var(--theme-color);
        letter-spacing: 0.08em;
        white-space: nowrap;
      }

      :deep(strong) {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 14px;
        line-height: 22px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      :deep(p) {
        margin-top: 1px;
        font-size: 12px;
        line-height: 19px;
        color: var(--el-text-color-secondary);
        overflow-wrap: anywhere;
        white-space: normal;
      }
    }

    &__aside {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 0;
    }

    &--compact {
      grid-template-columns: 38px minmax(0, 1fr) auto;
      padding: var(--art-space-2) var(--art-space-3);

      .art-entity-summary__icon {
        width: 38px;
        height: 38px;
        font-size: 18px;
      }
    }

    &--spaced {
      margin-bottom: var(--art-space-4);
    }

    @media (width <= 720px) {
      grid-template-columns: 40px minmax(0, 1fr);

      &__icon {
        width: 40px;
        height: 40px;
      }

      &__aside {
        grid-column: 1 / -1;
      }
    }
  }

  :global(html[data-box-mode='border-mode'] .art-entity-summary) {
    box-shadow: none;
  }

  :global(html[data-box-mode='shadow-mode'] .art-entity-summary) {
    border-color: transparent;
    box-shadow: var(--art-card-shadow-xs);
  }
</style>
