<template>
  <div class="editor-wrapper">
    <vue-monaco-editor
      :wrapperStyle="{ height: '100%' }"
      :value="modelValue"
      :language="language"
      :theme="editorTheme"
      :options="editorOptions"
      @update:value="handleChange"
      @keydown="handleKeyDown"
      @mount="handleEditorMounted"
    />
    <div v-if="!modelValue" class="editor-placeholder">
      请输入 PostgreSQL，支持 JOIN 推断、整句补全和 AI 生成
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import * as monaco from 'monaco-editor/editor/editor.api'
  import { ElMessage } from 'element-plus'
  import VueMonacoEditor from '@guolao/vue-monaco-editor'
  import { useSettingStore } from '@/store/modules/setting'
  import type { SqlErrorLocation } from '@/utils/sql-workbench'

  const props = withDefaults(
    defineProps<{
      modelValue: string
      language?: string
      readOnly?: boolean
    }>(),
    {
      language: 'pgsql',
      readOnly: false
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
    (e: 'execute', sql: string): void
    (e: 'ai-request'): void
  }>()

  const settingStore = useSettingStore()
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null

  const editorOptions = computed<monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    border: false,
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: props.readOnly,
    fixedOverflowWidgets: true,
    suggestOnTriggerCharacters: true,
    quickSuggestions: {
      other: true,
      comments: false,
      strings: false
    },
    wordBasedSuggestions: 'currentDocument',
    tabCompletion: 'on',
    inlineSuggest: {
      enabled: true
    }
  }))

  const editorTheme = computed(() => {
    return settingStore.systemThemeType === 'dark' ? 'vs-dark' : 'vs'
  })

  const handleChange = (val: string) => {
    emit('update:modelValue', val)
  }

  const getSelectedSql = () => {
    if (editorInstance) {
      const selection = editorInstance.getSelection()
      const model = editorInstance.getModel()
      if (selection && model && !selection.isEmpty()) {
        return model.getValueInRange(selection)
      }
    }
    return props.modelValue
  }

  const triggerExecute = () => {
    const sql = getSelectedSql()
    if (!sql.trim()) {
      ElMessage.warning('请输入 SQL 查询')
      return
    }
    emit('execute', sql)
  }

  // 把常用动作挂到 Monaco 上，保证右键菜单和快捷键行为一致。
  const handleEditorMounted = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editorInstance = editor

    editor.addAction({
      id: 'run-query-action',
      label: 'Run Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1,
      run: () => triggerExecute()
    })

    editor.addAction({
      id: 'format-sql-action',
      label: 'Format SQL',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF],
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 2,
      run: () => handleFormat()
    })

    editor.addAction({
      id: 'ai-generate-sql-action',
      label: 'AI Generate SQL',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 3,
      run: () => emit('ai-request')
    })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      triggerExecute()
    }
    if (event.shiftKey && event.key === 'Enter') {
      event.preventDefault()
      triggerExecute()
    }
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      handleFormat()
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      emit('ai-request')
    }
  }

  const handleFormat = async () => {
    if (!props.modelValue.trim()) return

    try {
      const { format } = await import('sql-formatter')
      const formattedSql = format(props.modelValue, {
        language: 'postgresql',
        tabWidth: 2,
        keywordCase: 'upper',
        linesBetweenQueries: 1
      })
      emit('update:modelValue', formattedSql)
    } catch (error) {
      console.error('SQL format failed', error)
      ElMessage.error('SQL 格式化失败')
    }
  }

  const clearErrorMarkers = () => {
    const model = editorInstance?.getModel()
    if (!model) return
    monaco.editor.setModelMarkers(model, 'sql-console', [])
  }

  // 只在当前错误位置打 marker，避免旧错误残留干扰下一次编辑。
  const applyErrorMarker = (location: SqlErrorLocation | null, message: string) => {
    const model = editorInstance?.getModel()
    if (!model) return

    if (!location) {
      clearErrorMarkers()
      return
    }

    monaco.editor.setModelMarkers(model, 'sql-console', [
      {
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: location.lineNumber,
        endLineNumber: location.lineNumber,
        startColumn: location.startColumn,
        endColumn: Math.max(location.endColumn, location.startColumn + 1)
      }
    ])

    editorInstance?.revealPositionInCenter({
      lineNumber: location.lineNumber,
      column: location.startColumn
    })
  }

  const setSql = (value: string) => {
    emit('update:modelValue', value)
    requestAnimationFrame(() => {
      editorInstance?.focus()
    })
  }

  const handleClear = () => {
    clearErrorMarkers()
    emit('update:modelValue', '')
  }

  defineExpose({
    format: handleFormat,
    clear: handleClear,
    getSqlToExecute: getSelectedSql,
    setSql,
    focus: () => editorInstance?.focus(),
    clearErrorMarkers,
    applyErrorMarker
  })
</script>

<style scoped lang="scss">
  .editor-wrapper {
    position: relative;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;

    .editor-placeholder {
      position: absolute;
      top: 0;
      left: 63px;
      z-index: 10;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 13px;
      color: #6e7681;
      pointer-events: none;
    }
  }
</style>

<style lang="scss">
  .suggest-widget {
    z-index: 99999 !important;
    background-color: var(--el-bg-color-overlay) !important;
    border: 1px solid var(--el-border-color-lighter) !important;
    box-shadow: var(--el-box-shadow-light) !important;

    .monaco-list {
      .monaco-list-row.focused {
        color: var(--el-text-color-primary) !important;
        background-color: var(--el-color-primary-light-9) !important;

        .monaco-highlighted-label {
          color: var(--el-color-primary);
        }
      }

      .monaco-list-row {
        .monaco-icon-label {
          width: 100% !important;

          .monaco-icon-label-container {
            display: flex !important;
            width: 100% !important;

            .monaco-icon-name-container {
              flex: 0 1 auto !important;
              overflow: hidden;
              text-overflow: ellipsis;
            }

            .monaco-icon-description-container {
              flex: 1 0 auto !important;
              padding-left: 10px;
              margin-left: auto !important;
              text-align: right !important;
              white-space: nowrap;
              opacity: 0.6;
            }
          }
        }
      }
    }

    .details {
      z-index: 99999 !important;
      background-color: var(--el-bg-color-overlay) !important;
      border: 1px solid var(--el-border-color-lighter) !important;
      box-shadow: var(--el-box-shadow-light) !important;
    }
  }
</style>
