<template>
  <section aria-label="OpenAPI 规范工具" class="mb-3 flex min-w-0 flex-col gap-2">
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <ArtIconButton
        size="small"
        icon="ri:code-s-slash-line"
        label="预览 OpenAPI 规范"
        :disabled="disabled || previewBusy"
        :loading="previewBusy"
        @click="preview"
      />
      <ArtIconButton
        size="small"
        icon="ri:download-2-line"
        label="下载 OpenAPI 规范"
        :disabled="disabled || previewBusy"
        @click="download"
      />
      <p class="m-0 min-w-0 text-xs leading-5 text-g-700">
        可导入接口工具；生成规范不会执行 SQL。
        <span v-if="!definition.enabled">此 API 已停用，仍可查看规范。</span>
      </p>
    </div>
    <p v-if="error" class="m-0 break-words text-xs leading-5 text-danger" role="alert">
      {{ error }}
    </p>
    <CellContentView ref="detail" />
  </section>
</template>

<script setup lang="ts">
  import { onActivated, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
  import type { SqlQueryApiDefinition } from '@/types/sql-query-api'
  import { downloadBlob } from '@/utils/file'
  import CellContentView, { type CellContentViewExpose } from './cell-content-view.vue'
  import {
    buildSqlQueryApiOpenApi,
    queryApiOpenApiFileName,
    SqlQueryApiOpenApiError
  } from './query-api-openapi'

  defineOptions({ name: 'SqlQueryApiOpenApiControls' })

  export interface QueryApiOpenApiControlsExpose {
    reset: () => void
  }
  const props = defineProps<{
    definition: SqlQueryApiDefinition
    url: string
    owner: string
    disabled?: boolean
  }>()
  const detail = ref<CellContentViewExpose>()
  const previewBusy = ref(false)
  const error = ref('')
  let revision = 0
  let active = true
  let alive = true
  const reset = (): void => {
    revision++
    previewBusy.value = false
    error.value = ''
    detail.value?.reset()
  }
  const captureCurrent = (): (() => boolean) => {
    const version = revision
    const owner = props.owner
    const definition = props.definition
    const url = props.url
    return () =>
      alive &&
      active &&
      !props.disabled &&
      version === revision &&
      owner === props.owner &&
      definition === props.definition &&
      url === props.url
  }
  const preview = async (): Promise<void> => {
    if (!alive || !active || props.disabled || previewBusy.value) return
    const isCurrent = captureCurrent()
    previewBusy.value = true
    error.value = ''
    try {
      const document = buildSqlQueryApiOpenApi(props.definition, props.url)
      const filename = queryApiOpenApiFileName(props.definition.slug)
      const content = JSON.stringify(document, null, 2)
      if (!isCurrent()) return
      const viewer = detail.value
      if (!viewer) {
        error.value = '规范预览尚未就绪，请重试。'
        return
      }
      await viewer.handleOpen({
        content,
        columnName: filename,
        preserveRaw: true,
        codeTitle: '接口规范',
        language: 'json',
        title: 'OpenAPI 规范',
        subtitle: '接口地址、认证、参数与响应定义'
      })
    } catch (cause) {
      if (isCurrent())
        error.value =
          cause instanceof SqlQueryApiOpenApiError ? cause.message : '规范预览失败，请重试。'
    } finally {
      if (isCurrent()) previewBusy.value = false
    }
  }
  const download = (): void => {
    if (!alive || !active || props.disabled || previewBusy.value) return
    const isCurrent = captureCurrent()
    error.value = ''
    try {
      const document = buildSqlQueryApiOpenApi(props.definition, props.url)
      const filename = queryApiOpenApiFileName(props.definition.slug)
      const content = JSON.stringify(document, null, 2)
      if (!isCurrent()) return
      downloadBlob(new Blob([content], { type: 'application/json;charset=utf-8' }), filename)
    } catch (cause) {
      if (isCurrent())
        error.value =
          cause instanceof SqlQueryApiOpenApiError ? cause.message : '规范下载失败，请重试。'
    }
  }
  watch(
    [
      () => props.owner,
      () => props.definition,
      () => props.definition.id,
      () => props.definition.slug,
      () => props.definition.updatedAt,
      () => props.definition.enabled,
      () => props.url,
      () => props.disabled
    ],
    reset,
    { flush: 'sync' }
  )
  onActivated(() => {
    active = true
  })
  onDeactivated(() => {
    active = false
    reset()
  })
  onBeforeUnmount(() => {
    alive = false
    reset()
  })
  defineExpose<QueryApiOpenApiControlsExpose>({ reset })
</script>
