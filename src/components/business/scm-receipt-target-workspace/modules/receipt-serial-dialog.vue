<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="space-y-4">
      <ArtEntitySummary
        icon="ri:qr-scan-2-line"
        eyebrow="SERIAL RECEIVING"
        title="逐件录入收料 SN"
        :description="`${context?.line.lineSnapshot.materialDescription || context?.line.lineSnapshot.materialCode || '物料'} · ${context?.documentNo || ''}`"
      />
      <ElAlert type="info" :closable="false" show-icon>
        本行库存数量 {{ expectedQuantity }} 件。每行填写一个唯一
        SN；确认入库时会再次校验件数，并逐件写入库存和流水。
      </ElAlert>
      <ArtForm
        ref="formRef"
        :model-value="form"
        @update:model-value="replaceReactiveModel(form, $event)"
        :items="items"
        :rules="rules"
        label-position="top"
        :show-reset="false"
        :show-submit="false"
      />
      <p class="text-xs text-[var(--el-text-color-secondary)]"
        >已输入 {{ parsedSerials.length }} 个 SN</p
      >
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { replaceReactiveModel } from '@/utils/form/model'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
  import { setScmReceiptLineSerials, type ScmReceiptTargetLine } from '@/api/scm-receipt-target'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'

  interface Context {
    documentNo: string
    line: ScmReceiptTargetLine
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<Context>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const context = shallowRef<Context>()
  const form = reactive({ serialText: '' })
  const expectedQuantity = computed(() =>
    Number(
      context.value?.line.lineSnapshot.stockQuantity ??
        context.value?.line.lineSnapshot.quantity ??
        0
    )
  )
  const parsedSerials = computed(() =>
    form.serialText
      .split(/[\s,，;；]+/)
      .map((value) => value.trim())
      .filter(Boolean)
  )
  const items: FormItem[] = [
    {
      key: 'serialText',
      label: '序列号清单',
      type: 'input',
      span: 24,
      props: { type: 'textarea', rows: 8, placeholder: '每行一个序列号；支持粘贴扫码结果' }
    }
  ]
  const rules = { serialText: [{ required: true, message: '请录入本行全部 SN', trigger: 'blur' }] }

  async function submit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      if (!context.value) return false
      if (
        expectedQuantity.value % 1 !== 0 ||
        parsedSerials.value.length !== expectedQuantity.value ||
        new Set(parsedSerials.value).size !== parsedSerials.value.length
      ) {
        ElMessage.warning('SN 编码必须逐件唯一，件数应等于本行库存数量')
        return false
      }
      await setScmReceiptLineSerials(context.value.line.id, parsedSerials.value)
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, '收料 SN 保存失败，请检查件数、编码和权限后重试')
      return false
    }
  }
  async function handleOpen(data: Context): Promise<void> {
    context.value = data
    form.serialText = data.line.serialNos?.join('\n') || ''
    await dialogRef.value?.handleOpen(data, {
      title: '录入收料序列号',
      subtitle: '提交前核对库存数量与唯一编码',
      onConfirm: submit
    })
  }
  defineExpose({ handleOpen })
</script>
