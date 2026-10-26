<template>
  <ArtSectionCard
    class="dashboard-certificate-risks"
    title="车辆与司机证件"
    subtitle="到期风险由责任人跟进，登记续证后闭环。"
    :loading="loading"
    :error="error"
    :empty="!loading && !error && records.length === 0"
    empty-title="暂无临期或过期证件"
    empty-description="车辆和司机证件状态正常，后续风险会在这里显示。"
    :min-height="190"
    :scroll-max-height="328"
    @retry="emit('retry')"
  >
    <template #actions>
      <div class="dashboard-certificate-risks__actions">
        <span class="dashboard-certificate-risks__count is-expired">已过期 {{ expired }}</span>
        <span class="dashboard-certificate-risks__count is-due">即将到期 {{ dueSoon }}</span>
        <ElButton text type="primary" @click="emit('view-all')">查看全部</ElButton>
      </div>
    </template>

    <div class="dashboard-certificate-risks__list">
      <button
        v-for="record in records"
        :key="record.id"
        type="button"
        class="dashboard-certificate-risks__row"
        :aria-label="`查看${record.subjectLabel}的${certificateTypeLabel(record.certificateType)}证件`"
        @click="emit('open-record', record)"
      >
        <span class="dashboard-certificate-risks__identity">
          <span class="dashboard-certificate-risks__icon" aria-hidden="true">
            <ArtSvgIcon
              :icon="record.subjectType === 'vehicle' ? 'ri:truck-line' : 'ri:user-line'"
            />
          </span>
          <span class="dashboard-certificate-risks__name">
            <strong :title="record.subjectLabel">{{ record.subjectLabel }}</strong>
            <small>{{ record.subjectType === 'vehicle' ? '车辆' : '司机' }}</small>
          </span>
        </span>
        <span class="dashboard-certificate-risks__type">{{
          certificateTypeLabel(record.certificateType)
        }}</span>
        <span
          class="dashboard-certificate-risks__owner"
          :title="record.responsibleName || '未指定责任人'"
        >
          责任人 · {{ record.responsibleName || '未指定' }}
        </span>
        <span class="dashboard-certificate-risks__date">{{ formatDate(record.expiresOn) }}</span>
        <ElTag
          :type="record.status === 'expired' ? 'danger' : 'warning'"
          size="small"
          effect="light"
        >
          {{ statusLabel(record.status) }}
        </ElTag>
        <ArtSvgIcon
          class="dashboard-certificate-risks__arrow"
          icon="ri:arrow-right-s-line"
          aria-hidden="true"
        />
      </button>
    </div>
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import dayjs from 'dayjs'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import type { DashboardCertificateRisk, DashboardCertificateRiskStatus } from '@/api/dashboard'

  defineProps<{
    loading: boolean
    error: Error | null
    expired: number
    dueSoon: number
    records: DashboardCertificateRisk[]
  }>()
  const emit = defineEmits<{
    retry: []
    'view-all': []
    'open-record': [record: DashboardCertificateRisk]
  }>()

  const typeLabels: Record<string, string> = {
    vehicle_registration: '行驶证',
    road_transport: '道路运输证',
    compulsory_insurance: '交强险保单',
    commercial_insurance: '商业险保单',
    vehicle_tax: '车船税',
    annual_inspection: '审车检验',
    driver_license: '驾驶证',
    professional_qualification: '从业资格证',
    identity_card: '身份证'
  }
  const statusLabels: Record<DashboardCertificateRiskStatus, string> = {
    expired: '已过期',
    due_today: '今天到期',
    due_15: '15 天内',
    due_30: '30 天内'
  }
  const certificateTypeLabel = (type: string): string => typeLabels[type] ?? '其他证件'
  const statusLabel = (status: DashboardCertificateRiskStatus): string => statusLabels[status]
  const formatDate = (date: string): string => dayjs(date).format('YYYY-MM-DD')
</script>

<style scoped lang="scss">
  .dashboard-certificate-risks {
    min-width: 0;

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    &__count {
      padding: 4px 8px;
      font-size: 12px;
      font-weight: 600;
      border-radius: var(--el-border-radius-base);

      &.is-expired {
        color: var(--el-color-danger);
        background: color-mix(in srgb, var(--el-color-danger) 9%, var(--default-box-color));
      }

      &.is-due {
        color: var(--el-color-warning-dark-2);
        background: color-mix(in srgb, var(--el-color-warning) 11%, var(--default-box-color));
      }
    }

    &__list {
      display: grid;
      gap: 1px;
    }

    &__row {
      display: grid;
      grid-template-columns:
        minmax(150px, 1.4fr) minmax(100px, 1fr) minmax(110px, 1fr)
        105px 74px 18px;
      gap: 16px;
      align-items: center;
      width: 100%;
      min-height: 56px;
      padding: 8px 12px;
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: 0;
      border-bottom: 1px solid var(--el-border-color-extra-light);
      border-radius: var(--el-border-radius-base);
      transition: background-color var(--art-motion-duration-fast) ease;

      &:last-child {
        border-bottom-color: transparent;
      }

      &:hover,
      &:focus-visible {
        background: var(--el-fill-color-light);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: -2px;
      }
    }

    &__identity {
      display: flex;
      gap: 10px;
      align-items: center;
      min-width: 0;
    }

    &__icon {
      display: grid;
      flex: 0 0 32px;
      place-items: center;
      width: 32px;
      height: 32px;
      font-size: 17px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
      border-radius: var(--el-border-radius-base);
    }

    &__name {
      display: grid;
      gap: 2px;
      min-width: 0;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__type,
    &__owner,
    &__date {
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      color: var(--el-text-color-regular);
      white-space: nowrap;
    }

    &__date {
      font-variant-numeric: tabular-nums;
    }

    &__arrow {
      font-size: 17px;
      color: var(--el-text-color-placeholder);
    }

    @media screen and (width <= 880px) {
      &__row {
        grid-template-columns: minmax(130px, 1fr) minmax(90px, 1fr) 100px 70px 18px;
        gap: 10px;
      }

      &__owner {
        display: none;
      }
    }

    @media screen and (width <= 580px) {
      &__row {
        grid-template-columns: minmax(120px, 1fr) minmax(80px, 1fr) 70px;
      }

      &__date,
      &__arrow {
        display: none;
      }
    }
  }
</style>
