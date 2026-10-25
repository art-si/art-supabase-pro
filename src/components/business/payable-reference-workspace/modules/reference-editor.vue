<template>
  <ArtDialog ref="dialogRef" :size="kind === 'scheme' ? 'xl' : 'md'" confirm-text="保存配置">
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="items"
      :rules="{
        code: [{ required: true, message: '请填写编码' }],
        name: [{ required: true, message: '请填写名称' }]
      }"
      :span="12"
      label-position="top"
      :show-submit="false"
      :show-reset="false"
    />
    <ArtSectionCard
      v-if="kind === 'scheme'"
      class="mt-4"
      title="核销匹配规则"
      subtitle="所有条件同时满足才匹配；主辅方以工作台所选关系为准。应付冲应收使用主数据已确认的统一往来单位；跨往来还须明确启用并具备相应权限。"
    >
      <template #actions
        ><ElButton
          :disabled="(form.rules?.length || 0) >= 20"
          @click="form.rules?.push(newPayableMatchRule())"
          ><ArtSvgIcon icon="ri:add-line" />新增规则</ElButton
        ></template
      >
      <ArtTable
        ref="ruleTableRef"
        :data="form.rules || []"
        :columns="[
          {
            prop: 'primaryField',
            label: '主方单据字段',
            required: true,
            minWidth: 205,
            useSlot: true
          },
          { prop: 'operator', label: '匹配关系', required: true, minWidth: 140, useSlot: true },
          {
            prop: 'secondaryField',
            label: '辅方单据字段',
            required: true,
            minWidth: 205,
            useSlot: true
          },
          { prop: 'emptyMatches', label: '任一为空时匹配', width: 165, useSlot: true },
          { prop: 'operation', label: '操作', width: 80, fixed: 'right', useSlot: true }
        ]"
        :pagination="false"
        :max-height="260"
      >
        <template #primaryField="{ row }"
          ><ElSelect
            v-model="row.primaryField"
            aria-label="主方单据字段"
            @change="resetOperator(row)"
            ><ElOption
              v-for="item in payableMatchFields"
              :key="item.value"
              :value="item.value"
              :label="item.label" /></ElSelect
        ></template>
        <template #operator="{ row }"
          ><ElSelect v-model="row.operator" aria-label="匹配关系"
            ><ElOption
              v-for="item in payableMatchOperators"
              :key="item.value"
              :value="item.value"
              :label="item.label"
              :disabled="!allowedPayableMatchOperators(row).includes(item.value)" /></ElSelect
        ></template>
        <template #secondaryField="{ row }"
          ><ElSelect
            v-model="row.secondaryField"
            aria-label="辅方单据字段"
            @change="resetOperator(row)"
            ><ElOption
              v-for="item in payableMatchFields"
              :key="item.value"
              :value="item.value"
              :label="item.label" /></ElSelect
        ></template>
        <template #emptyMatches="{ row }"
          ><ElSwitch v-model="row.emptyMatches" aria-label="为空时匹配"
        /></template>
        <template #operation="{ row }"
          ><ArtButtonTable icon="ri:subtract-line" label="移除匹配规则" @click="removeRule(row)"
        /></template>
      </ArtTable>
    </ArtSectionCard>
  </ArtDialog>
  <MasterDataDeleteGuard ref="deleteGuardRef" />
