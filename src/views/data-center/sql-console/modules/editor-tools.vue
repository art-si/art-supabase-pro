<template>
  <ElPopover v-model:visible="visible" placement="bottom-end" :width="320" trigger="click">
    <template #reference
      ><ArtIconButton size="small" icon="ri:tools-line" label="编辑器工具"
    /></template>
    <div class="flex flex-col gap-4">
      <div class="text-sm font-medium">编辑器工具</div>
      <div class="grid grid-cols-2 gap-2 [&>.el-button]:m-0!">
        <ElButton @click="run(() => emit('replace'))"
          ><ArtSvgIcon icon="ri:find-replace-line" />查找替换</ElButton
        >
        <ElButton @click="run(() => emit('comment'))"
          ><ArtSvgIcon icon="ri:code-s-slash-line" />切换注释</ElButton
        >
        <ElButton @click="run(() => emit('format'))">格式化 SQL</ElButton>
        <ElButton @click="fileInput?.click()">导入 SQL 文件</ElButton>
        <ElButton :disabled="!sql.trim()" @click="download">下载 SQL 文件</ElButton>
      </div>
      <input
        ref="fileInput"
        type="file"
        accept=".sql,text/plain"
        aria-label="选择 SQL 文件"
        class="sr-only"
        tabindex="-1"
        @change="importFile"
      />
      <div class="flex items-center justify-between gap-3"
        ><span class="text-xs text-g-700">跳转行号</span
        ><ElInputNumber
          v-model="jumpLine"
          aria-label="跳转行号"
          :min="1"
          :max="lineCount"
          controls-position="right"
          class="w-32!"
        /><ElButton :disabled="!jumpLine" @click="run(() => emit('goto', jumpLine))"
          >跳转</ElButton
        ></div
      >
      <div class="flex items-center justify-between gap-3"
        ><span class="text-xs text-g-700">字体大小</span
        ><div class="art-icon-label"
          ><ArtIconButton
            icon="ri:subtract-line"
            label="缩小 SQL 字体"
            :disabled="view.fontSize <= 11"
            @click="changeView({ fontSize: view.fontSize - 1 })" /><span
            class="w-10 text-center text-xs"
            >{{ view.fontSize }} px</span
          ><ArtIconButton
            icon="ri:add-line"
            label="放大 SQL 字体"
            :disabled="view.fontSize >= 22"
            @click="changeView({ fontSize: view.fontSize + 1 })" /></div
      ></div>
      <div class="flex items-center justify-between"
        ><span class="text-xs text-g-700">自动换行 · Alt + Z</span
        ><ElSwitch
          :model-value="view.wordWrap"
          aria-label="SQL 自动换行"
          @change="(value) => changeView({ wordWrap: Boolean(value) })"
      /></div>
      <div class="flex items-center justify-between"
        ><span class="text-xs text-g-700">代码缩略图</span
        ><ElSwitch
          :model-value="view.minimap"
          aria-label="SQL 代码缩略图"
          @change="(value) => changeView({ minimap: Boolean(value) })"
      /></div>
      <p class="m-0 text-xs leading-5 text-g-600"
        >Ctrl/⌘ + / 切换行注释；格式化时优先处理选中的 SQL。文件会在新页签中载入，不会自动执行。</p
      >
    </div>
  </ElPopover>
</template>
<script setup lang="ts">
  import { computed, nextTick, ref } from 'vue'
  import { ElMessage } from 'element-plus'
  import { downloadBlob } from '@/utils/file'
  import type { SqlEditorView } from './use-sql-tools'
  const props = defineProps<{ sql: string; scope: string; view: SqlEditorView }>()
  const emit = defineEmits<{
    replace: []
    comment: []
    format: []
    goto: [line: number]
    'update:view': [value: SqlEditorView]
    'load-file': [sql: string]
  }>()
  const fileInput = ref<HTMLInputElement>()
  const visible = ref(false)
  const run = async (action: () => void) => {
    visible.value = false
    await nextTick()
    action()
  }
  const jumpLine = ref(1)
  const lineCount = computed(() => Math.max(1, props.sql.split('\n').length))
  const changeView = (value: Partial<SqlEditorView>) =>
    emit('update:view', { ...props.view, ...value })
  const download = () =>
    downloadBlob(new Blob([props.sql], { type: 'text/plain;charset=utf-8' }), 'query.sql')
  const importFile = async () => {
    const input = fileInput.value
    const file = input?.files?.[0]
    if (!file || !input) return
    const owner = props.scope
    try {
      if (!file.name.toLowerCase().endsWith('.sql') || file.size > 1_000_000) {
        ElMessage.warning('请选择不超过 1 MB 的 .sql 文件')
        return
      }
      const sql = await file.text()
      if (owner === props.scope) await run(() => emit('load-file', sql.replace(/^\uFEFF/, '')))
    } catch {
      ElMessage.warning('SQL 文件读取失败，请检查文件后重试')
    } finally {
      input.value = ''
    }
  }
</script>
