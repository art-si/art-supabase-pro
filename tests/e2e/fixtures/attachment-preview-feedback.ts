import { createApp, h } from 'vue'
import ArtAttachmentLink from '@/components/core/media/art-file-viewer/attachment-link.vue'
import { downloadBlob, downloadFile } from '@/utils/file'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const boundary = params.get('mode') === 'boundary'
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode =
  params.get('box') === 'shadow-mode' ? 'shadow-mode' : 'border-mode'
const pngBytes = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5u0AAAAASUVORK5CYII='
  ),
  (character) => character.charCodeAt(0)
)
const sameOriginBlobUrl = boundary
  ? URL.createObjectURL(new Blob([pngBytes], { type: 'image/png' }))
  : ''
const boundaryFiles = [
  { name: '空地址', url: '' },
  { name: '井号地址', url: '#blocked' },
  { name: '脚本地址', url: 'javascript:window.__unsafeExecuted=true' },
  { name: '数据地址', url: 'data:image/png;base64,aGVsbG8=' },
  { name: '本地文件地址', url: 'file:///private/attachment.pdf' },
  { name: '邮件地址', url: 'mailto:test@example.invalid' },
  { name: '异源 Blob 地址', url: 'blob:https://foreign.invalid/12345678' },
  { name: '相对图片', url: '/tests/e2e/fixtures/preview-safe.png' },
  { name: '本源 Blob 图片', url: sameOriginBlobUrl }
]

createApp({
  render: () =>
    h('main', { style: { padding: '24px', maxWidth: '100%', boxSizing: 'border-box' } }, [
      h('h1', '附件预览'),
      ...(boundary
        ? [
            ...boundaryFiles.map((file) =>
              h('div', { 'data-file-name': file.name, style: { marginBottom: '8px' } }, [
                h(ArtAttachmentLink, { file })
              ])
            ),
            h('output', { 'data-testid': 'same-origin-blob-url', hidden: true }, sameOriginBlobUrl),
            h(
              'button',
              { type: 'button', onClick: () => downloadFile('javascript:alert(1)') },
              '无效下载'
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () => downloadFile('/tests/e2e/fixtures/preview-safe.txt', 'relative.txt')
              },
              'HTTP 下载'
            ),
            h(
              'button',
              {
                type: 'button',
                onClick: () =>
                  downloadBlob(
                    new Blob(['blob download bytes'], { type: 'text/plain' }),
                    'blob.txt'
                  )
              },
              'Blob 下载'
            )
          ]
        : [
            h(ArtAttachmentLink, {
              file: { url: 'https://example.invalid/receipt.pdf', name: '验收凭证.pdf' }
            })
          ])
    ])
}).mount('#attachment-preview')
