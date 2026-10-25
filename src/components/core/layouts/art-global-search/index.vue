<!-- 全局搜索组件 -->
<template>
  <div class="layout-search">
    <ElDialog
      v-model="showSearchDialog"
      width="600"
      :title="$t('search.dialogTitle')"
      :show-close="false"
      :lock-scroll="false"
      class="art-global-search-dialog"
      modal-class="search-modal"
      @close="closeSearchDialog"
    >
      <ElInput
        v-model.trim="searchVal"
        :readonly="navigationPending"
        :placeholder="$t('search.placeholder')"
        @input="search"
        ref="searchInput"
        :prefix-icon="Search"
        class="art-global-search__input h-12"
      >
        <template #suffix>
          <div
            class="h-4.5 flex-cc rounded border border-g-300 dark:!bg-g-200/50 !bg-box px-1.5 text-g-500"
          >
            <ArtSvgIcon icon="fluent:arrow-enter-left-20-filled" />
          </div>
        </template>
      </ElInput>
      <ElScrollbar
        class="art-global-search__results"
        max-height="min(370px, calc(100dvh - 240px))"
        ref="searchResultScrollbar"
      >
        <Transition name="search-state" mode="out-in">
          <div v-if="searchVal && searchResult.length" key="results" class="search-panel">
            <div class="search-panel__heading">
              <span>{{ $t('search.resultsTitle') }}</span>
              <span class="search-panel__count">
                {{ $t('search.resultCount', { count: searchResult.length }) }}
              </span>
            </div>

            <TransitionGroup name="search-list" tag="div" class="search-list">
              <button
                v-for="(item, index) in searchResult"
                :key="getItemKey(item)"
                type="button"
                :disabled="navigationPending"
                :aria-busy="isOpening(item) || undefined"
                class="search-item"
                :class="{ 'is-highlighted': isHighlighted(index), 'is-opening': isOpening(item) }"
                @click="searchGoPage(item)"
                @mouseenter="highlightOnHover(index)"
              >
                <span class="search-item__icon" aria-hidden="true">
                  <ArtSvgIcon icon="ri:file-list-3-line" />
                </span>
                <span class="search-item__label">{{ formatMenuTitle(item.meta.title) }}</span>
                <span v-if="isOpening(item)" class="search-item__progress" aria-hidden="true">
                  <ArtSvgIcon icon="ri:loader-4-line" class="search-item__spinner" />
                  打开中
                </span>
                <span v-else class="search-item__enter" aria-hidden="true">
                  <ArtSvgIcon icon="fluent:arrow-enter-left-20-filled" />
                </span>
              </button>
            </TransitionGroup>
          </div>

          <div v-else-if="!searchVal && historyResult.length" key="history" class="search-panel">
            <div class="search-panel__heading">
              <span>{{ $t('search.historyTitle') }}</span>
              <span class="search-panel__hint">{{ $t('search.historyHint') }}</span>
            </div>

            <TransitionGroup name="search-list" tag="div" class="search-list">
              <div
                v-for="(item, index) in historyResult"
                :key="getItemKey(item)"
                class="search-item search-item--history"
                :class="{
                  'is-highlighted': historyHIndex === index,
                  'is-opening': isOpening(item)
                }"
                @mouseenter="highlightOnHoverHistory(index)"
              >
                <button
                  type="button"
                  class="search-item__main"
                  :disabled="navigationPending"
                  :aria-busy="isOpening(item) || undefined"
                  @click="searchGoPage(item)"
                >
                  <span class="search-item__icon" aria-hidden="true">
                    <ArtSvgIcon icon="ri:history-line" />
                  </span>
                  <span class="search-item__label">{{ formatMenuTitle(item.meta.title) }}</span>
                </button>
                <ArtIconButton
                  class="search-item__remove size-7.5! text-[13px]!"
                  icon="ri:close-large-fill"
                  tone="danger"
                  :disabled="navigationPending"
                  :label="`${$t('search.deleteHistory')}：${formatMenuTitle(item.meta.title)}`"
                  @click.stop="deleteHistory(index)"
                />
                <span v-if="isOpening(item)" class="search-item__progress" aria-hidden="true">
                  <ArtSvgIcon icon="ri:loader-4-line" class="search-item__spinner" />
                  打开中
                </span>
                <span v-else class="search-item__enter" aria-hidden="true">
                  <ArtSvgIcon icon="fluent:arrow-enter-left-20-filled" />
                </span>
              </div>
            </TransitionGroup>
          </div>

          <div v-else-if="searchVal" key="no-results" class="search-empty">
            <ArtEmptyState
              :title="$t('search.noResultsTitle')"
              :description="$t('search.noResultsDescription', { keyword: searchVal })"
              size="compact"
              :visual-size="88"
            />
          </div>

          <div v-else key="no-history" class="search-empty">
            <ArtEmptyState
              :title="$t('search.emptyHistoryTitle')"
              :description="$t('search.emptyHistoryDescription')"
              size="compact"
              :visual-size="88"
            />
          </div>
        </Transition>
      </ElScrollbar>
      <span class="sr-only" role="status" aria-live="polite">
        {{ navigationPending ? `正在打开${navigationTargetTitle}` : '' }}
      </span>

      <template #footer>
        <div class="dialog-footer box-border flex-c">
          <div class="flex-cc">
            <ArtSvgIcon icon="fluent:arrow-enter-left-20-filled" class="keyboard" />
            <span class="mr-3.5 text-xs text-g-700">{{ $t('search.selectKeydown') }}</span>
          </div>
          <div class="flex-c">
            <ArtSvgIcon icon="ri:arrow-up-wide-fill" class="keyboard" />
            <ArtSvgIcon icon="ri:arrow-down-wide-fill" class="keyboard" />
            <span class="mr-3.5 text-xs text-g-700">{{ $t('search.switchKeydown') }}</span>
          </div>
          <div class="flex-c">
            <i class="keyboard !w-8 flex-cc"><p class="text-[10px] font-medium">ESC</p></i>
            <span class="mr-3.5 text-xs text-g-700">{{ $t('search.exitKeydown') }}</span>
          </div>
        </div>
      </template>
    </ElDialog>
  </div>
