<template>
  <ArtSectionCard
    class="order-flow"
    :loading="loading"
    :empty="total === 0"
    empty-title="暂无订单流转数据"
    empty-description="创建订单后可在此查看各状态的流转情况。"
    :min-height="300"
    preserve-content-structure
  >
    <template #header>
      <header>
        <div><p>运输执行</p><h2>订单流转</h2></div>
        <button type="button" class="order-flow__link" @click="emit('view-orders')">
          订单列表 <ArtSvgIcon icon="ri:arrow-right-line" />
        </button>
      </header>
    </template>

    <div class="order-flow__summary">
      <div
        ><strong>{{ total }}</strong
        ><span>{{ periodLabel }}订单</span></div
      >
      <b><i />当前运输中 {{ inTransitCount }} 单</b>
    </div>

    <div class="order-flow__distribution">
      <div class="order-flow__chart">
        <ArtRingChart
          height="164px"
          :data="chartData"
          :colors="chartColors"
          :radius="['63%', '82%']"
          :center-text="`${total} 单`"
          :show-tooltip="true"
        />
        <span>订单状态分布</span>
      </div>

      <div class="order-flow__list" aria-label="订单状态明细">
        <button
          v-for="item in statusItems"
          :key="item.key"
          type="button"
          @click="emit('view-orders')"
        >
          <div class="order-flow__status-line">
            <i :style="{ background: item.color }" />
            <span>{{ item.label }}</span>
            <strong>{{ item.value }}</strong>
            <small>{{ item.percent }}%</small>
          </div>
          <div class="order-flow__bar" aria-hidden="true">
            <i :style="{ width: `${item.percent}%`, background: item.color }" />
          </div>
        </button>
      </div>
    </div>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { PieDataItem } from '@/types/component/chart'
  import { useChartOps } from '@/hooks/core/useChart'
  import type { DashboardStatusItem } from './types'

  const props = defineProps<{
    periodLabel: string
    total: number
    inTransitCount: number
    statusItems: DashboardStatusItem[]
    loading: boolean
  }>()
  const emit = defineEmits<{ 'view-orders': [] }>()

  const chartPalette = useChartOps().colors
  const chartColorMap: Record<string, string> = {
    pending_load: chartPalette[0],
    pending_order: chartPalette[4],
    transporting: chartPalette[1],
    signed: chartPalette[2],
    completed: chartPalette[5]
  }
  const activeStatusItems = computed(() => props.statusItems.filter((item) => item.value > 0))
  const chartData = computed<PieDataItem[]>(() =>
    activeStatusItems.value.map((item) => ({ name: item.label, value: item.value }))
  )
  const chartColors = computed(() =>
    activeStatusItems.value.map((item) => chartColorMap[item.key] ?? chartPalette[0])
  )
</script>

<style scoped lang="scss">
  .order-flow {
    position: relative;
    min-width: 0;
    overflow: hidden;
    background:
      radial-gradient(
        circle at 100% 0%,
        color-mix(in srgb, var(--el-color-primary) 12%, transparent),
        transparent 38%
      ),
      var(--default-box-color);

    &.art-section-card {
      padding: 24px 25px;
    }

    header {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
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

    &__link {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      padding: 6px 8px;
      font-size: 12px;
      color: var(--el-color-primary);
      cursor: pointer;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-small);

      .art-svg-icon {
        font-size: 15px;
      }
    }

    &__summary {
      display: flex;
      gap: 16px;
      align-items: flex-end;
      justify-content: space-between;
      margin-top: 23px;

      > div {
        display: flex;
        gap: 9px;
        align-items: flex-end;
      }

      strong {
        font-size: 36px;
        line-height: 0.92;
        color: var(--el-text-color-primary);
        letter-spacing: -1px;
      }

      span {
        padding-bottom: 2px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      b {
        display: inline-flex;
        gap: 6px;
        align-items: center;
        padding: 6px 9px;
        font-size: 11px;
        font-weight: 650;
        color: var(--el-color-success);
        background: color-mix(in srgb, var(--el-color-success) 9%, transparent);
        border-radius: 999px;

        i {
          width: 6px;
          height: 6px;
          background: currentcolor;
          border-radius: 50%;
        }
      }
    }

    &__distribution {
      display: grid;
      grid-template-columns: minmax(0, 0.78fr) minmax(0, 1fr);
      gap: 18px;
      align-items: center;
      min-height: 220px;
      margin-top: 8px;
    }

    &__chart {
      display: grid;
      place-items: center;
      min-width: 0;

      .art-ring-chart,
      > div {
        min-width: 0;
      }

      > span {
        padding: 0;
        margin-top: -3px;
        font-size: 10px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__list {
      display: grid;
      gap: 6px;

      > button {
        display: grid;
        gap: 5px;
        width: 100%;
        padding: 7px 8px;
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-small);
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease;

        &:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--theme-color) 55%, transparent);
          outline-offset: 2px;
        }
      }
    }

    &__status-line {
      display: grid;
      grid-template-columns: 7px minmax(0, 1fr) auto 30px;
      gap: 7px;
      align-items: center;

      > i {
        width: 7px;
        height: 7px;
        border-radius: 50%;
      }

      span {
        padding: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-regular);
        white-space: nowrap;
      }

      strong {
        font-size: 12px;
        line-height: 1;
        color: var(--el-text-color-primary);
        letter-spacing: 0;
      }

      small {
        font-size: 10px;
        color: var(--el-text-color-placeholder);
        text-align: right;
      }
    }

    &__bar {
      height: 3px;
      margin-left: 14px;
      overflow: hidden;
      background: var(--el-fill-color-light);
      border-radius: 999px;

      i {
        display: block;
        min-width: 0;
        height: 100%;
        border-radius: inherit;
        transition: width 0.3s ease;
      }
    }

    @media screen and (width <= 560px) {
      &.art-section-card {
        padding: 21px 18px;
      }

      &__distribution {
        grid-template-columns: 1fr;
        gap: 4px;
      }

      &__chart {
        min-height: 174px;
      }
    }
  }

  :global([data-box-mode='border-mode'] .order-flow__link:hover),
  :global([data-box-mode='border-mode'] .order-flow__list > button:hover) {
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
    border-color: color-mix(in srgb, var(--theme-color) 28%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 8%, transparent);
  }

  :global([data-box-mode='shadow-mode'] .order-flow__link:hover),
  :global([data-box-mode='shadow-mode'] .order-flow__list > button:hover) {
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
    border-color: transparent;
    box-shadow: 0 5px 14px color-mix(in srgb, var(--theme-color) 14%, transparent);
  }
</style>
