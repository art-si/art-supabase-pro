<!-- 顶部快速入口面板 -->
<template>
  <ElPopover
    ref="popoverRef"
    :width="700"
    :offset="0"
    :show-arrow="false"
    trigger="click"
    placement="bottom-start"
    popper-class="fast-enter-popover"
    :popper-style="{
      border: '1px solid var(--default-border)',
      borderRadius: 'calc(var(--custom-radius) / 2 + 4px)'
    }"
  >
    <template #reference>
      <span ref="triggerRef" class="flex-c gap-2">
        <slot :on-trigger-click="focusFirstItem" />
      </span>
    </template>

    <nav
      ref="panelRef"
      class="grid grid-cols-[2fr_0.8fr]"
      aria-label="快捷入口"
      @keydown.esc.prevent.stop="closeAndRestoreFocus"
    >
      <div>
        <h2 class="sr-only">常用应用</h2>
        <div class="grid grid-cols-2 gap-1.5">
          <!-- 应用列表 -->
          <component
            v-for="application in enabledApplications"
            :key="application.name"
            :is="resolveNavigationComponent(application)"
            v-bind="getNavigationProps(application)"
            class="fast-enter-item mr-3 c-p flex-c gap-3 rounded-lg p-2 hover:bg-g-200/70 dark:hover:bg-g-200/90 hover:[&_.app-icon]:!bg-transparent"
            @click="closePopover"
          >
            <div class="app-icon size-12 flex-cc rounded-lg bg-g-200/80 dark:bg-g-300/30">
              <ArtSvgIcon
                class="text-xl"
                :icon="application.icon"
                :style="{ color: application.iconColor }"
                aria-hidden="true"
              />
            </div>
            <div>
              <h3 class="m-0 text-sm font-medium text-g-800">{{ application.name }}</h3>
              <p class="mt-1 text-xs text-g-600">{{ application.description }}</p>
            </div>
          </component>
        </div>
      </div>

      <div class="border-l-d pl-6 pt-2">
        <h3 class="mb-2.5 text-base font-medium text-g-800">快速链接</h3>
        <ul>
          <li v-for="quickLink in enabledQuickLinks" :key="quickLink.name">
            <component
              :is="resolveNavigationComponent(quickLink)"
              v-bind="getNavigationProps(quickLink)"
              class="fast-enter-link block w-full c-p py-2 text-left bg-transparent border-0 hover:[&_span]:text-theme"
              @click="closePopover"
            >
              <span class="text-g-600 no-underline">{{ quickLink.name }}</span>
            </component>
          </li>
        </ul>
      </div>
    </nav>
  </ElPopover>
</template>

<script setup lang="ts">
  import { RouterLink } from 'vue-router'
  import { useFastEnter } from '@/hooks/core/useFastEnter'
  import type { FastEnterBaseItem } from '@/types/config'

  defineOptions({ name: 'ArtFastEnter' })

  defineSlots<{
    default(props: { onTriggerClick: () => void }): unknown
  }>()

  const popoverRef = ref<{ hide: () => void }>()
  const triggerRef = ref<HTMLSpanElement>()
  const panelRef = ref<HTMLElement>()

  // 使用快速入口配置
  const { enabledApplications, enabledQuickLinks } = useFastEnter()

  const closePopover = (): void => {
    popoverRef.value?.hide()
  }

  const closeAndRestoreFocus = (): void => {
    closePopover()
    triggerRef.value?.querySelector<HTMLElement>('button, a, [tabindex]')?.focus()
  }

  const focusFirstItem = (): void => {
    nextTick(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const panel = panelRef.value
          if (!panel?.getClientRects().length) return
          panel.querySelector<HTMLElement>('.fast-enter-item')?.focus()
        })
      })
    })
  }

  const resolveNavigationComponent = (item: FastEnterBaseItem) => {
    return item.link ? 'a' : RouterLink
  }

  const getNavigationProps = (item: FastEnterBaseItem): Record<string, unknown> => {
    if (item.link) {
      return {
        href: item.link,
        target: '_blank',
        rel: 'noopener noreferrer'
      }
    }

    return {
      to: { name: item.routeName }
    }
  }
</script>

<style scoped lang="scss">
  .fast-enter-item,
  .fast-enter-link {
    color: inherit;
    text-decoration: none;
    transition:
      color 0.18s ease,
      background-color 0.18s ease,
      box-shadow 0.18s ease;

    &:focus-visible {
      outline: none;
      box-shadow: var(--art-themed-action-focus-shadow);
    }
  }
</style>
