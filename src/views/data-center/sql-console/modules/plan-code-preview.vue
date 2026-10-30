<template>
  <details
    ref="previewRef"
    class="sql-plan-code"
    :open="expanded"
    @keydown.ctrl.f.prevent.stop="openFind"
    @keydown.meta.f.prevent.stop="openFind"
  >
    <summary class="sql-plan-code__summary">
      <span class="art-icon-label min-w-0">
        <ArtSvgIcon
          :icon="language === 'sql' ? 'ri:code-s-slash-line' : 'ri:braces-line'"
          class="shrink-0 text-base text-primary"
          aria-hidden="true"
        />
        <span class="min-w-0 truncate font-medium">{{ title }}</span>
      </span>
      <span class="art-icon-label shrink-0 text-xs text-g-600">
        <span>{{ languageLabel }} · {{ lineCount }} 行</span>
        <ArtSvgIcon
          icon="ri:arrow-right-s-line"
          class="sql-plan-code__chevron"
          aria-hidden="true"
        />
      </span>
    </summary>
    <div class="sql-plan-code__content">
      <div class="flex items-center justify-between gap-3 px-3 py-1.5">
        <span class="text-xs text-g-600">只读预览</span>
        <div class="flex items-center gap-1">
          <ArtTooltip content="查找代码（Ctrl/⌘ + F）" placement="top" :disabled="findVisible"
            ><ArtIconButton
              size="small"
              icon="ri:search-line"
              :label="`查找 ${language.toUpperCase()}`"
              :aria-pressed="findVisible"
              @click="openFind"
          /></ArtTooltip>
          <ArtTooltip :content="wrapped ? '取消自动换行' : '启用自动换行'" placement="top">
            <ArtIconButton
              size="small"
              icon="ri:text-wrap"
              :label="wrapped ? '取消自动换行' : '启用自动换行'"
              :aria-pressed="wrapped"
              @click="wrapped = !wrapped"
            />
          </ArtTooltip>
          <ArtTooltip
            :content="copied ? '已复制' : `复制 ${language.toUpperCase()}`"
            placement="top"
          >
            <ArtIconButton
              size="small"
              :icon="copied ? 'ri:check-line' : 'ri:file-copy-line'"
              :label="`复制 ${language.toUpperCase()}`"
              @click="copyCode"
            />
          </ArtTooltip>
        </div>
      </div>
      <div
        v-if="findVisible"
        class="flex items-center gap-1 border-t border-g-200 px-3 py-2"
        @keydown.esc.prevent.stop="closeFind"
      >
        <ElInput
          ref="findInput"
          class="min-w-0 flex-1"
          v-model="keyword"
          size="small"
          clearable
          :aria-label="`查找 ${language.toUpperCase()} 内容`"
          placeholder="查找内容"
          @keydown.enter.prevent="handleFindEnter"
          ><template #suffix
            ><span class="whitespace-nowrap text-xs text-g-600" role="status">{{
              keyword ? `${matches.length ? matchIndex + 1 : 0} / ${matches.length}` : 'Enter 定位'
            }}</span></template
          ></ElInput
        >
        <ArtIconButton
          size="small"
          icon="ri:arrow-up-s-line"
          label="上一个匹配"
          :disabled="!matches.length"
          @click="moveMatch(-1)"
        />
        <ArtIconButton
          size="small"
          icon="ri:arrow-down-s-line"
          label="下一个匹配"
          :disabled="!matches.length"
          @click="moveMatch(1)"
        />
        <ArtIconButton size="small" icon="ri:close-line" label="关闭代码查找" @click="closeFind" />
      </div>
      <ElScrollbar ref="codeScrollbar" :max-height="maxHeight" always>
        <pre
          class="sql-plan-code__source"
          :class="{ 'is-wrapped': wrapped }"
          :aria-label="`${title}代码`"
          tabindex="0"
        ><code ref="sourceRef" v-code-highlight="{ code, language }" :class="`language-${language}`"></code></pre>
      </ElScrollbar>
    </div>
  </details>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
  import { ElMessage, type InputInstance, type ScrollbarInstance } from 'element-plus'
  import { escapeRegExp } from 'lodash-es'
  import { useTimeoutFn } from '@vueuse/core'
  import { codeHighlightDirective as vCodeHighlight } from '@/directives/business/code-highlight'
  import { copyTextToClipboard } from '@/utils/file/clipboard'

  const props = withDefaults(
    defineProps<{
      title: string
      code: string
      language: 'sql' | 'json' | 'plaintext'
      expanded?: boolean
      maxHeight?: string
    }>(),
    { expanded: false, maxHeight: '320px' }
  )
  const lineCount = computed(() => (props.code ? props.code.split('\n').length : 0))
  const languageLabel = computed(() =>
    props.language === 'plaintext' ? 'TEXT' : props.language.toUpperCase()
  )
  const wrapped = ref(false)
  const copied = ref(false)
  const findVisible = ref(false)
  const previewRef = ref<HTMLDetailsElement>()
  const keyword = ref('')
  const matchIndex = ref(0)
  const sourceRef = ref<HTMLElement>()
  const findInput = ref<InputInstance>()
  const codeScrollbar = ref<ScrollbarInstance>()
  let ownedHighlight: Highlight | null = null
  const matches = computed(() =>
    keyword.value
      ? Array.from(props.code.matchAll(new RegExp(escapeRegExp(keyword.value), 'gi')), (match) => ({
          start: match.index,
          end: match.index + match[0].length
        }))
      : []
  )
  const clearMatch = () => {
    if (typeof CSS !== 'undefined' && CSS.highlights?.get('art-sql-code-find') === ownedHighlight)
      CSS.highlights.delete('art-sql-code-find')
    ownedHighlight = null
  }
  const revealMatch = async () => {
    clearMatch()
    await nextTick()
    const match = matches.value[matchIndex.value]
    const source = sourceRef.value
    if (!match || !source || !findVisible.value) return
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    let offset = 0
    let started = false
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const length = node.textContent?.length || 0
      if (!started && match.start < offset + length) {
        range.setStart(node, match.start - offset)
        started = true
      }
      if (started && match.end <= offset + length) {
        range.setEnd(node, match.end - offset)
        break
      }
      offset += length
    }
    if (!started) return
    if (typeof Highlight !== 'undefined' && CSS.highlights) {
      ownedHighlight = new Highlight(range)
      CSS.highlights.set('art-sql-code-find', ownedHighlight)
    } else {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    }
    const wrap = codeScrollbar.value?.wrapRef
    if (wrap) {
      const target = range.getBoundingClientRect()
      const bounds = wrap.getBoundingClientRect()
      wrap.scrollTo({
        top: wrap.scrollTop + target.top - bounds.top - 36,
        left: wrapped.value ? 0 : Math.max(0, wrap.scrollLeft + target.left - bounds.left - 20)
      })
    }
  }
  const openFind = async () => {
    if (previewRef.value) previewRef.value.open = true
    findVisible.value = true
    await nextTick()
    findInput.value?.focus()
    void revealMatch()
  }
  const closeFind = () => {
    findVisible.value = false
    clearMatch()
  }
  const moveMatch = (direction: number) => {
    if (matches.value.length) {
      matchIndex.value =
        (matchIndex.value + direction + matches.value.length) % matches.value.length
      void revealMatch()
    }
  }
  const handleFindEnter = (event: Event) =>
    moveMatch(event instanceof KeyboardEvent && event.shiftKey ? -1 : 1)
  watch([keyword, () => props.code], () => {
    matchIndex.value = 0
    void revealMatch()
  })
  onBeforeUnmount(clearMatch)
  const { start: resetCopied, stop: stopReset } = useTimeoutFn(
    () => {
      copied.value = false
    },
    1800,
    { immediate: false }
  )
  watch(
    () => props.code,
    () => {
      copied.value = false
      stopReset()
    }
  )
  const copyCode = async () => {
    const source = props.code
    try {
      await copyTextToClipboard(source, { legacyFallback: true })
      if (props.code !== source) return
      copied.value = true
      resetCopied()
      ElMessage.success(`${props.language.toUpperCase()} 已复制`)
    } catch {
      ElMessage.error('复制失败，请选择代码后手动复制')
    }
  }
