<template>
  <div class="min-w-0">
    <div class="mb-3 flex items-center justify-between gap-3">
      <span class="text-sm text-g-600">所有条件同时满足才匹配，最多 20 项。</span>
      <ElButton :disabled="rules.length >= 20" @click="rules.push(newPayableMatchRule())">
        <ArtSvgIcon icon="ri:add-line" />新增规则
      </ElButton>
    </div>
    <ArtTable ref="tableRef" :data="rules" :columns="columns" :pagination="false" :max-height="300">
      <template #primaryField="{ row }">
        <ElSelect v-model="row.primaryField" aria-label="主方单据字段" @change="resetOperator(row)">
          <ElOption
            v-for="item in payableMatchFields"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          />
        </ElSelect>
      </template>
      <template #operator="{ row }">
        <ElSelect v-model="row.operator" aria-label="匹配关系">
          <ElOption
            v-for="item in payableMatchOperators"
            :key="item.value"
            :value="item.value"
            :label="item.label"
            :disabled="!allowedPayableMatchOperators(row).includes(item.value)"
          />
        </ElSelect>
      </template>
      <template #secondaryField="{ row }">
        <ElSelect
          v-model="row.secondaryField"
          aria-label="辅方单据字段"
          @change="resetOperator(row)"
        >
          <ElOption
            v-for="item in payableMatchFields"
            :key="item.value"
            :value="item.value"
            :label="item.label"
          />
        </ElSelect>
      </template>
      <template #emptyMatches="{ row }"
        ><ElSwitch v-model="row.emptyMatches" aria-label="为空时匹配"
      /></template>
      <template #operation="{ row }"
        ><ArtButtonTable icon="ri:subtract-line" label="移除匹配规则" @click="removeRule(row)"
      /></template>
    </ArtTable>
    <MasterDataDeleteGuard ref="deleteGuardRef" />
  </div>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import ArtTable, { type ArtTableExpose } from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import type { PayableMatchRule } from '@/api/payable-reference'
  import type { ColumnOption } from '@/types'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import {
    payableMatchFields,
    payableMatchOperators,
    newPayableMatchRule,
    allowedPayableMatchOperators,
    validatePayableMatchRules
  } from '@/utils/finance/payable-match'

  const props = withDefaults(defineProps<{ contextLabel?: string }>(), { contextLabel: '共用条件' })
  const rules = defineModel<PayableMatchRule[]>({ required: true })
  const tableRef = ref<ArtTableExpose>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const { confirmDelete } = useArtFeedback()
  const columns: ColumnOption<PayableMatchRule>[] = [
    { prop: 'primaryField', label: '主方单据字段', required: true, minWidth: 205, useSlot: true },
    { prop: 'operator', label: '匹配关系', required: true, minWidth: 140, useSlot: true },
    { prop: 'secondaryField', label: '辅方单据字段', required: true, minWidth: 205, useSlot: true },
    { prop: 'emptyMatches', label: '任一为空时匹配', width: 165, useSlot: true },
    { prop: 'operation', label: '操作', width: 80, fixed: 'right', useSlot: true }
  ]
  function resetOperator(row: PayableMatchRule): void {
    if (!allowedPayableMatchOperators(row).includes(row.operator)) row.operator = 'eq'
  }
  async function removeRule(row: PayableMatchRule): Promise<void> {
    const current = rules.value
    const index = current.indexOf(row)
    const guard = deleteGuardRef.value
    if (!guard) {
      ElMessage.warning('关联检查尚未就绪，请重新打开配置后再试')
      return
    }
    if (index < 0) return
    if (
      await guard.inspect({
        resourceLabel: '匹配规则',
        resources: [{ id: String(index + 1), label: `${props.contextLabel} · 第 ${index + 1} 条` }],
        fetchDependencies: async () => []
      })
    )
      return
    try {
      await confirmDelete('移除此匹配条件？保存方案后生效，不会删除既有核销记录。')
    } catch {
      return
    }
    if (rules.value !== current) return
    rules.value = current.filter((rule) => rule !== row)
  }
  async function validate(): Promise<boolean> {
    const result = await tableRef.value?.validate()
    if (result?.valid === false) return false
    const invalid = validatePayableMatchRules(rules.value)
    if (invalid) {
      ElMessage.warning(invalid)
      return false
    }
    return true
  }
  defineExpose({ validate })
</script>
