<template>
  <article class="fleet-risk art-card-xs">
    <header
      ><div><p>车辆健康</p><h2>风险提醒</h2></div
      ><span>{{ reminderTotal }} 项待处理</span></header
    >
    <div class="fleet-risk__stats">
      <div
        ><span>车辆总数</span><strong>{{ vehicleCount }}</strong></div
      >
      <div
        ><span>运营车辆</span><strong>{{ operatingVehicleCount }}</strong></div
      >
      <div
        ><span>待审核</span><strong>{{ pendingAuditVehicleCount }}</strong></div
      >
    </div>
    <div class="fleet-risk__reminders">
      <ArtEmptyState
        v-if="reminders.length === 0"
        class="fleet-risk__empty"
        title="当前无风险提醒"
        description="车辆风险出现时会在此展示，请继续关注车队状态。"
        size="compact"
        :visual-size="64"
      />
      <button
        v-for="item in reminders"
        :key="item.key"
        type="button"
        :class="`is-${item.severity}`"
        @click="emit('view-reminder')"
      >
        <i class="fleet-risk__severity" />
        <span>{{ item.label }}</span>
        <strong>{{ item.count }} <small>项</small></strong>
        <span class="fleet-risk__action" aria-hidden="true">
          <ArtSvgIcon icon="ri:arrow-right-s-line" />
        </span>
      </button>
    </div>
  </article>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type { DashboardReminder } from './types'

  defineProps<{
    vehicleCount: number
    operatingVehicleCount: number
    pendingAuditVehicleCount: number
    reminderTotal: number
    reminders: DashboardReminder[]
  }>()
  const emit = defineEmits<{ 'view-reminder': [] }>()
</script>

<style scoped lang="scss">
  .fleet-risk {
    position: relative;
    min-width: 0;
    padding: 24px 25px;
    container-type: inline-size;
    overflow: hidden;

    &::before {
      position: absolute;
      top: -60px;
      right: -60px;
      width: 150px;
      height: 150px;
      content: '';
      background: color-mix(in srgb, var(--el-color-danger) 8%, transparent);
      border-radius: 50%;
    }

    header {
      position: relative;
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;

      > span {
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 650;
        color: var(--el-color-danger);
        background: color-mix(in srgb, var(--el-color-danger) 10%, transparent);
        border-radius: 999px;
      }
    }

    p {
      margin: 0 0 5px;
      font-size: 11px;
      font-weight: 700;
      color: var(--el-color-danger);
      letter-spacing: 0.8px;
    }

    h2 {
      margin: 0;
      font-size: 18px;
      color: var(--el-text-color-primary);
    }

    &__stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding: 17px 0;
      margin-top: 22px;
      background: linear-gradient(
        120deg,
        var(--el-fill-color-light),
        color-mix(in srgb, var(--el-color-primary) 6%, var(--el-fill-color-light))
      );
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      div {
        display: grid;
        gap: 6px;
        padding-left: 15px;
        border-left: 1px solid var(--el-border-color-lighter);

        &:first-child {
          border-left: 0;
        }
      }

      span {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 22px;
        color: var(--el-text-color-primary);
      }
    }

    &__reminders {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 7px;
      margin-top: 16px;

      button {
        --risk-tone: var(--el-color-warning);

        display: grid;
        grid-template-columns: 8px minmax(0, 1fr) auto 32px;
        gap: 10px;
        align-items: center;
        width: 100%;
        min-height: 44px;
        padding: 6px 8px 6px 11px;
        text-align: left;
        cursor: pointer;
        background: color-mix(in srgb, var(--risk-tone) 4%, var(--el-fill-color-lighter));
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-base);
        transition:
          background 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease;

        &.is-danger {
          --risk-tone: var(--el-color-danger);
        }

        &:hover,
        &:focus-visible {
          background: color-mix(in srgb, var(--risk-tone) 8%, var(--default-box-color));

          .fleet-risk__action {
            color: var(--el-color-white);
            background: var(--risk-tone);
            transform: translateX(2px);
          }
        }

        &:focus-visible {
          outline: 2px solid color-mix(in srgb, var(--risk-tone) 55%, transparent);
          outline-offset: 2px;
        }
      }

      button > span:not(.fleet-risk__action) {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-regular);
        white-space: nowrap;
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);

        small {
          font-size: 9px;
          font-weight: 500;
          color: var(--el-text-color-placeholder);
        }
      }
    }

    &__severity {
      width: 7px;
      height: 7px;
      background: var(--risk-tone);
      border-radius: 50%;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--risk-tone) 10%, transparent);
    }

    &__action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      overflow: visible;
      font-size: 22px;
      color: var(--risk-tone);
      background: color-mix(in srgb, var(--risk-tone) 10%, var(--el-bg-color));
      border-radius: var(--art-control-radius);
      transition:
        color 0.18s ease,
        background 0.18s ease,
        transform 0.18s ease;
    }

    &__empty {
      grid-column: 1 / -1;
      min-height: 150px;
    }

    @container (width <= 420px) {
      &__reminders {
        grid-template-columns: 1fr;
      }
    }
  }

  :global([data-box-mode='border-mode'] .fleet-risk__reminders button:hover),
  :global([data-box-mode='border-mode'] .fleet-risk__reminders button:focus-visible) {
    border-color: color-mix(in srgb, var(--risk-tone) 30%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--risk-tone) 8%, transparent);
  }

  :global([data-box-mode='shadow-mode'] .fleet-risk__reminders button:hover),
  :global([data-box-mode='shadow-mode'] .fleet-risk__reminders button:focus-visible) {
    border-color: transparent;
    box-shadow: 0 7px 17px color-mix(in srgb, var(--risk-tone) 15%, transparent);
  }
</style>
