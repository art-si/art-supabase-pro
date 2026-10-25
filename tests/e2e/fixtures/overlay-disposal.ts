import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

type OverlayApi = ArtDialogExpose<{ id: string }> | ArtDrawerExpose<{ id: string }>
const params = new URLSearchParams(location.search)
const isDrawer = params.get('kind') === 'drawer'
const phase = params.get('phase') ?? 'open'
const mounted = ref(true)
const overlay = ref<OverlayApi>()
const errors = ref(0)
const resets = ref(0)
const callbacks = ref(0)
const completions = ref(0)
const retainedRecord = ref('')
let retainedApi: OverlayApi | undefined
let rejectPending: ((error: Error) => void) | undefined
const waitForFailure = () => {
  callbacks.value++
  return new Promise<void>((_resolve, reject) => {
    rejectPending = reject
  })
}
const open = async () => {
  retainedApi = overlay.value
  await overlay.value?.handleOpen(
    { id: '待处理草稿' },
    {
      title: '公共弹层卸载验收',
      onOpen: phase === 'open' ? waitForFailure : undefined,
      onConfirm: phase === 'confirm' ? waitForFailure : undefined,
      onClose: phase === 'close' ? waitForFailure : undefined
    }
  )
  completions.value++
}
const control = (label: string, action: () => unknown) =>
  h('button', { type: 'button', onClick: action }, label)
const output = (label: string, value: number) => h('output', { 'aria-label': label }, String(value))
const app = createApp({
  render: () =>
    h('main', [
      h(
        'div',
        {
          style: {
            position: 'fixed',
            bottom: '8px',
            left: '8px',
            maxWidth: 'calc(100% - 16px)',
            zIndex: 10000,
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px'
          }
        },
        [
          control('打开待处理草稿', open),
          control('请求确认', () => overlay.value?.handleConfirm()),
          control('请求关闭', () => overlay.value?.handleClose()),
          control('切换挂载', () => {
            mounted.value = !mounted.value
          }),
          control('结束旧请求', () => rejectPending?.(new Error('controlled pending failure'))),
          control('调用旧实例', async () => {
            await retainedApi?.handleOpen(
              { id: '旧实例重试' },
              {
                onOpen: () => {
                  callbacks.value++
                }
              }
            )
            retainedApi?.handleReset()
            retainedRecord.value = retainedApi?.getData().id ?? ''
          }),
          control('打开新草稿', () =>
            overlay.value?.handleOpen({ id: '新草稿' }, { title: '新草稿', onConfirm: () => false })
          ),
          output('回调次数', callbacks.value),
          output('错误次数', errors.value),
          output('重置次数', resets.value),
          output('打开完成次数', completions.value),
          h('output', { 'aria-label': '旧实例数据' }, retainedRecord.value)
        ]
      ),
      mounted.value
        ? h(
            isDrawer ? ArtDrawer : ArtDialog,
            {
              ref: overlay,
              onError: () => errors.value++,
              onReset: () => resets.value++
            },
            {
              default: ({ data }: { data: { id: string } }) => [
                h('p', data.id),
                h('input', { 'aria-label': '草稿备注', value: '保留草稿内容' })
              ]
            }
          )
        : null
    ])
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { render: () => h('div') } }]
  })
)
setupGlobDirectives(app)
app.mount('#overlay-disposal-preview')