</script>

<style scoped lang="scss">
  .sql-plan-code {
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--el-border-radius-base);

    &__summary {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-height: 46px;
      padding: 10px 14px;
      font-size: 13px;
      color: var(--el-text-color-regular);
      cursor: pointer;
      list-style: none;

      &::-webkit-details-marker {
        display: none;
      }

      &::marker {
        content: '';
      }

      &:hover {
        background: var(--el-fill-color-extra-light);
      }

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: -2px;
      }
    }

    &__chevron {
      width: 16px;
      height: 16px;
      transition: transform var(--art-motion-duration-fast) var(--art-motion-ease-out);
    }

    &[open] &__chevron {
      transform: rotate(90deg);
    }

    &__content {
      min-width: 0;
      background: var(--el-fill-color-extra-light);
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__source {
      box-sizing: border-box;
      width: max-content;
      min-width: 100%;
      padding: 4px 14px 16px;
      margin: 0;
      font:
        13px / 1.8 Consolas,
        SFMono-Regular,
        Menlo,
        monospace;
      color: var(--el-text-color-primary);
      tab-size: 2;
      white-space: pre;

      &.is-wrapped {
        width: 100%;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
      }

      &:focus-visible {
        outline: 2px solid var(--el-color-primary);
        outline-offset: -2px;
      }

      code {
        display: block;
        font: inherit;
      }

      :deep(.hljs-keyword),
      :deep(.hljs-literal),
      :deep(.hljs-type),
      :deep(.hljs-attr) {
        font-weight: 500;
        color: color-mix(in srgb, var(--el-color-primary) 80%, var(--el-text-color-primary));
      }

      :deep(.hljs-string),
      :deep(.hljs-regexp) {
        color: color-mix(in srgb, var(--el-color-success) 45%, var(--el-text-color-primary));
      }

      :deep(.hljs-number),
      :deep(.hljs-symbol) {
        color: color-mix(in srgb, var(--el-color-warning) 40%, var(--el-text-color-primary));
      }

      :deep(.hljs-built_in),
      :deep(.hljs-title) {
        color: color-mix(in srgb, var(--el-color-primary) 55%, var(--el-text-color-primary));
      }

      :deep(.hljs-comment),
      :deep(.hljs-punctuation) {
        color: var(--el-text-color-secondary);
      }
    }
  }
</style>

<style lang="scss">
  ::highlight(art-sql-code-find) {
    color: var(--el-text-color-primary);
    background: var(--el-color-warning-light-5);
  }
</style>
