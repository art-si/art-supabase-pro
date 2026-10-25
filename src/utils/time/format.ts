import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const clockTimePattern = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/
const timeOnlyPattern = /^\d{2}:\d{2}(?::\d{2})?$/

/** Format a date/time value using dayjs.
 *  value can be:
 *   - full ISO timestamp string
 *   - Date
 *   - time-only string like '12:34:56' (will use today's date)
 *  format: dayjs format string, defaults to 'YYYY-MM-DD HH:mm:ss'
 *  timezone: IANA timezone string (e.g., 'Asia/Shanghai') or undefined to use local timezone
 */
export function formatWithDayjs(
  value: string | Date | null | undefined,
  format = 'YYYY-MM-DD HH:mm:ss',
  timezone?: string
): string | null {
  if (value == null) return null

  // If it's time-only (HH:mm or HH:mm:ss), attach today's date
  if (typeof value === 'string' && timeOnlyPattern.test(value)) {
    if (!clockTimePattern.test(value)) return value
    const today = timezone ? dayjs().tz(timezone) : dayjs()
    const datePart = today.format('YYYY-MM-DD')
    const composed = `${datePart} ${value}`
    return timezone ? dayjs.tz(composed, timezone).format(format) : dayjs(composed).format(format)
  }

  const d = dayjs(value)
  if (!d.isValid()) return String(value)
  return timezone ? d.tz(timezone).format(format) : d.format(format)
}

/** Whether a value can be interpreted by the shared date/time formatter. */
export function isValidDateTimeValue(
  value: string | Date | null | undefined,
  allowTimeOnly = true
): boolean {
  if (value == null || value === '') return false
  if (typeof value === 'string' && timeOnlyPattern.test(value)) {
    return allowTimeOnly && clockTimePattern.test(value)
  }
  return dayjs(value).isValid()
}

export function toStartOfDayUTC(dateStr: string) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00Z')
  return d.toISOString()
}
export function toNextDayStartUTC(dateStr: string) {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString()
}
