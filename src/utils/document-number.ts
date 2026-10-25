type ResetCycle = Api.SystemManage.DocumentNumberResetCycle

const dateParts = (date: Date, timeZone: string): Record<string, string> => {
  const values = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)

  return Object.fromEntries(values.map((item) => [item.type, item.value]))
}

export function getDocumentNumberPeriodKey(
  resetCycle: ResetCycle,
  timeZone = 'Asia/Shanghai',
  date = new Date()
): string {
  const { year, month, day } = dateParts(date, timeZone)
  if (resetCycle === 'year') return year
  if (resetCycle === 'month') return `${year}${month}`
  if (resetCycle === 'day') return `${year}${month}${day}`
  return ''
}

export function renderDocumentNumber(
  template: string,
  sequence: number,
  timeZone = 'Asia/Shanghai',
  date = new Date()
): string {
  const { year, month, day } = dateParts(date, timeZone)
  const sequenceToken = template.match(/\{SEQ:([1-9][0-9]?)\}/)
  const width = Number(sequenceToken?.[1] ?? 1)

  return template
    .replaceAll('{YYYYMMDD}', `${year}${month}${day}`)
    .replaceAll('{YYYYMM}', `${year}${month}`)
    .replaceAll('{YYMM}', `${year.slice(-2)}${month}`)
    .replaceAll('{YYYY}', year)
    .replaceAll('{YY}', year.slice(-2))
    .replaceAll('{MM}', month)
    .replaceAll('{DD}', day)
    .replace(/\{SEQ:[1-9][0-9]?\}/, String(sequence).padStart(width, '0'))
}

export function validateDocumentNumberTemplate(template: string): string | null {
  const tokens = template.match(/\{SEQ:[1-9][0-9]?\}/g) ?? []
  if (tokens.length !== 1) return '模板必须且只能包含一个流水号令牌，例如 {SEQ:3}'

  const remaining = template
    .replaceAll('{YYYYMMDD}', '')
    .replaceAll('{YYYYMM}', '')
    .replaceAll('{YYMM}', '')
    .replaceAll('{YYYY}', '')
    .replaceAll('{YY}', '')
    .replaceAll('{MM}', '')
    .replaceAll('{DD}', '')
    .replace(/\{SEQ:[1-9][0-9]?\}/, '')
  if (/[{}]/.test(remaining)) return '模板中包含不支持或书写错误的令牌'
  if (!template.trim()) return '请输入编号模板'
  return null
}
