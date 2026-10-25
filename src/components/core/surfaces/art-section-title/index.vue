<template>
  <div
    :class="[
      'art-section-title',
      {
        'art-section-title--with-line': showLine,
        'art-section-title--with-marker': showMarker,
        'art-section-title--with-actions': $slots.actions && (!collapsible || expanded)
      }
    ]"
  >
    <button
      v-if="showLabel && collapsible"
      type="button"
      class="art-section-title__toggle"
      :aria-expanded="expanded"
      :aria-label="`${expanded ? '收起' : '展开'}${accessibleLabel || '当前分区'}`"
      @click="emit('toggle')"
    >
      <span class="art-section-title__content">
        <slot>
          <component v-if="typeof title !== 'string'" :is="title" />
          <span v-else>{{ title }}</span>
        </slot>
      </span>
      <ArtSvgIcon
        class="art-section-title__toggle-icon"
        :icon="expanded ? 'ri:arrow-up-s-line' : 'ri:arrow-down-s-line'"
        aria-hidden="true"
      />
    </button>
    <template v-else-if="showLabel">
      <slot>
        <component v-if="typeof title !== 'string'" :is="title" />
        <span v-else>{{ title }}</span>
      </slot>
    </template>
    <div v-if="$slots.actions && (!collapsible || expanded)" class="art-section-title__actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { Component, VNodeChild } from 'vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  defineOptions({ name: 'ArtSectionTitle' })

  export type ArtSectionTitleContent = string | (() => VNodeChild) | Component

  withDefaults(
    defineProps<{
      title?: ArtSectionTitleContent
      showLine?: boolean
      showLabel?: boolean
      showMarker?: boolean
      collapsible?: boolean
      expanded?: boolean
      accessibleLabel?: string
    }>(),
    {
      title: '',
      showLine: true,
      showLabel: true,
      showMarker: true,
      collapsible: false,
      expanded: true,
      accessibleLabel: ''
    }
  )

  const emit = defineEmits<{
    toggle: []
  }>()
</script>

<style scoped lang="scss">
  .art-section-title {
    display: flex;
    align-items: center;
    width: 100%;
    margin: 4px 0 14px;
    font-weight: 600;
    line-height: 24px;
    color: var(--el-text-color-primary);

    &--with-marker::before {
      width: 3px;
      height: 14px;
      margin-right: 8px;
      content: '';
      background: var(--el-color-primary);
      border-radius: 999px;
    }

    &--with-line::after {
      flex: 1;
      height: 1px;
      margin-left: 12px;
      content: '';
      background: var(--el-border-color-lighter);
    }

    &--with-actions {
      flex-wrap: wrap;
      row-gap: var(--art-space-2);
    }

    &--with-actions::after {
      order: 1;
      min-width: 16px;
    }

    &__actions {
      display: inline-flex;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: flex-end;
      order: 2;
      min-width: 0;
      margin-left: auto;
    }

    &__actions :deep(.el-button + .el-button) {
      margin-left: 0;
    }

    &__toggle {
      display: inline-flex;
      gap: var(--art-space-2);
      align-items: center;
      min-width: 0;
      padding: 2px 4px;
      margin: -2px -4px;
      font: inherit;
      color: inherit;
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--art-control-radius-sm);
      transition:
        color var(--art-motion-duration-fast) ease,
        background-color var(--art-motion-duration-fast) ease;

      &:hover {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 8%, transparent);
      }

      &:focus-visible {
        color: var(--theme-color);
        outline: none;
        box-shadow: var(--art-themed-action-focus-shadow);
      }
    }

    &__content {
      display: inline-flex;
      min-width: 0;
    }

    &__toggle-icon {
      flex: none;
      font-size: 18px;
    }
  }
</style>
