import { createApp, h } from 'vue'
import ArtAttachmentLink from '@/components/core/media/art-file-viewer/attachment-link.vue'
import 'element-plus/dist/index.css'

createApp({
  render: () =>
    h('main', { style: { padding: '24px', maxWidth: '100%', boxSizing: 'border-box' } }, [
      h('h1', '附件预览'),
      h(ArtAttachmentLink, {
        file: { url: 'https://example.invalid/receipt.pdf', name: '验收凭证.pdf' }
      })
    ])
}).mount('#attachment-preview')
