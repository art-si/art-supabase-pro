<template>
  <div class="screen-refresh-notice" role="alert">
    <ArtSvgIcon icon="ri:alert-line" aria-hidden="true" />
    <span>数据更新失败，当前显示 {{ updatedAt }} 的上次成功结果。</span>
    <button type="button" :disabled="loading" @click="emit('retry')">重新加载</button>
  </div>
</template>

<script setup lang="ts">
  defineProps<{ updatedAt: string; loading: boolean }>()
  const emit = defineEmits<{ retry: [] }>()
</script>

<style scoped lang="scss">
  .screen-refresh-notice {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
    min-height: 36px;
    padding: 7px 12px;
    font-size: 12px;
    color: var(--screen-text-strong);
    background: color-mix(in srgb, var(--screen-warning) 12%, var(--screen-bg));
    border: 1px solid color-mix(in srgb, var(--screen-warning) 42%, transparent);
    border-radius: var(--art-control-radius);

    > :first-child {
      flex: none;
      color: var(--screen-warning);
    }

    span {
      min-width: 0;
    }

    button {
      flex: none;
      min-height: 28px;
      padding: 0 8px;
      margin-left: auto;
      font: inherit;
      font-weight: 600;
      color: var(--screen-text-strong);
      cursor: pointer;
      background: transparent;
      border: 1px solid currentcolor;
      border-radius: var(--art-control-radius);
    }

    button:focus-visible {
      outline: 2px solid var(--screen-warning);
      outline-offset: 2px;
    }

    button:disabled {
      cursor: wait;
      opacity: 0.6;
    }
  }

  @media (width <= 640px) {
    .screen-refresh-notice {
      flex-wrap: wrap;
    }
  }
</style>
