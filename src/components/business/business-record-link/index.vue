<template>
  <div class="business-record-link" :class="{ 'is-compact': compact }">
    <div class="business-record-link__primary">
      <RouterLink
        v-if="to"
        class="business-record-link__control"
        :to="to"
        :title="title || `查看${label}详情`"
      >
        <span class="min-w-0 truncate">{{ label }}</span>
      </RouterLink>
      <button
        v-else-if="interactive"
        type="button"
        class="business-record-link__control"
        :title="title || `查看${label}详情`"
        @click="emit('click')"
      >
        <span class="min-w-0 truncate">{{ label }}</span>
      </button>
      <strong v-else class="business-record-link__static" :title="title || label">
        <span class="min-w-0 truncate">{{ label }}</span>
      </strong>
      <span v-if="meta" class="business-record-link__meta" :title="meta">{{ meta }}</span>
    </div>
    <small v-if="description" :title="description">{{ description }}</small>
  </div>
</template>

<script setup lang="ts">
  import type { RouteLocationRaw } from 'vue-router'

  defineOptions({ name: 'BusinessRecordLink' })

  withDefaults(
    defineProps<{
      label: string
      meta?: string
      description?: string
      title?: string
      to?: RouteLocationRaw
      interactive?: boolean
      compact?: boolean
    }>(),
    {
      meta: '',
      description: '',
      title: '',
      to: undefined,
      interactive: false,
      compact: false
    }
  )

  const emit = defineEmits<{ click: [] }>()
</script>

<style scoped lang="scss">
  .business-record-link {
    display: grid;
    gap: 4px;
    min-width: 0;

    &__primary {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 8px;
      align-items: center;
      min-width: 0;
    }

    &__control,
    &__static {
      display: inline-flex;
      align-items: center;
      max-width: 100%;
      min-height: 24px;
      padding: 1px 8px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 700;
      line-height: 20px;
      white-space: nowrap;
      border-radius: var(--el-border-radius-small);
    }

    &__control {
      color: color-mix(in srgb, var(--theme-color) 85%, var(--el-text-color-primary));
      text-decoration: none;
      cursor: pointer;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-7);
      transition:
        color var(--art-duration-fast),
        background-color var(--art-duration-fast),
        border-color var(--art-duration-fast);

      &:hover {
        color: color-mix(in srgb, var(--theme-color) 75%, var(--el-text-color-primary));
        background: var(--el-color-primary-light-8);
        border-color: var(--el-color-primary-light-5);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }

    &__control:is(button) {
      font: inherit;
      font-weight: 700;
    }

    &__static {
      padding-inline: 0;
      color: var(--el-text-color-primary);
    }

    &__meta,
    > small {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--art-gray-600);
      white-space: nowrap;
    }

    &.is-compact {
      gap: 2px;

      .business-record-link__control,
      .business-record-link__static {
        min-height: 22px;
        line-height: 18px;
      }
    }
  }
</style>
