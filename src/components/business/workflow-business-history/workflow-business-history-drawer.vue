<template>
  <ArtDrawer
    :loading="loading"
    loading-text="正在加载审批历程…"
    ref="drawerRef"
    :show-footer="false"
    show-fullscreen-button
  >
    <template #header>
      <div class="workflow-history-drawer__header">
        <span><ArtSvgIcon icon="ri:file-history-line" /></span>
        <div>
          <strong>审批历程</strong>
          <small>{{ target.businessTitle || '查看业务的全部审批轮次' }}</small>
        </div>
      </div>
    </template>

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
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
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
      size: 'xl',
      contentHeight: 'calc(100vh - 86px)',
      scrollbarAlways: true
    })
  }

  defineExpose<WorkflowBusinessHistoryDrawerExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  .workflow-history-drawer__header {
    display: flex;
    gap: 11px;
    align-items: center;
    min-width: 0;

    > span {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 20px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--el-bg-color));
      border-radius: var(--el-border-radius-base);
    }

    > div {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    strong,
    small {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      color: var(--el-text-color-primary);
    }

    small {
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }
  }
</style>
