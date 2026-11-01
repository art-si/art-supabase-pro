<template>
  <ElPopover v-model:visible="visible" placement="bottom-end" :width="320" trigger="click">
    <template #reference
      ><ArtIconButton ref="trigger" size="small" icon="ri:tools-line" label="编辑器工具"
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
        <ElButton :loading="importLoading" @click="chooseFile">导入 SQL 文件</ElButton>
        <ElButton :disabled="!sql.trim()" @click="run(download)">下载 SQL 文件</ElButton>
      </div>
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
  <input
    ref="fileInput"
    type="file"
    accept=".sql,text/plain"
    aria-label="选择 SQL 文件"
    hidden
    tabindex="-1"
    @change="importFile"
    @cancel="cancelFileChoice"
  />
  <component
    v-if="importComponent"
    :is="importComponent"
    ref="importDialog"
    :scope="scope"
    :import-sql="importSql"
    @choose-file="chooseFile"
    @closed="focusTrigger"
  />
</template>
<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
  import { ElMessage } from 'element-plus'
  import { downloadBlob } from '@/utils/file'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import type { SqlEditorView } from './use-sql-tools'
  import { SqlFileImportError, validateSqlFile } from './sql-file-import'
  interface SqlFileImportExpose {
    open: (file: File) => Promise<void>
  }
  const props = defineProps<{
    sql: string
    scope: string
    view: SqlEditorView
    importSql: (sql: string) => Promise<boolean>
  }>()
  const emit = defineEmits<{
    replace: []
    comment: []
    format: []
    goto: [line: number]
    'update:view': [value: SqlEditorView]
  }>()
  const fileInput = ref<HTMLInputElement>()
  const trigger = shallowRef<{ $el?: unknown }>()
  const importDialog = ref<SqlFileImportExpose>()
  const importLoading = ref(false)
  const { component: importComponent, load: loadImport } = useLazyComponent(
    () => import('./sql-file-import-dialog.vue')
  )
  const visible = ref(false)
  let revision = 0
  let alive = true
  let pendingChoice: { version: number; scope: string } | undefined
  const current = (version: number, scope: string): boolean =>
    alive && version === revision && scope === props.scope
  const focusTrigger = (): void => {
    if (!alive) return
    const button = trigger.value?.$el
    if (button instanceof HTMLButtonElement && !button.disabled) button.focus()
  }
  const run = async (action: () => void): Promise<void> => {
    const version = revision
    const scope = props.scope
    if (!current(version, scope)) return
    focusTrigger()
    visible.value = false
    await nextTick()
    if (!current(version, scope)) return
    action()
  }
  const jumpLine = ref(1)
  const lineCount = computed(() => Math.max(1, props.sql.split('\n').length))
  const changeView = (value: Partial<SqlEditorView>): void => {
    if (alive) emit('update:view', { ...props.view, ...value })
  }
  const download = () =>
    downloadBlob(new Blob([props.sql], { type: 'text/plain;charset=utf-8' }), 'query.sql')
  const chooseFile = (): void => {
    if (!alive || !fileInput.value) return
    pendingChoice = { version: ++revision, scope: props.scope }
    importLoading.value = false
    fileInput.value.value = ''
    fileInput.value.click()
  }
  const cancelFileChoice = (): void => {
    pendingChoice = undefined
    if (fileInput.value) fileInput.value.value = ''
  }
  const importFile = async (): Promise<void> => {
    const input = fileInput.value
    const choice = pendingChoice
    pendingChoice = undefined
    const file = input?.files?.[0]
    if (input) input.value = ''
    if (!file || !choice || !current(choice.version, choice.scope)) return
    const { version, scope: owner } = choice
    importLoading.value = true
    try {
      validateSqlFile(file.name, file.size)
      if (!current(version, owner)) return
      focusTrigger()
      visible.value = false
      await nextTick()
      if (!current(version, owner)) return
      await loadImport()
      if (!current(version, owner)) return
      await importDialog.value?.open(file)
    } catch (cause) {
      if (current(version, owner))
        ElMessage.warning(
          cause instanceof SqlFileImportError
            ? cause.message
            : 'SQL 文件导入组件加载失败，请重新选择文件后重试'
        )
    } finally {
      if (current(version, owner)) importLoading.value = false
    }
  }
  watch(
    () => props.scope,
    () => {
      revision++
      pendingChoice = undefined
      visible.value = false
      importLoading.value = false
      if (fileInput.value) fileInput.value.value = ''
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    alive = false
    revision++
    pendingChoice = undefined
  })
</script>
