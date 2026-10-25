import { createApp } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import EquipmentDialog, {
  type EquipmentLedgerDialogOpenData
} from '../../../modules/art-supabase-smis/src/views/equipment-ledger/equipment-ledger/modules/equipment-ledger-dialog.vue'
import type { SmisEquipment } from '../../../modules/art-supabase-smis/src/api/types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp(EquipmentDialog)
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: '22222222-2222-4222-8222-222222222222',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
} as Api.Auth.UserInfo)

// Vue's runtime public instance omits defineExpose from createApp's return type.
const dialog = app.mount('#equipment-preview') as unknown as {
  handleOpen: (data: EquipmentLedgerDialogOpenData) => Promise<void>
}
void dialog.handleOpen({
  row: {
    id: '33333333-3333-4333-8333-333333333333',
    categoryId: 'boiler-category',
    equipmentCode: 'BOILER-001',
    equipmentName: '测试锅炉',
    pressureGaugeIds: [
      '44444444-4444-4444-8444-444444444444',
      '44444444-4444-4444-8444-444444444444'
    ],
    safetyValveIds: ['55555555-5555-4555-8555-555555555555']
  } as SmisEquipment,
  categoryTree: [
    {
      id: 'boiler-category',
      categoryCode: 'B',
      categoryName: '锅炉',
      profileType: 'boiler',
      status: 'enabled',
      sort: 1
    },
    {
      id: 'gauge-category',
      categoryCode: 'G',
      categoryName: '压力表',
      profileType: 'pressure_gauge',
      status: 'enabled',
      sort: 2
    },
    {
      id: 'valve-category',
      categoryCode: 'V',
      categoryName: '安全阀',
      profileType: 'safety_valve',
      status: 'enabled',
      sort: 3
    }
  ],
  locationTree: []
})
