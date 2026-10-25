<template>
  <ArtDrawer
    ref="drawerRef"
    size="50%"
    :show-footer="false"
    append-to-body
    class="cell-content-drawer"
    @opened="editorVisible = true"
    @closed="editorVisible = false"
  >
    <template #header>
      <div class="flex items-center">
        <span class="text-lg font-medium mr-2">查看 </span>
        <el-tag>{{ columnName }}</el-tag>
      </div>
    </template>

    <div class="cell-content-view__editor">
      <Editor
        v-if="editorVisible"
        v-model="formattedContent"
        :language="language"
        :read-only="true"
      />
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { ref } from 'vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import Editor from './editor.vue'

  export interface CellContentOpenData {
    content: string
    columnName: string
  }

  export interface CellContentViewExpose {
    handleOpen: (data: CellContentOpenData) => Promise<void>
  }

  const drawerRef = ref<ArtDrawerExpose<CellContentOpenData>>()
  const columnName = ref('')
  const language = ref('text')
  const formattedContent = ref('')
  const editorVisible = ref(false)

  const resolveContentLanguage = (content: string, column: string) => {
    try {
      JSON.parse(content)
      return 'json'
    } catch {
      // Most scalar cells are plain text.
    }
    const trimmed = content.trim()
    if (/^<\?xml\b/i.test(trimmed)) return 'xml'
    if (/^<!doctype html\b|^<html\b/i.test(trimmed)) return 'html'
    if (
      /\b(sql|query)\b/i.test(column) &&
      /^(select|with|insert|update|delete|create)\b/i.test(trimmed)
    ) {
      return 'pgsql'
    }
    return 'plaintext'
  }

  const formatContent = (content: string) => {
    try {
      const json = JSON.parse(content)
      return JSON.stringify(json, null, 2)
    } catch {
      return content
    }
  }

  const handleOpen = async (data: CellContentOpenData) => {
    columnName.value = data.columnName
    language.value = resolveContentLanguage(data.content, data.columnName)
    formattedContent.value = formatContent(data.content)

    await drawerRef.value?.handleOpen(data, {
      title: '查看',
      size: '50%',
      showFooter: false
    })
  }

  defineExpose<CellContentViewExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  :global(.cell-content-drawer) {
    display: flex;
    flex-direction: column;

    .el-drawer__header {
      flex: 0 0 auto;
    }

    .el-drawer__body {
      --art-drawer-content-padding: 0;

      display: flex;
      flex: 1;
      flex-direction: column;
      height: auto;
      min-height: 0;
      padding: 0;
      overflow: hidden;
    }

    .el-scrollbar,
    .el-scrollbar__wrap,
    .el-scrollbar__view {
      height: 100%;
      min-height: 0;
    }

    .art-drawer__content {
      display: flex;
      flex: 1;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
  }

  .cell-content-view__editor {
    width: 100%;
    height: calc(100dvh - 90px);
    min-height: 360px;
  }
</style>
