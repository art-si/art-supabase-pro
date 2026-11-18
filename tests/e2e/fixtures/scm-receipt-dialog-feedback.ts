import { createApp, defineComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import type { ScmReceiptTargetLine } from '@/api/scm-receipt-target'
import ReceiptSerialDialog from '@/components/business/scm-receipt-target-workspace/modules/receipt-serial-dialog.vue'
import ReceiptBinDialog from '@/components/business/scm-receipt-target-workspace/modules/receipt-bin-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const line: ScmReceiptTargetLine = {
  id: '22222222-2222-4222-8222-222222222222',
  sourceLineId: '33333333-3333-4333-8333-333333333333',
  lineSnapshot: {
    materialId: '44444444-4444-4444-8444-444444444444',
    materialCode: 'TEST-MATERIAL',
    materialDescription: '测试序列号物料',
    quantity: 2,
    stockQuantity: 2,
    stockUnit: '件',
    warehouseId: '55555555-5555-4555-8555-555555555555'
  },
  serialNos: [],
  serialManagementEnabled: true,
  amount: 20
}

const Preview = defineComponent({
  setup() {
    const serialDialog = ref<InstanceType<typeof ReceiptSerialDialog> | null>(null)
    const binDialog = ref<InstanceType<typeof ReceiptBinDialog> | null>(null)
    return () =>
      h('main', [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              void serialDialog.value?.handleOpen({ documentNo: 'TEST-RECEIPT-001', line })
          },
          '打开收料 SN'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              void binDialog.value?.handleOpen({ tenantId, documentNo: 'TEST-RECEIPT-001', line })
          },
          '打开入库库位'
        ),
        h(ReceiptSerialDialog, { ref: serialDialog }),
        h(ReceiptBinDialog, { ref: binDialog })
      ])
  }
})

const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(Preview)) })
app.use(store)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)

useUserStore(store).setUserInfo({
  userId: '66666666-6666-4666-8666-666666666666',
  tenantId,
  tenant: { tenantCode: 'visual-test', tenantName: '视觉验收业务租户' },
  platformSuper: false
})
useTenantScopeStore(store).selectedTenantId = tenantId
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'

app.mount('#scm-receipt-dialog-feedback-preview')
