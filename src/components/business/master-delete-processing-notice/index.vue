<template>
  <aside v-if="isActive" class="master-delete-notice art-card-xs" aria-live="polite">
    <div class="master-delete-notice__content">
      <div class="master-delete-notice__title">
        <ArtSvgIcon icon="ri:links-line" aria-hidden="true" />
        <strong :title="`正在处理“${resourceName}”的删除前置资料`"
          >正在处理“{{ resourceName }}”的删除前置资料</strong
        >
        <ElTag type="warning" effect="light" size="small">
          {{ locationReady ? '已找到关联记录' : '定位待完成' }}
        </ElTag>
      </div>
      <p>{{ actionHint }}</p>
    </div>
    <div class="master-delete-notice__actions">
      <ElButton @click="clearLocation">清除定位</ElButton>
      <ElButton type="primary" plain @click="goBack">
        <template #icon><ArtSvgIcon icon="ri:arrow-left-line" /></template>
        返回{{ resourceLabel }}管理
      </ElButton>
    </div>
  </aside>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import { hasLocatedRecord } from './record-location'

  const props = withDefaults(
    defineProps<{
      actionHint?: string
      locationReady?: boolean
      table?: Pick<ArtTableQueryExpose, 'dataState'> | null
      recordId?: string | number
      recordKey?: string
      recordRows?: readonly object[]
      recordLoading?: boolean
      recordError?: boolean
      customerId?: string
      customerName?: string
    }>(),
    {
      actionHint: '',
      locationReady: undefined,
      table: null,
      recordKey: 'id',
      recordRows: () => [],
      recordLoading: false,
      recordError: false,
      customerId: '',
      customerName: ''
    }
  )

  const route = useRoute()
  const router = useRouter()
  const locationReady = computed(() => {
    if (props.locationReady !== undefined) return props.locationReady
    const state = props.table?.dataState
    const target = props.recordId ?? route.query.recordId
    return hasLocatedRecord(
      state?.rows.value ?? props.recordRows,
      typeof target === 'string' || typeof target === 'number' ? target : undefined,
      state?.loading.value ?? props.recordLoading,
      state?.error.value ?? props.recordError,
      props.recordKey
    )
  })
  const isMasterDelete = computed(() => route.query.fromMasterDelete === '1')
  const isActive = computed(() => isMasterDelete.value || route.query.fromCustomerDelete === '1')
  const resourceLabel = computed(() =>
    isMasterDelete.value ? String(route.query.resourceLabel || '主数据') : '客户'
  )
  const resourceName = computed(() =>
    isMasterDelete.value
      ? String(route.query.resourceName || '当前资料')
      : props.customerName || '该客户'
  )
  const actionHint = computed(() => {
    if (props.actionHint) return props.actionHint
    if (locationReady.value) return '已在当前页面找到关联记录。请核对并处理后返回原页面继续删除。'
    const recordNo = route.query.recordNo
    return typeof recordNo === 'string' && recordNo
      ? `请核对关联记录“${recordNo}”，处理完成后返回原页面重新检查。`
      : '请核对当前关联记录，处理完成后返回原页面重新检查。'
  })

  const goBack = (): void => {
    if (isMasterDelete.value) {
      const returnPath = typeof route.query.returnPath === 'string' ? route.query.returnPath : '/'
      void router.push(returnPath)
      return
    }

    void router.push({ name: 'TmsCustomer' })
  }

  const clearLocation = (): void => {
    void router.replace({ path: route.path })
  }
</script>

<style scoped lang="scss">
  .master-delete-notice {
    display: flex;
    flex: 0 0 auto;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 12px 16px;
    border-color: var(--el-color-warning-light-7);

    &__content {
      min-width: 0;

      p {
        margin: 3px 0 0;
        font-size: 13px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &__title {
      display: flex;
      gap: 7px;
      align-items: center;
      min-width: 0;

      > svg {
        flex: none;
        color: var(--el-color-warning-dark-2);
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }
    }

    &__actions {
      display: flex;
      flex: none;
      gap: 8px;

      .el-button + .el-button {
        margin-left: 0;
      }
    }

    .el-button {
      flex: none;
    }

    @media (width <= 720px) {
      flex-direction: column;
      align-items: stretch;

      &__actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .el-button {
        width: 100%;
      }
    }
  }
</style>
