<template>
  <ArtDialog ref="dialogRef" size="md" @close="handleClose">
    <ArtAsyncState :error="loadError" error-title="库位信息加载失败" @retry="loadPlacement">
      <div class="flex flex-col gap-4">
        <ArtEntitySummary
          icon="ri:map-pin-2-line"
          eyebrow="RECEIPT PLACEMENT"
          title="指定入库库位"
          :description="`${context?.line.lineSnapshot.materialDescription || context?.line.lineSnapshot.materialCode || '物料'} · ${context?.documentNo || ''}`"
        />
        <ElAlert type="info" :closable="false" show-icon>
          仅调整当前入库草稿的库位，不修改来源收料通知。确认入库时将重新校验仓位容量与物料管控规则。
        </ElAlert>
        <div class="grid gap-1 text-sm">
          <span class="text-[var(--el-text-color-secondary)]">入库仓库</span>
          <strong>{{ warehouse?.warehouseCode }} · {{ warehouse?.warehouseName }}</strong>
        </div>
        <div class="grid gap-1 text-sm">
          <label for="receipt-bin-select" class="text-[var(--el-text-color-secondary)]"
            >入库库位</label
          >
          <div v-if="warehouse?.enableLocations" class="flex min-w-0 flex-col gap-2 sm:flex-row">
            <ElSelect
              id="receipt-bin-select"
              v-model="selectedBinId"
              filterable
              clearable
              :disabled="recommending"
              class="min-w-0 flex-1"
              placeholder="选择可用库位"
            >
              <ElOption
                v-for="bin in availableBins"
                :key="bin.id"
                :label="`${bin.binCode} · ${bin.binName}`"
                :value="bin.id"
              />
            </ElSelect>
            <ElButton :loading="recommending" :disabled="!canRecommend" @click="recommend">
              <ArtSvgIcon icon="ri:magic-line" />自动选位
            </ElButton>
          </div>
          <div v-else class="rounded-lg bg-[var(--el-fill-color-light)] px-3 py-2">
            此仓库未启用库位，入库将直接归属仓库。
          </div>
        </div>
        <p class="text-xs text-[var(--el-text-color-secondary)]">
          本行库存数量 {{ quantity
          }}{{ unitDisplayName(context?.tenantId || '', context?.line.lineSnapshot.stockUnit) }}
          <span v-if="context?.line.serialManagementEnabled">
            · SN 物料仅可使用支持序列号的库位</span
          >
        </p>
      </div>
    </ArtAsyncState>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { useUnitDisplayNames } from '@/hooks/core/useUnitDisplayNames'
  const { loadUnitDisplayNames, unitDisplayName } = useUnitDisplayNames()
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase/error'
  import {
    fetchScmReceiptPlacementBin,
    fetchScmReceiptPlacementBins,
    fetchScmReceiptPlacementWarehouse,
    recommendScmReceiptPlacementBin,
    setScmReceiptLineBin,
    type ScmReceiptPlacementBin,
    type ScmReceiptPlacementWarehouse,
    type ScmReceiptTargetLine
  } from '@/api/scm-receipt-target'

  interface Context {
    tenantId: string
    documentNo: string
    line: ScmReceiptTargetLine
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const context = shallowRef<Context>()
  const warehouse = shallowRef<ScmReceiptPlacementWarehouse | null>(null)
  const bins = ref<ScmReceiptPlacementBin[]>([])
  const selectedBinId = ref<string | null>(null)
  const recommending = ref(false)
  const loadError = ref('')
  let generation = 0
  watch([loadError, warehouse, recommending], () => {
    dialogRef.value?.setOptions({
      confirmDisabled: Boolean(loadError.value) || !warehouse.value || recommending.value
    })
  })

  const quantity = computed(() =>
    Number(
      context.value?.line.lineSnapshot.stockQuantity ??
        context.value?.line.lineSnapshot.quantity ??
        0
    )
  )
  const availableBins = computed(() =>
    bins.value.filter((bin) => !context.value?.line.serialManagementEnabled || bin.supportsSerial)
  )
  const canRecommend = computed(
    () =>
      Boolean(warehouse.value?.enableLocations && context.value?.line.lineSnapshot.materialId) &&
      quantity.value > 0
  )

  async function recommend(): Promise<void> {
    const current = context.value
    const warehouseId = current?.line.lineSnapshot.warehouseId
    const materialId = current?.line.lineSnapshot.materialId
    if (!current || !warehouseId || !materialId || quantity.value <= 0 || recommending.value) return
    const requestGeneration = generation
    recommending.value = true
    try {
      const binId = await recommendScmReceiptPlacementBin({
        warehouseId,
        materialId,
        quantity: quantity.value
      })
      if (requestGeneration !== generation) return
      if (!binId) {
        ElMessage.warning('当前没有符合物料、容量和库区规则的可用库位')
        return
      }
      let bin = bins.value.find((item) => item.id === binId)
      if (!bin) {
        bin = (await fetchScmReceiptPlacementBin(current.tenantId, binId)) ?? undefined
        if (requestGeneration !== generation) return
        if (bin) bins.value.push(bin)
      }
      if (!bin || bin.warehouseId !== warehouseId) throw new Error('推荐库位不属于当前仓库')
      if (current.line.serialManagementEnabled && !bin.supportsSerial) {
        ElMessage.warning('推荐库位不支持序列号，请手动选择支持序列号的库位')
        return
      }
      selectedBinId.value = bin.id
      ElMessage.success(`已选库位 ${bin.binCode}，确认入库时将再次校验`)
    } catch (error) {
      if (requestGeneration === generation)
        notifyFriendlyError(error, '自动选位失败，请手动选择库位或稍后重试')
    } finally {
      if (requestGeneration === generation) recommending.value = false
    }
  }

  async function submit(): Promise<boolean> {
    const current = context.value
    if (!current || !warehouse.value || loadError.value || recommending.value) return false
    if (warehouse.value.enableLocations && !selectedBinId.value) {
      ElMessage.warning('请选择入库库位或使用自动选位')
      return false
    }
    try {
      await setScmReceiptLineBin(
        current.line.id,
        warehouse.value.enableLocations ? selectedBinId.value : null
      )
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '入库库位保存失败，请检查仓库、物料和库位后重试')
      return false
    }
  }

  async function loadPlacement(): Promise<void> {
    const data = context.value
    const warehouseId = data?.line.lineSnapshot.warehouseId
    if (!data || !warehouseId) return
    const requestGeneration = ++generation
    loadError.value = ''
    warehouse.value = null
    bins.value = []
    dialogRef.value?.setLoading(true)
    try {
      const [warehouseResult, binRows] = await Promise.all([
        fetchScmReceiptPlacementWarehouse(data.tenantId, warehouseId),
        fetchScmReceiptPlacementBins(data.tenantId, warehouseId)
      ])
      if (requestGeneration !== generation) return
      if (!warehouseResult) {
        loadError.value = '入库仓库不存在或当前不可访问，请核对来源单据后重试'
        return
      }
      warehouse.value = warehouseResult
      bins.value = binRows
      const currentBinId = data.line.lineSnapshot.binId
      selectedBinId.value =
        warehouseResult.enableLocations &&
        availableBins.value.some((bin) => bin.id === currentBinId)
          ? currentBinId || null
          : null
      if (warehouseResult.enableLocations && currentBinId && !selectedBinId.value)
        ElMessage.warning('原库位当前不可用，请重新选择')
    } catch (error) {
      if (requestGeneration === generation)
        loadError.value = getFriendlySupabaseErrorMessage(error, '库位信息加载失败，请重试')
    } finally {
      if (requestGeneration === generation) dialogRef.value?.setLoading(false)
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    const requestGeneration = ++generation
    await loadUnitDisplayNames([data.tenantId])
    if (requestGeneration !== generation) return
    const warehouseId = data.line.lineSnapshot.warehouseId
    if (!warehouseId) {
      ElMessage.warning('来源收料行未指定仓库，请先维护来源单据')
      return
    }
    context.value = data
    warehouse.value = null
    bins.value = []
    selectedBinId.value = null
    loadError.value = ''
    await dialogRef.value?.handleOpen(data, {
      title: '指定入库库位',
      subtitle: '草稿阶段调整，确认时复核仓位规则',
      loading: true,
      loadingText: '正在加载可用库位…',
      confirmDisabled: true,
      onOpen: loadPlacement,
      onConfirm: submit
    })
  }
  function handleClose(): void {
    generation++
    recommending.value = false
  }
  defineExpose({ handleOpen })
</script>
