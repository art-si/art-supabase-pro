<template>
  <article class="recent-orders art-card-xs">
    <header
      ><div><p>最新业务</p><h2>最近订单</h2></div
      ><button type="button" @click="emit('view-orders')"
        >全部订单 <ElIcon><ArrowRight /></ElIcon></button
    ></header>
    <div class="recent-orders__head"
      ><span>订单编号</span><span>发货方</span><span>运输线路</span><span>车辆 / 司机</span
      ><span>运费</span><span>状态</span></div
    >
    <ElScrollbar class="recent-orders__list">
      <ArtAsyncState
        :empty="orders.length === 0"
        empty-text="暂无订单数据"
        empty-description="创建首笔订单后，这里会显示最新进展。"
        :empty-image-size="62"
        :min-height="190"
      >
        <button
          v-for="item in orders"
          :key="item.id || item.orderNo"
          type="button"
          class="recent-orders__row"
          @click="emit('open-order', item.id)"
        >
          <strong>{{ item.orderNo }}</strong>
          <span :title="item.shippingCustomerName || undefined">{{
            item.shippingCustomerName || '发货方未维护'
          }}</span>
          <span>{{ item.originStation || '-' }} → {{ item.destinationStation || '-' }}</span>
          <span
            >{{ item.dispatchPlateNo || '待配载'
            }}<em>{{ item.dispatchDriverName || '司机待分配' }}</em></span
          >
          <b>{{ formatCurrencyValue(item.totalFee) }}</b>
          <ElTag size="small" :type="getOrderTagType(item.orderStatus)" effect="plain">{{
            getOrderStatusLabel(item.orderStatus)
          }}</ElTag>
        </button>
      </ArtAsyncState>
    </ElScrollbar>
  </article>
</template>

<script setup lang="ts">
  import { ArrowRight } from '@element-plus/icons-vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { formatCurrencyValue } from '@/utils/ui'
  import type { DashboardOrder } from './types'

  defineProps<{ orders: DashboardOrder[] }>()
  const emit = defineEmits<{ 'view-orders': []; 'open-order': [id?: string] }>()
  const labelMap: Record<string, string> = {
    pending_load: '待配载',
    pending_order: '待发车',
    transporting: '运输中',
    signed: '待结案',
    completed: '已完成',
    cancelled: '已取消'
  }
  const tagMap: Record<string, 'primary' | 'success' | 'warning' | 'info' | 'danger'> = {
    pending_load: 'primary',
    pending_order: 'warning',
    transporting: 'success',
    signed: 'warning',
    completed: 'info',
    cancelled: 'danger'
  }
  const getOrderStatusLabel = (status?: string | null): string =>
    labelMap[String(status ?? '')] ?? '待处理'
  const getOrderTagType = (
    status?: string | null
  ): 'primary' | 'success' | 'warning' | 'info' | 'danger' => tagMap[String(status ?? '')] ?? 'info'
</script>

<style scoped lang="scss">
  .recent-orders {
    position: relative;
    min-width: 0;
    padding: 24px 25px 10px;
    overflow: hidden;

    &::before {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 3px;
      content: '';
      background: linear-gradient(
        90deg,
        var(--el-color-primary-light-3),
        var(--theme-color),
        transparent 62%
      );
    }

    header {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;

      button {
        display: inline-flex;
        gap: 2px;
        align-items: center;
        padding: 7px 10px;
        font-size: 11px;
        color: var(--el-color-primary);
        touch-action: manipulation;
        cursor: pointer;
        background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
        border: 0;
        border-radius: 999px;
        transition:
          color 0.18s ease,
          background-color 0.18s ease;

        &:hover,
        &:focus-visible {
          color: var(--el-color-primary-dark-2);
          outline: 2px solid color-mix(in srgb, var(--theme-color) 38%, transparent);
          outline-offset: 2px;
          background: color-mix(in srgb, var(--el-color-primary) 13%, transparent);
        }
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

    &__head,
    &__row {
      display: grid;
      grid-template-columns: 1.05fr 1.05fr 1.3fr 1.1fr 0.72fr 0.65fr;
      gap: 14px;
      align-items: center;
    }

    &__head {
      padding: 12px;
      margin-top: 16px;
      font-size: 10px;
      font-weight: 650;
      color: var(--el-text-color-secondary);
      letter-spacing: 0.3px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-small);
    }

    &__list {
      height: 206px;
    }

    &__row {
      width: 100%;
      min-height: 49px;
      padding: 7px 12px;
      text-align: left;
      touch-action: manipulation;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
      transition: background 0.16s ease;

      &:hover {
        background: color-mix(in srgb, var(--el-color-primary) 5%, var(--el-fill-color-light));
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 48%, transparent);
        outline-offset: -2px;
        background: color-mix(in srgb, var(--theme-color) 6%, var(--el-fill-color-light));
      }

      strong,
      > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      > span {
        color: var(--el-text-color-regular);
      }

      span em {
        display: block;
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        font-style: normal;
        color: var(--el-text-color-placeholder);
        white-space: nowrap;
      }

      b {
        font-size: 12px;
        color: var(--el-text-color-regular);
      }

      :deep(.el-tag) {
        justify-self: start;
        width: fit-content;
        min-width: 0;
      }
    }

    @media screen and (width <= 720px) {
      padding-right: 18px;
      padding-left: 18px;

      &__head,
      &__row {
        grid-template-columns: 1fr 1fr auto;
      }

      &__head span:nth-child(3),
      &__head span:nth-child(4),
      &__head span:nth-child(5),
      &__row > span:nth-child(3),
      &__row > span:nth-child(4),
      &__row > b {
        display: none;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      header button,
      &__row {
        transition: none;
      }
    }
  }
</style>
