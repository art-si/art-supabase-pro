import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import Drawer from '@wms/views/production-inout/shared/production-material-drawer.vue'
import type { WmsProductionMaterialDocument } from '@wms/api/production-material.types'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = 'scope-tenant'
const document: WmsProductionMaterialDocument = {
  id: 'scope-document',
  tenantId,
  kind: 'finished_inbound',
  documentNo: 'TEST-IN-001',
  documentTypeId: '',
  businessTypeId: '',
  organizationId: 'scope-org',
  businessDate: '2026-10-23',
  warehouseId: 'scope-warehouse',
  workOrderId: 'order-004',
  projectId: null,
  customerId: null,
  demandDate: null,
  applicantId: null,
  departmentId: null,
  keeperId: null,
  status: 'draft',
  materialStatus: 'pending',
  remark: null,
  createdAt: '',
  updatedAt: '',
  approvedAt: null,
  lines: []
}
const app = createApp({
  setup() {
    const drawer = ref<InstanceType<typeof Drawer>>()
    return () =>
      h('main', [
        h(
          'button',
          { type: 'button', onClick: () => drawer.value?.handleOpen({ mode: 'edit', document }) },
          '打开完工入库单'
        ),
        h(Drawer, { ref: drawer, kind: 'finished_inbound' })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'scope-user', tenantId, platformSuper: true })
useTenantScopeStore(store).selectedTenantId = tenantId
app.mount('#app')
