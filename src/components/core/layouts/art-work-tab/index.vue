<!-- 标签页 -->
<template>
  <div
    v-if="showWorkTab"
    class="art-work-tab box-border flex-b w-full gap-1.5 select-none"
    :class="{
      'art-work-tab--default': tabStyle === 'tab-default',
      'art-work-tab--card': tabStyle === 'tab-card',
      'art-work-tab--google': tabStyle === 'tab-google'
    }"
  >
    <div ref="scrollAreaRef" class="flex min-w-0 flex-1 gap-1.5">
      <button
        v-show="hasOverflow"
        type="button"
        class="art-work-tab__scroll-button art-card-xs"
        :disabled="!canScrollLeft"
        aria-label="向左滚动已打开页面"
        @click="scrollTabs('left')"
      >
        <ArtSvgIcon icon="ri:arrow-left-s-line" />
      </button>

      <div class="art-work-tab__viewport min-w-0 flex-1" ref="scrollRef">
        <ul
          class="art-work-tab__track relative flex w-max whitespace-nowrap !bg-transparent"
          role="tablist"
          aria-label="已打开页面"
          :class="{
            'px-4': tabStyle === 'tab-google',
            'art-work-tab__track--stepping': isArrowScroll
          }"
          ref="tabsRef"
          :style="{ transform: `translateX(${scrollOffset}px)` }"
        >
          <li
            class="art-card-xs inline-flex flex-cc h-8 shrink-0 mr-1.5 text-xs c-p hover:text-theme group"
            :class="[
              item.path === activeTab ? 'activ-tab !text-theme' : 'text-g-600 dark:text-g-800',
              tabStyle === 'tab-google' ? 'google-tab relative !h-8 !leading-8' : ''
            ]"
            :style="{
              padding: item.fixedTab ? '0 10px' : '0 8px 0 12px'
            }"
            v-for="(item, index) in list"
            :key="item.path"
            role="tab"
            data-ui-audit-allow="aria-tab"
            :aria-selected="item.path === activeTab"
            :tabindex="item.path === activeTab ? 0 : -1"
            @click="clickTab(item)"
            @keydown="handleTabKeydown($event, index)"
            @contextmenu.prevent="(e: MouseEvent) => showMenu(e, item.path)"
          >
            <span class="art-icon-label art-icon-label--compact">
              <ArtSvgIcon
                v-if="item.icon"
                :icon="item.icon"
                class="group-hover:text-theme"
                :class="item.path === activeTab ? 'text-theme' : 'text-g-600'"
              />
              <span class="work-tab-title" :title="item.customTitle || formatMenuTitle(item.title)">
                {{ item.customTitle || formatMenuTitle(item.title) }}
              </span>
            </span>
            <ArtIconButton
              v-if="list.length > 1 && !item.fixedTab"
              class="relative ml-0.5 size-5! shrink-0 text-[10px]!"
              icon="ri:close-large-fill"
              :label="`关闭${item.customTitle || formatMenuTitle(item.title)}`"
              @click.stop="handleCloseButton($event, item.path)"
            />
            <div
              v-if="tabStyle === 'tab-google'"
              class="line absolute top-0 bottom-0 left-0 w-px h-4 my-auto bg-g-400 transition-opacity duration-150"
            />
          </li>
        </ul>
      </div>

      <button
        v-show="hasOverflow"
        type="button"
        class="art-work-tab__scroll-button art-card-xs"
        :disabled="!canScrollRight"
        aria-label="向右滚动已打开页面"
        @click="scrollTabs('right')"
      >
        <ArtSvgIcon icon="ri:arrow-right-s-line" />
      </button>
    </div>

    <div class="flex shrink-0">
      <button
        type="button"
        aria-label="管理已打开页面"
        title="管理已打开页面"
        class="art-work-tab__menu-button flex-cc art-card-xs relative top-0 size-8 leading-8 text-center c-p tad-200 hover:!bg-hover-color"
        :style="{
          marginTop: tabStyle === 'tab-google' ? '-2px' : ''
        }"
        @click="(e: MouseEvent) => showMenu(e, activeTab)"
      >
        <ArtSvgIcon icon="iconamoon:arrow-down-2-thin" class="text-2xl text-g-700" />
      </button>
    </div>

    <ArtMenuRight ref="menuRef" :menu-items="menuItems" :menu-width="140" @select="handleSelect" />
  </div>
</template>

