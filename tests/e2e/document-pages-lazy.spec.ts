import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const documentModuleUrl =
  '/modules/art-supabase-mdm/src/views/engineering/accessory-processing/modules/document-pages.ts'

test('图片预览不会加载 PDF 与 DOCX 转换器', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => requests.push(request.url()))
  await page.goto('/tests/e2e/fixtures/document-pages.html')

  const result = await page.evaluate(async (moduleUrl) => {
    const { rasterizeProcessingList } = (await import(moduleUrl)) as {
      rasterizeProcessingList: (file: File) => Promise<Array<{ width: number; height: number }>>
    }
    const canvas = document.createElement('canvas')
    canvas.width = 12
    canvas.height = 8
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('图片生成失败'))))
    })
    const pages = await rasterizeProcessingList(
      new File([blob], 'preview.png', { type: 'image/png' })
    )
    return pages.map(({ width, height }) => ({ width, height }))
  }, documentModuleUrl)

  expect(result).toEqual([{ width: 12, height: 8 }])
  expect(
    requests.filter((url) => /docx-preview|html-to-image|pdfjs-dist.*pdf\.mjs/i.test(url))
  ).toEqual([])
})

test('PDF 转换器在打开 PDF 时才加载并生成页面', async ({ page }) => {
  await page.goto('/tests/e2e/fixtures/document-pages.html')

  const pages = await page.evaluate(async (moduleUrl) => {
    const { rasterizeProcessingList } = (await import(moduleUrl)) as {
      rasterizeProcessingList: (file: File) => Promise<Array<{ width: number; height: number }>>
    }
    const newline = String.fromCharCode(10)
    const objects = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 120 80] /Contents 4 0 R >>',
      '<< /Length 0 >>' + newline + 'stream' + newline + newline + 'endstream'
    ]
    let source = '%PDF-1.4' + newline
    const offsets = [0]
    for (const [index, object] of objects.entries()) {
      offsets.push(source.length)
      source += String(index + 1) + ' 0 obj' + newline + object + newline + 'endobj' + newline
    }
    const xrefOffset = source.length
    source += 'xref' + newline + '0 ' + String(objects.length + 1) + newline
    source += '0000000000 65535 f ' + newline
    source += offsets
      .slice(1)
      .map((offset) => String(offset).padStart(10, '0') + ' 00000 n ' + newline)
      .join('')
    source +=
      'trailer' +
      newline +
      '<< /Size ' +
      String(objects.length + 1) +
      ' /Root 1 0 R >>' +
      newline +
      'startxref' +
      newline +
      String(xrefOffset) +
      newline +
      '%%EOF'
    const file = new File([new TextEncoder().encode(source)], 'preview.pdf', {
      type: 'application/pdf'
    })
    return (await rasterizeProcessingList(file)).map(({ width, height }) => ({ width, height }))
  }, documentModuleUrl)

  expect(pages).toEqual([{ width: 240, height: 160 }])
})

test('DOCX 转换器按需渲染仓库中的模板', async ({ page }) => {
  const documentPath = resolve(
    import.meta.dirname,
    '../../modules/art-supabase-mdm/src/views/engineering/accessory-processing/assets/accessory-processing-template.docx'
  )
  const templateBase64 = (await readFile(documentPath)).toString('base64')
  await page.goto('/tests/e2e/fixtures/document-pages.html')

  const pages = await page.evaluate(
    async ({ moduleUrl, base64 }) => {
      const { rasterizeProcessingList } = (await import(moduleUrl)) as {
        rasterizeProcessingList: (file: File) => Promise<Array<{ width: number; height: number }>>
      }
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      const file = new File([bytes], 'template.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      })
      return (await rasterizeProcessingList(file)).map(({ width, height }) => ({ width, height }))
    },
    { moduleUrl: documentModuleUrl, base64: templateBase64 }
  )

  expect(pages.length).toBeGreaterThan(0)
  expect(pages[0]?.width).toBeGreaterThan(0)
  expect(pages[0]?.height).toBeGreaterThan(0)
})
