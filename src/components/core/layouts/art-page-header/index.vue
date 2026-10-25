<template>
  <header class="art-page-header art-card-xs" :class="{ 'has-back': showBack }">
    <ArtIconButton
      v-if="showBack"
      class="art-page-header__back"
      icon="ri:arrow-left-line"
      label="返回"
      @click="emit('back')"
    />

    <div class="art-page-header__identity">
      <div class="art-page-header__title-row">
        <slot name="title">
          <h1>{{ title }}</h1>
        </slot>
        <slot name="status" />
      </div>
      <p v-if="subtitle || $slots.subtitle" class="art-page-header__subtitle">
        <slot name="subtitle">{{ subtitle }}</slot>
      </p>
      <div v-if="$slots.meta" class="art-page-header__meta">
        <slot name="meta" />
      </div>
    </div>

    <div v-if="$slots.default" class="art-page-header__actions">
      <slot />
    </div>
  </header>
</template>

<script setup lang="ts">
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'

  defineOptions({ name: 'ArtPageHeader' })

  withDefaults(
    defineProps<{
      title: string
      subtitle?: string
      showBack?: boolean
    }>(),
    {
      subtitle: '',
      showBack: false
    }
  )

  const emit = defineEmits<{ back: [] }>()
</script>

<style scoped lang="scss">
  .art-page-header {
    display: flex;
    flex-wrap: wrap;
    gap: var(--art-space-3);
    align-items: center;
    min-width: 0;
    padding: var(--art-section-padding);

    &__back {
      flex: none;
      font-size: 18px;
    }

    &__identity {
      flex: 1 1 320px;
      min-width: 0;
    }

    &__title-row {
      display: flex;
      gap: var(--art-space-2);
      align-items: center;
      min-width: 0;

      h1 {
        min-width: 0;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: var(--art-font-size-page-title);
        font-weight: 650;
        line-height: var(--art-line-height-title);
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__subtitle,
    &__meta {
      margin: var(--art-space-1) 0 0;
      font-size: var(--art-font-size-body);
      line-height: var(--art-line-height-body);
      color: var(--el-text-color-secondary);
    }

    &__actions {
      display: flex;
      flex: 0 1 auto;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: flex-end;
    }

    @media (width <= 640px) {
      flex-wrap: wrap;
      align-items: flex-start;
      padding: var(--art-space-4);

      &__actions {
        flex-wrap: wrap;
        justify-content: flex-start;
        width: 100%;
        padding-left: 44px;
      }

      &:not(.has-back) &__actions {
        padding-left: 0;
      }
    }
  }
</style>
