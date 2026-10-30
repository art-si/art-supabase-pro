<template>
  <ArtDrawer
    ref="drawerRef"
    :size="720"
    :show-confirm-button="false"
    :show-form-focus-button="false"
    cancel-text="关闭"
    @closed="content = ''"
  >
    <div class="flex min-w-0 flex-col gap-3">
      <div class="flex items-center justify-between gap-3 text-xs text-g-600"
        ><span class="truncate font-mono" :title="columnName">{{ columnName }}</span
        ><span class="shrink-0">{{ content.length.toLocaleString() }} 字符</span></div
      >
      <PlanCodePreview
        :key="revision"
        title="单元格内容"
        :language="language"
        :code="content"
        expanded
        max-height="calc(100dvh - 320px)"
      />
    </div>
  </ArtDrawer>
</template>
<script setup lang="ts">
  import { ref } from 'vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import PlanCodePreview from './plan-code-preview.vue'
  export interface CellContentOpenData {
    content: string
    columnName: string
  }
  export interface CellContentViewExpose {
    handleOpen: (data: CellContentOpenData) => Promise<void>
    reset: () => void
  }
  const drawerRef = ref<ArtDrawerExpose>()
  const columnName = ref('')
  const content = ref('')
  const language = ref<'sql' | 'json' | 'plaintext'>('plaintext')
  const revision = ref(0)
  const handleOpen = async (data: CellContentOpenData) => {
    revision.value++
    columnName.value = data.columnName
    content.value = data.content
    language.value = 'plaintext'
    try {
      content.value = JSON.stringify(JSON.parse(data.content), null, 2)
      language.value = 'json'
    } catch {
      if (
        /\b(sql|query)\b/i.test(data.columnName) &&
        /^(select|with|insert|update|delete|create)\b/i.test(data.content.trim())
      )
        language.value = 'sql'
    }
    await drawerRef.value?.handleOpen(undefined, {
      title: '单元格详情',
      subtitle: '只读查看 · 支持查找、换行和复制',
      headerIcon: 'ri:braces-line'
    })
  }
  defineExpose<CellContentViewExpose>({
    handleOpen,
    reset: () => {
      content.value = ''
      drawerRef.value?.handleClose()
    }
  })
</script>
