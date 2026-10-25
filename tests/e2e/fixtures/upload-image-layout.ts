import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import UploadImage from '@/components/core/forms/art-upload-image/index.vue'
import UploadFile from '@/components/core/forms/art-upload-file/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', query.get('theme') === 'dark')
document.documentElement.dataset.theme = query.get('theme') || 'light'
document.documentElement.dataset.boxMode = query.get('box') || 'border-mode'
const image =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#dbeafe"/><text x="25" y="65" fill="#1e3a8a">测试图片</text></svg>'
  )

const app = createApp({
  setup() {
    const uploaded = ref<string | string[]>('')
    const multi = ref<string | string[]>([image])
    const uploadRequest = async (
      file: File
    ): Promise<Api.DataCenter.Resources.ResourceListItem[]> => {
      await new Promise((resolve) => setTimeout(resolve, 500))
      if (file.name.includes('fail')) throw new Error('fixture upload failed')
      return [{ url: image, originName: file.name, tenantId: 'test-tenant' }]
    }
    return () =>
      h('main', { class: 'p-4 grid gap-6', style: 'max-width: 560px' }, [
        ...['empty', 'single', 'multiple', 'readonly', 'disabled', 'wide'].map((mode) =>
          h('section', { 'data-mode': mode }, [
            h('h2', { class: 'mb-2 text-sm' }, mode),
            h(UploadImage, {
              modelValue:
                mode === 'empty' ? uploaded.value : mode === 'multiple' ? multi.value : image,
              'onUpdate:modelValue': (value: string | string[]) => {
                if (mode === 'empty') uploaded.value = value
                if (mode === 'multiple') multi.value = value
              },
              multiple: mode === 'multiple',
              limit: 3,
              readonly: mode === 'readonly',
              disabled: mode === 'disabled',
              width: mode === 'wide' ? '100%' : undefined,
              resourceTenantId: 'test-tenant',
              uploadRequest
            })
          ])
        ),
        h('section', { 'data-mode': 'file' }, [
          h('h2', { class: 'mb-2 text-sm' }, '附件'),
          h(UploadFile, {
            modelValue: 'https://example.invalid/long-report.pdf',
            fileName: '用于验证窄屏的很长的附件名称_验收报告与附件资料_2026.pdf',
            resourceTenantId: 'test-tenant'
          })
        ])
      ])
  }
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
useUserStore(store).setUserInfo({
  userId: 'upload-layout-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#upload-layout')
