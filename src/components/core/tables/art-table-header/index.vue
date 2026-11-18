<!-- 表格头部，包含表格大小、刷新、全屏、列设置、其他设置 -->
<template>
  <div ref="rootRef" class="art-table-header flex-cb flex-wrap" id="art-table-header">
    <div class="art-table-header__left flex-wrap">
      <slot name="left"></slot>
    </div>

    <div class="art-table-header__right flex-c flex-wrap gap-y-2 md:justify-end">
      <ArtIconButton
        v-if="showSearchBar != null"
        class="art-table-header__action"
        :size="actionSize"
        icon="ri:search-line"
        :variant="showSearchBar ? 'solid' : 'ghost'"
        :label="showSearchBar ? '收起搜索条件' : '展开搜索条件'"
        :aria-pressed="showSearchBar"
        @click="search"
      />
      <ArtIconButton
        v-if="shouldShow('refresh')"
        class="art-table-header__action"
        :size="actionSize"
        icon="ri:refresh-line"
        label="刷新表格"
        :loading="loading && isManualRefresh"
        @click="refresh"
      />

      <ElDropdown v-if="shouldShow('size')" @command="handleTableSizeChange">
        <ArtIconButton
          class="art-table-header__action"
          :size="actionSize"
          icon="ri:arrow-up-down-fill"
          label="调整表格密度"
        />
        <template #dropdown>
          <ElDropdownMenu>
            <ElDropdownItem
              v-for="item in tableSizeOptions"
              :key="item.value"
              :command="item.value"
              :aria-current="tableSize === item.value ? 'true' : undefined"
              class="art-table-header__density-option"
              :class="{ '!bg-g-300/55': tableSize === item.value }"
            >
              <span class="art-icon-label art-table-header__density-label">
                <span>{{ item.label }}</span>
                <ArtSvgIcon
                  icon="ri:check-line"
                  aria-hidden="true"
                  class="art-table-header__density-check"
                  :class="{ invisible: tableSize !== item.value }"
                />
              </span>
            </ElDropdownItem>
          </ElDropdownMenu>
        </template>
      </ElDropdown>

      <ArtIconButton
        v-if="shouldShow('fullscreen')"
        class="art-table-header__action"
        :size="actionSize"
        :icon="isFullScreen ? 'dashicons:fullscreen-exit-alt' : 'dashicons:fullscreen-alt'"
        :label="isFullScreen ? '退出全屏' : '表格全屏'"
        :aria-pressed="isFullScreen"
        @click="toggleFullScreen"
      />

      <!-- 列设置 -->
      <ElPopover
        v-if="shouldShow('columns') && visibleColumnsModel.length"
        v-model:visible="toolbarPopoverOpen.columns"
        placement="bottom"
        trigger="click"
        role="dialog"
        :aria-label="toolbarPopoverLabels.columns"
        :width="232"
        :popper-options="{
          modifiers: [
            {
              name: 'preventOverflow',
              options: { altAxis: true, tether: false, padding: 8 }
            }
          ]
        }"
        @after-enter="focusToolbarPopover('columns')"
      >
        <template #reference>
          <ArtIconButton
            class="art-table-header__action"
            :size="actionSize"
            icon="ri:align-right"
            :label="toolbarPopoverLabels.columns"
            data-art-toolbar-popover="columns"
            aria-haspopup="dialog"
            :aria-controls="columnsPopoverId"
            :aria-expanded="toolbarPopoverOpen.columns"
            @keydown.esc="closeToolbarPopoverFromTrigger($event, 'columns')"
          />
        </template>
        <div :id="columnsPopoverId" @keydown.esc.prevent.stop="closeToolbarPopover('columns')">
          <div class="column-presets">
            <div class="flex items-center justify-between gap-2">
              <span class="column-presets__label">视图预设</span>
              <ArtIconButton
                size="small"
                icon="ri:close-line"
                label="关闭列设置"
                @click="closeToolbarPopover('columns')"
              />
            </div>
            <div class="column-presets__switch" role="group" aria-label="列显示预设">
              <button
                ref="compactPresetRef"
                type="button"
                class="art-icon-label art-icon-label--compact"
                :class="{ 'is-active': activeColumnPreset === 'compact' }"
                :aria-pressed="activeColumnPreset === 'compact'"
                title="保留关键业务列"
                @click="applyColumnPreset('compact')"
              >
                <ArtSvgIcon icon="ri:layout-row-line" />
                <span>精简视图</span>
              </button>
              <button
                type="button"
                class="art-icon-label art-icon-label--compact"
                :class="{ 'is-active': activeColumnPreset === 'all' }"
                :aria-pressed="activeColumnPreset === 'all'"
                title="显示全部可用列"
                @click="applyColumnPreset('all')"
              >
                <ArtSvgIcon icon="ri:table-view" />
                <span>完整视图</span>
              </button>
            </div>
          </div>
          <ElScrollbar max-height="min(380px, calc(100dvh - 180px))">
            <VueDraggable
              v-model="visibleColumnsModel"
              :disabled="false"
              filter=".fixed-column"
              :prevent-on-filter="false"
              @move="checkColumnMove"
            >
              <div
                v-for="item in visibleColumnsModel"
                :key="item.prop || item.type"
                class="column-option flex-c"
                :class="{ 'fixed-column': item.fixed }"
              >
                <div
                  class="drag-icon mr-2 h-4.5 flex-cc text-g-500"
                  :class="item.fixed ? 'cursor-default text-g-300' : 'cursor-move'"
                >
                  <ArtSvgIcon
                    :icon="item.fixed ? 'ri:unpin-line' : 'ri:drag-move-2-fill'"
                    class="text-base"
                  />
                </div>
                <ElCheckbox
                  :model-value="getColumnVisibility(item)"
                  @update:model-value="(val) => updateColumnVisibility(item, val)"
                  @keydown="moveColumnWithKeyboard($event, item)"
                  :disabled="item.disabled"
                  :title="item.label"
                  class="flex-1 min-w-0 [&_.el-checkbox__label]:overflow-hidden [&_.el-checkbox__label]:text-ellipsis [&_.el-checkbox__label]:whitespace-nowrap"
                  >{{
                    item.label || (item.type === 'selection' ? t('table.selection') : '')
                  }}</ElCheckbox
                >
              </div>
            </VueDraggable>
          </ElScrollbar>
          <p class="mb-0 mt-2 text-xs leading-5 text-g-700">
            勾选显示列；拖拽或 Alt + ↑/↓ 调整顺序。
          </p>
          <span class="sr-only" role="status" aria-live="polite">{{ columnMoveFeedback }}</span>
        </div>
      </ElPopover>
      <!-- 其他设置 -->
      <ElPopover
        v-if="shouldShow('settings')"
        v-model:visible="toolbarPopoverOpen.settings"
        placement="bottom"
        trigger="click"
        role="dialog"
        :aria-label="toolbarPopoverLabels.settings"
        @after-enter="focusToolbarPopover('settings')"
      >
        <template #reference>
          <ArtIconButton
            class="art-table-header__action"
            :size="actionSize"
            icon="ri:settings-line"
            :label="toolbarPopoverLabels.settings"
            data-art-toolbar-popover="settings"
            aria-haspopup="dialog"
            :aria-controls="settingsPopoverId"
            :aria-expanded="toolbarPopoverOpen.settings"
            @keydown.esc="closeToolbarPopoverFromTrigger($event, 'settings')"
          />
        </template>
        <div
          :id="settingsPopoverId"
          ref="settingsPopoverRef"
          @keydown.esc.prevent.stop="closeToolbarPopover('settings')"
        >
          <ElCheckbox v-if="showZebra" v-model="isZebra" :value="true">{{
            t('table.zebra')
          }}</ElCheckbox>
          <ElCheckbox v-if="showBorder" v-model="isBorder" :value="true">{{
            t('table.border')
          }}</ElCheckbox>
          <ElCheckbox v-if="showHeaderBackground" v-model="isHeaderBackground" :value="true">{{
            t('table.headerBackground')
          }}</ElCheckbox>
        </div>
      </ElPopover>
      <slot name="right"></slot>
      <button
        v-if="focusMode != null"
        ref="focusButtonRef"
        type="button"
        class="focus-button art-icon-label art-icon-label--compact"
        :class="{ active: focusMode }"
        :aria-label="focusMode ? '退出专注模式' : '进入专注模式'"
        :aria-pressed="focusMode"
        @click="toggleFocusMode"
      >
        <ArtSvgIcon :icon="focusMode ? 'ri:contract-left-right-line' : 'ri:focus-3-line'" />
        <span>{{ focusMode ? '退出专注' : '专注模式' }}</span>
      </button>
    </div>
  </div>
