import 'element-plus/theme-chalk/el-message.css'
import { printHtmlDocument } from '@/utils/file/print-document'

document.querySelector<HTMLButtonElement>('#print')?.addEventListener('click', () => {
  const image =
    document.body.dataset.image === 'true' ? '<img src="/print-logo.svg" alt="标识" />' : ''
  const failPrint = document.body.dataset.failPrint === 'true'
  const font =
    document.body.dataset.font === 'true'
      ? '<style>@font-face { font-family: PrintFont; src: url("/print-font.woff2"); } body { font-family: PrintFont; }</style>'
      : ''
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8" /><title>打印验证</title>${font}</head><body data-fail-print="${failPrint}"><h1>测试业务文档</h1>${image}<p>数量：0</p></body></html>`
  const opened = printHtmlDocument(html, 'width=980,height=820')
  const output = document.querySelector('output')
  if (output) output.textContent = opened ? '已打开' : '未打开'
})