<script setup lang="ts">
  import { clamp } from 'lodash-es'
  import { computed, nextTick, ref, watch } from 'vue'
  import { type LocationQueryRaw, useRouter } from 'vue-router'
  import { useI18n } from 'vue-i18n'
  import { storeToRefs } from 'pinia'
  import { useElementSize, useEventListener } from '@vueuse/core'

  import { useWorktabStore } from '@/store/modules/worktab'
  import { useUserStore } from '@/store/modules/user'
  import { formatMenuTitle } from '@/utils/router'
  import { useSettingStore } from '@/store/modules/setting'
  import ArtMenuRight, { type MenuItemType } from '../../others/art-menu-right/index.vue'
  import { useCommon } from '@/hooks/core/useCommon'
  import type { WorkTab } from '@/types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'

  defineOptions({ name: 'ArtWorkTab' })

  type TabCloseType = 'current' | 'left' | 'right' | 'other' | 'all'

  // 基础设置
  const { t } = useI18n()
  const store = useWorktabStore()
  const userStore = useUserStore()
  const router = useRouter()
  const { currentRoute } = router
  const settingStore = useSettingStore()
  const { tabStyle, showWorkTab } = storeToRefs(settingStore)

  // DOM 引用
  const scrollAreaRef = ref<HTMLElement | null>(null)
  const scrollRef = ref<HTMLElement | null>(null)
  const tabsRef = ref<HTMLElement | null>(null)
  const menuRef = ref<InstanceType<typeof ArtMenuRight> | null>(null)
  const scrollOffset = ref(0)
  const isArrowScroll = ref(false)
  const { width: scrollAreaWidth } = useElementSize(scrollAreaRef)
  const { width: viewportWidth } = useElementSize(scrollRef, undefined, { box: 'border-box' })
  const { width: trackWidth } = useElementSize(tabsRef, undefined, { box: 'border-box' })
  const minOffset = computed(() => Math.min(viewportWidth.value - trackWidth.value, 0))
  const hasOverflow = computed(() => trackWidth.value > scrollAreaWidth.value + 1)
  const canScrollLeft = computed(() => scrollOffset.value < -1)
  const canScrollRight = computed(() => scrollOffset.value > minOffset.value + 1)

  const clickedPath = ref('')

  // 计算属性
  const list = computed(() => store.opened)
  const activeTab = computed(() => currentRoute.value.path)
  const activeTabIndex = computed(() => list.value.findIndex((tab) => tab.path === activeTab.value))

  // 右键菜单逻辑
  const useContextMenu = () => {
    const getClickedTabInfo = () => {
      const clickedIndex = list.value.findIndex((tab) => tab.path === clickedPath.value)
      const currentTab = list.value[clickedIndex]

      return {
        clickedIndex,
        currentTab,
        isLastTab: clickedIndex === list.value.length - 1,
        isOneTab: list.value.length === 1,
        isCurrentTab: clickedPath.value === activeTab.value
      }
    }

    // 检查标签页是否固定
    const checkTabsFixedStatus = (clickedIndex: number) => {
      const leftTabs = list.value.slice(0, clickedIndex)
      const rightTabs = list.value.slice(clickedIndex + 1)
      const otherTabs = list.value.filter((_, index) => index !== clickedIndex)

      return {
        areAllLeftTabsFixed: leftTabs.length > 0 && leftTabs.every((tab) => tab.fixedTab),
        areAllRightTabsFixed: rightTabs.length > 0 && rightTabs.every((tab) => tab.fixedTab),
        areAllOtherTabsFixed: otherTabs.length > 0 && otherTabs.every((tab) => tab.fixedTab),
        areAllTabsFixed: list.value.every((tab) => tab.fixedTab)
      }
    }

    // 右键菜单选项
    const menuItems = computed(() => {
      const { clickedIndex, currentTab, isLastTab, isOneTab, isCurrentTab } = getClickedTabInfo()
      const fixedStatus = checkTabsFixedStatus(clickedIndex)

      return [
        {
          key: 'refresh',
          label: t('worktab.btn.refresh'),
          icon: 'ri:refresh-line',
          disabled: !isCurrentTab
        },
        {
          key: 'fixed',
          label: currentTab?.fixedTab ? t('worktab.btn.unfixed') : t('worktab.btn.fixed'),
          icon: 'ri:pushpin-2-line',
          disabled: false,
          showLine: true
        },
        {
          key: 'left',
          label: t('worktab.btn.closeLeft'),
          icon: 'ri:arrow-left-s-line',
          disabled: clickedIndex === 0 || fixedStatus.areAllLeftTabsFixed
        },
        {
          key: 'right',
          label: t('worktab.btn.closeRight'),
          icon: 'ri:arrow-right-s-line',
          disabled: isLastTab || fixedStatus.areAllRightTabsFixed
        },
        {
          key: 'other',
          label: t('worktab.btn.closeOther'),
          icon: 'ri:close-fill',
          disabled: isOneTab || fixedStatus.areAllOtherTabsFixed
        },
        {
          key: 'all',
          label: t('worktab.btn.closeAll'),
          icon: 'ri:close-circle-line',
          disabled: isOneTab || fixedStatus.areAllTabsFixed
        }
      ]
    })

    return { menuItems }
  }

  const getTabElement = (index: number) =>
    tabsRef.value?.querySelectorAll<HTMLElement>('[role="tab"]').item(index)

  const setScrollOffset = (offset: number, animate = false): void => {
    isArrowScroll.value = animate
    scrollOffset.value = clamp(offset, minOffset.value, 0)
  }

  const revealTab = (index: number): void => {
    const tab = getTabElement(index)
    if (!tab || !viewportWidth.value) return

    const left = tab.offsetLeft
    const right = left + tab.offsetWidth
    if (left < -scrollOffset.value) setScrollOffset(-left)
    else if (right > viewportWidth.value - scrollOffset.value)
      setScrollOffset(viewportWidth.value - right)
  }

  useEventListener(
    tabsRef,
    'wheel',
    (event) => {
      if (event.ctrlKey || !hasOverflow.value) return

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      const offset = clamp(scrollOffset.value - delta, minOffset.value, 0)
      if (offset === scrollOffset.value) return

      event.preventDefault()
      setScrollOffset(offset)
    },
    { passive: false }
  )

  let touchX: number | undefined
  useEventListener(
    tabsRef,
    'touchstart',
    (event) => {
      touchX = event.touches[0]?.clientX
    },
    { passive: true }
  )
  useEventListener(
    tabsRef,
    'touchmove',
    (event) => {
      const x = event.touches[0]?.clientX
      if (x === undefined || touchX === undefined) return
      setScrollOffset(scrollOffset.value + x - touchX)
      touchX = x
    },
    { passive: true }
  )
  useEventListener(tabsRef, ['touchend', 'touchcancel'], () => {
    touchX = undefined
  })

  // 标签页操作逻辑
  const useTabOperations = () => {
    const clickTab = (item: WorkTab): void => {
      void router.push({
        path: item.path,
        query: item.query as LocationQueryRaw
      })
    }

    const closeWorktab = (type: TabCloseType, path: string) => {
      const closeActions = {
        current: () => store.removeTab(path),
        left: () => store.removeLeft(path),
        right: () => store.removeRight(path),
        other: () => store.removeOthers(path),
        all: () => store.removeAll()
      }

      closeActions[type]?.()
    }

    const showMenu = (e: MouseEvent, path?: string) => {
      clickedPath.value = path || ''
      menuRef.value?.show(e)
      e.preventDefault()
      e.stopPropagation()
    }

    const handleSelect = (item: MenuItemType) => {
      const { key } = item

      if (key === 'refresh') {
        useCommon().refresh()
        return
      }

      if (key === 'fixed') {
        store.toggleFixedTab(clickedPath.value)
        return
      }

      const activeIndex = list.value.findIndex((tab) => tab.path === activeTab.value)
      const clickedIndex = list.value.findIndex((tab) => tab.path === clickedPath.value)

      const navigationRules = {
        left: activeIndex < clickedIndex,
        right: activeIndex > clickedIndex,
        other: true
      } as const

      const shouldNavigate = navigationRules[key as keyof typeof navigationRules]

      if (shouldNavigate) {
        router.push(clickedPath.value)
      }

      closeWorktab(key as TabCloseType, clickedPath.value)
    }

    return {
      clickTab,
      closeWorktab,
      showMenu,
      handleSelect
    }
  }

  const { menuItems } = useContextMenu()
  const { clickTab, closeWorktab, showMenu, handleSelect } = useTabOperations()

  const handleCloseButton = (event: MouseEvent, path: string): void => {
    closeWorktab('current', path)
    if (event.detail !== 0) return

    const index = list.value.findIndex((tab) => tab.path === store.current.path)
    void nextTick(() => {
      revealTab(index)
      getTabElement(index)?.focus({ preventScroll: true })
    })
  }

  const focusTabAt = (index: number): void => {
    const target = list.value[index]
    if (!target) return

    revealTab(index)
    getTabElement(index)?.focus({ preventScroll: true })
    clickTab(target)
  }

  const handleTabKeydown = (event: KeyboardEvent, index: number): void => {
    if (event.target !== event.currentTarget) return

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      clickTab(list.value[index])
      return
    }

    const lastIndex = list.value.length - 1
    const targetIndexByKey: Partial<Record<string, number>> = {
      ArrowLeft: index > 0 ? index - 1 : lastIndex,
      ArrowRight: index < lastIndex ? index + 1 : 0,
      Home: 0,
      End: lastIndex
    }
    const targetIndex = targetIndexByKey[event.key]
    if (targetIndex === undefined) return

    event.preventDefault()
    focusTabAt(targetIndex)
  }

  const scrollTabs = (direction: 'left' | 'right'): void => {
    const step = Math.max(180, Math.round(viewportWidth.value * 0.45))
    setScrollOffset(scrollOffset.value + (direction === 'left' ? step : -step), true)
  }

  watch(
    minOffset,
    (limit) => {
      if (scrollOffset.value < limit) setScrollOffset(limit)
    },
    { flush: 'post' }
  )

  watch(
    [viewportWidth, activeTab, () => userStore.language],
    () => {
      revealTab(activeTabIndex.value)
    },
    { flush: 'post' }
  )
