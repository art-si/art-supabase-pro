import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useUserStore } from '@/store/modules/user'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import InvoiceAuditor from '@fms/views/settlement/invoice-management/modules/invoice-compliance-audit-drawer.vue'
import CostAuditor from '@fms/views/settlement/waybill-cost/modules/waybill-cost-audit-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const mode = params.get('mode') === 'invoice' ? 'invoice' : 'cost'
const levels = ['high', 'medium', 'low'] as const
const app = createApp({
  setup() {
    const invoice = ref<InstanceType<typeof InvoiceAuditor>>()
    const cost = ref<InstanceType<typeof CostAuditor>>()
    return () =>
      h('main', { class: 'flex flex-wrap gap-2 p-4' }, [
        ...levels.map((level) =>
          h(
            'button',
            {
              type: 'button',
              onClick: () =>
                mode === 'invoice'
                  ? void invoice.value?.handleOpen({
                      invoiceId: `audit-invoice-${level}`,
                      invoiceRecordNo: `INV-${level}`
                    })
                  : void cost.value?.handleOpen({
                      costId: `audit-cost-${level}`,
                      waybillNo: `WB-${level}`
                    })
            },
            `打开${level}审核`
          )
        ),
        mode === 'invoice' ? h(InvoiceAuditor, { ref: invoice }) : h(CostAuditor, { ref: cost })
      ])
  }
})

app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
const settings = useSettingStore(store)
settings.systemThemeType =
  params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
settings.systemThemeMode = settings.systemThemeType
settings.boxBorderMode = params.get('box') !== 'shadow'
initializeTheme()
document.documentElement.dataset.boxMode = settings.boxBorderMode ? 'border-mode' : 'shadow-mode'
useUserStore(store).setUserInfo({
  userId: 'fms-audit-scss-user',
  tenantId: 'fms-audit-scss-tenant',
  platformSuper: false
})
app.mount('#fms-audit-scss-reuse')
