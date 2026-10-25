<template>
  <div class="business-workspace-focus-toggle" :class="{ 'is-active': model }" :title="title">
    <span class="business-workspace-focus-toggle__label art-icon-label">
      <ArtSvgIcon :icon="model ? 'ri:focus-3-fill' : 'ri:focus-3-line'" />
      专注模式
    </span>
    <ElSwitch
      :model-value="model"
      size="small"
      inline-prompt
      active-text="开"
      inactive-text="关"
      :width="40"
      :aria-label="model ? '退出专注模式' : '进入专注模式'"
      @update:model-value="model = Boolean($event)"
    />
  </div>
</template>

<script setup lang="ts">
  defineOptions({ name: 'BusinessWorkspaceFocusToggle' })

  withDefaults(
    defineProps<{
      title?: string
    }>(),
    {
      title: '隐藏概览与辅助说明，只保留当前工作区；按 Esc 可退出'
    }
  )

  const model = defineModel<boolean>({ default: false })
</script>

<style scoped lang="scss">
  .business-workspace-focus-toggle {
    display: inline-flex;
    gap: 8px;
    align-items: center;
    min-height: 34px;
    padding: 4px 8px;
    color: var(--el-text-color-regular);
    white-space: nowrap;
    background: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
    border: 1px solid color-mix(in srgb, var(--theme-color) 12%, var(--el-border-color-lighter));
    border-radius: var(--el-border-radius-base);
    transition:
      color 0.18s ease,
      background-color 0.18s ease,
      border-color 0.18s ease;

    &.is-active {
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-color: color-mix(in srgb, var(--theme-color) 28%, var(--el-border-color));
    }

    &__label {
      font-size: 12px;
      font-weight: 600;
    }
  }
</style>
