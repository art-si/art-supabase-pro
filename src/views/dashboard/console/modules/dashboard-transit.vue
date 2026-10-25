<template>
  <article class="dashboard-transit art-card-xs">
    <header>
      <div><p>调度中心</p><h2>实时运输</h2></div>
      <button type="button" @click="emit('monitor')"
        >在途监控 <ElIcon><ArrowRight /></ElIcon
      ></button>
    </header>
    <ElScrollbar class="dashboard-transit__list">
      <ArtAsyncState
        :empty="orders.length === 0"
        empty-text="暂无运输中的运单"
        empty-description="运单发车后，这里会展示实时运输进度。"
        :empty-image-size="62"
        :min-height="260"
      >
        <button
          v-for="item in orders"
          :key="item.id || item.orderNo"
          type="button"
          class="transit-row"
          @click="emit('open-order', item.id)"
        >
          <span class="transit-row__truck"><ArtSvgIcon icon="ri:truck-line" /></span>
          <div class="transit-row__main"
            ><strong>{{ item.dispatchPlateNo || '待分配车辆' }}</strong
            ><span>{{ item.orderNo }}</span></div
          >
          <div class="transit-row__route"
            ><b>{{ item.originStation || '始发站' }}</b
            ><i /><b>{{ item.destinationStation || '目的站' }}</b></div
          >
          <span class="transit-row__customer" :title="item.shippingCustomerName || undefined">{{
            item.shippingCustomerName || '发货方未维护'
          }}</span>
          <span class="transit-row__driver">{{ item.dispatchDriverName || '司机待分配' }}</span>
          <ElTag size="small" type="success" effect="light">运输中</ElTag>
        </button>
      </ArtAsyncState>
    </ElScrollbar>
  </article>
</template>

<script setup lang="ts">
  import { ArrowRight } from '@element-plus/icons-vue'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import type { DashboardOrder } from './types'

  defineProps<{ orders: DashboardOrder[] }>()
  const emit = defineEmits<{ monitor: []; 'open-order': [id?: string] }>()
</script>

<style scoped lang="scss">
  .dashboard-transit {
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
        var(--el-color-success),
        var(--theme-color),
        transparent 66%
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
      color: var(--el-color-success-dark-2);
      letter-spacing: 0.8px;
    }

    h2 {
      margin: 0;
      font-size: 18px;
      color: var(--el-text-color-primary);
    }

    &__list {
      height: 282px;
      margin-top: 16px;
    }

    .transit-row {
      display: grid;
      grid-template-columns: 38px 108px minmax(120px, 1fr) minmax(96px, 0.6fr) 82px auto;
      gap: 10px;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding: 8px;
      text-align: left;
      touch-action: manipulation;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--el-border-color-lighter);
      transition: background 0.16s ease;

      &:hover {
        background: color-mix(in srgb, var(--el-color-success) 5%, var(--el-fill-color-light));
      }

      &:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--theme-color) 48%, transparent);
        outline-offset: -2px;
        background: color-mix(in srgb, var(--theme-color) 6%, var(--el-fill-color-light));
      }

      &__truck {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        color: var(--el-color-success-dark-2);
        background: color-mix(in srgb, var(--el-color-success) 12%, var(--el-bg-color));
        border-radius: var(--el-border-radius-small);
      }

      &__main {
        display: grid;
        gap: 4px;
        min-width: 0;

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          color: var(--el-text-color-primary);
          white-space: nowrap;
        }

        span {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 10px;
          color: var(--el-text-color-placeholder);
          white-space: nowrap;
        }
      }

      &__customer,
      &__driver {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        color: var(--el-text-color-placeholder);
        white-space: nowrap;
      }

      &__route {
        display: flex;
        gap: 7px;
        align-items: center;
        min-width: 0;
        overflow: hidden;

        b {
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          font-weight: 550;
          color: var(--el-text-color-regular);
          white-space: nowrap;
        }

        i {
          position: relative;
          flex: 0 0 18px;
          height: 1px;
          background: linear-gradient(90deg, var(--el-color-success), var(--theme-color));

          &::after {
            position: absolute;
            top: -2px;
            right: 0;
            width: 5px;
            height: 5px;
            content: '';
            background: var(--el-color-primary);
            border-radius: 50%;
          }
        }
      }
    }

    @media screen and (width <= 720px) {
      padding-right: 18px;
      padding-left: 18px;

      .transit-row {
        grid-template-columns: 38px minmax(0, 1fr) auto;

        &__route,
        &__customer,
        &__driver {
          display: none;
        }
      }
    }

    @media (prefers-reduced-motion: reduce) {
      header button,
      .transit-row {
        transition: none;
      }
    }
  }
</style>