</template>

<script lang="ts" setup>
  import { useUserStore } from '@/store/modules/user'
  import { AppRouteRecord } from '@/types/router'
  import { Search } from '@element-plus/icons-vue'
  import { mittBus } from '@/utils/sys'
  import { useMenuStore } from '@/store/modules/menu'
  import { formatMenuTitle } from '@/utils/router'
  import { handleMenuJump, preloadMenuRoute } from '@/utils/navigation'
  import { router } from '@/router'
  import { isNavigationFailure, NavigationFailureType } from 'vue-router'
  import { ElMessage, type ScrollbarInstance } from 'element-plus'
  import { useEventListener, useTimeoutFn } from '@vueuse/core'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { useWorkspaceInteraction } from '@/hooks/core/useWorkspaceInteraction'

  defineOptions({ name: 'ArtGlobalSearch' })

  const userStore = useUserStore()
  const { isLocked, captureIntent } = useWorkspaceInteraction()
  const { menuList } = storeToRefs(useMenuStore())

  const showSearchDialog = ref(false)
  const searchVal = ref('')
  const searchResult = ref<AppRouteRecord[]>([])
  const historyMaxLength = 10

  const { searchHistory: historyResult } = storeToRefs(userStore)

  const searchInput = ref<HTMLInputElement | null>(null)
  const highlightedIndex = ref(0)
  const historyHIndex = ref(0)
  const searchResultScrollbar = ref<ScrollbarInstance>()
  const isKeyboardNavigating = ref(false) // 新增状态：是否正在使用键盘导航
  const navigationPending = ref(false)
  const navigationTargetKey = ref<string | null>(null)
  const navigationTargetTitle = ref('')
  const resetNavigation = (): void => {
    navigationPending.value = false
    navigationTargetKey.value = null
    navigationTargetTitle.value = ''
  }
  const { start: focusInput, stop: stopFocusInput } = useTimeoutFn(
    () => {
      if (showSearchDialog.value) searchInput.value?.focus()
    },
    100,
    { immediate: false }
  )
  const { start: finishKeyboardNavigation, stop: stopKeyboardNavigation } = useTimeoutFn(
    () => {
      isKeyboardNavigating.value = false
    },
    100,
    { immediate: false }
  )
  watch(showSearchDialog, (open) => {
    if (!open) {
      stopFocusInput()
      stopKeyboardNavigation()
      isKeyboardNavigating.value = false
    }
  })
  watch(
    isLocked,
    (locked) => {
      if (!locked) return
      showSearchDialog.value = false
      resetNavigation()
      stopFocusInput()
      stopKeyboardNavigation()
      isKeyboardNavigating.value = false
    },
    { flush: 'sync' }
  )

  const getItemKey = (item: AppRouteRecord) =>
    item.path || String(item.meta.link || item.name || '')

  // 生命周期钩子
  onMounted(() => {
    mittBus.on('openSearchDialog', openSearchDialog)
  })

  onUnmounted(() => {
    mittBus.off('openSearchDialog', openSearchDialog)
  })

  // 键盘快捷键处理
  const handleKeydown = (event: KeyboardEvent) => {
    if (isLocked.value) return
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      showSearchDialog.value = true
      focusInput()
    }

    // 当搜索对话框打开时，处理方向键和回车键
    if (showSearchDialog.value) {
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        highlightPrevious()
      } else if (event.key === 'ArrowDown') {
        event.preventDefault()
        highlightNext()
      } else if (event.key === 'Enter') {
        event.preventDefault()
        selectHighlighted()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        showSearchDialog.value = false
      }
    }
  }

  // 搜索逻辑
  const search = (val: string) => {
    highlightedIndex.value = 0

    if (val) {
      searchResult.value = flattenAndFilterMenuItems(menuList.value, val)
    } else {
      searchResult.value = []
    }
  }

  const flattenAndFilterMenuItems = (items: AppRouteRecord[], val: string): AppRouteRecord[] => {
    const lowerVal = val.toLowerCase()
    const result: AppRouteRecord[] = []

    const flattenAndMatch = (item: AppRouteRecord) => {
      if (item.meta?.isHide) return

      const lowerItemTitle = formatMenuTitle(item.meta.title).toLowerCase()

      if (item.children && item.children.length > 0) {
        item.children.forEach(flattenAndMatch)
        return
      }

      if (
        lowerItemTitle.includes(lowerVal) &&
        ((item.path && item.path.trim()) || item.meta.link || item.meta.isIframe)
      ) {
        result.push({ ...item, children: undefined })
      }
    }

    items.forEach(flattenAndMatch)
    return result
  }

  // 高亮控制并实现滚动条跟随
  const highlightPrevious = () => {
    if (navigationPending.value) return
    isKeyboardNavigating.value = true
    if (searchVal.value) {
      if (!searchResult.value.length) return finishKeyboardNavigation()
      highlightedIndex.value =
        (highlightedIndex.value - 1 + searchResult.value.length) % searchResult.value.length
      scrollToHighlightedItem()
    } else {
      if (!historyResult.value.length) return finishKeyboardNavigation()
      historyHIndex.value =
        (historyHIndex.value - 1 + historyResult.value.length) % historyResult.value.length
      scrollToHighlightedHistoryItem()
    }
    finishKeyboardNavigation()
  }

  const highlightNext = () => {
    if (navigationPending.value) return
    isKeyboardNavigating.value = true
    if (searchVal.value) {
      if (!searchResult.value.length) return finishKeyboardNavigation()
      highlightedIndex.value = (highlightedIndex.value + 1) % searchResult.value.length
      scrollToHighlightedItem()
    } else {
      if (!historyResult.value.length) return finishKeyboardNavigation()
      historyHIndex.value = (historyHIndex.value + 1) % historyResult.value.length
      scrollToHighlightedHistoryItem()
    }
    finishKeyboardNavigation()
  }

  const scrollToHighlightedItem = () => {
    nextTick(() => {
      if (!searchResultScrollbar.value || !searchResult.value.length) return

      const scrollWrapper = searchResultScrollbar.value.wrapRef
      if (!scrollWrapper) return

      const highlightedElements = scrollWrapper.querySelectorAll('.search-panel .search-item')
      if (!highlightedElements[highlightedIndex.value]) return

      const highlightedElement = highlightedElements[highlightedIndex.value] as HTMLElement
      const itemHeight = highlightedElement.offsetHeight
      const scrollTop = scrollWrapper.scrollTop
      const containerHeight = scrollWrapper.clientHeight
      const itemTop = highlightedElement.offsetTop
      const itemBottom = itemTop + itemHeight

      if (itemTop < scrollTop) {
        searchResultScrollbar.value.setScrollTop(itemTop)
      } else if (itemBottom > scrollTop + containerHeight) {
        searchResultScrollbar.value.setScrollTop(itemBottom - containerHeight)
      }
    })
  }

  const scrollToHighlightedHistoryItem = () => {
    nextTick(() => {
      if (!searchResultScrollbar.value || !historyResult.value.length) return

      const scrollWrapper = searchResultScrollbar.value.wrapRef
      if (!scrollWrapper) return

      const historyItems = scrollWrapper.querySelectorAll('.search-panel .search-item')
      if (!historyItems[historyHIndex.value]) return

      const highlightedElement = historyItems[historyHIndex.value] as HTMLElement
      const itemHeight = highlightedElement.offsetHeight
      const scrollTop = scrollWrapper.scrollTop
      const containerHeight = scrollWrapper.clientHeight
      const itemTop = highlightedElement.offsetTop
      const itemBottom = itemTop + itemHeight

      if (itemTop < scrollTop) {
        searchResultScrollbar.value.setScrollTop(itemTop)
      } else if (itemBottom > scrollTop + containerHeight) {
        searchResultScrollbar.value.setScrollTop(itemBottom - containerHeight)
      }
    })
  }

  const selectHighlighted = () => {
    if (searchVal.value && searchResult.value.length) {
      searchGoPage(searchResult.value[highlightedIndex.value])
    } else if (!searchVal.value && historyResult.value.length) {
      searchGoPage(historyResult.value[historyHIndex.value])
    }
  }

  const isHighlighted = (index: number) => {
    return highlightedIndex.value === index
  }

  const isOpening = (item: AppRouteRecord) =>
    navigationPending.value && navigationTargetKey.value === getItemKey(item)

  const searchGoPage = async (item: AppRouteRecord) => {
    if (isLocked.value || navigationPending.value) return
    const isCurrentIntent = captureIntent()
    navigationTargetKey.value = getItemKey(item)
    navigationTargetTitle.value = formatMenuTitle(item.meta.title)
    navigationPending.value = true
    try {
      if (!(item.meta.link && !item.meta.isIframe)) {
        await preloadMenuRoute(item, false, true)
      }
      if (!isCurrentIntent()) return
      const failure = await handleMenuJump(item)
      if (!isCurrentIntent()) return
      if (
        failure &&
        isNavigationFailure(failure) &&
        !isNavigationFailure(failure, NavigationFailureType.duplicated)
      ) {
        throw failure
      }
      if (
        !(item.meta.link && !item.meta.isIframe) &&
        router.currentRoute.value.path !== router.resolve(item.path).path
      ) {
        throw new Error('导航未进入目标页面')
      }
      await nextTick()
      if (!isCurrentIntent()) return
      addHistory(item)
      showSearchDialog.value = false
      searchVal.value = ''
      searchResult.value = []
    } catch (error) {
      if (!isCurrentIntent()) return
      console.error('[GlobalSearch] 页面导航失败:', error)
      ElMessage.error('页面打开失败，请重试或从左侧菜单进入')
    } finally {
      if (isCurrentIntent()) resetNavigation()
    }
  }

  // 历史记录管理
  const updateHistory = () => {
    if (Array.isArray(historyResult.value)) {
      userStore.setSearchHistory(historyResult.value)
    }
  }

  const addHistory = (item: AppRouteRecord) => {
    const itemKey = item.path || String(item.meta.link || '')
    const hasItemIndex = historyResult.value.findIndex(
      (historyItem: AppRouteRecord) =>
        (historyItem.path || String(historyItem.meta.link || '')) === itemKey
    )

    if (hasItemIndex !== -1) {
      historyResult.value.splice(hasItemIndex, 1)
    } else if (historyResult.value.length >= historyMaxLength) {
      historyResult.value.pop()
    }

    const cleanedItem = { ...item }
    delete cleanedItem.children
    delete cleanedItem.meta.authList
    historyResult.value.unshift(cleanedItem)
    updateHistory()
  }

  const deleteHistory = (index: number) => {
    historyResult.value.splice(index, 1)
    historyHIndex.value = Math.min(historyHIndex.value, Math.max(historyResult.value.length - 1, 0))
    updateHistory()
  }

  // 对话框控制
  const openSearchDialog = () => {
    if (isLocked.value) return
    showSearchDialog.value = true
    focusInput()
  }

  const closeSearchDialog = () => {
    searchVal.value = ''
    searchResult.value = []
    highlightedIndex.value = 0
    historyHIndex.value = 0
  }

  // 修改 hover 高亮逻辑，只有在非键盘导航时才生效
  const highlightOnHover = (index: number) => {
    if (!navigationPending.value && !isKeyboardNavigating.value && searchVal.value) {
      highlightedIndex.value = index
    }
  }

  const highlightOnHoverHistory = (index: number) => {
    if (!navigationPending.value && !isKeyboardNavigating.value && !searchVal.value) {
      historyHIndex.value = index
    }
  }
  useEventListener(document, 'keydown', handleKeydown)
