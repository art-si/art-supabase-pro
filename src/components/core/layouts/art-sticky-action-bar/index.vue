<template>
  <footer class="art-sticky-action-bar art-card-xs" :class="{ 'is-embedded': embedded }">
    <div v-if="$slots.summary || hint" class="art-sticky-action-bar__summary">
      <slot name="summary">
        <span class="art-sticky-action-bar__hint">
          <ArtSvgIcon :icon="hintIcon" aria-hidden="true" />
          <span>{{ hint }}</span>
        </span>
      </slot>
    </div>
    <div class="art-sticky-action-bar__actions">
      <slot />
    </div>
  </footer>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  defineOptions({ name: 'ArtStickyActionBar' })

  withDefaults(
    defineProps<{
      hint?: string
      hintIcon?: string
      /** Render as the bounded footer of an existing workspace surface. */
      embedded?: boolean
    }>(),
    {
      hint: '',
      hintIcon: 'ri:information-line',
      embedded: false
    }
  )
</script>

<style scoped lang="scss">
  .art-sticky-action-bar {
    position: sticky;
    bottom: var(--art-sticky-offset);
    z-index: 20;
    display: flex;
    gap: var(--art-space-4);
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: var(--art-space-3) var(--art-section-padding);
    border-color: color-mix(
      in srgb,
      var(--el-color-primary) 12%,
      var(--art-card-border)
    ) !important;
    box-shadow: 0 8px 28px rgb(0 0 0 / 10%) !important;
    backdrop-filter: blur(12px);

    &.is-embedded {
      position: static;
      z-index: auto;
      flex: none;
      min-height: 64px;
      padding: 12px 16px;
      border: 0 !important;
      border-top: 1px solid var(--el-border-color-lighter) !important;
      border-radius: 0;
      box-shadow: none !important;
      backdrop-filter: none;
    }

    &__summary {
      flex: 1;
      min-width: 0;
    }

    &__hint {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: center;
      font-size: 12px;
      line-height: 1.5;
      color: var(--el-text-color-secondary);

      :deep(svg) {
        flex: none;
        color: var(--theme-color);
      }
    }

    &__actions {
      display: flex;
      flex: none;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: flex-end;
      margin-left: auto;
    }

    @media (width <= 640px) {
      bottom: var(--art-space-2);
      flex-direction: column;
      align-items: stretch;
      padding: var(--art-space-3);

      &__actions {
        flex-wrap: wrap;
        justify-content: flex-end;
        width: 100%;
        margin-left: 0;
      }
    }
  }
</style>
