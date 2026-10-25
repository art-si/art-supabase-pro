import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import BomWorkspace from '../../../modules/art-supabase-mdm/src/views/engineering/bom-maintenance/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const actor = '11111111-1111-4111-8111-111111111111'
const target = '22222222-2222-4222-8222-222222222222'
const scope = new URLSearchParams(location.search).get('scope')
const deleteTest = new URLSearchParams(location.search).has('deleteTest')
const ordinary = scope?.startsWith('ordinary') ?? false
useUserStore(store).setUserInfo({
  userId: 'workspace-test',
  tenantId: actor,
  platformSuper: !ordinary
})
useTenantScopeStore(store).selectedTenantId =
  scope === 'all' || scope === 'ordinary'
    ? null
    : scope === 'selected' || scope === 'ordinary-forged'
      ? target
      : actor
useMenuStore(store).setButtonList(
  ['View', 'Add', 'ManageGroup', ...(deleteTest ? ['Delete'] : [])].map((action) => ({
    name: `MdmBomMaintenance:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
)
if (deleteTest) {
  const menu = useMenuStore(store)
  menu.setButtonList([
    ...menu.buttonList,
    { name: 'MdmAccessoryProcessing:View', path: '', type: 'button', meta: { title: '查看清单' } }
  ])
}
document.addEventListener('revoke-bom-delete', () => {
  const menu = useMenuStore(store)
  menu.setButtonList(menu.buttonList.filter((button) => button.name !== 'MdmBomMaintenance:Delete'))
})
document.addEventListener('revoke-bom-group-delete', () => {
  const menu = useMenuStore(store)
  menu.setButtonList(
    menu.buttonList.filter((button) => button.name !== 'MdmBomMaintenance:ManageGroup')
  )
})
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    {
      path: '/mdm/engineering/accessory-processing',
      component: {},
      name: 'MdmAccessoryProcessing'
    },
    { path: '/:pathMatch(.*)*', component: {}, name: 'MdmBomMaintenance' }
  ]
})
const app = createApp({
  render: () =>
    h(
      'main',
      {
        class: 'art-page-view flex h-screen min-h-0 flex-col gap-2 p-4',
        style: { '--art-full-height': '100vh' }
      },
      [
        h('button', { onClick: () => router.push('/away') }, '离开 BOM 页面'),
        h(
          'button',
          {
            onClick: () => {
              useTenantScopeStore(store).selectedTenantId = target
            }
          },
          '切换租户 B'
        ),
        h(BomWorkspace),
        deleteTest
          ? h(
              'output',
              { 'data-testid': 'bom-reference-navigation', hidden: true },
              JSON.stringify({
                path: router.currentRoute.value.path,
                query: router.currentRoute.value.query
              })
            )
          : null
      ]
    )
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.isReady()
app.mount('#bom-workspace')
