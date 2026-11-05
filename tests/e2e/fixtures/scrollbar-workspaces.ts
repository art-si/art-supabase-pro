import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import ProjectAssistantObjectBrowser from '@/views/data-center/supabase-ai-assistant/modules/project-assistant-object-browser.vue'
import ProjectAssistantObjectDetail from '@/views/data-center/supabase-ai-assistant/modules/project-assistant-object-detail.vue'
import DashboardTransit from '@/views/dashboard/console/modules/dashboard-transit.vue'
import DashboardRecentOrders from '@/views/dashboard/console/modules/dashboard-recent-orders.vue'
import type { ProjectDatabaseObject, ProjectObjectDetail } from '@/types/supabase-ai-assistant'
import type { DashboardOrder } from '@/api/dashboard'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const isDark = new URLSearchParams(location.search).has('dark')
document.documentElement.classList.toggle('dark', isDark)
document.documentElement.dataset.theme = isDark ? 'dark' : 'light'

const selectedObject: ProjectDatabaseObject = {
  schemaName: 'public',
  objectName: 'test_logistics_orders',
  objectType: 'table',
  description: '脱敏测试对象：用于验证滚动区域与字段说明。'
}
const objects: ProjectDatabaseObject[] = Array.from({ length: 28 }, (_, index) => ({
  schemaName: 'public',
  objectName: `test_table_${String(index + 1).padStart(2, '0')}`,
  objectType: 'table',
  description: `第 ${index + 1} 个脱敏测试对象`
}))
const detail: ProjectObjectDetail = {
  ...selectedObject,
  ddl: [
    'create table public.test_logistics_orders (',
    ...Array.from({ length: 56 }, (_, index) => `  test_field_${index + 1} text,`),
    '  id uuid primary key',
    ');'
  ].join('\n'),
  columns: Array.from({ length: 36 }, (_, index) => ({
    name: `test_field_${index + 1}`,
    dataType: 'text',
    nullable: true,
    description: `测试字段 ${index + 1}`
  }))
}
const relationships = Array.from({ length: 24 }, (_, index) => ({
  constraintName: `test_relationship_${index + 1}`,
  sourceSchema: 'public',
  sourceTable: 'test_logistics_orders',
  sourceColumns: [`test_field_${index + 1}`],
  targetSchema: 'public',
  targetTable: `test_reference_${index + 1}`,
  targetColumns: ['id'],
  definition: `foreign key (test_field_${index + 1}) references test_reference_${index + 1}(id)`
}))
const orders: DashboardOrder[] = Array.from({ length: 16 }, (_, index) => ({
  id: `test-order-${index + 1}`,
  orderNo: `TEST-${String(index + 1).padStart(4, '0')}`,
  orderStatus: index % 2 ? 'transporting' : 'pending_order',
  originStation: '测试始发站',
  destinationStation: '测试目的站',
  shippingCustomerName: '脱敏测试客户',
  dispatchPlateNo: '测试车辆',
  dispatchDriverName: '测试司机',
  totalFee: 1200 + index * 10
}))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
const app = createApp({
  render: () =>
    h('main', { class: 'scrollbar-workspaces-preview' }, [
      h('section', { class: 'scrollbar-assistant-preview' }, [
        h(ProjectAssistantObjectBrowser, {
          focusMode: false,
          schemas: ['public'],
          objects,
          selectedObject,
          filters: { schema: 'all', objectType: 'all', keyword: '' },
          loading: false,
          loadSource: null,
          error: null
        }),
        h(ProjectAssistantObjectDetail, {
          selectedObject,
          detail,
          relationships,
          loading: { detail: false, relationships: false },
          errors: { detail: null, relationships: null },
          assistantMode: 'read_only',
          canEditDescription: false,
          chatSending: false
        })
      ]),
      h('section', { class: 'scrollbar-dashboard-preview' }, [
        h(DashboardTransit, { orders }),
        h(DashboardRecentOrders, { orders })
      ])
    ])
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
await router.push('/')
await router.isReady()
app.mount('#scrollbar-workspaces-preview')
