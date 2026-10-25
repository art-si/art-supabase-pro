import type { ColInfo } from '@/vendor/sheetjs/xlsx.mjs'
export { formatSize } from './format-size'
import { createTenantScopeReadGuard } from '../tenant-scope-context'
import { ElMessage } from 'element-plus'
import { openFilePreview, type FilePreviewTarget } from '@/hooks/core/useFilePreview'

export type ExcelCellValue = string | number | boolean | null | undefined | Date

export type ExcelRecord = Record<string, unknown>

export interface ExcelColumn<TRecord extends object = ExcelRecord> {
  key: keyof TRecord | string
  title: string
  width?: number
  required?: boolean
  formatter?: (value: unknown, row: TRecord, index: number) => ExcelCellValue
}

export interface ExportExcelOptions<TRecord extends object = ExcelRecord> {
  data: TRecord[]
  columns: ExcelColumn<TRecord>[]
  filename?: string
  sheetName?: string
  autoIndex?: boolean
  indexColumnTitle?: string
  maxRows?: number
  filenameSuffix?: 'date' | 'datetime' | false
  workbookProperties?: ExcelWorkbookProperties
  onProgress?: (progress: number) => void
  assertCanDownload?: () => void
}

export interface ExcelWorkbookProperties {
  creator?: string
  lastModifiedBy?: string
  created?: Date
  modified?: Date
}

const formatExcelCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toLocaleDateString('zh-CN')
  if (typeof value === 'boolean') return value ? '是' : '否'
  return String(value)
}

const calculateExcelColumnWidths = (
  rows: Record<string, string>[],
  columns: Array<Pick<ExcelColumn<object>, 'title' | 'width'>>
): ColInfo[] => {
  if (!rows.length) return []

  const sampleSize = Math.min(rows.length, 100)
  const titles = Object.keys(rows[0])

  return titles.map((title) => {
    const configuredWidth = columns.find((column) => column.title === title)?.width
    if (configuredWidth) return { wch: configuredWidth }

    const maxLength = Math.max(
      title.length,
      ...rows.slice(0, sampleSize).map((row) => String(row[title] || '').length)
    )
    return { wch: Math.min(Math.max(maxLength + 2, 8), 50) }
  })
}

export const buildExcelRows = <TRecord extends object>(
  data: TRecord[],
  columns: ExcelColumn<TRecord>[],
  options: Pick<ExportExcelOptions<TRecord>, 'autoIndex' | 'indexColumnTitle'> = {}
): Record<string, string>[] => {
  return data.map((row, index) => {
    const output: Record<string, string> = {}

    if (options.autoIndex) {
      output[options.indexColumnTitle || '序号'] = String(index + 1)
    }

    columns.forEach((column) => {
      const value = Reflect.get(row, String(column.key))
      const formattedValue = column.formatter ? column.formatter(value, row, index) : value
      output[column.title] = formatExcelCellValue(formattedValue)
    })

    return output
  })
}

export const buildExcelFilename = (
  filename: string,
  suffix: ExportExcelOptions['filenameSuffix'] = 'date',
  now = new Date()
): string => {
  if (suffix === false) return `${filename}.xlsx`
  const value =
    suffix === 'datetime' ? now.toISOString().replace(/[:.]/g, '-') : now.toISOString().slice(0, 10)
  return `${filename}_${value}.xlsx`
}

