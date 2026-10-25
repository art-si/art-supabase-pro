import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import MasterDialog from '@mdm/views/components/operational-master/modules/master-dialog.vue'
import ReferenceDialog from '@mdm/views/components/material-reference/modules/reference-dialog.vue'
import ReferencePage from '@mdm/views/components/material-reference/index.vue'
import SupplyCodeDialog from '@mdm/views/components/inventory-configuration/modules/supply-chain-code-rule-dialog.vue'
import { resolveMasterConfig } from '@mdm/views/components/operational-master/modules/master-config'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const referenceList = new URLSearchParams(location.search).get('mode') === 'reference-list'
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof MasterDialog>>()
    const reference = ref<InstanceType<typeof ReferenceDialog>>()
    const supplyCode = ref<InstanceType<typeof SupplyCodeDialog>>()
    if (referenceList) return () => h(ReferencePage)
    return () =>
      h('main', { class: 'p-4' }, [
        ...['project', 'operation'].map((kind) =>
          h(
            'button',
            {
              type: 'button',
              class: 'm-2',
              onClick: () =>
                dialog.value?.handleOpen({
                  config: resolveMasterConfig(`/mdm/${kind}`),
                  tenantId: 'test-tenant',
                  tenantOptions: [{ label: '测试租户', value: 'test-tenant' }],
                  groups: []
                })
            },
            `打开${kind}`
          )
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              reference.value?.handleOpen({
                kind: 'code-rule',
                tenantId: 'test-tenant',
                tenantOptions: [{ label: '测试租户', value: 'test-tenant' }]
              })
          },
          '打开编码规则'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              supplyCode.value?.handleOpen({
                row: {
                  id: 'test-code-rule',
                  tenantId: 'test-tenant',
                  ruleCode: 'TEST',
                  ruleName: '测试编码规则',
                  exampleCode: '',
                  applyBatch: true,
                  applySerial: false,
                  applyTracking: false,
                  perMaterial: true,
                  separator: '',
                  status: 'enabled',
                  segments: [
                    {
                      attributeCode: 'DATE',
                      useMode: 'full',
                      format: 'YYYYMM',
                      configuredValue: '',
                      length: null,
                      step: 1,
                      paddingChar: '0',
                      padDirection: 'left',
                      truncate: false,
                      sequenceSource: false,
                      sort: 1,
                      attribute: {
                        attributeCode: 'DATE',
                        attributeName: '日期',
                        attributeType: 'date',
                        sort: 1,
                        enabled: true
                      }
                    }
                  ]
                }
              })
          },
          '打开供应链规则'
        ),
        h(SupplyCodeDialog, { ref: supplyCode }),
        h(ReferenceDialog, { ref: reference }),
        h(MasterDialog, { ref: dialog })
      ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'dynamic-options-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList([
  { name: 'MdmMaterialType:View', path: '', type: 'button', meta: { title: '测试权限' } }
])
await router.push(referenceList ? '/mdm/material-master/material-type' : '/')
await router.isReady()
app.mount('#app')
