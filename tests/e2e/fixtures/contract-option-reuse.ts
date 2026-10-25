import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import ContractDialog from '../../../modules/art-supabase-tms/src/views/basic-data/contract/modules/contract-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<InstanceType<typeof ContractDialog>>()
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        { type: 'button', onClick: () => void dialog.value?.handleOpen() },
        '打开合同验收'
      ),
      h(ContractDialog, { ref: dialog })
    ])
})
app.use(store)
useUserStore(store).setUserInfo({
  userId: 'option-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: true
})
useUserStore(store).setDictMap({
  tmsContractBusinessType: [
    { code: 'carrier', status: '1', name: '承运商合同', label: '承运商合同', value: 'carrier' },
    {
      code: 'customer',
      status: '1',
      name: '企业/货主端合同',
      label: '企业/货主端合同',
      value: 'customer'
    }
  ],
  tmsContractTransportMode: [
    { code: 'road', status: '1', name: '公路', label: '公路', value: 'road' }
  ]
})
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#contract-preview')
