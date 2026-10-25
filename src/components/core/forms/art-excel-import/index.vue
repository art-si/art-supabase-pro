<!-- 导入 Excel 文件 -->
<template>
  <div class="inline-block">
    <input
      ref="fileInputRef"
      class="hidden"
      type="file"
      :accept="accept"
      :disabled="isDisabled"
      @change="handleFileChange"
    />
    <ElButton v-bind="buttonProps" :disabled="isDisabled" v-ripple @click="openFilePicker">
      <template v-if="icon" #icon>
        <component v-if="typeof icon !== 'string'" :is="icon" />
        <ArtSvgIcon v-else :icon="icon" />
      </template>
      <slot>导入 Excel</slot>
    </ElButton>
  </div>
</template>

<script setup lang="ts">
  import { genFileId } from 'element-plus'
  import type { UploadFile, UploadRawFile } from 'element-plus'
  import type { Component } from 'vue'
  import { importExcelFile } from '@/utils/file'

  defineOptions({ name: 'ArtExcelImport' })

  const props = withDefaults(
    defineProps<{
      accept?: string
      disabled?: boolean
      icon?: string | Component
      buttonProps?: Record<string, unknown>
      parseExcel?: boolean
      contextKey?: object | string | number
    }>(),
    {
      accept: '.xlsx, .xls',
      disabled: false,
      buttonProps: () => ({ type: 'primary' }),
      parseExcel: true
    }
  )

  const emit = defineEmits<{
    'file-change': [file: File, uploadFile: UploadFile]
    'import-success': [data: Array<Record<string, unknown>>, file: File, uploadFile: UploadFile]
    'import-error': [error: Error]
    'parsing-change': [parsing: boolean]
  }>()

  const fileInputRef = ref<HTMLInputElement>()
  const isParsing = ref(false)
  watch(isParsing, (value) => emit('parsing-change', value), { flush: 'sync' })
  let parseRequest = 0
  watch(
    () => props.contextKey,
    () => {
      parseRequest += 1
      isParsing.value = false
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    parseRequest += 1
    isParsing.value = false
  })
  const isDisabled = computed(
    () => props.disabled || isParsing.value || Boolean(props.buttonProps?.loading)
  )

  const openFilePicker = (): void => {
    if (!isDisabled.value) fileInputRef.value?.click()
  }

  const handleFileChange = async (event: Event): Promise<void> => {
    if (isDisabled.value) return
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    const rawFile = Object.assign(file, { uid: genFileId() }) as UploadRawFile
    const uploadFile: UploadFile = {
      name: rawFile.name,
      status: 'ready',
      size: rawFile.size,
      uid: rawFile.uid,
      raw: rawFile
    }

    isParsing.value = true
    const request = ++parseRequest
    try {
      if (!props.parseExcel) {
        emit('file-change', rawFile, uploadFile)
        return
      }
      const results = await importExcelFile(rawFile)
      if (request !== parseRequest) return
      emit('import-success', results, rawFile, uploadFile)
    } catch (error) {
      if (request !== parseRequest) return
      emit(
        'import-error',
        error instanceof Error ? error : new Error('导入文件解析失败', { cause: error })
      )
    } finally {
      input.value = ''
      if (request === parseRequest) isParsing.value = false
    }
  }
</script>
