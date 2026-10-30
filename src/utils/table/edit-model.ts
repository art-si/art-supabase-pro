import { assign, cloneDeep, get, has, isEqual, set, unset, toPath } from 'lodash-es'
import type { TableEditRecordset } from '@/types/table-edit'

type EditCommand<T> =
  | { kind: 'row'; row: T; before: T; after: T }
  | { kind: 'cell'; row: T; prop: string; before: unknown; after: unknown; existed: boolean }
  | { kind: 'insert' | 'remove'; entries: Array<{ row: T; index: number }> }

/** A working set with stable row references and bounded command history. No server writes. */
export class TableEditModel<T extends object> {
  rows: T[] = []
  private originals = new Map<T, T>()
  private sourceOrder: T[] = []
  private removed = new Set<T>()
  private past: EditCommand<T>[] = []
  private future: EditCommand<T>[] = []

  constructor(
    data: T[],
    private historyLimit = 100
  ) {
    this.loadData(data)
  }

  loadData(data: T[]): void {
    this.rows = cloneDeep(data)
    this.sourceOrder = [...this.rows]
    this.originals = new Map(this.rows.map((row) => [row, cloneDeep(row)]))
    this.removed.clear()
    this.past = []
    this.future = []
  }

  private record(command: EditCommand<T>): void {
    this.past.push(command)
    const limit = Number.isFinite(this.historyLimit)
      ? Math.max(1, Math.min(500, Math.floor(this.historyLimit)))
      : 100
    this.past = this.past.slice(-limit)
    this.future = []
  }

  setCellValue(row: T, prop: string, value: unknown): boolean {
    if (
      !this.rows.includes(row) ||
      !prop ||
      toPath(prop).some((key) => ['__proto__', 'prototype', 'constructor'].includes(key))
    )
      return false
    const before: unknown = get(row, prop)
    if (isEqual(before, value)) return false
    this.record({
      kind: 'cell',
      row,
      prop,
      before: cloneDeep(before),
      after: cloneDeep(value),
      existed: has(row, prop)
    })
    set(row, prop, cloneDeep(value))
    return true
  }

  getRecordset(): TableEditRecordset<T> {
    const changes = this.rows.flatMap((row, rowIndex) => {
      const original = this.originals.get(row)
      if (!original || isEqual(row, original)) return []
      const fields = Object.keys(row).filter(
        (key) => !isEqual(get(row, [key]), get(original, [key]))
      )
      return [{ row, original: cloneDeep(original), fields, rowIndex }]
    })
    return {
      insertRecords: this.rows.filter((row) => !this.originals.has(row)),
      removeRecords: this.sourceOrder
        .filter((row) => this.removed.has(row))
        .map((row) => cloneDeep(this.originals.get(row)!)),
      updateRecords: changes.map((change) => change.row),
      changes
    }
  }

  isUpdateByRow(row: T, prop?: string): boolean {
    const original = this.originals.get(row)
    return (
      original !== undefined &&
      !isEqual(prop ? get(row, prop) : row, prop ? get(original, prop) : original)
    )
  }

  insertAt(records: T | T[], target?: T | -1): T[] {
    const inserted = cloneDeep(Array.isArray(records) ? records : [records])
    const index = target === -1 ? this.rows.length : target ? this.rows.indexOf(target) : 0
    if (index < 0 || !inserted.length) return []
    const previousLength = this.rows.length
    this.rows.length = previousLength + inserted.length
    this.rows.copyWithin(index + inserted.length, index, previousLength)
    for (let offset = 0; offset < inserted.length; offset++)
      this.rows[index + offset] = inserted[offset]
    this.record({
      kind: 'insert',
      entries: inserted.map((row, offset) => ({ row, index: index + offset }))
    })
    return inserted
  }

  remove(records: T | T[]): T[] {
    const requested = Array.isArray(records) ? records : [records]
    const requestedSet = new Set(requested)
    const entries = this.rows.flatMap((row, index) =>
      requestedSet.has(row) ? [{ row, index }] : []
    )
    if (!entries.length) return []
    this.record({ kind: 'remove', entries })
    this.apply(this.past[this.past.length - 1], false)
    return entries.map((entry) => entry.row)
  }

  private apply(command: EditCommand<T>, reverse: boolean): void {
    if (command.kind === 'row') {
      this.replaceRow(command.row, reverse ? command.before : command.after)
      return
    }
    if (command.kind === 'cell') {
      if (reverse && !command.existed) unset(command.row, command.prop)
      else set(command.row, command.prop, cloneDeep(reverse ? command.before : command.after))
      return
    }
    const inserting = (command.kind === 'insert') !== reverse
    if (inserting) {
      const existing = this.rows.slice()
      const total = existing.length + command.entries.length
      this.rows.length = total
      let sourceIndex = 0
      let entryIndex = 0
      for (let index = 0; index < total; index++) {
        const entry = command.entries[entryIndex]
        if (entry && entry.index === index) {
          this.rows[index] = entry.row
          this.removed.delete(entry.row)
          entryIndex++
        } else this.rows[index] = existing[sourceIndex++]
      }
    } else {
      const pending = new Map<T, number>()
      for (const { row } of command.entries) pending.set(row, (pending.get(row) ?? 0) + 1)
      let write = 0
      for (let read = 0; read < this.rows.length; read++) {
        const row = this.rows[read]
        const count = pending.get(row) ?? 0
        if (count) pending.set(row, count - 1)
        else this.rows[write++] = row
      }
      this.rows.length = write
      for (const { row } of command.entries) if (this.originals.has(row)) this.removed.add(row)
    }
  }

  undo(): void {
    const command = this.past.pop()
    if (!command) return
    this.apply(command, true)
    this.future.push(command)
  }

  redo(): void {
    const command = this.future.pop()
    if (!command) return
    this.apply(command, false)
    this.past.push(command)
  }

  canUndo(): boolean {
    return this.past.length > 0
  }
  canRedo(): boolean {
    return this.future.length > 0
  }

  private replaceRow(row: T, value: T): void {
    for (const key of Object.keys(row)) if (!has(value, [key])) unset(row, [key])
    assign(row, cloneDeep(value))
  }

  revertData(row?: T, prop?: string): void {
    if (!row) {
      this.rows = [...this.sourceOrder]
      for (const item of this.rows) {
        const original = this.originals.get(item)!
        this.replaceRow(item, original)
      }
      this.removed.clear()
      this.past = []
      this.future = []
    } else {
      const original = this.originals.get(row)
      if (!original) return
      if (prop && has(original, prop)) this.setCellValue(row, prop, get(original, prop))
      else {
        const after = cloneDeep(prop ? row : original)
        if (prop) unset(after, prop)
        this.record({ kind: 'row', row, before: cloneDeep(row), after })
        this.replaceRow(row, after)
      }
    }
  }
}
