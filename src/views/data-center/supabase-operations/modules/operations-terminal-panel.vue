<template>
  <section
    class="operations-terminal"
    role="region"
    aria-label="任务执行日志"
    data-testid="operations-terminal"
    :aria-busy="loading"
  >
    <div class="operations-terminal__toolbar">
      <div class="flex min-w-0 items-center gap-2">
        <strong class="text-sm font-medium">执行日志</strong>
        <span class="text-xs text-g-600">{{ lineCount }} 行 · 只读</span>
        <span v-if="running" class="text-xs text-g-600">持续更新中</span>
      </div>
      <div class="flex flex-wrap items-center gap-1">
        <ElButton text size="small" aria-label="搜索日志" :disabled="!ready" @click="openSearch">
          <ArtSvgIcon icon="ri:search-line" />搜索
        </ElButton>
        <ElButton
          text
          size="small"
          aria-label="复制日志"
          :disabled="!logs.length"
          @click="copyLogs"
        >
          <ArtSvgIcon icon="ri:file-copy-line" />复制
        </ElButton>
        <ElButton
          text
          size="small"
          aria-label="自动换行"
          :aria-pressed="wordWrap"
          @click="wordWrap = !wordWrap"
        >
          <ArtSvgIcon icon="ri:text-wrap" />换行
        </ElButton>
        <ElCheckbox v-model="followOutput" size="small" class="ml-2!">跟随输出</ElCheckbox>
      </div>
    </div>
    <div class="operations-terminal__body">
      <div ref="editorHost" class="operations-terminal__editor" />
      <div v-if="loading" class="operations-terminal__state" role="status">正在加载日志视图…</div>
      <div v-else-if="loadError" class="operations-terminal__state" role="alert">
        <p>日志视图加载失败，仍可复制当前日志。</p>
        <ElButton type="primary" plain size="small" @click="loadEditor">重新加载</ElButton>
      </div>
      <div v-else-if="ready && !logs.length" class="operations-terminal__empty" role="status">
        {{ running ? '任务已提交，等待脚本首次输出…' : '此任务没有可显示的历史日志' }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
  import { useMutationObserver, useEventListener } from '@vueuse/core'
  import { ElMessage } from 'element-plus'
  import type * as Monaco from 'monaco-editor/editor/editor.api'
  import type { OperationLog } from '@/types/supabase-operations'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import { getOperationLogLevel, stripOperationLogAnsi } from '@/utils/supabase/operations-log'

  const props = defineProps<{ logs: OperationLog[]; runId: string; running: boolean }>()
  const editorTheme = ref<'vs' | 'vs-dark'>('vs')
  const editorHost = ref<HTMLElement>()
  const loading = ref(false)
  const loadError = ref(false)
  const ready = ref(false)
  const wordWrap = ref(false)
  const followOutput = ref(true)
  const renderedText = computed(() =>
    props.logs
      .map((line) => {
        const time = line.time.slice(11, 19)
        const level = getOperationLogLevel(line.message, line.level).toUpperCase()
        return `${time} UTC  [${level}]  ${stripOperationLogAnsi(line.message)}`
      })
      .join('\n')
  )
  const lineCount = computed(() => (renderedText.value ? renderedText.value.split('\n').length : 0))
  let editor: Monaco.editor.IStandaloneCodeEditor | undefined
  let model: Monaco.editor.ITextModel | undefined
  let scrollListener: Monaco.IDisposable | undefined
  let loadedMonaco: typeof import('monaco-editor/editor/editor.api') | undefined
  let loadGeneration = 0
  let programmaticScroll = false
  useEventListener(
    editorHost,
    'wheel',
    (event) => {
      if (event.deltaY < 0) followOutput.value = false
    },
    { passive: true, capture: true }
  )

  const scrollToEnd = () => {
    if (!editor || !model) return
    programmaticScroll = true
    editor.setScrollTop(editor.getScrollHeight())
    requestAnimationFrame(() => {
      programmaticScroll = false
    })
  }

  const loadEditor = async () => {
    if (editor || loading.value) return
    const generation = ++loadGeneration
    loading.value = true
    loadError.value = false
    try {
      const { registerOperationsTerminalLanguage, operationsTerminalLanguageId } =
        await import('./operations-terminal-language')
      if (generation !== loadGeneration || !editorHost.value) return
      const monaco = registerOperationsTerminalLanguage()
      loadedMonaco = monaco
      model = monaco.editor.createModel(renderedText.value, operationsTerminalLanguageId)
      editor = monaco.editor.create(editorHost.value, {
        model,
        theme: editorTheme.value,
        ariaLabel: '运维终端日志',
        readOnly: true,
        domReadOnly: true,
        automaticLayout: true,
        fontFamily: "'Cascadia Code', Consolas, 'Courier New', monospace",
        fontSize: 14,
        lineHeight: 22,
        lineNumbers: 'on',
        minimap: { enabled: false },
        wordWrap: wordWrap.value ? 'on' : 'off',
        scrollBeyondLastLine: false,
        roundedSelection: false,
        renderLineHighlight: 'none',
        padding: { top: 12, bottom: 12 },
        fixedOverflowWidgets: true,
        links: false,
        find: { seedSearchStringFromSelection: 'selection' }
      })
      scrollListener = editor.onDidScrollChange((event) => {
        if (!event.scrollTopChanged || programmaticScroll || !followOutput.value) return
        const atEnd =
          editor!.getScrollTop() + editor!.getLayoutInfo().height >= editor!.getScrollHeight() - 16
        if (!atEnd) followOutput.value = false
      })
      ready.value = true
      await nextTick()
      scrollToEnd()
    } catch {
      scrollListener?.dispose()
      editor?.dispose()
      model?.dispose()
      scrollListener = undefined
      editor = undefined
      model = undefined
      ready.value = false
      loadError.value = true
    } finally {
      if (generation === loadGeneration) loading.value = false
    }
  }

  const openSearch = () => {
    editor?.focus()
    editor?.getAction('actions.find')?.run()
  }

  const copyLogs = async () => {
    try {
      await copyTextToClipboard(renderedText.value)
      ElMessage.success('日志已复制')
    } catch {
      ElMessage.error('复制失败，请选中日志后手动复制')
    }
  }

  watch(renderedText, (text) => {
    if (!model) return
    const previous = model.getValue()
    if (text === previous) return
    const wasFollowing = followOutput.value
    programmaticScroll = true
    if (text.startsWith(previous) && previous) {
      model.applyEdits([
        {
          range: model
            .getFullModelRange()
            .setStartPosition(model.getLineCount(), model.getLineMaxColumn(model.getLineCount())),
          text: text.slice(previous.length)
        }
      ])
    } else {
      const viewState = followOutput.value ? null : editor?.saveViewState()
      model.setValue(text)
      if (viewState) editor?.restoreViewState(viewState)
    }
    if (wasFollowing) nextTick(scrollToEnd)
    else
      requestAnimationFrame(() => {
        programmaticScroll = false
      })
  })
  watch(
    () => props.runId,
    () => {
      followOutput.value = true
      nextTick(scrollToEnd)
    },
    { flush: 'sync' }
  )
  watch(wordWrap, (enabled) => editor?.updateOptions({ wordWrap: enabled ? 'on' : 'off' }))
  watch(followOutput, (enabled) => {
    if (enabled) nextTick(scrollToEnd)
  })
  watch(editorTheme, (theme) => loadedMonaco?.editor.setTheme(theme))
  const updateTheme = () => {
    const root = document.documentElement
    editorTheme.value =
      root.classList.contains('dark') || root.dataset.theme === 'dark' ? 'vs-dark' : 'vs'
  }
  const { stop: stopThemeObserver } = useMutationObserver(document.documentElement, updateTheme, {
    attributes: true,
    attributeFilter: ['class', 'data-theme']
  })
  onMounted(() => {
    updateTheme()
    loadEditor()
  })
  onBeforeUnmount(() => {
    loadGeneration++
    stopThemeObserver()
    scrollListener?.dispose()
    editor?.dispose()
    model?.dispose()
  })
</script>

<style scoped lang="scss">
  .operations-terminal {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 180px;
    overflow: hidden;
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--custom-radius);
  }

  .operations-terminal__toolbar {
    display: flex;
    flex-shrink: 0;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding: 4px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .operations-terminal__body {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .operations-terminal__editor {
    position: absolute;
    inset: 0;
    min-width: 0;
    overflow: hidden;
  }

  .operations-terminal__state,
  .operations-terminal__empty {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: center;
    justify-content: center;
    padding: 16px;
    color: var(--el-text-color-secondary);
    text-align: center;
    background: var(--el-bg-color);
  }
</style>
