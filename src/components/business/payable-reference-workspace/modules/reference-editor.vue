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
    <div v-if="kind === 'scheme'" class="mt-4">
      <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label class="art-icon-label text-sm text-g-800">
          <ElSwitch
            v-model="separateRules"
            aria-label="按核销关系分别配置"
            :disabled="!supportsMatrix"
            :before-change="beforeModeChange"
            @change="changeMode"
          />按核销关系分别配置
        </label>
        <span class="text-xs text-g-600">仅已配置关系参与核销，保存后生效；既有核销快照不变。</span>
      </div>
      <ElAlert
        v-if="!supportsMatrix"
        class="mb-4"
        type="info"
        :closable="false"
        show-icon
        title="当前服务仅支持共用规则，分关系配置需升级服务后使用。"
      />
      <ArtSectionCard
        v-if="separateRules"
        title="核销关系"
        subtitle="每种关系独立维护匹配条件，不会回退使用其他关系的规则。"
      >
        <template #actions>
          <ElSelect
            v-model="pendingRelation"
            class="w-52! shrink-0"
            aria-label="新增核销关系"
            placeholder="选择核销关系"
            :disabled="!availableRelations.length"
          >
            <ElOption
              v-for="option in availableRelations"
              :key="option.value"
              :value="option.value"
              :label="option.label"
            />
          </ElSelect>
          <ElButton :disabled="!pendingRelation" @click="addRelation"
            ><ArtSvgIcon icon="ri:add-line" />新增关系</ElButton
          >
        </template>
        <ArtTable
          :data="form.relationRules || []"
          :columns="relationColumns"
          row-key="relation"
          :pagination="false"
          :max-height="300"
        >
          <template #description="{ row }"
            ><ElInput
              v-model="row.description"
              :aria-label="`${relationLabel(row.relation)}关系说明`"
              :maxlength="1000"
              placeholder="可选：说明本关系的适用范围"
          /></template>
          <template #operation="{ row }">
            <ArtButtonTable
              icon="ri:settings-3-line"
              label="配置匹配规则"
              @click="editRelation(row)"
            />
            <ArtButtonTable
              icon="ri:subtract-line"
              label="移除核销关系"
              @click="removeRelation(row)"
            />
          </template>
        </ArtTable>
      </ArtSectionCard>
      <ArtSectionCard
        v-else
        title="共用匹配规则"
        subtitle="沿用旧方案行为，所有支持的核销关系共用下列条件。"
      >
        <PayableMatchRuleEditor ref="commonEditorRef" v-model="commonRules" />
      </ArtSectionCard>
    </div>
  </ArtDialog>
  <ArtDialog ref="relationDialogRef" size="xl" confirm-text="应用条件">
    <p v-if="editingConfig?.relation === 'payable_receivable'" class="mb-4 text-sm text-g-600"
      >应付冲应收以主数据确认的统一往来单位匹配；跨往来仍须在工作台明确启用并授权。</p
    >
    <PayableMatchRuleEditor
      ref="relationEditorRef"
      v-model="editingRules"
      :context-label="editingConfig ? relationLabel(editingConfig.relation) : ''"
    />
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
  import PayableMatchRuleEditor from '@/components/business/payable-match-rule-editor/index.vue'
  import type { ColumnOption } from '@/types'
  import {
    savePayableReference,
    type PayableMatchRule,
    type PayableReference,
    type PayableReferenceKind,
    type PayableRelationRuleConfig,
    type PayableWriteoffRelation
  } from '@/api/payable-reference'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { payablePurposeBusinessTypeOptions } from '@/utils/finance/payable-settlement'
  import { notifyFriendlyError, useArtFeedback } from '@/hooks/core/useArtFeedback'
  import {
    newPayableMatchRule,
    validatePayableMatchRules,
    newPayableRelationConfig,
    validatePayableRelationConfigs
  } from '@/utils/finance/payable-match'
  const props = withDefaults(
    defineProps<{
      kind: PayableReferenceKind
      configurationVersion?: number
      relationOptions?: Array<{ label: string; value: PayableWriteoffRelation }>
      defaultRelation?: PayableWriteoffRelation
    }>(),
    { configurationVersion: 0, relationOptions: () => [] }
  )
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  watch(
    [() => formRef.value?.readyToSubmit, dialogRef],
    ([ready]) => dialogRef.value?.setOptions({ confirmDisabled: !ready }),
    { flush: 'sync' }
  )
  const commonEditorRef = ref<InstanceType<typeof PayableMatchRuleEditor>>()
  const relationEditorRef = ref<InstanceType<typeof PayableMatchRuleEditor>>()
  const relationDialogRef = ref<ArtDialogExpose>()
  const deleteGuardRef = ref<InstanceType<typeof MasterDataDeleteGuard>>()
  const { confirmDelete } = useArtFeedback()
  const form = ref<PayableReference>({ code: '', name: '', enabled: true })
  const supportsMatrix = computed(() => props.configurationVersion === 2)
  const separateRules = ref(false)
  const pendingRelation = ref<PayableWriteoffRelation>()
  const editingConfig = shallowRef<PayableRelationRuleConfig>()
  const editingRules = ref<PayableMatchRule[]>([])
  const commonRules = computed({
    get: () => form.value.rules || [],
    set: (value: PayableMatchRule[]) => {
      form.value.rules = value
    }
  })
  const availableRelations = computed(() =>
    props.relationOptions.filter(
      (option) => !form.value.relationRules?.some((config) => config.relation === option.value)
    )
  )
  const relationLabel = (relation: PayableWriteoffRelation) =>
    props.relationOptions.find((option) => option.value === relation)?.label || relation
  const relationColumns: ColumnOption<PayableRelationRuleConfig>[] = [
    {
      prop: 'relation',
      label: '核销关系',
      minWidth: 170,
      formatter: (row) => relationLabel(row.relation)
    },
    {
      prop: 'rules',
      label: '匹配条件',
      width: 125,
      formatter: (row) => `${row.rules.length} 项条件`
    },
    { prop: 'description', label: '关系说明', minWidth: 260, useSlot: true },
    { prop: 'operation', label: '操作', width: 104, fixed: 'right', useSlot: true }
  ]
  function addRelation(): void {
    if (
      !pendingRelation.value ||
      !availableRelations.value.some((option) => option.value === pendingRelation.value)
    )
      return
    form.value.relationRules?.push(newPayableRelationConfig(pendingRelation.value))
    pendingRelation.value = availableRelations.value[0]?.value
  }
  async function editRelation(config: PayableRelationRuleConfig): Promise<void> {
    const current = form.value
    editingConfig.value = config
    editingRules.value = cloneDeep(config.rules)
    await relationDialogRef.value?.handleOpen(undefined, {
      title: `核销匹配规则 · ${relationLabel(config.relation)}`,
      onConfirm: async () => {
        if (!(await relationEditorRef.value?.validate())) return false
        if (form.value !== current || !form.value.relationRules?.includes(config)) return false
        config.rules = cloneDeep(editingRules.value)
        return true
      }
    })
  }
  async function removeRelation(config: PayableRelationRuleConfig): Promise<void> {
    const current = form.value
    const guard = deleteGuardRef.value
    if (!guard) {
      ElMessage.warning('关联检查尚未就绪，请重新打开配置后再试')
      return
    }
    if (
      await guard.inspect({
        resourceLabel: '核销关系',
        resources: [{ id: config.relation, label: relationLabel(config.relation) }],
        fetchDependencies: async () => []
      })
    )
      return
    try {
      await confirmDelete('移除此关系？保存后此方案不再用于该关系，不会删除既有核销记录。')
    } catch {
      return
    }
    if (form.value !== current) return
    form.value.relationRules = form.value.relationRules?.filter((entry) => entry !== config)
    pendingRelation.value = availableRelations.value[0]?.value
  }
  async function beforeModeChange(): Promise<boolean> {
    const current = form.value
    if (!supportsMatrix.value) return false
    if (!separateRules.value) return (await commonEditorRef.value?.validate()) === true
    const configs = form.value.relationRules || []
    if (!configs.length) return true
    const guard = deleteGuardRef.value
    if (!guard) {
      ElMessage.warning('关联检查尚未就绪，请重试')
      return false
    }
    if (
      await guard.inspect({
        resourceLabel: '核销关系配置',
        resources: configs.map((config) => ({
          id: config.relation,
          label: relationLabel(config.relation)
        })),
        fetchDependencies: async () => []
      })
    )
      return false
    try {
      await confirmDelete(
        '切换为共用条件后，所有关系使用第一种关系的规则，历史快照不变。确定继续？'
      )
      return form.value === current
    } catch {
      return false
    }
  }
  function changeMode(): void {
    if (separateRules.value)
      form.value.relationRules = props.relationOptions.map((option) => ({
        relation: option.value,
        description: '',
        rules: cloneDeep(commonRules.value)
      }))
    else {
      form.value.rules = cloneDeep(form.value.relationRules?.[0]?.rules || commonRules.value)
      form.value.relationRules = null
    }
    pendingRelation.value = availableRelations.value[0]?.value
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
    if (props.kind === 'scheme' && value?.relationRules != null && !supportsMatrix.value) {
      ElMessage.warning('分关系配置能力尚未就绪，请刷新后再修改')
      return
    }
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
    if (!value && props.kind === 'scheme' && supportsMatrix.value) {
      const relation =
        props.defaultRelation &&
        props.relationOptions.some((option) => option.value === props.defaultRelation)
          ? props.defaultRelation
          : props.relationOptions[0]?.value || 'payable_payment'
      form.value.relationRules = [newPayableRelationConfig(relation)]
    }
    separateRules.value = form.value.relationRules != null
    pendingRelation.value = availableRelations.value[0]?.value
    await dialogRef.value?.handleOpen(undefined, {
      title: `${value ? '编辑' : '新增'}${props.kind === 'purpose' ? '付款用途' : props.kind === 'method' ? '结算方式' : '核销方案'}`,
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        if (props.kind === 'scheme') {
          if (!separateRules.value && !(await commonEditorRef.value?.validate())) return false
          const invalid = separateRules.value
            ? validatePayableRelationConfigs(form.value.relationRules)
            : validatePayableMatchRules(form.value.rules)
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
  function close(): void {
    void relationDialogRef.value?.handleClose()
    void dialogRef.value?.handleClose()
  }
  defineExpose({ open, close })
</script>
