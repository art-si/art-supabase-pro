<template>
  <ArtDialog
    ref="dialogRef"
    title="采购转固"
    size="sm"
    :loading="optionsLoading"
    loading-text="正在加载转固选项…"
    :confirm-disabled="busy || failed"
    @close="invalidateOptions"
  >
    <ElAlert
      title="每条所选出库明细生成一张资产草稿，金额取未税金额；请在固定资产中核对后办理转固。"
      type="info"
      :closable="false"
      class="mb-4"
    />
    <ArtForm
      ref="formRef"
      v-model="form"
      :items="items"
      :rules="rules"
      :disabled="busy"
      :span="24"
      label-position="top"
    />
    <ElButton v-if="failed" link type="primary" @click="loadOptions()">重新加载账套与类别</ElButton>
  </ArtDialog>
</template>
<script setup lang="ts">
  import dayjs from 'dayjs'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'

  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { useArtOverlaySession } from '@/hooks/core/useArtOverlay'
  import {
    fetchWmsAssetAccountSets,
    fetchWmsAssetCategories,
    pushWmsOtherAssets,
    type WmsAssetSelection
  } from '@/api/wms-asset-capitalization'
  const emit = defineEmits<{ success: [ids: string[]] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const session = useArtOverlaySession(() => Boolean(unref(dialogRef.value?.visible)))
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const form = ref({ accountSetId: '', categoryId: '', date: dayjs().format('YYYY-MM-DD') })
  const tenantId = ref('')
  const selections = ref<WmsAssetSelection[]>([])
  const accountSets = ref<Array<{ label: string; value: string }>>([])
  const categories = ref<Array<{ label: string; value: string }>>([])
  const failed = ref(false)
  const optionsLoading = ref(false)
  const saving = ref(false)
  const busy = computed(() => optionsLoading.value || saving.value)
  let request = 0
  const items = computed<FormItem[]>(() => [
    {
      key: 'accountSetId',
      label: '账套',
      type: 'select',
      props: { options: accountSets.value, onChange: () => loadOptions(false) }
    },
    {
      key: 'categoryId',
      label: '资产类别',
      type: 'select',
      props: { options: categories.value, disabled: !form.value.accountSetId }
    },
    { key: 'date', label: '取得日期', type: 'date', props: { valueFormat: 'YYYY-MM-DD' } }
  ])
  const rules = {
    accountSetId: [{ required: true, message: '请选择账套' }],
    categoryId: [{ required: true, message: '请选择资产类别' }],
    date: [{ required: true, message: '请选择取得日期' }]
  }
  function invalidateOptions(): void {
    session.invalidate()
    request++
    optionsLoading.value = false
    saving.value = false
    failed.value = false
  }
  async function loadOptions(refreshAccounts = true): Promise<void> {
    const current = ++request
    const currentSession = session.version.value
    optionsLoading.value = true
    failed.value = false
    categories.value = []
    form.value.categoryId = ''
    try {
      if (refreshAccounts) {
        const rows = await fetchWmsAssetAccountSets(tenantId.value)
        if (current !== request || !session.isCurrent(currentSession)) return
        const selectedAccount = form.value.accountSetId
        accountSets.value = rows
        form.value.accountSetId = selectedAccount
          ? rows.some((row) => row.value === selectedAccount)
            ? selectedAccount
            : ''
          : rows[0]?.value || ''
      }
      const accountSetId = form.value.accountSetId
      if (!accountSetId) return
      const result = await fetchWmsAssetCategories(accountSetId)
      if (
        current !== request ||
        !session.isCurrent(currentSession) ||
        form.value.accountSetId !== accountSetId
      )
        return
      categories.value = result
    } catch (error) {
      if (current !== request || !session.isCurrent(currentSession)) return
      failed.value = true
      notifyFriendlyError(error, '账套或资产类别加载失败，请重试')
    } finally {
      if (current === request && session.isCurrent(currentSession)) optionsLoading.value = false
    }
  }
  async function open(targetTenantId: string, rows: WmsAssetSelection[]): Promise<void> {
    invalidateOptions()
    tenantId.value = targetTenantId
    selections.value = rows
    form.value = { accountSetId: '', categoryId: '', date: dayjs().format('YYYY-MM-DD') }
    accountSets.value = []
    categories.value = []
    optionsLoading.value = true
    await dialogRef.value?.handleOpen(undefined, {
      onConfirm: submit,
      confirmText: '生成资产草稿',
      onOpen: () => {
        void loadOptions()
      }
    })
  }
  async function submit(): Promise<boolean> {
    const currentSession = session.version.value
    if (busy.value || failed.value || !(await validateArtFormForSubmit(formRef.value))) return false
    if (busy.value || failed.value || !session.isCurrent(currentSession)) return false
    saving.value = true
    try {
      const ids = await pushWmsOtherAssets({ ...form.value, selections: selections.value })
      ElMessage.success(`已生成 ${ids.length} 张资产草稿`)
      emit('success', ids)
      return true
    } catch (error) {
      notifyFriendlyError(error, '采购转固失败，请核对所选明细后重试')
      return false
    } finally {
      if (currentSession === session.version.value) saving.value = false
    }
  }
  defineExpose({ open })
</script>
