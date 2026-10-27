import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import VehicleInsuranceDialog from '@vms/views/vehicle-manage/vehicle-insurance/modules/vehicle-insurance-dialog.vue'
import VehicleArchiveEdit from '@vms/views/vehicle-archive-edit/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const scenario = new URLSearchParams(location.search).get('scenario')
const tenantId = '11111111-1111-4111-8111-111111111111'
const insuranceRef = ref<InstanceType<typeof VehicleInsuranceDialog>>()
const existingInsurance = {
  id: 'insurance-1',
  tenantId,
  fieldAccess: { documents: 'edit' },
  attachments: [
    { name: '旧保单', url: 'https://example.invalid/shared.pdf', fileType: 'pdf' },
    { name: '新保单', url: 'https://example.invalid/shared.pdf', fileType: 'pdf' }
  ]
} as Api.Vms.VehicleManage.VehicleInsurance

const app = createApp({
  render: () =>
    scenario === 'archive'
      ? h('main', { class: 'art-page-view', style: { padding: '16px' } }, [h(VehicleArchiveEdit)])
      : h('main', { class: 'art-page-view', style: { padding: '16px' } }, [
          h(
            'button',
            {
              type: 'button',
              onClick: () => void insuranceRef.value?.handleOpen(existingInsurance)
            },
            '编辑保险'
          ),
          h(VehicleInsuranceDialog, { ref: insuranceRef })
        ])
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/vms/vehicle-archive-edit/:id', component: {} }
  ]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'attachment-test', tenantId, platformSuper: true })
const tenantScope = useTenantScopeStore(store)
tenantScope.tenantOptions = [{ id: tenantId, tenantCode: 'A', tenantName: '测试租户' }]
tenantScope.setTenantScope(tenantId)
await router.push(scenario === 'archive' ? '/vms/vehicle-archive-edit/archive-1' : '/')
await router.isReady()
app.mount('#app')