</script>

<style scoped lang="scss">
  .art-work-tab {
    min-height: var(--art-work-tab-height);
    padding: 6px var(--art-page-inline-padding);
    margin: 0;
    background: var(--art-layout-toolbar-bg);
    box-shadow: inset 0 -1px 0 var(--art-layout-divider);

    &--card {
      padding-block: var(--art-space-1);
    }

    &--google {
      padding-top: var(--art-space-1);
      padding-bottom: 0;
    }

    &__menu-button {
      color: var(--art-gray-700);
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;

      &:focus-visible {
        color: var(--theme-color);
        outline: none;
        box-shadow: var(--art-themed-action-focus-shadow) !important;
      }
    }

    &__scroll-button {
      display: inline-grid;
      flex: 0 0 auto;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      font: inherit;
      font-size: 18px;
      color: var(--art-gray-700);
      touch-action: manipulation;
      cursor: pointer;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: var(--el-border-radius-base);

      &:hover:not(:disabled) {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
        box-shadow: var(--art-themed-action-hover-shadow);
      }

      &:focus-visible {
        color: var(--theme-color);
        outline: none;
        box-shadow: var(--art-themed-action-focus-shadow);
      }

      &:disabled {
        cursor: not-allowed;
        opacity: 0.38;
      }
    }

    &__viewport {
      overflow: clip visible;
    }

    &__track--stepping {
      transition: transform var(--art-motion-duration-fast) var(--art-motion-ease-out);
    }

    li[role='tab'] {
      min-width: 0;
      max-width: 156px;
      border-radius: var(--art-surface-radius) !important;
      transition:
        color 0.18s ease,
        background-color 0.18s ease,
        border-color 0.18s ease,
        box-shadow 0.18s ease,
        opacity 0.18s ease;

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: -2px;
      }

      > button {
        padding: 4px;
        font: inherit;
        color: inherit;
        touch-action: manipulation;
        cursor: pointer;
        background: transparent;
        border: 0;

        &:focus-visible {
          color: var(--theme-color);
          outline: none;
          background: color-mix(in srgb, var(--theme-color) 9%, transparent);
          box-shadow: var(--art-themed-action-focus-shadow);
        }
      }
    }

    .work-tab-title {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &--default {
      li[role='tab'].art-card-xs {
        color: var(--art-gray-600) !important;
        background: transparent !important;
        border-color: transparent !important;
        box-shadow: none !important;

        &:hover:not(.activ-tab) {
          color: var(--theme-color) !important;
          background: color-mix(
            in srgb,
            var(--theme-color) 5%,
            var(--default-box-color)
          ) !important;
          border-color: var(--art-themed-action-active-border) !important;
          box-shadow: var(--art-themed-action-hover-shadow) !important;
        }

        &.activ-tab {
          position: relative;
          font-weight: 600;
          color: var(--theme-color) !important;

          &::after {
            position: absolute;
            right: 10px;
            bottom: 0;
            left: 10px;
            height: 2px;
            content: '';
            background: var(--theme-color);
            border-radius: 999px 999px 0 0;
            box-shadow: 0 -2px 8px color-mix(in srgb, var(--theme-color) 24%, transparent);
          }
        }
      }
    }

    &--card {
      li[role='tab'].art-card-xs {
        color: var(--art-gray-700) !important;
        background: var(--default-box-color) !important;
        opacity: 1;

        &:hover:not(.activ-tab) {
          color: var(--theme-color) !important;
          background: color-mix(
            in srgb,
            var(--theme-color) 5%,
            var(--default-box-color)
          ) !important;
          border-color: var(--art-themed-action-active-border) !important;
          box-shadow: var(--art-themed-action-hover-shadow) !important;
        }

        &.activ-tab {
          font-weight: 600;
          color: var(--theme-color) !important;
          background: color-mix(
            in srgb,
            var(--theme-color) 10%,
            var(--default-box-color)
          ) !important;
          border-color: var(--art-themed-action-active-border) !important;
          box-shadow: var(--art-themed-action-active-shadow) !important;
        }
      }
    }

    &--google {
      --work-tab-google-bg: var(--default-box-color);
      --work-tab-google-filter: none;
      --work-tab-google-curve-size: 14px;

      li[role='tab'] {
        margin-right: 0 !important;
        border-radius: var(--art-surface-radius) !important;
      }
    }
  }

  .google-tab.activ-tab.art-card-xs {
    z-index: 1;
    font-weight: 600;
    color: var(--art-gray-900) !important;
    background-color: var(--work-tab-google-bg) !important;
    border-color: transparent !important;
    border-bottom-color: var(--work-tab-google-bg) !important;
    border-bottom-right-radius: 0 !important;
    border-bottom-left-radius: 0 !important;
    box-shadow: inset 0 2px 0 color-mix(in srgb, var(--theme-color) 68%, transparent) !important;
    filter: var(--work-tab-google-filter);
  }

  .google-tab.activ-tab::before,
  .google-tab.activ-tab::after {
    position: absolute;
    bottom: 0;
    width: var(--work-tab-google-curve-size);
    height: var(--work-tab-google-curve-size);
    content: '';
    border-radius: 50%;
    box-shadow: 0 0 0 24px var(--work-tab-google-bg);
  }

  .google-tab.activ-tab::before {
    left: calc(var(--work-tab-google-curve-size) * -1);
    clip-path: inset(50% -7px 0 50%);
  }

  .google-tab.activ-tab::after {
    right: calc(var(--work-tab-google-curve-size) * -1);
    clip-path: inset(50% 50% 0 -7px);
  }

  :global([data-box-mode='shadow-mode'] .art-work-tab--google) {
    --work-tab-google-filter: drop-shadow(
      0 2px 3px color-mix(in srgb, var(--art-gray-900) 9%, transparent)
    );
  }

  :global(html.dark .art-work-tab--google) {
    --work-tab-google-bg: var(--default-box-color);
  }

  .google-tab:not(.activ-tab):hover {
    box-sizing: border-box;
    color: var(--art-gray-900) !important;
    background-color: color-mix(in srgb, var(--art-gray-200) 78%, transparent) !important;
    border-color: transparent !important;
    border-radius: var(--art-surface-radius) !important;
    opacity: 1;
  }

  .google-tab:not(.activ-tab) {
    color: var(--art-gray-600) !important;
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    opacity: 1;
    filter: none;
  }

  .dark .google-tab:not(.activ-tab):hover {
    background-color: var(--art-hover-color) !important;
  }

  .google-tab:hover .line,
  .google-tab.activ-tab .line,
  .google-tab:first-child .line {
    opacity: 0;
  }

  .google-tab:hover + .google-tab .line,
  .google-tab.activ-tab + .google-tab .line {
    opacity: 0;
  }

  .google-tab::before,
  .google-tab::after {
    position: absolute;
    bottom: 0;
    width: var(--work-tab-google-curve-size);
    height: var(--work-tab-google-curve-size);
    content: '';
    border-radius: 50%;
    box-shadow: 0 0 0 24px transparent;
  }

  .google-tab::before {
    left: calc(var(--work-tab-google-curve-size) * -1);
    clip-path: inset(50% -7px 0 50%);
  }

  .google-tab::after {
    right: calc(var(--work-tab-google-curve-size) * -1);
    clip-path: inset(50% 50% 0 -7px);
  }

  .google-tab i:hover {
    color: var(--art-gray-700);
    background: var(--art-gray-300);
  }
</style>
