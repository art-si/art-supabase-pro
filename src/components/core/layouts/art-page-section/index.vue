<template>
  <section class="art-page-section" :class="{ 'has-header': hasHeader }">
    <div v-if="hasHeader" class="art-page-section__header">
      <div class="art-page-section__identity">
        <ArtSectionTitle :show-line="false" :show-marker="showMarker">{{ title }}</ArtSectionTitle>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="art-page-section__actions">
        <slot name="actions" />
      </div>
    </div>
    <div class="art-page-section__body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'

  defineOptions({ name: 'ArtPageSection' })

  const props = withDefaults(
    defineProps<{
      title?: string
      subtitle?: string
      showMarker?: boolean
    }>(),
    {
      title: '',
      subtitle: '',
      showMarker: true
    }
  )

  const slots = useSlots()
  const hasHeader = computed(() => Boolean(props.title || props.subtitle || slots.actions))
</script>

<style scoped lang="scss">
  .art-page-section {
    min-width: 0;

    &__header {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2) var(--art-space-3);
      align-items: flex-start;
      justify-content: space-between;
      min-width: 0;
      margin-bottom: var(--art-space-4);
    }

    &__identity {
      flex: 1 1 120px;
      min-width: 0;

      :deep(.art-section-title) {
        margin: 0;
        font-size: var(--art-font-size-section-title);
      }

      p {
        margin: var(--art-space-1) 0 0 11px;
        font-size: var(--art-font-size-caption);
        line-height: 20px;
        color: var(--el-text-color-secondary);
      }
    }

    &__actions {
      display: flex;
      flex: none;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      align-items: center;
      justify-content: flex-end;
      max-width: 100%;
    }

    &__body {
      min-width: 0;
    }
  }
</style>
