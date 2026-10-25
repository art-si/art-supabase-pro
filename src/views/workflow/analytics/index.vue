<template>
  <div class="workflow-analytics-page art-full-height">
    <ElScrollbar class="workflow-analytics-page__scrollbar">
      <div class="business-workspace-page">
        <BusinessWorkspaceHeader
          density="compact"
          title="审批效能"
          description="按统计周期查看审批结果、节点瓶颈与协作负载，定位需要改善的流程。"
          icon="ri:bar-chart-grouped-line"
          :tags="[{ label: '只读分析', type: 'info' }]"
        />
        <WorkflowAnalyticsPanel />
      </div>
    </ElScrollbar>
  </div>
</template>

<script setup lang="ts">
  import BusinessWorkspaceHeader from '@/components/business/business-workspace-header/index.vue'
  import WorkflowAnalyticsPanel from '../modules/workflow-analytics-panel.vue'

  defineOptions({ name: 'WorkflowAnalytics' })
</script>

<style scoped lang="scss">
  .workflow-analytics-page {
    min-height: 0;
    overflow: hidden;

    &__scrollbar {
      height: 100%;
    }
  }
</style>
