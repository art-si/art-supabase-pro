<template>
  <div class="editor-wrapper">
    <vue-monaco-editor
      :wrapperStyle="{ height: '100%', flex: '1', minHeight: '0' }"
      :value="modelValue"
      :language="language"
      :theme="editorTheme"
      :options="editorOptions"
      @update:value="handleChange"
      @mount="handleEditorMounted"
    />
    <div v-if="!modelValue" class="editor-placeholder">
      请输入 {{ SQL_DIALECT_LABELS[activeDialect] }}，支持表字段补全和 AI 生成
    </div>
    <div class="sql-editor-status"
      ><span
        >行 {{ cursor.line }}，列 {{ cursor.column
        }}<template v-if="cursor.selected"> · 已选 {{ cursor.selected }} 字符</template></span
      ><span
        >{{ SQL_DIALECT_LABELS[activeDialect] }} · {{ modelValue.split('\n').length }} 行 · 2
        空格</span
      ></div
    >
  </div>
</template>

<script setup lang="ts">
  import { computed, onBeforeUnmount, ref } from 'vue'
  import { monaco } from '@/utils/monaco-runtime'
  import '@/utils/monaco-sql-setup'
  import { ElMessage } from 'element-plus'
  import VueMonacoEditor from '@guolao/vue-monaco-editor'
  import { useSettingStore } from '@/store/modules/setting'
  import type { SqlEditorView } from './use-sql-tools'
  import type { SqlDialect } from '@/types/sql-connections'
  import { SQL_DIALECT_LABELS } from '@/utils/sql-connections'
  import {
    getSqlExecutionTarget,
    type SqlErrorLocation,
    type SqlExecutionTarget
  } from '@/utils/sql-workbench'

  const props = withDefaults(
    defineProps<{
      modelValue: string
      language?: string
      dialect?: SqlDialect
      readOnly?: boolean
      view?: SqlEditorView
    }>(),
    {
      language: 'pgsql',
      readOnly: false,
      view: () => ({ fontSize: 13, wordWrap: false, minimap: false })
    }
  )

  const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void
    (e: 'execute'): void
    (e: 'ai-request'): void
    (e: 'target-change', source: SqlExecutionTarget['source']): void
    (e: 'cursor-change', target: SqlExecutionTarget): void
    (e: 'history-state', state: { undo: boolean; redo: boolean }): void
    (e: 'toggle-wrap'): void
  }>()

  const settingStore = useSettingStore()
  const activeDialect = computed(
    () => props.dialect || (props.language === 'mysql' ? 'mysql' : 'postgres')
  )
  const cursor = ref({ line: 1, column: 1, selected: 0 })
  let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
  let disposed = false
  onBeforeUnmount(() => {
    disposed = true
    editorInstance = null
  })

  // Monaco 0.57 validates these history options at runtime but omits them from its
  // public find type. Keep history local to this editor, which is recreated per scope.
  const scopedFindOptions = {
    loop: true,
    history: 'never',
    replaceHistory: 'never'
  } satisfies monaco.editor.IEditorFindOptions & { history: 'never'; replaceHistory: 'never' }
  const editorOptions = computed<monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
    automaticLayout: true,
    ariaLabel: 'SQL 编辑器',
    padding: { top: 10, bottom: 10 },
    minimap: { enabled: props.view.minimap },
    fontSize: props.view.fontSize,
    wordWrap: props.view.wordWrap ? 'on' : 'off',
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    border: false,
    lineNumbers: 'on',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    readOnly: props.readOnly,
    fixedOverflowWidgets: true,
    find: scopedFindOptions,
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
    if (!disposed) emit('update:modelValue', val)
  }

  const getExecutionTarget = (): SqlExecutionTarget => {
    const dialect = activeDialect.value
    if (editorInstance) {
      const selection = editorInstance.getSelection()
      const model = editorInstance.getModel()
      if (selection && model && !selection.isEmpty()) {
        return getSqlExecutionTarget(
          model.getValue(),
          model.getOffsetAt(selection.getStartPosition()),
          {
            start: model.getOffsetAt(selection.getStartPosition()),
            end: model.getOffsetAt(selection.getEndPosition())
          },
          dialect
        )
      }
      if (model)
        return getSqlExecutionTarget(
          model.getValue(),
          model.getOffsetAt(editorInstance.getPosition() || new monaco.Position(1, 1)),
          undefined,
          dialect
        )
    }
    return getSqlExecutionTarget(props.modelValue, 0, undefined, dialect)
  }

  const triggerExecute = () => {
    const { sql } = getExecutionTarget()
    if (!sql.trim()) {
      ElMessage.warning('请输入 SQL 查询')
      return
    }
    emit('execute')
  }

  // 把常用动作挂到 Monaco 上，保证右键菜单和快捷键行为一致。
  const handleEditorMounted = (editor: monaco.editor.IStandaloneCodeEditor) => {
    if (disposed) {
      editor.dispose()
      return
    }
    editorInstance = editor
    const reportState = () => {
      if (disposed) return
      const target = getExecutionTarget()
      const position = editor.getPosition()
      const selection = editor.getSelection()
      cursor.value = {
        line: position?.lineNumber || 1,
        column: position?.column || 1,
        selected: selection ? editor.getModel()?.getValueInRange(selection).length || 0 : 0
      }
      emit('target-change', target.source)
      emit('cursor-change', target)
      const model = editor.getModel()
      emit('history-state', { undo: model?.canUndo() ?? false, redo: model?.canRedo() ?? false })
    }
    editor.onDidChangeCursorSelection(reportState)
    editor.onDidChangeModelContent(() => {
      clearErrorMarkers()
      reportState()
    })
    reportState()
    editor.addAction({
      id: 'art-toggle-sql-wrap',
      label: '切换 SQL 自动换行',
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyZ],
      run: () => emit('toggle-wrap')
    })

    editor.addAction({
      id: 'run-query-action',
      label: 'Run Query',
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
        monaco.KeyMod.Shift | monaco.KeyCode.Enter
      ],
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

  const handleFormat = async () => {
    if (!props.modelValue.trim()) return
    const source = props.modelValue
    const selection = editorInstance?.getSelection()
    const selected =
      selection && !selection.isEmpty()
        ? editorInstance?.getModel()?.getValueInRange(selection)
        : undefined

    try {
      const { formatDialect, mysql, postgresql, plsql } = await import('sql-formatter')
      if (disposed) return
      if (props.modelValue !== source) {
        ElMessage.info('内容已变化，请重新格式化')
        return
      }
      const formattedSql = formatDialect(selected || source, {
        dialect:
          activeDialect.value === 'mysql'
            ? mysql
            : activeDialect.value === 'dm'
              ? plsql
              : postgresql,
        tabWidth: 2,
        keywordCase: 'upper',
        linesBetweenQueries: 1
      })
      if (selected && selection && editorInstance) {
        editorInstance.pushUndoStop()
        editorInstance.executeEdits('format-sql-selection', [
          { range: selection, text: formattedSql, forceMoveMarkers: true }
        ])
        editorInstance.pushUndoStop()
        editorInstance.focus()
      } else setSql(formattedSql)
    } catch (error) {
      if (disposed) return
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
  const applyErrorMarker = (
    location: SqlErrorLocation | null,
    message: string,
    startOffset = 0
  ) => {
    const model = editorInstance?.getModel()
    if (!model) return

    if (!location) {
      clearErrorMarkers()
      return
    }

    const origin = model.getPositionAt(startOffset)
    const lineNumber = origin.lineNumber + location.lineNumber - 1
    const columnOffset = location.lineNumber === 1 ? origin.column - 1 : 0
    monaco.editor.setModelMarkers(model, 'sql-console', [
      {
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: lineNumber,
        endLineNumber: lineNumber,
        startColumn: location.startColumn + columnOffset,
        endColumn: Math.max(location.endColumn, location.startColumn + 1) + columnOffset
      }
    ])

    editorInstance?.revealPositionInCenter({
      lineNumber,
      column: location.startColumn + columnOffset
    })
  }

  const setSql = (value: string) => {
    if (disposed) return
    const model = editorInstance?.getModel()
    if (model && editorInstance) {
      editorInstance.pushUndoStop()
      editorInstance.executeEdits('sql-workbench', [
        { range: model.getFullModelRange(), text: value }
      ])
      editorInstance.pushUndoStop()
    } else emit('update:modelValue', value)
    requestAnimationFrame(() => {
      editorInstance?.focus()
    })
  }

  const insertSql = (value: string) => {
    const selection = editorInstance?.getSelection()
    if (!selection || !editorInstance) return
    editorInstance.pushUndoStop()
    editorInstance.executeEdits('sql-workbench', [
      { range: selection, text: value, forceMoveMarkers: true }
    ])
    editorInstance.pushUndoStop()
    editorInstance.focus()
  }

  const handleClear = () => {
    clearErrorMarkers()
    setSql('')
  }

  const revealStatement = (start: number, end: number, select = false) => {
    const model = editorInstance?.getModel()
    if (!model || !editorInstance) return
    const first = model.getPositionAt(start)
    const last = model.getPositionAt(end)
    if (select)
      editorInstance.setSelection(
        new monaco.Range(first.lineNumber, first.column, last.lineNumber, last.column)
      )
    else editorInstance.setPosition(first)
    editorInstance.revealPositionInCenter(first)
    editorInstance.focus()
  }
  const selectStatement = () => {
    const model = editorInstance?.getModel()
    if (!model || !editorInstance) return
    const target = getSqlExecutionTarget(
      model.getValue(),
      model.getOffsetAt(editorInstance.getPosition() || new monaco.Position(1, 1)),
      undefined,
      activeDialect.value
    )
    if (target.sql)
      revealStatement(target.startOffset, target.startOffset + target.sql.length, true)
  }
  const editorAction = (
    action:
      | 'undo'
      | 'redo'
      | 'actions.find'
      | 'editor.action.startFindReplaceAction'
      | 'editor.action.commentLine'
  ) => {
    editorInstance?.focus()
    editorInstance?.trigger('sql-workspace-toolbar', action, null)
  }

  defineExpose({
    format: handleFormat,
    clear: handleClear,
    getExecutionTarget,
    setSql,
    insertSql,
    revealStatement,
    selectStatement,
    undo: () => editorAction('undo'),
    redo: () => editorAction('redo'),
    find: () => editorAction('actions.find'),
    replace: () => editorAction('editor.action.startFindReplaceAction'),
    comment: () => editorAction('editor.action.commentLine'),
    goToLine: (line: number) => {
      const model = editorInstance?.getModel()
      if (model && editorInstance && Number.isFinite(line)) {
        const position = {
          lineNumber: Math.min(model.getLineCount(), Math.max(1, Math.trunc(line))),
          column: 1
        }
        editorInstance.setPosition(position)
        editorInstance.revealPositionInCenter(position)
        editorInstance.focus()
      }
    },
    focus: () => editorInstance?.focus(),
    clearErrorMarkers,
    applyErrorMarker
  })
</script>

<style scoped lang="scss">
  .editor-wrapper {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;

    .sql-editor-status {
      display: flex;
      flex-shrink: 0;
      gap: 12px;
      justify-content: space-between;
      min-height: 24px;
      padding: 4px 12px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-extra-light);
      border-top: 1px solid var(--el-border-color-lighter);

      @media (width <= 640px) {
        span:last-child {
          display: none;
        }
      }
    }

    .editor-placeholder {
      position: absolute;
      top: 10px;
      left: 63px;
      z-index: 10;
      font-family: Consolas, 'Courier New', monospace;
      font-size: 13px;
      color: var(--el-text-color-placeholder);
      pointer-events: none;
    }
  }
</style>

<style lang="scss">
  .suggest-widget {
    // Monaco's selected label/icon use their own variables, not the row's color.
    --vscode-editorSuggestWidget-background: var(--el-bg-color-overlay);
    --vscode-editorSuggestWidget-foreground: var(--el-text-color-primary);
    --vscode-editorSuggestWidget-selectedBackground: var(--el-color-primary-light-9);
    --vscode-editorSuggestWidget-selectedForeground: var(--el-text-color-primary);
    --vscode-editorSuggestWidget-selectedIconForeground: var(--el-text-color-primary);
    --vscode-editorSuggestWidget-highlightForeground: var(--el-text-color-primary);
    --vscode-editorSuggestWidget-focusHighlightForeground: var(--el-text-color-primary);

    z-index: 99999 !important;
    background-color: var(--el-bg-color-overlay) !important;
    border: 1px solid var(--art-modal-surface-border, var(--el-border-color-lighter)) !important;
    box-shadow: var(--art-modal-surface-shadow) !important;

    .monaco-list {
      .monaco-list-row.focused {
        color: var(--el-text-color-primary) !important;
        background-color: var(--el-color-primary-light-9) !important;

        .monaco-highlighted-label {
          color: var(--el-text-color-primary);
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
              color: var(--el-text-color-regular) !important;
              text-align: right !important;
              white-space: nowrap;
              opacity: 1;
            }
          }
        }
      }
    }

    .monaco-highlighted-label .highlight {
      font-weight: 600;
    }

    .details {
      z-index: 99999 !important;
      background-color: var(--el-bg-color-overlay) !important;
      border: 1px solid var(--art-modal-surface-border, var(--el-border-color-lighter)) !important;
      box-shadow: var(--art-modal-surface-shadow) !important;
    }
  }
</style>
