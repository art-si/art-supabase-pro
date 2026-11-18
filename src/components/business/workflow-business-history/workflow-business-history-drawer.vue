<template>
  <ArtDrawer
    :loading="loading"
    loading-text="正在加载审批历程…"
    ref="drawerRef"
    :show-footer="false"
    show-fullscreen-button
  >
    <WorkflowBusinessHistory
      v-if="target.businessType && target.businessId"
      :business-type="target.businessType"
      :business-id="target.businessId"
      :min-height="180"
      external-loading
      @loading-change="loading = $event"
    />
  </ArtDrawer>
</template>

<script setup lang="ts">
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import WorkflowBusinessHistory from './index.vue'
  import type { WorkflowBusinessHistoryDrawerExpose, WorkflowBusinessHistoryTarget } from './types'

  defineOptions({ name: 'WorkflowBusinessHistoryDrawer' })

  const loading = ref(false)
  const drawerRef = ref<ArtDrawerExpose<WorkflowBusinessHistoryTarget>>()
  const target = reactive<WorkflowBusinessHistoryTarget>({
    businessType: '',
    businessId: '',
    businessTitle: ''
  })

  async function handleOpen(openTarget: WorkflowBusinessHistoryTarget): Promise<void> {
    Object.assign(target, openTarget)
    await drawerRef.value?.handleOpen(openTarget, {
      title: '审批历程',
      headerIcon: 'ri:file-history-line',
      subtitle: openTarget.businessTitle || '查看业务的全部审批轮次',
      size: 'xl',
      contentHeight: 'calc(100vh - 86px)',
      scrollbarAlways: true
    })
  }

  defineExpose<WorkflowBusinessHistoryDrawerExpose>({ handleOpen })
</script>
