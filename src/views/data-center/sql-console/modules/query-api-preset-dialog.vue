<template>
  <ArtDialog
    ref="dialog"
    size="sm"
    :show-form-focus-button="false"
    :show-fullscreen-button="false"
    confirm-text="保存方案"
    cancel-text="取消"
    :on-confirm="save"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <ArtForm
        ref="formRef"
        v-model="form.data"
        :items="form.items"
        :rules="form.rules"
        :disabled="submitting"
        label-position="top"
        class="px-0! pt-0!"
      />
      <p class="m-0 text-xs leading-5 text-g-700">
        名称为 1–32 个字符。仅保存在本机当前账号、当前租户的此 API 下，不会自动调用 API。
      </p>
      <p v-if="error" class="m-0 text-xs leading-5 text-danger" role="alert">{{ error }}</p>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { onBeforeUnmount, onDeactivated, reactive, ref, watch } from 'vue'
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import {
    normalizeQueryApiPresetName,
    SqlQueryApiPresetError
  } from './query-api-parameter-presets'

  defineOptions({ name: 'SqlQueryApiPresetDialog' })

  export interface QueryApiPresetDialogOpenData {
    initialName?: string
    onSave: (name: string) => Promise<boolean> | boolean
  }
  export interface QueryApiPresetDialogExpose {
    open: (data: QueryApiPresetDialogOpenData) => Promise<void>
    reset: () => void
  }
  interface PresetFormData {
    name: string
  }
  interface PresetForm {
    data: PresetFormData
    items: FormItem[]
    rules: FormRules<PresetFormData>
  }
  const dialog = ref<ArtDialogExpose>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const submitting = ref(false)
  const error = ref('')
  const form = reactive<PresetForm>({
    data: { name: '' },
    items: [
      {
        key: 'name',
        label: '方案名称',
        type: 'input',
        span: 24,
        placeholder: '例如：本月华东订单',
        props: { clearable: true, 'aria-label': '方案名称' }
      }
    ],
    rules: {
      name: [
        {
          required: true,
          trigger: ['blur', 'change'],
          validator: (_rule, value: unknown, callback) => {
            try {
              normalizeQueryApiPresetName(value)
              callback()
            } catch (cause) {
              callback(
                cause instanceof SqlQueryApiPresetError
                  ? cause
                  : new Error('方案名称不可用，请重新输入', { cause })
              )
            }
          }
        }
      ]
    }
  })
  let generation = 0
  let active = false
  let alive = true
  let saveHandler: QueryApiPresetDialogOpenData['onSave'] | undefined
  const current = (version: number): boolean => alive && active && version === generation
  const invalidate = (): void => {
    generation++
    active = false
    saveHandler = undefined
    submitting.value = false
    error.value = ''
    form.data = { name: '' }
    formRef.value?.clearValidate()
  }
  const reset = (): void => {
    invalidate()
    void dialog.value?.handleClose(true)
  }
  const save = async (): Promise<boolean> => {
    const handler = saveHandler
    if (!alive || !active || submitting.value || !handler) return false
    const version = generation
    submitting.value = true
    error.value = ''
    try {
      let valid = false
      try {
        valid = Boolean(await formRef.value?.validate())
      } catch (cause) {
        if (current(version) && cause instanceof Error)
          error.value = '方案名称校验未完成，请重新输入后重试。'
        return false
      }
      if (!valid || !current(version) || saveHandler !== handler) return false
      const name = normalizeQueryApiPresetName(form.data.name)
      const saved = await handler(name)
      if (!current(version) || saveHandler !== handler) return false
      if (!saved) {
        error.value = '方案未保存，请核对参数或重新读取方案后重试。'
        return false
      }
      return true
    } catch (cause) {
      if (current(version))
        error.value =
          cause instanceof SqlQueryApiPresetError ? cause.message : '参数方案保存失败，请重试。'
      return false
    } finally {
      if (current(version)) submitting.value = false
    }
  }
  const open = async (data: QueryApiPresetDialogOpenData): Promise<void> => {
    if (!alive) return
    invalidate()
    const version = generation
    active = true
    saveHandler = data.onSave
    form.data = { name: data.initialName ?? '' }
    await dialog.value?.handleOpen(undefined, {
      title: '保存参数方案',
      subtitle: '复用当前已填参数，不修改 API 定义',
      onClose: () => {
        if (!current(version)) return false
        invalidate()
        return true
      }
    })
  }
  watch(
    () => form.data.name,
    () => {
      if (!submitting.value) error.value = ''
    }
  )
  onDeactivated(reset)
  onBeforeUnmount(() => {
    alive = false
    invalidate()
  })
  defineExpose<QueryApiPresetDialogExpose>({ open, reset })
</script>
