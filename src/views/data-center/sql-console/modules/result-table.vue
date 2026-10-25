<template>
  <div class="result-table-container h-full">
    <ArtTable
      table-layout="fixed"
      :loading="loading"
      :data="tableData"
      :columns="tableColumns"
      :cell-class-name="cellClassName"
      :show-table-header="false"
      border
      class="h-full"
      @cell-click="handleCellClick"
      @cell-contextmenu="handleCellContextMenu"
    />

    <!-- Context Menu -->
    <ArtMenuRight
      ref="menuRef"
      :menu-items="menuItems"
      :menu-width="180"
      :submenu-width="140"
      :border-radius="10"
      @select="handleMenuSelect"
    />

    <!-- Cell Content Drawer -->
    <CellContentView ref="cellContentViewRef" />
  </div>
</template>

<script setup lang="ts">
  import { ref, computed, nextTick } from 'vue'
  import { isObject } from 'lodash-es'
  import ArtTable from '@/components/core/tables/art-table/index.vue'
  import ArtMenuRight, { MenuItemType } from '@/components/core/others/art-menu-right/index.vue'
  import CellContentView, { type CellContentViewExpose } from './cell-content-view.vue'
  import { copyTextToClipboard } from '@/utils/file/clipboard'
  import type { ColumnOption } from '@/types'

  type SqlResultRow = Record<string, unknown>

  interface SqlMetadataColumn {
    name: string
    property?: string
  }

  interface TableCellColumn {
    property: string
  }

  interface MenuExpose {
    show: (event: MouseEvent) => void
  }

  interface Props {
    loading?: boolean
    data?: SqlResultRow[]
    columns?: SqlMetadataColumn[]
  }

  const props = withDefaults(defineProps<Props>(), {
    loading: false,
    data: () => [],
    columns: () => []
  })

  const menuRef = ref<MenuExpose>()
  const cellContentViewRef = ref<CellContentViewExpose>()

  // Selected cell info
  const selectedCell = ref<{
    row: SqlResultRow
    column: TableCellColumn
    event: MouseEvent
  } | null>(null)

  // Compute table columns
  const tableColumns = computed<ColumnOption<SqlResultRow>[]>(() => {
    if (!props.columns || props.columns.length === 0) {
      return []
    }

    return props.columns.map((column) => ({
      prop: column.name,
      label: column.name,
      minWidth: 120,
      formatter: (row) => {
        const value = row[column.name]
        if (isObject(value)) {
          return JSON.stringify(value)
        }
        return value
      }
    }))
  })

  const tableData = computed(() => props.data)

  const getCellContent = (row: SqlResultRow, property: string) => {
    const value = row[property]
    return isObject(value) ? JSON.stringify(value) : String(value ?? '')
  }

  // Menu Items
  const menuItems = computed((): MenuItemType[] => [
    {
      key: 'copy',
      label: '复制',
      icon: 'ri-file-copy-line'
    },
    {
      key: 'view',
      label: '查看',
      icon: 'ri-eye-line'
    }
  ])

  // Handle Cell Click (Left Click)
  const handleCellClick = (
    row: SqlResultRow,
    column: TableCellColumn,
    cell: HTMLTableCellElement,
    event: MouseEvent
  ) => {
    void cell
    selectedCell.value = { row, column, event }
  }

  // Handle Cell Context Menu (Right Click)
  const handleCellContextMenu = (
    row: SqlResultRow,
    column: TableCellColumn,
    cell: HTMLTableCellElement,
    event: MouseEvent
  ) => {
    void cell
    // Prevent default browser menu
    event.preventDefault()

    // Update selected cell info
    selectedCell.value = { row, column, event }

    // Show menu
    nextTick(() => {
      menuRef.value?.show(event)
    })
  }

  // Handle Menu Selection
  const handleMenuSelect = async (item: MenuItemType) => {
    if (!selectedCell.value) return

    if (item.key === 'copy') {
      try {
        await copyTextToClipboard(
          getCellContent(selectedCell.value.row, selectedCell.value.column.property)
        )
        ElMessage.success('复制成功')
      } catch {
        ElMessage.warning('复制失败，请打开查看内容后手动复制')
      }
    } else if (item.key === 'view') {
      void openDrawer()
    }
  }

  const openDrawer = async () => {
    if (!selectedCell.value) return

    await cellContentViewRef.value?.handleOpen({
      content: getCellContent(selectedCell.value.row, selectedCell.value.column.property),
      columnName: selectedCell.value.column.property
    })
  }

  const cellClassName = ({ row, column }: { row: SqlResultRow; column: TableCellColumn }) => {
    if (
      selectedCell.value &&
      selectedCell.value.row === row &&
      selectedCell.value.column.property === column.property
    ) {
      return 'selected-cell'
    }
    return ''
  }
</script>

<style scoped lang="scss">
  .result-table-container {
    :deep(.el-table) {
      height: 100%;

      .cell {
        overflow: visible;
        text-overflow: initial;
        line-height: 1.5;
        overflow-wrap: anywhere;
        white-space: normal;
      }

      // Add selection style if needed
      .el-table__cell {
        // cursor: default;
      }

      .selected-cell {
        position: relative;
        z-index: 1;
        box-shadow: inset 0 0 0 2px var(--el-color-primary);
      }
    }
  }
</style>
