<template>
  <div class="recognition-page-hero" :class="{ 'is-motion-ready': motionReady }">
    <BusinessWorkspaceHeader
      eyebrow="INTELLIGENT DOCUMENT HUB"
      :title="title"
      :description="subtitle"
      icon="ri:scan-2-line"
      :tags="[{ label: '人工复核闭环', type: 'success', effect: 'plain' }]"
      :metrics="workspaceMetrics"
    >
      <template v-if="$slots.action" #actions><slot name="action" /></template>
    </BusinessWorkspaceHeader>
    <Transition name="recognition-overview-alert">
      <ElAlert
        v-if="error"
        class="recognition-page-hero__alert"
        title="识别概览暂时无法更新，任务列表仍可正常使用。"
        type="warning"
        :closable="false"
        show-icon
      >
        <template #default>
          <ElButton link type="warning" :loading="loading" @click="emit('retry')">
            重新加载概览
          </ElButton>
        </template>
      </ElAlert>
    </Transition>
  </div>
</template>

<script setup lang="ts">
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric
  } from '@/components/business/business-workspace-header/index.vue'

  interface MetricItem {
    label: string
    value: string | number
    note: string
    icon?: string
    tone?: BusinessWorkspaceMetric['tone']
  }

  const props = withDefaults(
    defineProps<{
      title: string
      subtitle: string
      metrics: MetricItem[]
      loading?: boolean
      error?: Error | null
    }>(),
    { loading: false, error: null }
  )
  const emit = defineEmits<{ retry: [] }>()
  const motionReady = ref(false)
  const metricIcons = ['ri:file-search-line', 'ri:checkbox-circle-line', 'ri:time-line']
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() =>
    props.metrics.map((item, index) => ({
      label: item.label,
      value: item.value,
      description: item.note,
      icon: item.icon ?? metricIcons[index % metricIcons.length],
      tone: item.tone ?? (index === 1 ? 'success' : index === 2 ? 'warning' : 'primary'),
      loading: props.loading
    }))
  )

  onMounted(async () => {
    await nextTick()
    motionReady.value = true
  })
</script>

<style scoped lang="scss">
  .recognition-page-hero {
    flex: 0 0 auto;
    min-width: 0;

    &.is-motion-ready {
      animation: recognition-page-hero-in var(--art-motion-duration-slow) var(--art-motion-ease-out)
        backwards;
    }

    &__alert {
      margin-top: 8px;

      :deep(.el-alert__content) {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
        align-items: center;
      }
    }
  }

  .recognition-overview-alert-enter-active {
    transition:
      opacity var(--art-motion-duration-base) var(--art-motion-ease-out),
      transform var(--art-motion-duration-base) var(--art-motion-ease-out);
  }

  .recognition-overview-alert-leave-active {
    transition:
      opacity var(--art-motion-duration-fast) var(--art-motion-ease-in),
      transform var(--art-motion-duration-fast) var(--art-motion-ease-in);
  }

  .recognition-overview-alert-enter-from,
  .recognition-overview-alert-leave-to {
    opacity: 0;
    transform: translate3d(0, -8px, 0) scale(0.99);
  }

  @keyframes recognition-page-hero-in {
    from {
      opacity: 0;
      transform: translate3d(-12px, 0, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .recognition-page-hero.is-motion-ready {
      animation: recognition-page-hero-fade var(--art-motion-duration-fast) ease-out backwards;
    }

    .recognition-overview-alert-enter-active,
    .recognition-overview-alert-leave-active {
      transition: opacity var(--art-motion-duration-fast) ease-out;
    }

    .recognition-overview-alert-enter-from,
    .recognition-overview-alert-leave-to {
      transform: none;
    }
  }

  @keyframes recognition-page-hero-fade {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }
</style>
