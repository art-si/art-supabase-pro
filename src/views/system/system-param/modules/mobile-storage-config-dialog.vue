<template>
  <ArtDialog ref="dialogRef" size="md">
    <div class="mobile-storage-config-dialog">
      <section class="mobile-storage-config-dialog__context">
        <span aria-hidden="true"><ArtSvgIcon icon="ri:smartphone-line" /></span>
        <div>
          <strong>设置移动端可选模式</strong>
          <p>这里控制是否向时光记事用户开放云端选项，每位用户仍可在自己的设备上选择。</p>
        </div>
      </section>

      <ArtForm
        ref="formRef"
        v-model="form"
        :items="items"
        :rules="rules"
        :span="24"
        label-position="top"
        label-width="auto"
        :validate-on-rule-change="false"
      />

      <p class="mobile-storage-config-dialog__note">
        <ArtSvgIcon icon="ri:information-line" />
        本机存储始终可用且默认启用；选择云端的用户需要登录。该选项不会替用户切换存储方式。
      </p>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { nextTick, ref } from 'vue'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { saveWebsiteConfig } from '@/api/system-manage/website-config'

  type WebsiteConfig = Api.SystemManage.WebsiteConfigItem
  type StorageModeForm = { mode: 'local-only' | 'local-and-cloud' }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  const emit = defineEmits<{ success: [config: WebsiteConfig] }>()
  const dialogRef = ref<ArtDialogExpose<WebsiteConfig>>()
  const formRef = ref<ArtFormExpose>()
  const config = ref<WebsiteConfig | null>(null)
  const form = ref<StorageModeForm>({ mode: 'local-only' })
  const items: FormItem[] = [
    {
      label: '可用模式',
      key: 'mode',
      type: 'radioGroup',
      span: 24,
      props: {
        optionType: 'button',
        options: [
          { label: '仅本机', value: 'local-only' },
          { label: '本机 + Supabase 云端', value: 'local-and-cloud' }
        ]
      },
      description: '新安装默认使用本机存储；开放云端后，用户可在“我的”页面自行切换。'
    }
  ]
  const rules: FormRules<StorageModeForm> = {
    mode: [{ required: true, message: '请选择移动端可用模式', trigger: 'change' }]
  }

  const handleConfirm = async (): Promise<boolean> => {
    if (!(await validateArtFormForSubmit(formRef.value))) return false
    const current = config.value
    if (!current?.id) return false

    try {
      const next = {
        ...current,
        noteStorageCloudEnabled: form.value.mode === 'local-and-cloud'
      }
      await saveWebsiteConfig(next)
      emit('success', next)
      ElMessage.success('移动端存储选项已保存')
      return true
    } catch (error) {
      notifyFriendlyError(error, '保存失败，请检查平台配置权限后重试', 'warning')
      return false
    }
  }

  const handleOpen = async (value?: WebsiteConfig | null): Promise<void> => {
    if (!value?.id) return
    config.value = value
    form.value = { mode: value.noteStorageCloudEnabled ? 'local-and-cloud' : 'local-only' }
    await nextTick()
    formRef.value?.clearValidate()
    await dialogRef.value?.handleOpen(value, {
      title: '时光记事存储模式',
      subtitle: '这里只配置可选项，不会改变任何用户当前的存储方式。',
      confirmText: '保存选项',
      onConfirm: handleConfirm
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .mobile-storage-config-dialog {
    display: grid;
    gap: 18px;

    &__context {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--art-surface-radius);

      > span {
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        font-size: 18px;
        color: var(--el-color-primary);
        background: var(--el-bg-color);
        border-radius: var(--art-control-radius);
      }

      strong {
        display: block;
        line-height: 1.4;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__note {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      padding: 12px 14px;
      margin: 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-lighter);
      border-radius: var(--art-control-radius);

      :deep(.art-svg-icon) {
        flex: none;
        margin-top: 2px;
        color: var(--el-color-primary);
      }
    }
  }
</style>
