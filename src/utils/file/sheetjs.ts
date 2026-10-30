// Limit the lazy workbook module to imports and XLSX exports so unused writers can be removed.
export { read, utils, writeXLSX } from '@/vendor/sheetjs/xlsx.mjs'
export type { ColInfo } from '@/vendor/sheetjs/xlsx.mjs'
