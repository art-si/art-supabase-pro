import { recognizeImageTextLocally } from '@/utils/ocr/local-image-ocr'
import { parseLocalDriverDocumentOcr } from '@tms/api/modules/driver-document-ocr-parser'
import type { DriverDocumentImageSide } from '@tms/api/modules/driver-document-ocr'

interface SyntheticSide {
  side: DriverDocumentImageSide
  heading: string
  lines: string[]
}

const sides: SyntheticSide[] = [
  {
    side: 'idCardFrontUrl',
    heading: '模拟信息 正面',
    lines: ['姓名: 测试司机甲', '性别: 男', '出生日期: 1990-01-01', '身份证号: 990000199001010019']
  },
  {
    side: 'idCardBackUrl',
    heading: '模拟信息 背面',
    lines: ['签发机关: 模拟测试单位', '有效期限: 2020-01-01 至 2030-01-01']
  }
]

function drawSyntheticText(side: SyntheticSide): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1400
  canvas.height = 650
  const context = canvas.getContext('2d')
  if (!context) throw new Error('测试浏览器不支持 Canvas 2D')
  context.fillStyle = '#fff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#111'
  context.font = '52px "Microsoft YaHei", sans-serif'
  context.fillText(side.heading, 55, 95)
  side.lines.forEach((line, index) => context.fillText(line, 55, 200 + index * 92))
  const image = new Image()
  image.alt = `${side.heading}，浏览器生成的合成文字图片`
  image.width = 420
  image.height = 195
  image.src = canvas.toDataURL('image/png')
  document.getElementById('images')?.append(image)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('无法生成测试图片'))))
  })
}

const button = document.querySelector<HTMLButtonElement>('#run')
const output = document.querySelector<HTMLOutputElement>('#result')
button?.addEventListener('click', async () => {
  if (!button || !output) return
  button.disabled = true
  output.textContent = '正在本地识别'
  try {
    const results = []
    for (const side of sides) {
      const image = await drawSyntheticText(side)
      const recognized = await recognizeImageTextLocally(image)
      results.push({
        side: side.side,
        imageBytes: image.size,
        text: recognized.text,
        confidence: recognized.confidence,
        proposal: parseLocalDriverDocumentOcr(recognized.text, side.side, recognized.confidence)
      })
    }
    output.textContent = JSON.stringify(results)
  } catch (error) {
    output.textContent = JSON.stringify({
      error: error instanceof Error ? error.message : '识别失败'
    })
  } finally {
    button.disabled = false
  }
})