export const exportExcel = async <TRecord extends object>(
  options: ExportExcelOptions<TRecord>
): Promise<void> => {
  const {
    data,
    columns,
    filename = `export_${new Date().toISOString().slice(0, 10)}`,
    sheetName = 'Sheet1',
    autoIndex = false,
    indexColumnTitle = '序号',
    maxRows = 100000,
    filenameSuffix = 'date',
    workbookProperties = {},
    onProgress,
    assertCanDownload
  } = options

  if (!Array.isArray(data) || !data.length) {
    throw new Error('没有可导出的数据')
  }
  if (!Array.isArray(columns) || !columns.length) {
    throw new Error('没有可导出的列配置')
  }
  if (!Number.isSafeInteger(maxRows) || maxRows < 1) {
    throw new RangeError('导出行数上限必须是正安全整数')
  }
  if (data.length > maxRows) {
    throw new Error(`导出数据不能超过 ${maxRows} 行`)
  }

  const assertTenantScope = createTenantScopeReadGuard()
  onProgress?.(10)
  const [{ default: FileSaver }, XLSX] = await Promise.all([
    import('file-saver'),
    import('@/vendor/sheetjs/xlsx.mjs')
  ])
  const rows = buildExcelRows(data, columns, { autoIndex, indexColumnTitle })
  onProgress?.(30)
  const worksheet = XLSX.utils.json_to_sheet(rows)
  worksheet['!cols'] = calculateExcelColumnWidths(rows, columns)
  onProgress?.(50)

  const workbook = XLSX.utils.book_new()
  workbook.Props = {
    Title: filename,
    Subject: '数据导出',
    Author: workbookProperties.creator || '亿企工场',
    Manager: workbookProperties.lastModifiedBy || '',
    Company: '系统导出',
    Category: '数据',
    Keywords: 'excel,export,data',
    Comments: '由系统自动生成',
    CreatedDate: workbookProperties.created || new Date(),
    ModifiedDate: workbookProperties.modified || new Date()
  }
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
  onProgress?.(70)

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'array',
    compression: true
  })
  onProgress?.(85)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })

  onProgress?.(95)
  assertTenantScope()
  assertCanDownload?.()
  FileSaver.saveAs(blob, buildExcelFilename(filename, filenameSuffix))
  onProgress?.(100)
}

export async function importExcelFile(file: File): Promise<Array<Record<string, unknown>>> {
  const XLSX = await import('@/vendor/sheetjs/xlsx.mjs')
  const isCsv = file.name.toLowerCase().endsWith('.csv')
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = event.target?.result
        const workbook = XLSX.read(data, { type: isCsv ? 'string' : 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const rows = XLSX.utils.sheet_to_json(worksheet)
        resolve(rows as Array<Record<string, unknown>>)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = (error) => reject(error)
    if (isCsv) reader.readAsText(file, 'UTF-8')
    else reader.readAsArrayBuffer(file)
  })
}

export const mapExcelRowsToRecords = <TRecord extends ExcelRecord>(
  rows: Array<Record<string, unknown>>,
  columns: ExcelColumn<TRecord>[]
): TRecord[] => {
  return rows
    .map((row) => {
      const entries: Array<[string, unknown]> = []

      columns.forEach((column) => {
        const key = String(column.key)
        const titledValue = Object.prototype.hasOwnProperty.call(row, column.title)
          ? row[column.title]
          : undefined
        const rawValue =
          titledValue ?? (Object.prototype.hasOwnProperty.call(row, key) ? row[key] : undefined)
        if (rawValue === undefined || rawValue === null) return

        entries.push([key, typeof rawValue === 'string' ? rawValue.trim() : rawValue])
      })

      return Object.fromEntries(entries) as TRecord
    })
    .filter((row) =>
      columns.every((column) => {
        if (!column.required) return true
        if (!Object.prototype.hasOwnProperty.call(row, String(column.key))) return false
        const value = row[String(column.key)]
        return value !== undefined && value !== null && String(value).trim() !== ''
      })
    )
}

export async function calcFileHash(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export type FileActionTarget = FilePreviewTarget

export const getFileExtension = (fileName?: string, suffix?: string): string => {
  const normalizedSuffix = suffix || fileName?.split('.').pop() || ''
  return normalizedSuffix.replace(/^\./, '').trim().toLowerCase()
}

export const viewFile = (url?: string): void => {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

export const downloadFile = (url?: string, filename = 'attachment'): void => {
  if (!url) return

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

/** 下载内存文件并在浏览器接管后统一释放临时对象 URL。 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  try {
    downloadFile(url, filename)
  } finally {
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

export const viewAttachment = (file: FileActionTarget): void => {
  const result = openFilePreview(file)
  if (result === 'missing-url') ElMessage.warning('附件没有可用的预览地址')
  if (result === 'blocked') ElMessage.warning('浏览器阻止了新页签，请允许本站打开弹出式窗口')
  if (result === 'storage-unavailable')
    ElMessage.warning('无法保存预览信息，请检查浏览器的本站存储权限后重试')
}

export const downloadAttachment = (file: FileActionTarget): void => {
  downloadFile(file.url, file.name || 'attachment')
}