</template>

<script lang="ts" setup>
  import { computed, nextTick, onUnmounted, reactive, ref, useId, watch } from 'vue'
  import { useEventListener } from '@vueuse/core'
  import { storeToRefs } from 'pinia'
  import { TableSizeEnum } from '@/enums/form-enum'
  import { useTableStore } from '@/store/modules/table'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { VueDraggable } from 'vue-draggable-plus'
  import { useI18n } from 'vue-i18n'
  import type { ColumnOption } from '@/types/component'
  import { ElScrollbar } from 'element-plus'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import { getFocusedKeyboardButton, restoreButtonFocusIfLost } from '@/utils/ui/button-focus'
  import {
    filterTenantDimensionDescriptors,
    isTenantDimensionDescriptor
  } from '@/utils/tenant-dimension-visibility'

  defineOptions({ name: 'ArtTableHeader' })

  const { t } = useI18n()
  const rootRef = ref<HTMLElement>()

  interface Props {
    /** 斑马纹 */
    showZebra?: boolean
    /** 边框 */
    showBorder?: boolean
    /** 表头背景 */
    showHeaderBackground?: boolean
    /** 全屏 class */
    fullClass?: string
    /** 组件布局，子组件名用逗号分隔 */
    layout?: string
    /** 工具栏图标按钮尺寸；紧凑工作区可选 small，其他页面保持默认尺寸。 */
    actionSize?: 'default' | 'small'
    /** 加载中 */
    loading?: boolean
    /** 搜索栏显示状态 */
    showSearchBar?: boolean
    /** 专注模式状态；未传时不显示专注模式按钮 */
    focusMode?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    showZebra: true,
    showBorder: true,
    showHeaderBackground: true,
    fullClass: 'art-page-view',
    layout: 'search,refresh,size,fullscreen,columns,settings',
    actionSize: 'default',
    showSearchBar: undefined,
    focusMode: undefined
  })

  const columns = defineModel<ColumnOption[]>('columns', {
    required: false,
    default: () => []
  })
  const { isPlatformScope } = storeToRefs(useTenantScopeStore())
  const visibleColumnsModel = computed({
    get: () => filterTenantDimensionDescriptors(columns.value, isPlatformScope.value),
    set: (nextColumns: ColumnOption[]) => {
      if (isPlatformScope.value) {
        columns.value = nextColumns
        return
      }

      const reorderedVisibleColumns = [...nextColumns]
      columns.value = columns.value.map((column) =>
        isTenantDimensionDescriptor(column) ? column : (reorderedVisibleColumns.shift() ?? column)
      )
    }
  })

  const emit = defineEmits<{
    (e: 'refresh'): void
    (e: 'search'): void
    (e: 'update:showSearchBar', value: boolean): void
    (e: 'update:focusMode', value: boolean): void
  }>()

  /**
   * 获取列的显示状态
   * 优先使用 visible 字段，如果不存在则使用 checked 字段
   */
  const getColumnVisibility = (col: ColumnOption): boolean => {
    if (col.visible !== undefined) {
      return col.visible
    }
    return col.checked ?? true
  }

  /**
   * 更新列的显示状态
   * 同时更新 checked 和 visible 字段以保持兼容性
   */
  const updateColumnVisibility = (col: ColumnOption, value: boolean | string | number): void => {
    const boolValue = !!value
    col.checked = boolValue
    col.visible = boolValue
  }

  const columnMoveFeedback = ref('')
  const toolbarPopoverLabels = { columns: '设置显示列', settings: '表格显示设置' }
  const toolbarPopoverOpen = reactive({ columns: false, settings: false })
  type ToolbarPopover = keyof typeof toolbarPopoverOpen
  const columnsPopoverId = useId()
  const settingsPopoverId = useId()
  const compactPresetRef = ref<HTMLButtonElement>()
  const settingsPopoverRef = ref<HTMLElement>()

  const getToolbarPopoverTrigger = (popover: ToolbarPopover) =>
    rootRef.value?.querySelector<HTMLButtonElement>(`[data-art-toolbar-popover="${popover}"]`)

  const focusToolbarPopover = (popover: ToolbarPopover): void => {
    const trigger = getToolbarPopoverTrigger(popover)
    if (!trigger || !toolbarPopoverOpen[popover]) return
    const { activeElement, body } = trigger.ownerDocument
    if (activeElement !== trigger && activeElement !== body) return
    const firstControl =
      popover === 'columns'
        ? compactPresetRef.value
        : settingsPopoverRef.value?.querySelector<HTMLInputElement>(
            'input[type="checkbox"]:not(:disabled)'
          )
    firstControl?.focus({ preventScroll: true })
  }

  const closeToolbarPopover = async (popover: ToolbarPopover): Promise<void> => {
    toolbarPopoverOpen[popover] = false
    await nextTick()
    getToolbarPopoverTrigger(popover)?.focus({ preventScroll: true })
  }
  const closeToolbarPopoverFromTrigger = (event: KeyboardEvent, popover: ToolbarPopover): void => {
    if (!toolbarPopoverOpen[popover]) return
    event.preventDefault()
    event.stopPropagation()
    void closeToolbarPopover(popover)
  }
  const moveColumnWithKeyboard = async (
    event: KeyboardEvent,
    column: ColumnOption
  ): Promise<void> => {
    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !['ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return
    event.preventDefault()
    event.stopPropagation()
    const current = visibleColumnsModel.value
    const index = current.indexOf(column)
    const destination = index + (event.key === 'ArrowUp' ? -1 : 1)
    const neighbor = current[destination]
    if (index < 0 || !neighbor) return
    if (column.fixed || neighbor.fixed) {
      columnMoveFeedback.value = '固定列的位置不能调整'
      return
    }
    const focused = event.target
    const reordered = [...current]
    ;[reordered[index], reordered[destination]] = [neighbor, column]
    visibleColumnsModel.value = reordered
    columnMoveFeedback.value = `已将 ${column.label || column.prop || '当前列'}${event.key === 'ArrowUp' ? '上移' : '下移'}`
    await nextTick()
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus()
  }

  type ColumnPreset = 'compact' | 'all'

  const isStructuralColumn = (column: ColumnOption): boolean =>
    Boolean(column.fixed || column.disabled) ||
    ['selection', 'index', 'globalIndex'].includes(String(column.type)) ||
    column.prop === 'operation'

  const activeColumnPreset = computed<ColumnPreset | undefined>(() => {
    let visibleBusinessColumns = 0
    let matchesCompactPreset = true
    let allColumnsVisible = true

    visibleColumnsModel.value.forEach((column) => {
      const isStructural = isStructuralColumn(column)
      const isVisible = getColumnVisibility(column)
      const compactVisible = isStructural || visibleBusinessColumns < 5

      if (!isStructural) visibleBusinessColumns += 1
      if (isVisible !== compactVisible) matchesCompactPreset = false
      if (!isVisible) allColumnsVisible = false
    })

    if (allColumnsVisible) return 'all'
    return matchesCompactPreset ? 'compact' : undefined
  })

  const applyColumnPreset = (preset: ColumnPreset): void => {
    let visibleBusinessColumns = 0
    visibleColumnsModel.value.forEach((column) => {
      const isStructural = isStructuralColumn(column)
      const visible = preset === 'all' || isStructural || visibleBusinessColumns < 5

      if (!isStructural) visibleBusinessColumns += 1
      updateColumnVisibility(column, visible)
    })
  }

  /** 表格大小选项配置 */
  const tableSizeOptions = [
    { value: TableSizeEnum.SMALL, label: t('table.sizeOptions.small') },
    { value: TableSizeEnum.DEFAULT, label: t('table.sizeOptions.default') },
    { value: TableSizeEnum.LARGE, label: t('table.sizeOptions.large') }
  ]

  const tableStore = useTableStore()
  const { tableSize, isZebra, isBorder, isHeaderBackground } = storeToRefs(tableStore)

  /** 解析 layout 属性，转换为数组 */
  const layoutItems = computed(() => {
    return props.layout.split(',').map((item) => item.trim())
  })

  /**
   * 检查组件是否应该显示
   * @param componentName 组件名称
   * @returns 是否显示
   */
  const shouldShow = (componentName: string) => {
    return layoutItems.value.includes(componentName)
  }

  /**
   * 拖拽移动事件处理 - 防止固定列位置改变
   * @param evt move事件对象
   * @returns 是否允许移动
   */
  interface ColumnMoveEvent {
    related?: HTMLElement | null
  }

  const checkColumnMove = (event: ColumnMoveEvent) => {
    // 拖拽进入的目标 DOM 元素
    const toElement = event.related as HTMLElement
    // 如果目标位置是 fixed 列，则不允许移动
    if (toElement && toElement.classList.contains('fixed-column')) {
      return false
    }
    return true
  }

  /** 搜索事件处理 */
  const search = () => {
    // 切换搜索栏显示状态
    emit('update:showSearchBar', !props.showSearchBar)
    emit('search')
  }

  const isManualRefresh = ref(false)
  let keyboardRefreshButton: HTMLButtonElement | undefined

  const finishManualRefresh = async (): Promise<void> => {
    if (!isManualRefresh.value) return
    isManualRefresh.value = false
    const button = keyboardRefreshButton
    keyboardRefreshButton = undefined
    if (!button) return
    await nextTick()
    if (!isManualRefresh.value) restoreButtonFocusIfLost(button)
  }

  watch(
    () => props.loading,
    (loading) => {
      if (!loading) void finishManualRefresh()
    }
  )

  const refresh = async (event: MouseEvent): Promise<void> => {
    if (props.loading || isManualRefresh.value) return
    keyboardRefreshButton = getFocusedKeyboardButton(event)
    isManualRefresh.value = true
    emit('refresh')
    await nextTick()
    if (!props.loading) await finishManualRefresh()
  }

  /** 切换专注模式，仅负责工具栏交互，页面聚焦范围由 ArtTableQuery 管理。 */
  const focusButtonRef = ref<HTMLButtonElement>()
  const toggleFocusMode = (): void => {
    emit('update:focusMode', !props.focusMode)
  }

  /**
   * 表格大小变化处理
   * @param command 表格大小枚举值
   */
  const handleTableSizeChange = (command: TableSizeEnum) => {
    useTableStore().setTableSize(command)
  }

  /** 加载中 */
  const isFullScreen = ref(false)

  /** 保存原始的 overflow 样式，用于退出全屏时恢复 */
  const originalOverflow = ref('')

  /**
   * 切换全屏状态
   * 进入全屏时会隐藏页面滚动条，退出时恢复原状态
   */
  const toggleFullScreen = () => {
    const el = document.querySelector(`.${props.fullClass}`)
    if (!el) return

    isFullScreen.value = !isFullScreen.value

    if (isFullScreen.value) {
      // 进入全屏：保存原始样式并隐藏滚动条
      originalOverflow.value = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      el.classList.add('el-full-screen')
      tableStore.setIsFullScreen(true)
    } else {
      // 退出全屏：恢复原始样式
      document.body.style.overflow = originalOverflow.value
      el.classList.remove('el-full-screen')
      tableStore.setIsFullScreen(false)
    }
  }

  /**
   * ESC键退出全屏的事件处理器
   * 需要保存引用以便在组件卸载时正确移除监听器
   */
  const handleEscapeKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && isFullScreen.value) {
      toggleFullScreen()
    }
  }

  useEventListener(document, 'keydown', handleEscapeKey)

  /** 组件卸载时清理资源 */
  onUnmounted(() => {
    // 如果组件在全屏状态下被卸载，恢复页面滚动状态
    if (isFullScreen.value) {
      document.body.style.overflow = originalOverflow.value
      const el = document.querySelector(`.${props.fullClass}`)
      if (el) {
        el.classList.remove('el-full-screen')
      }
    }
  })

  defineExpose({
    rootRef,
    focusButtonRef
  })
