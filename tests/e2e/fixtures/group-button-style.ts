import { createApp, defineAsyncComponent, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode') || 'shared'
const component = defineAsyncComponent(
  mode === 'bom'
    ? () => import('@mdm/views/engineering/bom-maintenance/modules/bom-group-panel.vue')
    : mode === 'warehouse'
      ? () =>
          import('@mdm/views/inventory-master/warehouse-definition/modules/warehouse-group-panel.vue')
      : mode === 'category'
        ? () =>
            import('@mdm/views/material-master/material-category/modules/category-tree-panel.vue')
        : mode === 'industry'
          ? () => import('@mdm/views/engineering/component-type/index.vue')
          : () => import('@/components/business/master-group-panel/index.vue')
)
const selectedId = ref('')
const groups = [
  {
    id: 'group-0',
    tenantId: 'test-tenant',
    domain: mode === 'warehouse' ? 'warehouse' : 'material',
    parentId: null,
    code: 'STYLE-01',
    name: '样式验证分组',
    sort: 0,
    enabled: true,
    remark: ''
  }
]
const categories = groups.map((group) => ({
  id: group.id,
  tenantId: group.tenantId,
  parentId: null,
  categoryCode: group.code,
  categoryName: group.name,
  sort: group.sort,
  enabled: true
}))
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
const app = createApp({
  setup: () => () =>
    h(
      'main',
      {
        class: 'art-page-view p-4',
        style: '--art-full-height: calc(100dvh - 32px)'
      },
      mode === 'industry'
        ? h(component)
        : h(
            'div',
            {
              style: 'width: min(100%, 340px); height: 620px'
            },
            [
              h(component, {
                title: '样式验证分组',
                groups,
                categories,
                selectedId: selectedId.value,
                loading: false,
                error: mode === 'bom' ? null : '',
                navigationOnly: true,
                onSelect: (group: string | { id: string } | undefined) => {
                  selectedId.value = typeof group === 'string' ? group : group?.id || ''
                }
              })
            ]
          )
    )
})
app.use(store)
app.use(language)
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'style-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
await router.push('/mdm/engineering/component-type')
await router.isReady()
app.mount('#app')
