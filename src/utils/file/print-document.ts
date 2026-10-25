import { ElMessage } from 'element-plus'

const reportPrintFailure = (error: unknown): void => {
  console.error('[PrintDocument] 打印失败:', error)
  ElMessage.error('打印失败，请关闭打印窗口后重试')
}

/** Print trusted, escaped business HTML in an isolated window. Owns failure notifications. */
export function printHtmlDocument(html: string, windowFeatures?: string): boolean {
  let documentUrl: string
  try {
    const printDocument = new DOMParser().parseFromString(html, 'text/html')
    if (!printDocument.querySelector('base[href]')) {
      const base = printDocument.createElement('base')
      base.href = document.baseURI
      printDocument.head.prepend(base)
    }
    documentUrl = URL.createObjectURL(
      new Blob([`<!doctype html>${printDocument.documentElement.outerHTML}`], {
        type: 'text/html;charset=utf-8'
      })
    )
  } catch (error) {
    reportPrintFailure(error)
    return false
  }
  const releaseDocument = (): void => URL.revokeObjectURL(documentUrl)
  let popup: Window | null
  try {
    popup = window.open(documentUrl, '_blank', windowFeatures)
  } catch (error) {
    releaseDocument()
    reportPrintFailure(error)
    return false
  }
  if (!popup) {
    releaseDocument()
    ElMessage.warning('浏览器阻止了打印窗口，请允许本站打开弹窗后重试')
    return false
  }

  const printWindow = popup
  const handleLoad = (): void => {
    releaseDocument()
    printWindow.removeEventListener('pagehide', releaseDocument)
    if (printWindow.closed) return
    void Promise.resolve()
      .then(async () => {
        // A missing logo must not prevent printing the remaining business document.
        await Promise.allSettled([
          ...Array.from(printWindow.document.images, (image) => image.decode()),
          printWindow.document.fonts.ready
        ])
        if (printWindow.closed) return
        printWindow.focus()
        printWindow.print()
      })
      .catch(reportPrintFailure)
  }

  try {
    printWindow.opener = null
    printWindow.addEventListener('pagehide', releaseDocument, { once: true })
    printWindow.addEventListener('load', handleLoad, { once: true })
    return true
  } catch (error) {
    releaseDocument()
    printWindow.removeEventListener('pagehide', releaseDocument)
    printWindow.removeEventListener('load', handleLoad)
    printWindow.close()
    reportPrintFailure(error)
    return false
  }
}
