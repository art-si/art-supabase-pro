<template>
  <ArtSectionCard
    class="dashboard-trend"
    :loading="loading"
    :empty="data.orderCount === 0"
    empty-title="暂无订单趋势数据"
    empty-description="切换统计周期，或在开单后查看趋势。"
    :min-height="300"
    preserve-content-structure
  >
    <template #header>
      <header>
        <div><p>经营态势</p><h2>订单趋势</h2></div>
        <ElRadioGroup
          :model-value="period"
          size="small"
          aria-label="趋势统计周期"
          @update:model-value="onPeriodChange"
        >
          <ElRadioButton
            v-for="option in periodOptions"
            :key="option.value"
            :value="option.value"
            >{{ option.label }}</ElRadioButton
          >
        </ElRadioGroup>
      </header>
    </template>
    <div class="dashboard-trend__summary">
      <div
        ><span>期间订单</span><strong>{{ data.orderCount }} <em>单</em></strong></div
      >
      <i />
      <div
        ><span>开单运费</span><strong>{{ formatCurrencyValue(data.freightAmount) }}</strong></div
      >
    </div>
    <ArtLineChart
      height="230px"
      :data="data.values"
      :x-axis-data="data.labels"
      :show-area-color="true"
      :show-axis-line="false"
      :show-legend="false"
      :loading="loading"
    />
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { useDictionaryOptions } from '@/hooks/core/useDictionaryOptions'
  import type { DashboardTrendPeriod } from '@/api/dashboard'
  import { formatCurrencyValue } from '@/utils/ui'
  import type { DashboardTrendData } from './types'

  defineProps<{
    period: DashboardTrendPeriod
    data: DashboardTrendData
    loading: boolean
  }>()
  const emit = defineEmits<{ 'update:period': [period: DashboardTrendPeriod] }>()
  const configuredPeriodOptions = useDictionaryOptions('commonDashboardTrendPeriod')
  const periodOptions = computed(() =>
    configuredPeriodOptions.filter((option) =>
      ['today', 'week', 'month', 'year'].includes(option.value)
    )
  )
  function onPeriodChange(value: unknown): void {
    if (value === 'today' || value === 'week' || value === 'month' || value === 'year')
      emit('update:period', value)
  }
</script>

<style scoped lang="scss">
  .dashboard-trend {
    position: relative;
    min-width: 0;
    overflow: hidden;

    &.art-section-card {
      padding: 24px 26px 17px;
    }

    &::before {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      content: '';
      background: linear-gradient(
        90deg,
        var(--theme-color),
        var(--el-color-success),
        transparent 72%
      );
    }

    header {
      display: flex;
      flex-wrap: wrap;
      gap: 16px;
      align-items: center;
      justify-content: space-between;

      :deep(.el-radio-group) {
        padding: 3px;
        background: var(--el-fill-color-light);
        border: 1px solid color-mix(in srgb, var(--el-border-color-lighter) 72%, transparent);
        border-radius: 999px;
      }

      :deep(.el-radio-button__inner) {
        min-width: 48px;
        border: 0;
        border-radius: 999px !important;
        box-shadow: none;
        transition:
          color 0.18s ease,
          background-color 0.18s ease,
          box-shadow 0.18s ease;
      }

      :deep(.el-radio-button.is-active .el-radio-button__inner) {
        box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-color) 18%, transparent);
      }
    }

    p {
      margin: 0 0 5px;
      font-size: 11px;
      font-weight: 700;
      color: var(--el-color-primary);
      letter-spacing: 0.8px;
    }

    h2 {
      margin: 0;
      font-size: 18px;
      color: var(--el-text-color-primary);
    }

    &__summary {
      display: flex;
      gap: 24px;
      align-items: center;
      margin: 25px 0 1px;

      div {
        display: grid;
        gap: 5px;
      }

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 23px;
        line-height: 1.1;
        color: var(--el-text-color-primary);
      }

      em {
        font-size: 12px;
        font-style: normal;
        font-weight: 500;
        color: var(--el-text-color-placeholder);
      }

      > i {
        width: 1px;
        height: 34px;
        background: var(--el-border-color-lighter);
      }
    }

    @media screen and (width <= 560px) {
      &.art-section-card {
        padding: 21px 18px 13px;
      }

      header {
        align-items: flex-start;
      }

      :deep(.el-radio-group) {
        width: 100%;
      }

      :deep(.el-radio-button__inner) {
        width: 100%;
        padding-right: 8px;
        padding-left: 8px;
      }

      :deep(.el-radio-button) {
        flex: 1;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      :deep(.el-radio-button__inner) {
        transition: none;
      }
    }
  }
</style>
