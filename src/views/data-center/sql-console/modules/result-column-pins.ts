import Decimal from 'decimal.js-light'
import { countBy } from 'lodash-es'

export type SqlColumnPinSide = 'left' | 'right'

export interface SqlColumnPin {
  key: string
  side: SqlColumnPinSide
}

export interface SqlColumnPinColumn {
  key: string
  /** Actual current layout width, including flex growth and user resizing. */
  width: number
}

export type SqlColumnPinSuspensionReason =
  | 'invalid-key'
  | 'duplicate-column'
  | 'duplicate-request'
  | 'unavailable-column'
  | 'invalid-width'
  | 'invalid-viewport'
  | 'narrow-viewport'
  | 'insufficient-space'

export interface SqlSuspendedColumnPin extends SqlColumnPin {
  reason: SqlColumnPinSuspensionReason
}

export interface SqlColumnPinLayoutInput {
  /** Only currently visible, authorized columns; hidden fields occupy no width. */
  columns: readonly SqlColumnPinColumn[]
  viewportWidth: number
  /** Request order, independent of display order. Do not reorder after a column drag. */
  desiredPins: readonly SqlColumnPin[]
}

export interface SqlColumnPinLayout {
  appliedPins: ReadonlyMap<string, SqlColumnPinSide>
  suspended: SqlSuspendedColumnPin[]
  reservedMiddleWidth: number
  pinnedWidth: number
  remainingWidth: number
}

export interface SqlColumnPinRequestResult {
  accepted: boolean
  reason?: SqlColumnPinSuspensionReason
  desiredPins: SqlColumnPin[]
  layout: SqlColumnPinLayout
}

// Finite JS numbers range from 5e-324 to ~1.8e308. 1024 decimal digits cover
// that entire span plus the carry from any JS array length, without an epsilon.
const LayoutDecimal = Decimal.clone({ precision: 1024 })
const minPinnedViewport = 640

/** Recompute presentation only; suspended requests remain owned by the caller. */
export function resolveSqlColumnPins(input: SqlColumnPinLayoutInput): SqlColumnPinLayout {
  const columnCounts = countBy(input.columns, 'key')
  const requestCounts = countBy(input.desiredPins, 'key')
  const columns = new Map(input.columns.map((column) => [column.key, column]))
  const validViewport = Number.isFinite(input.viewportWidth) && input.viewportWidth > 0
  const viewport = new LayoutDecimal(validViewport ? String(input.viewportWidth) : 0)
  const candidates = new Map<number, Decimal>()
  const reasons = new Map<number, SqlColumnPinSuspensionReason>()

  input.desiredPins.forEach((pin, index) => {
    const column = columns.get(pin.key)
    if (!pin.key) reasons.set(index, 'invalid-key')
    else if (requestCounts[pin.key] > 1) reasons.set(index, 'duplicate-request')
    else if (!column) reasons.set(index, 'unavailable-column')
    else if (columnCounts[pin.key] > 1) reasons.set(index, 'duplicate-column')
    else if (!Number.isFinite(column.width) || column.width <= 0)
      reasons.set(index, 'invalid-width')
    else if (!validViewport) reasons.set(index, 'invalid-viewport')
    else if (input.viewportWidth < minPinnedViewport) reasons.set(index, 'narrow-viewport')
    else candidates.set(index, new LayoutDecimal(String(column.width)))
  })

  const totalRequestedWidth = [...candidates.values()].reduce(
    (sum, width) => sum.plus(width),
    new LayoutDecimal(0)
  )
  const allColumnsFit =
    input.columns.length > 0 &&
    candidates.size === input.columns.length &&
    totalRequestedWidth.lte(viewport)
  let reserved = new LayoutDecimal(0)
  if (
    validViewport &&
    input.viewportWidth >= minPinnedViewport &&
    input.columns.length &&
    !allColumnsFit
  ) {
    const proportional = viewport.times('0.3')
    reserved = proportional.lt(240)
      ? new LayoutDecimal(240)
      : proportional.gt(320)
        ? new LayoutDecimal(320)
        : proportional
  }
  const budget = viewport.minus(reserved)
  let pinned = new LayoutDecimal(0)
  const appliedPins = new Map<string, SqlColumnPinSide>()
  const suspended: SqlSuspendedColumnPin[] = []
  input.desiredPins.forEach((pin, index) => {
    const width = candidates.get(index)
    let reason = reasons.get(index)
    if (width) {
      if (pinned.plus(width).lte(budget)) {
        appliedPins.set(pin.key, pin.side)
        pinned = pinned.plus(width)
      } else reason = 'insufficient-space'
    }
    if (reason) suspended.push({ ...pin, reason })
  })
  return {
    appliedPins,
    suspended,
    reservedMiddleWidth: reserved.toNumber(),
    pinnedWidth: pinned.toNumber(),
    remainingWidth: viewport.minus(pinned).toNumber()
  }
}

/** Add/change a pin atomically; a refusal preserves both preferences and applied pins. */
export function requestSqlColumnPin(
  input: SqlColumnPinLayoutInput,
  request: SqlColumnPin
): SqlColumnPinRequestResult {
  const current = resolveSqlColumnPins(input)
  const existingIndex = input.desiredPins.findIndex((pin) => pin.key === request.key)
  const desiredPins = input.desiredPins.map((pin) => ({ ...pin }))
  if (existingIndex < 0) desiredPins.push({ ...request })
  else desiredPins[existingIndex] = { ...request }
  const candidate = resolveSqlColumnPins({ ...input, desiredPins })
  const targetApplied = candidate.appliedPins.get(request.key) === request.side
  const previousRetained = [...current.appliedPins].every(
    ([key, side]) => candidate.appliedPins.get(key) === (key === request.key ? request.side : side)
  )
  if (!targetApplied || !previousRetained) {
    return {
      accepted: false,
      reason:
        candidate.suspended.find((pin) => pin.key === request.key)?.reason ?? 'insufficient-space',
      desiredPins: input.desiredPins.map((pin) => ({ ...pin })),
      layout: current
    }
  }
  return { accepted: true, desiredPins, layout: candidate }
}
