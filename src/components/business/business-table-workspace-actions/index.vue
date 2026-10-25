<template>
  <div class="business-table-workspace-actions" aria-label="表格显示与主要操作">
    <div
      v-if="showDisplayControls"
      class="business-table-workspace-actions__display"
      role="group"
      aria-label="表格显示设置"
    >
      <div
        class="business-table-workspace-actions__toggle"
        title="显示搜索、刷新、密度、全屏和列设置等辅助工具"
      >
        <span>显示工具栏</span>
        <ElSwitch
          :model-value="effectiveShowTableToolbar"
          :disabled="!controller || focusMode"
          size="small"
          inline-prompt
          active-text="开"
          inactive-text="关"
          :width="40"
          aria-label="显示表格右侧工具栏"
          @update:model-value="handleShowTableToolbarChange"
        />
      </div>

      <div
        v-if="focusable"
        class="business-table-workspace-actions__toggle"
        title="隐藏页面说明，只保留查询与表格；按 Esc 可退出"
      >
        <span>专注模式</span>
        <ElSwitch
          :model-value="focusMode"
          :disabled="!controller"
          size="small"
          inline-prompt
          active-text="开"
          inactive-text="关"
          :width="40"
          :aria-label="focusMode ? '退出专注模式' : '进入专注模式'"
          @update:model-value="handleFocusModeChange"
        />
      </div>
    </div>

    <div
      ref="headerActionHostRef"
      class="business-table-workspace-actions__actions"
      aria-label="页面主要操作"
    />
  </div>
</template>

<script setup lang="ts">
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'

  defineOptions({ name: 'BusinessTableWorkspaceActions' })

  const props = withDefaults(
    defineProps<{
      table?: ArtTableQueryExpose | null
      focusable?: boolean
      showDisplayControls?: boolean
    }>(),
    {
      table: null,
      focusable: true,
      showDisplayControls: true
    }
  )

  const headerActionHostRef = ref<HTMLElement>()
  const controller = computed(() => props.table?.workspaceController)
  const effectiveShowTableToolbar = computed(
    () => controller.value?.effectiveShowTableToolbar.value ?? false
  )
  const focusMode = computed(() => controller.value?.focusMode.value ?? false)
  const focusable = computed(
    () => props.focusable && (controller.value?.focusable.value ?? props.focusable)
  )
  let attachedTable: ArtTableQueryExpose | null | undefined
  let attachedElement: HTMLElement | undefined
  let pendingFocusTransfer = false
  let syncRevision = 0

  const detachHeaderActionHost = (): void => {
    if (attachedTable && attachedElement) {
      attachedTable.workspaceController.detachHeaderActionHost(attachedElement)
    }
    attachedTable = undefined
    attachedElement = undefined
  }

  const syncHeaderActionHost = async (): Promise<void> => {
    const nextTable = props.table
    const nextElement = headerActionHostRef.value
    if (nextTable === attachedTable && nextElement === attachedElement) return

    const previousTable = attachedTable
    const tableChanged = Boolean(previousTable && previousTable !== nextTable)
    const shouldTransferFocus = Boolean(
      (tableChanged && previousTable?.workspaceController.focusMode.value) || pendingFocusTransfer
    )
    const revision = ++syncRevision

    if (tableChanged && previousTable?.workspaceController.focusMode.value) {
      previousTable.workspaceController.setFocusMode(false)
    }
    detachHeaderActionHost()
    if (!nextTable || !nextElement) {
      pendingFocusTransfer = shouldTransferFocus
      return
    }

    nextTable.workspaceController.attachHeaderActionHost(nextElement)
    attachedTable = nextTable
    attachedElement = nextElement
    pendingFocusTransfer = false

    if (shouldTransferFocus && nextTable.workspaceController.focusable.value) {
      await nextTick()
      if (revision === syncRevision && props.table === nextTable) {
        nextTable.workspaceController.setFocusMode(true)
      }
    }
  }

  watch([() => props.table, headerActionHostRef], () => void syncHeaderActionHost(), {
    immediate: true,
    flush: 'post'
  })

  onBeforeUnmount(() => {
    syncRevision += 1
    pendingFocusTransfer = false
    detachHeaderActionHost()
  })

  const handleShowTableToolbarChange = (value: string | number | boolean): void => {
    controller.value?.setShowTableToolbar(Boolean(value))
  }

  const handleFocusModeChange = (value: string | number | boolean): void => {
    controller.value?.setFocusMode(Boolean(value))
  }
</script>

<style scoped lang="scss">
  .business-table-workspace-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    max-width: 100%;
    padding: 4px;
    background: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
    border: 1px solid transparent;
    border-radius: var(--custom-radius);

    &__display,
    &__toggle,
    &__actions {
      display: flex;
      align-items: center;
    }

    &__display {
      flex-wrap: wrap;
      gap: 10px;
      min-width: 0;
      padding-inline: 6px 2px;
    }

    &__toggle {
      gap: 6px;
      min-height: 32px;
      font-size: 12px;
      font-weight: 600;
      color: var(--el-text-color-regular);
      white-space: nowrap;
    }

    &__actions {
      flex-wrap: wrap;
      gap: 8px;
      justify-content: flex-end;
      min-width: 0;

      &:not(:empty) {
        padding-left: 8px;
        border-left: 1px solid var(--el-border-color-lighter);
      }

      &:empty {
        display: none;
      }
    }

    @media (width <= 640px) {
      &__actions:not(:empty) {
        padding-left: 0;
        border-left: 0;
      }
    }
  }

  :global(html[data-box-mode='border-mode'] .business-table-workspace-actions) {
    border-color: color-mix(in srgb, var(--theme-color) 18%, var(--el-border-color-lighter));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 4%, transparent);
  }

  :global(html[data-box-mode='shadow-mode'] .business-table-workspace-actions) {
    box-shadow: 0 6px 16px color-mix(in srgb, var(--theme-color) 10%, transparent);
  }
</style>