</script>

<style scoped lang="scss">
  .art-table-header {
    gap: var(--art-space-3);
    min-width: 0;

    &__left {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      min-width: 0;
      max-width: 100%;
    }

    &__left:empty,
    &__right:empty {
      display: none;
    }

    &__right {
      flex: none;
      min-width: 0;
      max-width: 100%;
      margin-inline-start: auto;
    }
  }

  .art-table-header__action {
    margin-right: 6px;
  }

  .art-table-header__density-option + .art-table-header__density-option {
    margin-block-start: 3px;
  }

  .art-table-header__density-label {
    flex: 1;
    justify-content: space-between;
    line-height: inherit;
  }

  .art-table-header__density-check {
    color: var(--theme-color);
  }

  .focus-button {
    width: auto;
    height: 32px;
    padding: 0 8px;
    margin-right: 0;
    font-size: 12px;
    line-height: 1;
    color: var(--art-gray-700);
    white-space: nowrap;
    cursor: pointer;
    background: color-mix(in srgb, var(--art-gray-200) 72%, var(--default-box-color));
    border: 1px solid transparent;
    border-radius: var(--el-border-radius-base);
    transition:
      color 0.18s ease,
      background-color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;

    &:hover {
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
      border-color: transparent;
      box-shadow: var(--art-themed-action-hover-shadow);
    }

    &:active {
      background: color-mix(in srgb, var(--theme-color) 14%, var(--default-box-color));
      box-shadow: var(--art-themed-action-active-shadow);
    }

    &.active {
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      box-shadow: var(--art-themed-action-active-shadow);
    }

    &:focus-visible {
      outline: none;
      box-shadow: var(--art-themed-action-focus-shadow);
    }
  }

  .column-presets {
    display: grid;
    gap: 8px;
    padding-bottom: 12px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--el-border-color-lighter);

    &__label {
      font-size: 11px;
      font-weight: 600;
      line-height: 1;
      color: var(--el-text-color-secondary);
    }

    &__switch {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 4px;
      padding: 3px;
      background: var(--el-fill-color-lighter);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      button {
        min-width: 0;
        min-height: 32px;
        padding: 0 8px;
        font: inherit;
        font-size: 12px;
        color: var(--art-gray-700);
        white-space: nowrap;
        cursor: pointer;
        background: transparent;
        border: 1px solid transparent;
        border-radius: var(--el-border-radius-small);
        transition:
          color 0.18s ease,
          background-color 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease;

        .art-svg-icon {
          flex: none;
          font-size: 14px;
        }

        &:hover:not(.is-active) {
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 6%, var(--default-box-color));
        }

        &.is-active {
          font-weight: 600;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
          box-shadow: var(--art-themed-action-active-shadow);
        }

        &:focus-visible {
          outline: none;
          box-shadow: var(--art-themed-action-focus-shadow);
        }
      }
    }
  }

  @media (width <= 767px) {
    .art-table-header__left {
      flex-basis: 100%;
    }

    .art-table-header__right {
      margin-inline-start: 0;
    }

    .art-table-header__action {
      margin-right: 0;
      margin-left: 8px;
    }
  }
</style>