</script>
<style lang="scss">
  .search-modal {
    background-color: rgb(15 23 42 / 36%);
  }

  .art-global-search-dialog {
    width: min(600px, calc(100vw - 24px));
    padding: 0 !important;
    overflow: hidden;
    background: var(--default-box-color);
    border-color: var(--art-card-border);
    border-radius: var(--art-modal-radius) !important;

    .el-dialog__header {
      display: none;
    }

    .el-dialog__body {
      padding: 16px 18px 0 !important;
    }

    .el-dialog__footer {
      min-height: 50px;
      padding: 11px 18px 12px !important;
      background: color-mix(in srgb, var(--art-gray-100) 62%, var(--default-box-color));
      border-top: 1px solid var(--art-card-border);
    }

    .art-global-search__results {
      margin-top: 10px;

      .el-scrollbar__bar.is-vertical {
        right: 1px;
      }
    }

    .search-panel {
      min-width: 0;
      min-height: 220px;
      padding: 2px 4px 14px 0;

      &__heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        min-width: 0;
        min-height: 28px;
        padding: 0 8px;
        font-size: 12px;
        font-weight: 600;
        line-height: 20px;
        color: var(--art-gray-700);
      }

      &__count,
      &__hint {
        font-weight: 400;
        color: var(--art-gray-500);
      }
    }

    .search-list {
      display: grid;
      gap: 6px;
      min-width: 0;
      padding: 2px;
    }

    .search-item {
      position: relative;
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      height: 48px;
      padding: 0 12px;
      overflow: hidden;
      font-size: 14px;
      line-height: 20px;
      color: var(--art-gray-800);
      text-align: left;
      cursor: pointer;
      background: color-mix(in srgb, var(--art-gray-100) 72%, transparent);
      border: 1px solid transparent;
      border-radius: var(--art-control-radius);
      transition:
        color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        background-color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        border-color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        box-shadow var(--art-motion-duration-fast) var(--art-motion-ease-out),
        transform var(--art-motion-duration-fast) var(--art-motion-ease-out);

      &::before {
        position: absolute;
        top: 12px;
        bottom: 12px;
        left: 0;
        width: 3px;
        content: '';
        background: var(--theme-color);
        border-radius: 0 999px 999px 0;
        opacity: 0;
        transform: scaleY(0.45);
        transition:
          opacity var(--art-motion-duration-fast) ease,
          transform var(--art-motion-duration-base) var(--art-motion-ease-out);
      }

      &:hover {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      }

      &:focus-visible {
        outline: none;
        box-shadow: var(--art-themed-action-focus-shadow);
      }

      &.is-highlighted,
      &.is-opening {
        color: var(--theme-color) !important;
        background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color)) !important;
        border-color: var(--art-themed-action-active-border);
        box-shadow: var(--art-themed-action-active-shadow);
        transform: translateX(2px);

        &::before {
          opacity: 1;
          transform: scaleY(1);
        }

        .search-item__icon {
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 14%, transparent);
        }

        .search-item__enter {
          opacity: 1;
          transform: translateX(0);
        }
      }

      &--history {
        padding: 0 8px 0 0;
        cursor: default;

        &:has(.search-item__main:focus-visible) {
          box-shadow: var(--art-themed-action-focus-shadow);
        }

        &:hover .search-item__remove,
        .search-item__remove:focus-visible {
          opacity: 1;
        }
      }

      &__main {
        display: flex;
        flex: 1;
        align-items: center;
        align-self: stretch;
        min-width: 0;
        padding: 0 4px 0 12px;
        color: inherit;
        text-align: left;
        cursor: pointer;
        background: transparent;
        border: 0;

        &:focus-visible {
          outline: none;
        }
      }

      &__icon {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        margin-right: 12px;
        font-size: 16px;
        color: var(--art-gray-600);
        background: color-mix(in srgb, var(--art-gray-200) 78%, transparent);
        border-radius: var(--art-control-radius-small);
        transition:
          color var(--art-motion-duration-fast) ease,
          background-color var(--art-motion-duration-fast) ease;
      }

      &__label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
        white-space: nowrap;
      }

      &__enter {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        margin-left: 8px;
        font-size: 16px;
        color: var(--theme-color);
        opacity: 0;
        transform: translateX(5px);
        transition:
          opacity var(--art-motion-duration-fast) ease,
          transform var(--art-motion-duration-fast) var(--art-motion-ease-out);
      }

      &__progress {
        display: inline-flex;
        flex: none;
        gap: 6px;
        align-items: center;
        margin-left: 8px;
        font-size: 12px;
        font-weight: 500;
        color: var(--theme-color);
        white-space: nowrap;
      }

      &__spinner {
        font-size: 16px;
        animation: art-search-spinner 900ms linear infinite;
      }

      &__remove {
        flex: none;
        opacity: 0.72;
      }
    }

    .search-empty {
      display: grid;
      place-items: center;
      min-height: 220px;

      .art-empty-state {
        width: 100%;
      }
    }

    .search-state-enter-active,
    .search-state-leave-active {
      transition:
        opacity var(--art-motion-duration-fast) ease,
        transform var(--art-motion-duration-fast) var(--art-motion-ease-out);
    }

    .search-state-enter-from {
      opacity: 0;
      transform: translateY(6px);
    }

    .search-state-leave-to {
      opacity: 0;
      transform: translateY(-4px);
    }

    .search-list-enter-active,
    .search-list-leave-active,
    .search-list-move {
      transition:
        opacity var(--art-motion-duration-fast) ease,
        transform var(--art-motion-duration-base) var(--art-motion-ease-out);
    }

    .search-list-enter-from,
    .search-list-leave-to {
      opacity: 0;
      transform: translateY(6px);
    }

    .dialog-footer {
      flex-wrap: wrap;
      gap: 4px 0;
      min-width: 0;
    }

    .art-global-search__input .el-input__wrapper {
      padding: 0 14px;
      background-color: color-mix(in srgb, var(--art-gray-100) 76%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-control-radius) !important;
      box-shadow: none;
      transition:
        border-color var(--art-motion-duration-fast) ease,
        box-shadow var(--art-motion-duration-fast) ease;

      &.is-focus {
        border-color: color-mix(in srgb, var(--theme-color) 38%, transparent);
        box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-color) 10%, transparent);
      }
    }

    .art-global-search__input .el-input__inner {
      color: var(--art-gray-800) !important;
    }
  }

  html.dark .search-modal {
    background-color: rgb(2 6 23 / 62%);
  }

  @keyframes art-search-spinner {
    to {
      transform: rotate(360deg);
    }
  }

  @media (width <= 640px) {
    .art-global-search-dialog {
      .el-dialog__body {
        padding: 14px 14px 8px !important;
      }

      .el-dialog__footer {
        padding: 10px 14px 11px !important;
      }

      .search-panel {
        padding-right: 1px;
      }

      .search-item {
        height: 46px;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .art-global-search-dialog {
      .search-item,
      .search-item::before,
      .search-item__icon,
      .search-item__enter,
      .search-item__remove,
      .search-state-enter-active,
      .search-state-leave-active,
      .search-list-enter-active,
      .search-list-leave-active,
      .search-list-move {
        transition-duration: 0.01ms !important;
      }

      .search-item__spinner {
        animation: none;
      }
    }
  }
</style>

<style scoped>
  @reference '@styles/core/tailwind.css';

  .keyboard {
    @apply mr-2 
    box-border
    h-5 
    w-5.5
    rounded
    border 
    border-g-400 
    px-1 
    text-g-500
    shadow-[0_2px_0_var(--default-border-dashed)] 
    last-of-type:mr-1.5;
  }
</style>
