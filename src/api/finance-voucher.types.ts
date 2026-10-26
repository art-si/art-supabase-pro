export interface FinanceVoucherPreviewLine {
  summary: string
  subjectCode: string
  subjectName: string
  debitAmount: number
  creditAmount: number
  baseCurrencyCode?: string
  currencyId?: string
  currencyCode?: string
  exchangeRate?: number
  originalAmount?: number
}
