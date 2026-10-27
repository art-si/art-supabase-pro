import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import QuotationLineTable from '@scm/views/sales-document/modules/quotation-line-table.vue'
import type { ScmDocumentLine, ScmMaterialOption } from '@scm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const materials = ref<ScmMaterialOption[]>([
  {
    id: 'material-1',
    tenantId: 'tenant-test',
    materialCode: 'MAT-001',
    materialDescription: '辅助单位换算测试物料',
    baseUnitId: 'piece',
    auxiliaryUnitId: 'box',
    auxiliaryUnit: '箱',
    unitConversions: [{ sourceUnitId: 'box', sourceFactor: 1, baseFactor: 1 }]
  }
])
const lines = ref<ScmDocumentLine[]>([
  {
    lineId: 'line-1',
    materialId: 'material-1',
    materialCode: 'MAT-001',
    materialDescription: '辅助单位换算测试物料',
    quantity: 1.23449,
    unitPrice: 10,
    taxRate: 13,
    gift: false,
    discountMode: 'none',
    discountRate: 0
  }
])
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view min-w-0 p-4' }, [
      h(
        'button',
        {
          type: 'button',
          onClick: () => {
            const conversion = materials.value[0]?.unitConversions?.[0]
            if (conversion) conversion.baseFactor = Infinity
          }
        },
        '设置无效系数'
      ),
      h(QuotationLineTable, {
        lines: lines.value,
        'onUpdate:lines': (value: ScmDocumentLine[]) => (lines.value = value),
        materials: materials.value,
        disabled: false,
        contract: true,
        sourceOptions: [],
        taxRates: [],
        discountOptions: []
      })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'unit-test',
  tenantId: 'tenant-test',
  platformSuper: false
})
app.mount('#scm-unit-quantity')
