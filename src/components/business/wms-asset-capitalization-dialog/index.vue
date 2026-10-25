<template>
  <ArtDialog ref="dialogRef" title="采购转固" size="sm">
    <ElAlert
      title="每条所选出库明细生成一张资产草稿，金额取未税金额；请在固定资产中核对后办理转固。"
      type="info"
      :closable="false"
      class="mb-4"
    />
    <ArtForm
      ref="formRef"
      :model-value="form"
      @update:model-value="replaceReactiveModel(form, $event)"
      :items="items"
      :rules="rules"
      :span="24"
      :show-submit="false"
      :show-reset="false"
      label-position="top"
    />
    <ElButton v-if="failed" link type="primary" @click="loadOptions">重新加载账套与类别</ElButton>
  </ArtDialog>
</template>
<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { replaceReactiveModel } from '@/utils/form/model'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import {
    fetchWmsAssetAccountSets,
    fetchWmsAssetCategories,
    pushWmsOtherAssets,
    type WmsAssetSelection
  } from '@/api/wms-asset-capitalization'
  const emit = defineEmits<{ success: [ids: string[]] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = reactive({ accountSetId: '', categoryId: '', date: dayjs().format('YYYY-MM-DD') })
  const tenantId = ref('')
  const selections = ref<WmsAssetSelection[]>([])
  const accountSets = ref<Array<{ label: string; value: string }>>([])
  const categories = ref<Array<{ label: string; value: string }>>([])
  const failed = ref(false)
  const busy = ref(false)
  let request = 0
  const items = computed<FormItem[]>(() => [
    {
      key: 'accountSetId',
      label: '账套',
      type: 'select',
      props: { options: accountSets.value, disabled: busy.value },
      onChange: loadCategories
    },
    {
      key: 'categoryId',
      label: '资产类别',
      type: 'select',
      props: { options: categories.value, disabled: busy.value || !form.accountSetId }
    },
    { key: 'date', label: '取得日期', type: 'date', props: { valueFormat: 'YYYY-MM-DD' } }
  ])
  const rules = {
    accountSetId: [{ required: true, message: '请选择账套' }],
    categoryId: [{ required: true, message: '请选择资产类别' }],
    date: [{ required: true, message: '请选择取得日期' }]
  }
  async function loadCategories(): Promise<void> {
    const current = ++request
    categories.value = []
    form.categoryId = ''
    if (!form.accountSetId) return
    try {
      const result = await fetchWmsAssetCategories(form.accountSetId)
      if (current !== request) return
      categories.value = result
    } catch (error) {
      failed.value = true
      notifyFriendlyError(error, '资产类别加载失败，请重试')
    }
  }
  async function loadOptions(): Promise<void> {
    failed.value = false
    busy.value = true
    try {
      accountSets.value = await fetchWmsAssetAccountSets(tenantId.value)
      form.accountSetId = accountSets.value[0]?.value || ''
      await loadCategories()
    } catch (error) {
      failed.value = true
      notifyFriendlyError(error, '账套加载失败，请重试')
    } finally {
      busy.value = false
    }
  }
  async function open(targetTenantId: string, rows: WmsAssetSelection[]): Promise<void> {
    tenantId.value = targetTenantId
    selections.value = rows
    form.date = dayjs().format('YYYY-MM-DD')
    await dialogRef.value?.handleOpen(undefined, { onConfirm: submit, confirmText: '生成资产草稿' })
    await loadOptions()
  }
  async function submit(): Promise<boolean> {
    if (busy.value || failed.value || !(await validateArtFormForSubmit(formRef.value))) return false
    busy.value = true
    try {
      const ids = await pushWmsOtherAssets({ ...form, selections: selections.value })
      ElMessage.success(`已生成 ${ids.length} 张资产草稿`)
      emit('success', ids)
      return true
    } catch (error) {
      notifyFriendlyError(error, '采购转固失败，请核对所选明细后重试')
      return false
    } finally {
      busy.value = false
    }
  }
  defineExpose({ open })
</script>
