<template>
  <ArtDialog ref="dialogRef" title="按方案自动核销" size="xl" confirm-text="确认自动核销">
    <div v-if="isRedBlue" class="mb-4 flex flex-wrap items-center gap-3 text-sm">
      <span class="text-g-700">异币自动分配</span>
      <ElSegmented
        v-model="crossCurrencyMode"
        class="w-full sm:w-auto"
        :options="currencyModes"
        :direction="isNarrow ? 'vertical' : 'horizontal'"
        :block="isNarrow"
        aria-label="异币自动分配方式"
        :disabled="loading || executing"
        @change="changeCurrencyMode"
      />
    </div>
    <ElAlert
      v-if="isRedBlue && crossCurrencyMode === 'full_pair'"
      class="mb-4"
      type="warning"
      :closable="false"
      show-icon
      title="异币匹配双方可用余量将全部对冲，差额计入汇兑损益，请逐行核对原币金额。"
    />
    <ArtSectionCard
      title="匹配清单"
      subtitle="仅核减双方会计余额，不发起银行付款。确认时会重新校验方案与余额。"
      :loading="loading && !plan"
      :error="plan ? '' : loadError"
      :empty="!plan?.items.length"
      empty-title="暂无符合方案的单据"
      empty-description="请检查双方未核销余额、日期范围及方案匹配条件。"
      @retry="load"
    >
      <template #actions>
        <ArtIconButton
          icon="ri:refresh-line"
          label="重新预览"
          :loading="loading"
          :disabled="executing"
          @click="load"
        />
      </template>
      <ElAlert
        v-if="plan && loadError"
        class="mb-3"
        :title="loadError"
        type="error"
        :closable="false"
        show-icon
      />
      <div v-if="plan" class="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span class="text-g-700">{{ plan.schemeName }} · 共 {{ plan.recordCount }} 笔</span>
        <span class="font-semibold text-g-900"
          >核销合计 {{ formatPayableCurrencyTotals(plan.items, (row) => row.amount) }}</span
        >
      </div>
      <ArtTable
        :data="plan?.items || []"
        :columns="columns"
        :pagination="false"
        :max-height="390"
      />
      <p class="mt-3 text-sm text-g-600">{{ plan?.message }}</p>
    </ArtSectionCard>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import { useMediaQuery } from '@vueuse/core'
  import { computed, onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { formatCurrencyValue } from '@/utils/ui/format'
  import {
    formatPayableCurrencyTotals,
    formatPayableExchangeDifference
  } from '@/utils/finance/payable-writeoff'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import type { ColumnOption } from '@/types'
  import {
    automaticPayableWriteoff,
    type PayableAutomaticWriteoffItem,
    type PayableAutomaticWriteoffPlan,
    type PayableAutomaticWriteoffRequest,
    type PayableCrossCurrencyMode
  } from '@/api/payable-writeoff'

  const emit = defineEmits<{ success: []; refresh: [] }>()
  const tenantScope = useTenantScopeStore()
  const dialogRef = ref<ArtDialogExpose>()
  const request = ref<PayableAutomaticWriteoffRequest>()
  const plan = ref<PayableAutomaticWriteoffPlan>()
  const loading = ref(false)
  const executing = ref(false)
  const loadError = ref('')
  const isNarrow = useMediaQuery('(max-width: 639px)')
  const isRedBlue = computed(() => request.value?.query.relation === 'payable_red_blue')
  const crossCurrencyMode = ref<PayableCrossCurrencyMode>('book_equivalent')
  const currencyModes = [
    { label: '本位币等值分配', value: 'book_equivalent' },
    { label: '匹配余量全部对冲', value: 'full_pair' },
    { label: '仅同币种', value: 'same_currency' }
  ]
  async function changeCurrencyMode(): Promise<void> {
    if (!request.value) return
    request.value.query.crossCurrencyMode = crossCurrencyMode.value
    await load()
  }
  let version = 0
  const confirmDisabled = computed(
    () => loading.value || executing.value || !!loadError.value || !plan.value?.items.length
  )
  const columns = computed<ColumnOption<PayableAutomaticWriteoffItem>[]>(() => [
    {
      prop: 'payableNo',
      label: isRedBlue.value
        ? '蓝字财务应付'
        : request.value?.query.relation === 'payment_refund'
          ? '付款单'
          : '财务应付单',
      minWidth: 215,
      fixed: 'left'
    },
    { prop: 'supplierName', label: '主方往来单位', minWidth: 180 },
    {
      prop: 'paymentNo',
      label: isRedBlue.value
        ? '红字财务应付'
        : request.value?.query.relation === 'payable_receivable'
          ? '财务应收单'
          : request.value?.query.relation === 'payment_refund'
            ? '付款退款单'
            : '付款单',
      minWidth: 215
    },
    { prop: 'paymentSupplierName', label: '辅方往来单位', minWidth: 180 },
    {
      prop: 'needsVoucher',
      label: '生成核销单',
      width: 130,
      formatter: (row) => (row.needsVoucher ? '是' : '否')
    },
    {
      prop: 'amount',
      label: isRedBlue.value ? '主方原币金额' : '核销金额(元)',
      width: 165,
      fixed: 'right',
      align: 'right',
      formatter: (row) => formatCurrencyValue(row.amount, row.currencyCode || 'CNY')
    },
    ...(isRedBlue.value
      ? [
          {
            prop: 'currencyCode',
            label: '主方/辅方币种',
            width: 145,
            formatter: (row: PayableAutomaticWriteoffItem) =>
              `${row.currencyCode || 'CNY'} / ${row.secondaryCurrencyCode || row.currencyCode || 'CNY'}`
          },
          {
            prop: 'creditAmount',
            label: '辅方原币金额',
            width: 170,
            align: 'right' as const,
            formatter: (row: PayableAutomaticWriteoffItem) =>
              formatCurrencyValue(
                row.creditAmount ?? row.amount,
                row.secondaryCurrencyCode || 'CNY'
              )
          },
          {
            prop: 'exchangeDifference',
            label: '汇兑差额(本位币)',
            width: 195,
            align: 'right' as const,
            formatter: (row: PayableAutomaticWriteoffItem) =>
              formatPayableExchangeDifference(row.exchangeDifference, row.baseCurrencyCode || 'CNY')
          }
        ]
      : [])
  ])
  async function load(): Promise<void> {
    if (!request.value || executing.value) return
    const current = ++version
    loading.value = true
    loadError.value = ''
    try {
      const result = await automaticPayableWriteoff(request.value)
      if (current === version) plan.value = result
    } catch (error) {
      if (current === version) {
        loadError.value = '匹配清单加载失败，请重新预览；未执行任何核销。'
        notifyFriendlyError(error, loadError.value)
      }
    } finally {
      if (current === version) loading.value = false
    }
  }
  async function open(value: PayableAutomaticWriteoffRequest): Promise<void> {
    if (executing.value) {
      ElMessage.warning('核销正在处理，请等待结果后再打开新清单')
      return
    }
    request.value = cloneDeep(value)
    if (isRedBlue.value) {
      crossCurrencyMode.value = value.query.crossCurrencyMode || crossCurrencyMode.value
      request.value.query.crossCurrencyMode = crossCurrencyMode.value
    }
    plan.value = undefined
    loadError.value = ''
    await dialogRef.value?.handleOpen(undefined, {
      confirmDisabled: true,
      onConfirm: async () => {
        if (confirmDisabled.value || !plan.value || !request.value) return false
        executing.value = true
        try {
          const result = await automaticPayableWriteoff(request.value, plan.value.planToken)
          if (!result.executed) throw new Error('核销尚未执行，请重新预览后再确认')
          ElMessage.success(result.message)
          emit('success')
          return true
        } catch (error) {
          loadError.value = '核销结果未确认，请重新预览，并核对最新余额与核销记录。'
          notifyFriendlyError(error, loadError.value)
          emit('refresh')
          return false
        } finally {
          executing.value = false
        }
      }
    })
    await load()
  }
  watch(confirmDisabled, (value) => dialogRef.value?.setOptions({ confirmDisabled: value }), {
    flush: 'sync'
  })
  onBeforeUnmount(() => {
    version += 1
  })
  watch(
    () => tenantScope.revision,
    () => {
      version += 1
      request.value = undefined
      plan.value = undefined
      loading.value = false
      loadError.value = ''
      void dialogRef.value?.handleClose()
    }
  )
  defineExpose({ open })
</script>
