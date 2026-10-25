import dayjs from 'dayjs'

const chineseWeekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

export function formatScreenDate(value: string): string {
  const date = dayjs(value)
  return `${date.format('YYYY年MM月DD日')} · ${chineseWeekdays[date.day()]}`
}
