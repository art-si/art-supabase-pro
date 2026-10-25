import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
import OcrPanel from '@fms/views/settlement/waybill-cost/modules/expense-ocr-panel.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const dialog = ref<ArtDialogExpose<{ id: string }>>()
    const images = ref(['https://synthetic.invalid/receipt-a.png'])
    const applied = ref('')
    const failed = ref(0)
    const open = (id = 'A') =>
      dialog.value?.handleOpen({ id }, { title: `识别会话-${id}`, showConfirmButton: false })
    return () =>
      h('main', { class: 'min-h-screen p-4' }, [
        h('button', { onClick: () => void open() }, '打开识别会话'),
        h(
          ArtDialog,
          { ref: dialog },
          {
            default: () => [
              h('div', { class: 'mb-4 flex gap-4' }, [
                h('button', { onClick: () => void open('B') }, '切换单据'),
                h(
                  'button',
                  {
                    onClick: () => {
                      images.value = ['https://synthetic.invalid/receipt-b.png']
                    }
                  },
                  '更换票据'
                )
              ]),
              h(OcrPanel, {
                modelValue: images.value,
                'onUpdate:modelValue': (value: string[]) => {
                  images.value = value
                },
                enabled: true,
                resourceTenantId: '11111111-1111-4111-8111-111111111111',
                onApply: (value: Api.Fms.WaybillExpenseOcrAnalyzeResponse) => {
                  applied.value = value.artifactId
                },
                onFailed: () => failed.value++
              })
            ]
          }
        ),
        h('output', { 'data-testid': 'applied-artifact', hidden: true }, applied.value),
        h('output', { 'data-testid': 'failed-count', hidden: true }, String(failed.value))
      ])
  }
})
app
  .use(store)
  .use(language)
  .use(
    createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: { render: () => null } }]
    })
  )
setupGlobDirectives(app)
app.mount('#app')
