<template>
  <header class="screen-panel-heading">
    <div class="screen-panel-heading__icon"><ArtSvgIcon :icon="icon" /></div>
    <div>
      <h2>{{ title }}</h2>
    </div>
    <div v-if="$slots.aside" class="screen-panel-heading__aside"><slot name="aside" /></div>
  </header>
</template>

<script setup lang="ts">
  defineProps<{ title: string; icon: string }>()
</script>

<style scoped lang="scss">
  .screen-panel-heading {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) auto;
    gap: 11px;
    align-items: center;
    min-width: 0;

    &__icon {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      font-size: 17px;
      color: var(--screen-accent-soft);
      background: color-mix(in srgb, var(--screen-accent) 13%, transparent);
      border: 1px solid color-mix(in srgb, var(--screen-accent) 22%, transparent);
      border-radius: var(--el-border-radius-small);
    }

    h2 {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: clamp(15px, 0.85vw, 19px);
      font-weight: 700;
      line-height: 1.2;
      color: var(--screen-text-strong);
      white-space: nowrap;
    }

    &__aside {
      min-width: 0;
    }
  }
</style>
