<template>
  <ArtDialog ref="dialogRef" size="xl" :confirm-disabled="!formRef?.controlsReady">
    <ElAlert
      class="mb-4"
      title="请核对文书内容与双方授权后签署。签署完成后，正文和签署凭据将锁定。"
      type="info"
      :closable="false"
      show-icon
    />
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="items"
      :rules="rules"
      :span="12"
      label-width="96px"
      scroll-to-error
    />
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElAlert, type FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { persistSignatureImage } from '@/components/core/forms/art-signature-pad/signature-image'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import type {
    ContractSigningInput,
    ContractSigningOpenData,
    ContractSigningDialogExpose
  } from './types'

  defineOptions({ name: 'ContractSigningDialog' })
  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const initial = (): ContractSigningInput & { authorized: boolean } => ({
    partyASignatureUrl: '',
    partyASealUrl: '',
    partyBSignatureUrl: '',
    partyBSealUrl: '',
    authorized: false
  })
  const form = reactive({ data: initial(), saving: false })
  const signing = shallowRef<ContractSigningOpenData>()
  let session = 0
  const items = computed<FormItem[]>(() => [
    {
      key: 'partyASection',
      label: `甲方 · ${signing.value?.partyAName || ''}`,
      type: 'divider',
      span: 24
    },
    {
      key: 'partyASignatureUrl',
      label: '手写签名',
      type: 'signature',
      props: { resourceTenantId: signing.value?.tenantId || '', disabled: form.saving },
      description: '可用鼠标、触屏书写，或上传已有手写签名图片。'
    },
    {
      key: 'partyASealUrl',
      label: '电子印章',
      type: 'uploadImage',
      props: {
        title: '上传印章',
        resourceTenantId: signing.value?.tenantId || '',
        fileType: 'image/png,image/jpeg,image/webp',
        fileSize: 2 * 1024 * 1024,
        showResourcePicker: false,
        previewFit: 'contain',
        disabled: form.saving
      },
      description: '上传已授权的印章图片；本方至少提供签名或印章一项。'
    },
    {
      key: 'partyBSection',
      label: `乙方 · ${signing.value?.partyBName || ''}`,
      type: 'divider',
      span: 24
    },
    {
      key: 'partyBSignatureUrl',
      label: '手写签名',
      type: 'signature',
      props: { resourceTenantId: signing.value?.tenantId || '', disabled: form.saving },
      description: '可用鼠标、触屏书写，或上传已有手写签名图片。'
    },
    {
      key: 'partyBSealUrl',
      label: '电子印章',
      type: 'uploadImage',
      props: {
        title: '上传印章',
        resourceTenantId: signing.value?.tenantId || '',
        fileType: 'image/png,image/jpeg,image/webp',
        fileSize: 2 * 1024 * 1024,
        showResourcePicker: false,
        previewFit: 'contain',
        disabled: form.saving
      },
      description: '上传已授权的印章图片；本方至少提供签名或印章一项。'
    },
    {
      key: 'authorized',
      label: '签署确认',
      type: 'checkbox',
      span: 24,
      props: { label: '我已核对文书，并确认本次签署取得双方授权', disabled: form.saving }
    }
  ])
  const evidenceValidator =
    (party: 'A' | 'B') => (_rule: unknown, _value: unknown, callback: (error?: Error) => void) => {
      const hasEvidence =
        party === 'A'
          ? form.data.partyASignatureUrl || form.data.partyASealUrl
          : form.data.partyBSignatureUrl || form.data.partyBSealUrl
      callback(
        hasEvidence
          ? undefined
          : new Error(`请提供${party === 'A' ? '甲方' : '乙方'}手写签名或印章`)
      )
    }
  const rules: FormRules = {
    partyASignatureUrl: [{ validator: evidenceValidator('A'), trigger: 'change' }],
    partyBSignatureUrl: [{ validator: evidenceValidator('B'), trigger: 'change' }],
    authorized: [
      {
        validator: (_rule, value, callback) =>
          callback(value === true ? undefined : new Error('请确认双方授权后签署')),
        trigger: 'change'
      }
    ]
  }
  watch(
    () => [form.data.partyASealUrl, form.data.partyBSealUrl],
    () => formRef.value?.clearValidate(['partyASignatureUrl', 'partyBSignatureUrl'])
  )
  const handleOpen: ContractSigningDialogExpose['handleOpen'] = async (data) => {
    const currentSession = ++session
    signing.value = data
    form.data = initial()
    await dialogRef.value?.handleOpen(undefined, {
      title: data.title,
      subtitle: data.documentNo,
      confirmText: '确认签署',
      contentMaxHeight: '76vh',
      dialogProps: { closeOnClickModal: false },
      onConfirm: async () => {
        if (!(await validateArtFormForSubmit(formRef.value))) return false
        form.saving = true
        try {
          const [partyASignatureUrl, partyBSignatureUrl] = await Promise.all([
            persistSignatureImage(form.data.partyASignatureUrl, data.tenantId),
            persistSignatureImage(form.data.partyBSignatureUrl, data.tenantId)
          ])
          if (currentSession !== session) return false
          // Keep successful uploads when a concurrent approval or persistence check rejects signing.
          Object.assign(form.data, { partyASignatureUrl, partyBSignatureUrl })
          await data.onSubmit({
            partyASignatureUrl,
            partyBSignatureUrl,
            partyASealUrl: form.data.partyASealUrl,
            partyBSealUrl: form.data.partyBSealUrl
          })
          if (currentSession !== session) return false
          emit('success')
          return true
        } catch (error) {
          if (currentSession === session)
            notifyFriendlyError(error, '签署失败，请核对审批状态和签署凭据后重试')
          return false
        } finally {
          if (currentSession === session) form.saving = false
        }
      },
      onReset: () => {
        session++
        form.data = initial()
        form.saving = false
        signing.value = undefined
      }
    })
  }
  defineExpose<ContractSigningDialogExpose>({ handleOpen })
</script>
