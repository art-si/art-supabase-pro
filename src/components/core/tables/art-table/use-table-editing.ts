import { computed, nextTick, onScopeDispose, ref, shallowRef, watch, markRaw } from 'vue'
import { get, cloneDeep } from 'lodash-es'
import { TableEditModel } from '@/utils/table/edit-model'
import type {
  ColumnOption,
  TableEditApi,
  TableEditConfig,
  TableEditContext,
  TableEditRecordset
} from '@/types'

type Row = Record<string, unknown>

export function useTableEditing(options: {
  data: () => Row[]
  columns: () => ColumnOption<Row>[]
  config: () => TableEditConfig<Row> | undefined
  keepSource: () => boolean
  loading: () => boolean
  container: () => HTMLElement | undefined
  change: (records: TableEditRecordset<Row>) => void
  activated: (context: TableEditContext<Row>) => void
  closed: (context: TableEditContext<Row>) => void
  revealRow: (row: Row, prop: string) => Promise<void>
}) {
  const enabled = computed(() => Boolean(options.config() && options.config()?.enabled !== false))
  const tracking = computed(() => enabled.value || options.keepSource())
  const model = shallowRef(new TableEditModel<Row>([]))
  const revision = ref(0)
  const active = shallowRef<TableEditContext<Row> | null>(null)
  let sourceRows = new Map<Row, Row>()
  let ids = new WeakMap<Row, string>()
  let seed = 0
  let activationToken = 0
  const rows = computed(() => {
    void revision.value
    return tracking.value ? [...model.value.rows] : options.data()
  })
  const displayedRows = computed(() => {
    const allRows = rows.value
    if (!options.config()?.onlyChanged) return allRows
    const records = model.value.getRecordset()
    const changedRows = new Set([...records.insertRecords, ...records.updateRecords])
    return allRows.filter((row) => changedRows.has(row))
  })
  const key = (row: Row) => {
    if (!ids.has(row)) ids.set(row, `edit-row-${++seed}`)
    return ids.get(row)!
  }
  const resolveRow = (row: Row) => (model.value.rows.includes(row) ? row : sourceRows.get(row))
  const fields = computed(() => {
    const result: ColumnOption<Row>[] = []
    const visit = (columns: ColumnOption<Row>[]) =>
      columns.forEach((column) => {
        if (column.children?.length) visit(column.children)
        else if (column.prop && column.editRender?.enabled !== false && column.editRender)
          result.push(column)
      })
    visit(options.columns())
    return result
  })
  const context = (row: Row, prop: string): TableEditContext<Row> => ({
    row,
    prop,
    rowIndex: model.value.rows.indexOf(row),
    value: get(row, prop)
  })
  const canEdit = (column: ColumnOption<Row>, row: Row) => {
    if (
      !enabled.value ||
      options.loading() ||
      !column.prop ||
      !column.editRender ||
      column.editRender.enabled === false ||
      !model.value.rows.includes(row)
    )
      return false
    const ctx = context(row, column.prop)
    const disabled = column.editRender.disabled
    return (
      !(typeof disabled === 'function' ? disabled(ctx) : disabled) &&
      (options.config()?.beforeEditMethod?.(ctx) ?? true)
    )
  }
  const changed = () => {
    revision.value++
    options.change(model.value.getRecordset())
  }
  const closeActive = () => {
    const previous = active.value
    active.value = null
    if (previous) options.closed(context(previous.row, previous.prop))
  }
  const clearEdit = () => {
    activationToken++
    closeActive()
  }
  onScopeDispose(clearEdit)
  watch(
    [options.data, tracking],
    () => {
      clearEdit()
      model.value = new TableEditModel(
        tracking.value ? options.data() : [],
        options.config()?.historyLimit
      )
      model.value.rows.forEach(markRaw)
      sourceRows = new Map(options.data().map((row, index) => [row, model.value.rows[index]]))
      ids = new WeakMap()
      revision.value++
    },
    { immediate: true }
  )
  watch(enabled, (value) => {
    if (!value) clearEdit()
  })
  watch(options.loading, (value) => {
    if (value) clearEdit()
  })

  const setEditCell = async (input: Row, prop: string): Promise<boolean> => {
    const row = resolveRow(input)
    const owner = model.value
    const column = fields.value.find((field) => field.prop === prop)
    const previousToken = activationToken
    if (!row || !column || !canEdit(column, row) || previousToken !== activationToken) return false
    const token = ++activationToken
    const isCurrent = () => {
      if (owner !== model.value || token !== activationToken || !enabled.value) return false
      const currentColumn = fields.value.find((field) => field.prop === prop)
      if (!currentColumn || !canEdit(currentColumn, row)) return false
      return owner === model.value && token === activationToken
    }
    await options.revealRow(row, prop)
    if (!isCurrent()) return false
    if (active.value?.row !== row || active.value.prop !== prop) closeActive()
    if (!isCurrent()) return false
    const selection = context(row, prop)
    active.value = selection
    await nextTick()
    if (active.value !== selection || !isCurrent()) {
      if (active.value === selection) active.value = null
      return false
    }
    const cell = Array.from(
      options.container()?.querySelectorAll<HTMLElement>('[data-art-edit-row]') ?? []
    ).find(
      (element) => element.dataset.artEditRow === key(row) && element.dataset.artEditField === prop
    )
    const activated = { ...selection, cell }
    active.value = activated
    options.activated(activated)
    if (token !== activationToken || active.value !== activated) return false
    if (options.config()?.editor === 'external') return true
    const inputElement = cell?.querySelector<HTMLElement>(
      'input:not([disabled]),textarea:not([disabled]),[role="switch"]'
    )
    inputElement?.focus({ preventScroll: true })
    return true
  }
  const isEditing = (column: ColumnOption<Row>, row: Row) =>
    options.config()?.editor !== 'external' &&
    canEdit(column, row) &&
    active.value?.row === row &&
    (options.config()?.mode === 'row' || active.value.prop === column.prop)
  const setCellValue = (input: Row, prop: string, value: unknown) => {
    const row = resolveRow(input)
    const column = fields.value.find((field) => field.prop === prop)
    if (!row || !column || !canEdit(column, row) || !model.value.setCellValue(row, prop, value))
      return false
    changed()
    return true
  }
  const navigate = async (
    row: Row,
    prop: string,
    direction: 'next' | 'previous' | 'down' | 'up'
  ) => {
    const candidates = rows.value.flatMap((record) =>
      fields.value
        .filter((column) => canEdit(column, record))
        .map((column) => ({ row: record, prop: column.prop! }))
    )
    const index = candidates.findIndex((cell) => cell.row === row && cell.prop === prop)
    let target: { row: Row; prop: string } | undefined
    if (direction === 'next' || direction === 'previous')
      target = candidates[index + (direction === 'next' ? 1 : -1)]
    else {
      const rowIndex = rows.value.indexOf(row) + (direction === 'down' ? 1 : -1)
      target = candidates.find((cell) => cell.row === rows.value[rowIndex] && cell.prop === prop)
    }
    if (target) await setEditCell(target.row, target.prop)
    else clearEdit()
  }
  const api: TableEditApi<Row> = {
    getTableData: () => cloneDeep(rows.value),
    getRecordset: () => model.value.getRecordset(),
    getInsertRecords: () => model.value.getRecordset().insertRecords,
    getRemoveRecords: () => model.value.getRecordset().removeRecords,
    getUpdateRecords: () => model.value.getRecordset().updateRecords,
    isUpdateByRow: (input, prop) => {
      void revision.value
      const row = resolveRow(input)
      return row ? model.value.isUpdateByRow(row, prop) : false
    },
    revertData: (input, prop) => {
      if (!tracking.value || options.loading()) return
      const target = input ? resolveRow(input) : undefined
      if (input && !target) return
      clearEdit()
      model.value.revertData(target, prop)
      changed()
    },
    insertAt: (records, target) => {
      if (!enabled.value || options.loading()) return []
      const destination = target === -1 || !target ? target : resolveRow(target)
      if (target && target !== -1 && !destination) return []
      clearEdit()
      const result = model.value.insertAt(records, destination)
      result.forEach(markRaw)
      changed()
      return result
    },
    remove: (records) => {
      if (!enabled.value || options.loading()) return []
      clearEdit()
      const workingSet = new Set(model.value.rows)
      const targets = (Array.isArray(records) ? records : [records])
        .map((input) => (workingSet.has(input) ? input : sourceRows.get(input)))
        .filter((row): row is Row => Boolean(row))
      const result = model.value.remove(targets)
      changed()
      return result
    },
    setCellValue,
    setEditCell,
    setEditRow: (input) => {
      const row = resolveRow(input)
      const column = row && fields.value.find((field) => canEdit(field, row))
      return row && column?.prop ? setEditCell(row, column.prop) : Promise.resolve(false)
    },
    clearEdit,
    getEditRecord: () =>
      active.value
        ? { ...context(active.value.row, active.value.prop), cell: active.value.cell }
        : null,
    undo: () => {
      if (!enabled.value || options.loading()) return
      clearEdit()
      model.value.undo()
      changed()
    },
    redo: () => {
      if (!enabled.value || options.loading()) return
      clearEdit()
      model.value.redo()
      changed()
    },
    canUndo: () => {
      void revision.value
      return model.value.canUndo()
    },
    canRedo: () => {
      void revision.value
      return model.value.canRedo()
    }
  }
  return { enabled, rows, displayedRows, key, canEdit, isEditing, active, navigate, api }
}
