<template>
  <ElPopover
    :visible="visible"
    :virtual-ref="anchor"
    virtual-triggering
    trigger="click"
    :width="editorWidth"
    :show-arrow="false"
    :persistent="false"
    :popper-options="popperOptions"
    placement="bottom-start"
    popper-class="sql-cell-editor-popover"
    @update:visible="visibilityChanged"
  >
    <section
      class="sql-cell-editor"
      role="dialog"
      :aria-label="`编辑 ${context?.prop || ''}`"
      @keydown="handleKeydown"
    >
      <header class="flex items-center justify-between gap-3 border-b border-g-200 px-3 py-2">
        <span class="min-w-0"
          ><strong class="block truncate text-sm">{{ context?.prop }}</strong
          ><span class="block truncate font-mono text-xs text-g-700" :title="column?.dataType"
            >{{ column?.dataType }} · 第 {{ (context?.rowIndex || 0) + 1 }} 行</span
          ></span
        >
        <div class="flex shrink-0 items-center gap-1">
          <ArtIconButton
            v-if="kind === 'json'"
            size="small"
            icon="ri:code-s-slash-line"
            label="格式化 JSON"
            :disabled="Boolean(error) || isNull"
            @click="formatJson"
          />
          <ArtIconButton
            v-if="kind === 'json' || multiline"
            size="small"
            :icon="expanded ? 'dashicons:fullscreen-exit-alt' : 'dashicons:fullscreen-alt'"
            :label="expanded ? '恢复编辑器大小' : '放大编辑器'"
            @click="expanded = !expanded"
          />
          <ArtIconButton size="small" icon="ri:close-line" label="取消单元格编辑" @click="cancel" />
        </div>
      </header>
      <div class="flex flex-col gap-3 p-3">
        <ElCheckbox v-if="column?.isNullable" v-model="isNull" size="small" @change="toggleNull"
          >设为 SQL NULL（无值）</ElCheckbox
        >
        <div v-if="isNull" class="rounded bg-g-100 px-3 py-4 font-mono text-sm text-g-700"
          >NULL</div
        >
        <div
          v-else-if="kind === 'json'"
          :style="{ height: jsonHeight }"
          class="min-h-0 overflow-hidden rounded border border-g-200"
        >
          <VueMonacoEditor
            :value="text"
            language="json"
            :theme="dark ? 'vs-dark' : 'vs'"
            :options="jsonOptions"
            @update:value="text = $event"
            @mount="mountJson"
          />
        </div>
        <template v-else-if="kind === 'boolean' || kind === 'enum'">
          <ElSelect
            v-model="choice"
            :aria-label="`编辑值 ${context?.prop}`"
            :teleported="false"
            :filterable="options.length > 8"
            :empty-values="[null, undefined]"
            class="w-full!"
          >
            <ElOption
              v-for="option in options"
              :key="String(option.value)"
              :label="option.label"
              :value="option.value"
            />
          </ElSelect>
        </template>
        <template v-else>
          <ElInput
            ref="inputRef"
            v-model="text"
            :aria-label="`编辑值 ${context?.prop}`"
            :type="multiline ? 'textarea' : 'text'"
            :autosize="multiline ? textAreaSize : false"
            :inputmode="kind === 'number' ? 'decimal' : 'text'"
            placeholder="输入字段值"
            @keydown.enter="plainEnter"
          />
          <div v-if="isDateKind" class="flex flex-col gap-2">
            <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-g-700"
              ><span>本地时间预览：{{ formattedDate }}</span
              ><ElButton size="small" @click="setNow">设为当前时间</ElButton></div
            >
            <ElTimePicker
              v-if="kind === 'time'"
              :model-value="calendarValue"
              :aria-label="`选择时间 ${context?.prop}`"
              :teleported="false"
              placement="top-start"
              :popper-options="popperOptions"
              class="w-full!"
              @update:model-value="pickDate"
            />
            <ElDatePicker
              v-else
              :model-value="calendarValue"
              :type="kind === 'date' ? 'date' : 'datetime'"
              :aria-label="`选择日期时间 ${context?.prop}`"
              :teleported="false"
              placement="top-start"
              :popper-options="popperOptions"
              class="w-full!"
              @update:model-value="pickDate"
            />
            <span class="text-xs leading-5 text-g-700"
              >原始文本保留小数秒和时区；使用日历或“当前时间”会填写新值。</span
            >
          </div>
        </template>
        <span v-if="error" class="text-xs leading-5 text-danger" role="alert">{{ error }}</span>
      </div>
      <footer
        class="flex flex-wrap items-center justify-between gap-2 border-t border-g-200 bg-g-100 px-3 py-2"
      >
        <span class="text-xs text-g-700"
          >{{ kind === 'json' || multiline ? 'Ctrl/⌘ + Enter 保留' : 'Enter 保留' }} · Esc
          取消</span
        >
        <div class="flex items-center"
          ><ElButton size="small" @click="cancel">取消</ElButton
          ><ElButton size="small" type="primary" :disabled="Boolean(error)" @click="save"
            >保留修改</ElButton
          ></div
        >
      </footer>
    </section>
  </ElPopover>
