<template>
  <ArtDrawer
    ref="drawerRef"
    :size="720"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="关闭"
    @closed="clearClosedContent"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <div class="flex items-center justify-between gap-3 text-xs text-g-600"
        ><span class="truncate font-mono" :title="columnName">{{ columnName }}</span
        ><span class="shrink-0">{{ content.length.toLocaleString() }} 字符</span></div
      >
      <PlanCodePreview
        ref="codePreview"
        :key="revision"
        :title="codeTitle"
        :language="language"
        :code="content"
        expanded
        max-height="calc(100dvh - 320px)"
      />
    </div>
  </ArtDrawer>
</template>
<script setup lang="ts">
  import { ref, unref } from 'vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import PlanCodePreview, { type PlanCodePreviewExpose } from './plan-code-preview.vue'
  import { formatSqlJsonText } from './sql-json-text'
  export interface CellContentOpenData {
    content: string
    columnName: string
    preserveRaw?: boolean
    title?: string
    subtitle?: string
    codeTitle?: string
    /** Highlight known source text without parsing or reformatting it when preserveRaw is true. */
    language?: 'sql' | 'json' | 'plaintext'
  }
  export interface CellContentViewExpose {
    handleOpen: (data: CellContentOpenData) => Promise<void>
    reset: () => void
  }
  const drawerRef = ref<ArtDrawerExpose>()
  const codePreview = ref<PlanCodePreviewExpose>()
  const columnName = ref('')
  const content = ref('')
  const codeTitle = ref('单元格内容')
  const language = ref<'sql' | 'json' | 'plaintext'>('plaintext')
  const revision = ref(0)
  const clearClosedContent = (): void => {
    if (!unref(drawerRef.value?.visible)) content.value = ''
  }
  const handleOpen = async (data: CellContentOpenData) => {
    codePreview.value?.invalidateCopy()
    revision.value++
    columnName.value = data.columnName
    content.value = data.content
    codeTitle.value = data.codeTitle ?? '单元格内容'
    language.value = data.language ?? 'plaintext'
    if (!data.preserveRaw) {
      try {
        JSON.parse(data.content)
        content.value = formatSqlJsonText(data.content)
        language.value = 'json'
      } catch {
        if (
          /\b(sql|query)\b/i.test(data.columnName) &&
          /^(select|with|insert|update|delete|create)\b/i.test(data.content.trim())
        )
          language.value = 'sql'
      }
    }
    await drawerRef.value?.handleOpen(undefined, {
      title: data.title ?? '单元格详情',
      subtitle: data.subtitle ?? '只读查看 · 支持查找、换行和复制',
      headerIcon: 'ri:braces-line'
    })
  }
  defineExpose<CellContentViewExpose>({
    handleOpen,
    reset: () => {
      codePreview.value?.invalidateCopy()
      content.value = ''
      drawerRef.value?.handleClose()
    }
  })
</script>
