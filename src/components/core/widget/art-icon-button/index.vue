<!-- 按钮组件 -->
<template>
  <button
    v-auth="permission"
    type="button"
    class="art-icon-button inline-flex flex-cc c-p border-0 bg-transparent text-g-600 dark:text-g-800 rounded tad-300 hover:bg-hover-color"
    :class="[
      `art-icon-button--${tone}`,
      `art-icon-button--${variant}`,
      size === 'small' ? 'size-6.5 text-base' : 'size-8.5 text-xl',
      { 'art-icon-button--loading': loading }
    ]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    :aria-label="label"
    :title="label"
    @click="handleClick"
  >
    <slot name="icon"><ArtSvgIcon :icon="icon" /></slot>
    <slot></slot>
  </button>
</template>

<script lang="ts" setup>
  defineOptions({ name: 'ArtIconButton' })

  interface Props {
    /** 图标名称 */
    icon?: string
    /** 是否禁用 */
    disabled?: boolean
    /** 是否处于加载状态；加载时保留动作含义并旋转图标 */
    loading?: boolean
    tone?: 'theme' | 'danger'
    variant?: 'ghost' | 'solid'
    /** 按钮尺寸；small 为 26px，默认保持 34px */
    size?: 'default' | 'small'
    permission?: string
    /** 按钮动作名称，用于无障碍文本和悬停提示 */
    label: string
  }

  const props = withDefaults(defineProps<Props>(), {
    tone: 'theme',
    variant: 'ghost',
    size: 'default'
  })

  const emit = defineEmits<{
    (e: 'click', event: MouseEvent): void
  }>()

  const handleClick = (event: MouseEvent): void => {
    if (props.disabled || props.loading) return
    emit('click', event)
  }
</script>

<style scoped lang="scss">
  button {
    --art-action-color: var(--theme-color);

    touch-action: manipulation;
    transition:
      color var(--art-motion-duration-fast) ease,
      background-color var(--art-motion-duration-fast) ease,
      box-shadow var(--art-motion-duration-fast) ease;

    &.art-icon-button--danger {
      --art-action-color: var(--el-color-danger);
    }

    &:not(:disabled):hover {
      color: var(--art-action-color);
      background-color: color-mix(in srgb, var(--art-action-color) 10%, transparent);
      box-shadow: var(--art-themed-action-hover-shadow);
    }

    &:not(:disabled):active {
      background-color: color-mix(in srgb, var(--art-action-color) 16%, transparent);
      box-shadow: var(--art-themed-action-active-shadow);
    }

    &:focus-visible {
      color: var(--art-action-color);
      outline: none;
      background-color: color-mix(in srgb, var(--art-action-color) 9%, transparent);
      box-shadow: var(--art-themed-action-focus-shadow);
    }

    &:disabled:not(.art-icon-button--loading) {
      cursor: not-allowed;
      opacity: 0.55;
    }

    &.art-icon-button--loading {
      color: var(--art-action-color);
      cursor: progress;
      background-color: color-mix(in srgb, var(--art-action-color) 10%, transparent);
    }

    &.art-icon-button--loading :deep(svg) {
      animation: art-icon-button-spin 0.8s linear infinite;
    }

    &.art-icon-button--solid {
      color: var(--el-color-white);
      background-color: var(--art-action-color);
      box-shadow: 0 6px 14px color-mix(in srgb, var(--art-action-color) 24%, transparent);

      &:not(:disabled):hover {
        color: var(--el-color-white);
        background-color: color-mix(in srgb, var(--art-action-color) 88%, black);
      }

      &:not(:disabled):active,
      &.art-icon-button--loading {
        color: var(--el-color-white);
        background-color: color-mix(in srgb, var(--art-action-color) 82%, black);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      &.art-icon-button--loading :deep(svg) {
        animation: none;
      }
    }
  }

  @keyframes art-icon-button-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