</template>
<script setup lang="ts">
  import { cloneDeep } from 'lodash-es'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import MasterDataDeleteGuard from '@/components/business/master-data-delete-guard/index.vue'
  import {
    savePayableReference,
    type PayableMatchRule,
    type PayableReference,
    type PayableReferenceKind
  } from '@/api/payable-reference'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { payablePurposeBusinessTypeOptions } from '@/utils/finance/payable-settlement'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import {
    payableMatchFields,
    payableMatchOperators,
    newPayableMatchRule,
    allowedPayableMatchOperators,
    validatePayableMatchRules
  } from '@/utils/finance/payable-match'
  const props = defineProps<{ kind: PayableReferenceKind }>()
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const ruleTableRef = ref<InstanceType<typeof ArtTable>>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const { confirmDelete } = useArtFeedback()
  const form = ref<PayableReference>({ code: '', name: '', enabled: true })
  function resetOperator(row: PayableMatchRule): void {
    if (!allowedPayableMatchOperators(row).includes(row.operator)) row.operator = 'eq'
  }
  async function removeRule(row: PayableMatchRule): Promise<void> {
    const guard = deleteGuardRef.value
    if (!guard) {
      ElMessage.warning('关联检查尚未就绪，请重新打开配置后再试')
      return
    }
    const index = form.value.rules?.indexOf(row) ?? -1
    if (index < 0) return
    if (
      await guard.inspect({
        resourceLabel: '匹配规则',
        resources: [{ id: String(index + 1), label: `第 ${index + 1} 条匹配规则` }],
        fetchDependencies: async () => []
      })
    )
      return
    try {
      await confirmDelete('移除此匹配条件？保存方案后生效；不会删除既有核销记录。')
    } catch {
      return
    }
    form.value.rules = form.value.rules?.filter((rule) => rule !== row)
  }
  const items = computed<FormItem[]>(() => [
    {
      key: 'code',
      label: '编码',
      type: 'input',
      span: props.kind === 'scheme' ? 8 : 12,
      props: { maxlength: 40 }
    },
    {
      key: 'name',
      label: '名称',
      type: 'input',
      span: props.kind === 'scheme' ? 16 : 12,
      props: { maxlength: 100 }
    },
    ...(props.kind === 'purpose'
      ? ([
          {
            key: 'businessType',
            label: '付款业务类型',
            type: 'select',
            props: {
              options: payablePurposeBusinessTypeOptions
            }
          },
          { key: 'defaultFundPurpose', label: '默认资金用途', type: 'input' },
          { key: 'payableWriteoff', label: '参与应付核销', type: 'switch' },
          { key: 'receivableWriteoff', label: '参与应收核销', type: 'switch' }
        ] as FormItem[])
      : props.kind === 'method'
        ? ([
            {
              key: 'category',
              label: '结算方式类别',
              type: 'select',
              props: {
                options: [
                  { value: 'cash', label: '现金' },
                  { value: 'cheque', label: '支票' },
                  { value: 'remittance', label: '汇兑' },
                  { value: 'bill', label: '非支票票据' },
                  { value: 'virtual', label: '虚拟结算' }
                ]
              }
            },
            {
              key: 'cashMethod',
              label: '运输资金结算映射',
              type: 'select',
              props: {
                options: [
                  { value: 'cash', label: '现金' },
                  { value: 'bank_transfer', label: '银行转账' },
                  { value: 'other', label: '其他' }
                ]
              }
            }
          ] as FormItem[])
        : ([{ key: 'automatic', label: '自动核销', type: 'switch', span: 4 }] as FormItem[])),
    { key: 'enabled', label: '启用', type: 'switch', span: props.kind === 'scheme' ? 4 : 12 },
    {
      key: props.kind === 'scheme' ? 'remark' : 'description',
      label: props.kind === 'scheme' ? '备注' : '描述',
      type: props.kind === 'scheme' ? 'input' : 'textarea',
      span: props.kind === 'scheme' ? 16 : 24,
      props:
        props.kind === 'scheme'
          ? { maxlength: 1000, placeholder: '可选：说明核销范围' }
          : { rows: 3, maxlength: 1000 }
    }
  ])
  async function open(value?: PayableReference): Promise<void> {
    form.value = value
      ? cloneDeep(value)
      : {
          code: '',
          name: '',
          enabled: true,
          businessType: 'purchase',
          payableWriteoff: true,
          receivableWriteoff: false,
          category: 'remittance',
          cashMethod: 'bank_transfer',
          automatic: false,
          rules: [newPayableMatchRule(), newPayableMatchRule('currency_code')]
        }
    await dialogRef.value?.handleOpen(undefined, {
      title: `${value ? '编辑' : '新增'}${props.kind === 'purpose' ? '付款用途' : props.kind === 'method' ? '结算方式' : '核销方案'}`,
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        if (props.kind === 'scheme') {
          if (!(await ruleTableRef.value?.validate())) return false
          const invalid = validatePayableMatchRules(form.value.rules)
          if (invalid) {
            ElMessage.warning(invalid)
            return false
          }
        }
        try {
          await savePayableReference(props.kind, form.value)
          ElMessage.success('配置已保存')
          emit('success')
          return true
        } catch (error) {
          notifyFriendlyError(error, '配置未保存，请重试')
          return false
        }
      }
    })
  }
  defineExpose({ open })
</script>
