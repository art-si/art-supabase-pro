import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Auditor from '@fms/views/settlement/waybill-cost/modules/waybill-cost-audit-drawer.vue'
import Ocr from '@fms/views/settlement/invoice-management/modules/invoice-ocr-panel.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const auditor = ref<InstanceType<typeof Auditor>>()
const isAudit = new URLSearchParams(location.search).get('mode') === 'audit'
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'p-4' },
      isAudit
        ? [
            h(
              'button',
              {
                onClick: () =>
                  void auditor.value?.handleOpen({ costId: 'test-cost', waybillNo: 'AUDIT-001' })
              },
              '打开费用审核'
            ),
            h(Auditor, { ref: auditor })
          ]
        : h(Ocr, {
            modelValue: [
              'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
            ],
            direction: 'input',
            resourceTenantId: 'test-tenant'
          })
    )
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'ai-money-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#ai-money')
