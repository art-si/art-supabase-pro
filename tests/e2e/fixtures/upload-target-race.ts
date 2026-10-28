import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import UploadFile from '@/components/core/forms/art-upload-file/index.vue'
import UploadImage from '@/components/core/forms/art-upload-image/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantA = '11111111-1111-4111-8111-111111111111'
const tenantB = '22222222-2222-4222-8222-222222222222'
const query = new URLSearchParams(location.search)
const kind = query.get('kind') === 'image' ? 'image' : 'file'
const dark = query.get('theme') === 'dark'
document.documentElement.classList.toggle('dark', dark)
document.documentElement.dataset.theme = dark ? 'dark' : 'light'
document.documentElement.dataset.boxMode = query.get('box') || 'border-mode'

interface PendingUpload {
  id: number
  name: string
  target: string
  settled: boolean
  resolve: (value: Api.DataCenter.Resources.ResourceListItem[]) => void
  reject: (reason: Error) => void
}

const app = createApp({
  setup() {
    const target = ref(tenantA)
    const model = ref<string | string[]>([])
    const modelWrites = ref(0)
    const resourceChanges = ref(0)
    const pending = ref<PendingUpload[]>([])
    let sequence = 0

    const uploadRequest = (file: File): Promise<Api.DataCenter.Resources.ResourceListItem[]> =>
      new Promise((resolve, reject) => {
        pending.value.push({
          id: ++sequence,
          name: file.name,
          target: target.value,
          settled: false,
          resolve,
          reject
        })
      })

    const settle = (id: number, outcome: 'success' | 'foreign' | 'error') => {
      const request = pending.value.find((item) => item.id === id)
      if (!request || request.settled) return
      request.settled = true
      if (outcome === 'error') {
        request.reject(new Error(`旧上传失败 ${id}`))
        return
      }
      request.resolve([
        {
          url: `https://example.invalid/${kind}/${request.id}/${encodeURIComponent(request.name)}`,
          originName: request.name,
          tenantId:
            outcome === 'foreign'
              ? request.target === tenantA
                ? tenantB
                : tenantA
              : request.target
        }
      ])
    }
    const switchTarget = (tenantId: string) => {
      model.value = []
      target.value = tenantId
    }
    const uploadProps = () => ({
      modelValue: model.value,
      resourceTenantId: target.value,
      uploadRequest,
      multiple: true,
      limit: 8,
      showResourcePicker: false,
      'onUpdate:modelValue': (value: string | string[]) => {
        model.value = value
        modelWrites.value += 1
      },
      onResourceChange: () => {
        resourceChanges.value += 1
      }
    })

    return () =>
      h('main', { class: 'mx-auto grid max-w-xl gap-5 p-5', 'data-kind': kind }, [
        h('h1', { class: 'text-lg font-semibold' }, '附件租户切换竞态验收'),
        h('div', { class: 'flex gap-2' }, [
          h(
            'button',
            { type: 'button', 'data-testid': 'tenant-a', onClick: () => switchTarget(tenantA) },
            '选择 A 租户'
          ),
          h(
            'button',
            { type: 'button', 'data-testid': 'tenant-b', onClick: () => switchTarget(tenantB) },
            '选择 B 租户'
          )
        ]),
        h('output', { 'data-testid': 'target' }, target.value),
        h(kind === 'file' ? UploadFile : UploadImage, uploadProps()),
        h('output', { 'data-testid': 'model' }, JSON.stringify(model.value)),
        h('output', { 'data-testid': 'model-writes' }, String(modelWrites.value)),
        h('output', { 'data-testid': 'resource-changes' }, String(resourceChanges.value)),
        h(
          'div',
          { class: 'grid gap-2', 'data-testid': 'requests' },
          pending.value.map((request) =>
            h('div', { key: request.id, 'data-testid': `request-${request.id}` }, [
              h('span', `${request.name} · ${request.target}`),
              h(
                'button',
                {
                  type: 'button',
                  disabled: request.settled,
                  'data-testid': `resolve-${request.id}`,
                  onClick: () => settle(request.id, 'success')
                },
                '返回成功'
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: request.settled,
                  'data-testid': `foreign-${request.id}`,
                  onClick: () => settle(request.id, 'foreign')
                },
                '返回异租户'
              ),
              h(
                'button',
                {
                  type: 'button',
                  disabled: request.settled,
                  'data-testid': `reject-${request.id}`,
                  onClick: () => settle(request.id, 'error')
                },
                '返回失败'
              )
            ])
          )
        )
      ])
  }
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
useUserStore(store).setUserInfo({
  userId: 'upload-target-race',
  tenantId: tenantA,
  platformSuper: true
})
app.mount('#upload-target-race')
