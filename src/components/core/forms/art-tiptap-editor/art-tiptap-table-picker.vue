<template>
  <div ref="pickerRef" class="art-tiptap-table-picker">
    <div
      class="art-tiptap-table-picker__grid"
      role="grid"
      :aria-label="`选择表格尺寸，当前 ${activeRows} 行 ${activeColumns} 列`"
      @mouseleave="restoreSelection"
    >
      <div v-for="row in maxRows" :key="row" class="art-tiptap-table-picker__row" role="row">
        <button
          v-for="column in maxColumns"
          :key="`${row}-${column}`"
          class="art-tiptap-table-picker__cell"
          :class="{ 'is-active': row <= activeRows && column <= activeColumns }"
          type="button"
          role="gridcell"
          :tabindex="row === keyboardRow && column === keyboardColumn ? 0 : -1"
          :aria-label="`插入 ${row} 行 ${column} 列表格`"
          @mouseenter="preview(row, column)"
          @focus="preview(row, column)"
          @keydown="handleGridKeydown($event, row, column)"
          @click="select(row, column)"
        />
      </div>
    </div>

    <div class="art-tiptap-table-picker__summary">
      <strong>{{ activeRows }} × {{ activeColumns }}</strong>
      <span>表格</span>
    </div>

    <button
      class="art-tiptap-table-picker__header-toggle"
      :class="{ 'is-active': withHeaderRow }"
      type="button"
      role="switch"
      :aria-checked="withHeaderRow"
      @click="withHeaderRow = !withHeaderRow"
    >
      <span class="art-tiptap-table-picker__check" aria-hidden="true">
        <ArtSvgIcon v-if="withHeaderRow" icon="ri:check-line" />
      </span>
      首行作为表头
    </button>
  </div>
</template>

<script setup lang="ts">
  import { clamp } from 'lodash-es'
  import { nextTick, ref } from 'vue'

  defineOptions({ name: 'ArtTiptapTablePicker' })

  const props = withDefaults(
    defineProps<{
      maxRows?: number
      maxColumns?: number
      defaultRows?: number
      defaultColumns?: number
    }>(),
    {
      maxRows: 8,
      maxColumns: 8,
      defaultRows: 3,
      defaultColumns: 3
    }
  )

  const emit = defineEmits<{
    insert: [options: { rows: number; columns: number; withHeaderRow: boolean }]
  }>()

  const pickerRef = ref<HTMLElement>()
  const activeRows = ref(props.defaultRows)
  const activeColumns = ref(props.defaultColumns)
  const keyboardRow = ref(props.defaultRows)
  const keyboardColumn = ref(props.defaultColumns)
  const withHeaderRow = ref(true)

  const preview = (rows: number, columns: number) => {
    activeRows.value = rows
    activeColumns.value = columns
  }

  const restoreSelection = () => {
    preview(keyboardRow.value, keyboardColumn.value)
  }

  const focusCell = async (row: number, column: number) => {
    keyboardRow.value = clamp(row, 1, props.maxRows)
    keyboardColumn.value = clamp(column, 1, props.maxColumns)
    preview(keyboardRow.value, keyboardColumn.value)
    await nextTick()
    pickerRef.value
      ?.querySelector<HTMLElement>(
        `.art-tiptap-table-picker__row:nth-child(${keyboardRow.value}) .art-tiptap-table-picker__cell:nth-child(${keyboardColumn.value})`
      )
      ?.focus()
  }

  const select = (rows: number, columns: number) => {
    keyboardRow.value = rows
    keyboardColumn.value = columns
    emit('insert', { rows, columns, withHeaderRow: withHeaderRow.value })
  }

  const handleGridKeydown = (event: KeyboardEvent, row: number, column: number) => {
    const movement: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1]
    }
    const offset = movement[event.key]
    if (!offset) return
    event.preventDefault()
    void focusCell(row + offset[0], column + offset[1])
  }
</script>
