<!-- 表格头部，包含表格大小、刷新、全屏、列设置、其他设置 -->
<template>
  <div ref="rootRef" class="art-table-header flex-cb max-md:!block" id="art-table-header">
    <div class="art-table-header__left flex-wrap">
      <slot name="left"></slot>
    </div>

    <div class="art-table-header__right flex-c flex-wrap gap-y-2 md:justify-end max-md:mt-3">
      <ArtIconButton
        v-if="showSearchBar != null"
        class="art-table-header__action"
        icon="ri:search-line"
        :variant="showSearchBar ? 'solid' : 'ghost'"
        :label="showSearchBar ? '收起搜索条件' : '展开搜索条件'"
        :aria-pressed="showSearchBar"
        @click="search"
      />
      <ArtIconButton
        v-if="shouldShow('refresh')"
        class="art-table-header__action"
        icon="ri:refresh-line"
        label="刷新表格"
        :loading="loading && isManualRefresh"
        @click="refresh"
      />

      <ElDropdown v-if="shouldShow('size')" @command="handleTableSizeChange">
        <ArtIconButton
          class="art-table-header__action"
          icon="ri:arrow-up-down-fill"
          label="调整表格密度"
        />
        <template #dropdown>
          <ElDropdownMenu>
            <div
              v-for="item in tableSizeOptions"
              :key="item.value"
              class="table-size-btn-item [&_.el-dropdown-menu__item]:!mb-[3px] last:[&_.el-dropdown-menu__item]:!mb-0"
            >
              <ElDropdownItem
                :key="item.value"
                :command="item.value"
                :class="tableSize === item.value ? '!bg-g-300/55' : ''"
              >
                {{ item.label }}
              </ElDropdownItem>
            </div>
          </ElDropdownMenu>
        </template>
      </ElDropdown>

      <ArtIconButton
        v-if="shouldShow('fullscreen')"
        class="art-table-header__action"
        :icon="isFullScreen ? 'dashicons:fullscreen-exit-alt' : 'dashicons:fullscreen-alt'"
        :label="isFullScreen ? '退出全屏' : '表格全屏'"
        :aria-pressed="isFullScreen"
        @click="toggleFullScreen"
      />

      <!-- 列设置 -->
      <ElPopover
        v-if="shouldShow('columns') && visibleColumnsModel.length"
        placement="bottom"
        trigger="click"
        :width="232"
      >
        <template #reference>
          <ArtIconButton
            class="art-table-header__action"
            icon="ri:align-right"
            label="设置显示列"
          />
        </template>
        <div>
          <div class="column-presets">
            <span class="column-presets__label">视图预设</span>
            <div class="column-presets__switch" role="group" aria-label="列显示预设">
              <button
                type="button"
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
          <ElScrollbar max-height="380px">
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
                  :disabled="item.disabled"
                  class="flex-1 min-w-0 [&_.el-checkbox__label]:overflow-hidden [&_.el-checkbox__label]:text-ellipsis [&_.el-checkbox__label]:whitespace-nowrap"
                  >{{
                    item.label || (item.type === 'selection' ? t('table.selection') : '')
                  }}</ElCheckbox
                >
              </div>
            </VueDraggable>
          </ElScrollbar>
        </div>
      </ElPopover>
      <!-- 其他设置 -->
      <ElPopover v-if="shouldShow('settings')" placement="bottom" trigger="click">
        <template #reference>
          <ArtIconButton
            class="art-table-header__action"
            icon="ri:settings-line"
            label="表格显示设置"
          />
        </template>
        <div>
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
  import { computed, ref, onUnmounted } from 'vue'
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

  /** 刷新事件处理 */
  const refresh = () => {
    isManualRefresh.value = true
    emit('refresh')
  }

  /** 切换专注模式，仅负责工具栏交互，页面聚焦范围由 ArtTableQuery 管理。 */
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

  /** 是否手动点击刷新 */
  const isManualRefresh = ref(false)

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
    rootRef
  })
</script>

<style scoped lang="scss">
  .art-table-header {
    gap: var(--art-space-3);
    min-width: 0;

    &__left {
      display: flex;
      flex: 1;
      align-items: center;
      min-width: 0;
    }

    &__right {
      flex: none;
      min-width: 0;
    }
  }

  .art-table-header__action {
    margin-right: 6px;
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

    &:focus-visible {
      outline: none;
      box-shadow: var(--art-themed-action-focus-shadow);
    }

    &.active {
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
      box-shadow: var(--art-themed-action-active-shadow);
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
        display: inline-flex;
        gap: var(--art-control-icon-gap);
        align-items: center;
        justify-content: center;
        min-width: 0;
        min-height: 32px;
        padding: 0 8px;
        font: inherit;
        font-size: 12px;
        color: var(--el-text-color-secondary);
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

        &:focus-visible {
          outline: none;
          box-shadow: var(--art-themed-action-focus-shadow);
        }

        &.is-active {
          font-weight: 600;
          color: var(--theme-color);
          background: color-mix(in srgb, var(--theme-color) 9%, var(--default-box-color));
          box-shadow: var(--art-themed-action-active-shadow);
        }
      }
    }
  }

  @media (width <= 767px) {
    .art-table-header__action {
      margin-right: 0;
      margin-left: 8px;
    }
  }
</style>