</template>
<script setup lang="ts">
  import { computed, nextTick, ref, shallowRef } from 'vue'
  import { useEventListener, useWindowSize } from '@vueuse/core'
  import { ElMessage, type InputInstance } from 'element-plus'
  import VueMonacoEditor from '@guolao/vue-monaco-editor'
  import { monaco } from '@/utils/monaco-runtime'
  import { useSettingStore } from '@/store/modules/setting'
  import type { TableEditContext } from '@/types'
  import type { SqlColumnRef } from '@/utils/sql-workbench'
  import { getSqlCellEditorKind, validateSqlDraftValue } from './result-edit'
  import { formatSqlJsonText, sqlJsonTokens } from './sql-json-text'
  import dayjs from 'dayjs'
  import { isEqual } from 'lodash-es'
  const props = defineProps<{ column?: SqlColumnRef }>()
  const emit = defineEmits<{ save: [context: TableEditContext, value: unknown]; cancel: [] }>()
  const setting = useSettingStore()
  const dark = computed(() => setting.systemThemeType === 'dark')
  const { width, height } = useWindowSize()
  const popperOptions = {
    strategy: 'fixed' as const,
    modifiers: [
      {
        name: 'preventOverflow',
        options: {
          boundary: document.documentElement,
          rootBoundary: 'viewport',
          padding: 12,
          altAxis: true,
          tether: false
        }
      },
      {
        name: 'flip',
        options: { boundary: document.documentElement, rootBoundary: 'viewport', padding: 12 }
      }
    ]
  }
  const visible = ref(false)
  const anchor = shallowRef<HTMLElement>()
  const context = shallowRef<TableEditContext>()
  const draft = shallowRef<unknown>('')
  const expanded = ref(false)
  const isNull = ref(false)
  const inputRef = ref<InputInstance>()
  let jsonEditor: monaco.editor.IStandaloneCodeEditor | undefined
  const kind = computed(() => getSqlCellEditorKind(props.column))
  const isDateKind = computed(() => ['date', 'time', 'datetime'].includes(kind.value))
  const multiline = computed(
    () =>
      kind.value === 'text' &&
      (/text|clob/i.test(props.column?.dataType || '') ||
        String(draft.value ?? '').length > 160 ||
        String(draft.value ?? '').includes('\n'))
  )
  const text = computed({
    get: () => (draft.value == null ? '' : String(draft.value)),
    set: (value: string) => {
      draft.value = value
    }
  })
  const choice = computed({
    get: () =>
      typeof draft.value === 'string' ||
      typeof draft.value === 'number' ||
      typeof draft.value === 'boolean' ||
      draft.value === null
        ? draft.value
        : undefined,
    set: (value: unknown) => {
      draft.value = value
    }
  })
  const options = computed(() => {
    if (kind.value === 'enum')
      return (props.column?.enumValues || []).map((value) => ({ label: value, value }))
    const original = context.value?.value
    const numeric = typeof original === 'number'
    const textBit =
      original === '1' || original === '0' || /^bit/i.test(props.column?.dataType || '')
    return [
      { label: 'TRUE', value: numeric ? 1 : textBit ? '1' : true },
      { label: 'FALSE', value: numeric ? 0 : textBit ? '0' : false }
    ]
  })
  const editedValue = computed(() => (isNull.value ? null : draft.value))
  const error = computed(() =>
    isEqual(editedValue.value, context.value?.value)
      ? ''
      : validateSqlDraftValue(editedValue.value, props.column) || ''
  )
  const editorWidth = computed(() =>
    Math.min(
      Math.max(240, width.value - 32),
      expanded.value ? 900 : kind.value === 'json' ? 620 : multiline.value ? 520 : 420
    )
  )
  const availableHeight = computed(() => {
    const rect = anchor.value?.getBoundingClientRect()
    return rect ? Math.max(rect.top, height.value - rect.bottom) - 32 : height.value - 32
  })
  const textAreaSize = computed(() => {
    const maxRows = Math.max(
      3,
      Math.min(expanded.value ? 20 : 10, Math.floor((availableHeight.value - 200) / 22))
    )
    return { minRows: Math.min(expanded.value ? 12 : 4, maxRows), maxRows }
  })
  const jsonHeight = computed(
    () => `${Math.max(80, Math.min(expanded.value ? 480 : 260, availableHeight.value - 200))}px`
  )
  const jsonOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    automaticLayout: true,
    ariaLabel: 'JSON 字段编辑器',
    minimap: { enabled: false },
    lineNumbers: 'on',
    fontSize: 13,
    wordWrap: 'on',
    scrollBeyondLastLine: false,
    tabSize: 2,
    folding: true,
    padding: { top: 8, bottom: 8 },
    renderValidationDecorations: 'on',
    quickSuggestions: false
  }
  const calendarValue = computed(() => {
    const value =
      kind.value === 'time'
        ? dayjs(text.value.replace(/\.\d+/, ''), 'HH:mm:ss', true)
        : dayjs(text.value)
    return value.isValid() ? value.toDate() : null
  })
  const formattedDate = computed(() =>
    calendarValue.value
      ? dayjs(calendarValue.value).format(
          kind.value === 'date'
            ? 'YYYY-MM-DD'
            : kind.value === 'time'
              ? 'HH:mm:ss.SSS'
              : 'YYYY-MM-DD HH:mm:ss.SSS Z'
        )
      : '无法解析，可直接检查原始文本'
  )
  const toggleNull = () => {
    if (!isNull.value && draft.value == null)
      draft.value =
        kind.value === 'json' ? 'null' : kind.value === 'boolean' ? options.value[1].value : ''
  }
  const cancel = () => {
    visible.value = false
    jsonEditor = undefined
    emit('cancel')
  }
  const visibilityChanged = (value: boolean) => {
    if (!value && visible.value) flush()
  }
  const flush = () => {
    if (!context.value || !visible.value) return
    let value = editedValue.value
    if (
      !error.value &&
      kind.value === 'json' &&
      typeof value === 'string' &&
      typeof context.value.value === 'string' &&
      sqlJsonTokens(value) === sqlJsonTokens(context.value.value)
    )
      value = context.value.value
    const selection = context.value
    visible.value = false
    jsonEditor = undefined
    emit('save', selection, value)
  }
  const save = () => {
    if (!error.value) flush()
  }
  const formatJson = () => {
    if (!error.value && !isNull.value) text.value = formatSqlJsonText(text.value)
  }
  const mountJson = (editor: monaco.editor.IStandaloneCodeEditor) => {
    jsonEditor = editor
    editor.focus()
  }
  const pickDate = (value: unknown) => {
    if (value === null) {
      isNull.value = Boolean(props.column?.isNullable)
      draft.value = isNull.value ? null : ''
      return
    }
    if (!(value instanceof Date) || !Number.isFinite(value.getTime())) return
    const format =
      kind.value === 'date'
        ? 'YYYY-MM-DD'
        : kind.value === 'time'
          ? 'HH:mm:ss.SSS'
          : /time zone|timestamptz|datetimeoffset/i.test(props.column?.dataType || '')
            ? 'YYYY-MM-DDTHH:mm:ss.SSSZ'
            : 'YYYY-MM-DD HH:mm:ss.SSS'
    text.value = dayjs(value).format(format)
  }
  const setNow = () => pickDate(new Date())
  const plainEnter = (event: Event | KeyboardEvent) => {
    if (!(event instanceof KeyboardEvent)) return
    if (!multiline.value && !event.isComposing) {
      event.preventDefault()
      event.stopPropagation()
      save()
    }
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancel()
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      event.stopPropagation()
      save()
    }
  }
  useEventListener(
    window,
    'scroll',
    (event: Event) => {
      if (visible.value && event.target instanceof Element && event.target.closest('.art-table'))
        flush()
    },
    { capture: true }
  )
  defineExpose({
    open: async (value: TableEditContext) => {
      if (!value.cell?.isConnected) {
        ElMessage.info('请先将该单元格滚动到可见区域再编辑')
        return
      }
      context.value = value
      anchor.value = value.cell
      draft.value = value.value
      isNull.value = value.value === null
      expanded.value = false
      visible.value = true
      if (kind.value === 'json' && !isNull.value && !error.value) formatJson()
      await nextTick()
      inputRef.value?.focus()
      jsonEditor?.focus()
    },
    cancel,
    flush,
    isDirty: () =>
      visible.value &&
      (kind.value === 'json' &&
      !error.value &&
      typeof editedValue.value === 'string' &&
      typeof context.value?.value === 'string'
        ? sqlJsonTokens(editedValue.value) !== sqlJsonTokens(context.value.value)
        : !isEqual(editedValue.value, context.value?.value)),
    isOpen: () => visible.value
  })
</script>
<style scoped lang="scss">
  .sql-cell-editor {
    margin: -12px;
  }

  :global(.sql-cell-editor-popover) {
    max-width: calc(100vw - 32px);
  }
</style>
