import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElDrawer, ElScrollbar } from 'element-plus'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import OrganizationScopeFilter from '@/views/system/shared/organization-scope-filter.vue'
import ProductionWorkCenterNavigator from '@/components/business/production-work-center-navigator/index.vue'
import WebsiteConfig from '@/views/system/website-config/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.uiScope = 'workspace'
document.documentElement.dataset.boxMode = query.get('box') || 'border-mode'
document.documentElement.classList.toggle('dark', query.get('theme') === 'dark')
document.documentElement.style.setProperty('--custom-radius', '10px')

function organization(
  id: string,
  organizationName: string,
  scopeCount: number,
  parentId: string | null = null
): Api.SystemManage.OrganizationScopeFilterItem {
  return {
    id,
    tenantId: 'navigation-fixture-tenant',
    parentId,
    organizationName,
    organizationCode: id.toUpperCase(),
    organizationType: parentId ? 'department' : 'company',
    status: '1',
    sort: 0,
    isSystem: false,
    scopeCount
  }
}
const organizations = [
  {
    ...organization('company-a', '导航验收公司', 2),
    children: [organization('eng', '工程技术部门', 3, 'company-a')]
  },
  organization('company-b', '导航验收第二公司', 7),
  ...Array.from({ length: 28 }, (_, index) =>
    organization(`branch-${index}`, `分支机构 ${index + 1}`, 1)
  )
]

const app = createApp({
  setup() {
    if (query.get('page') === 'website') {
      return () =>
        h('main', { id: 'app-main' }, [
          h(ElScrollbar, { class: 'app-main__scrollbar', wrapClass: 'app-main__scroll-wrap' }, () =>
            h(WebsiteConfig, { class: 'website-fixture-page' })
          )
        ])
    }
    const selectedKey = ref('__all_organizations__')
    const includeDescendants = ref(true)
    const scopeType = ref<'user' | 'role' | 'employee' | 'position'>('user')
    const loading = ref(false)
    const empty = ref(false)
    const refreshes = ref(0)
    const drawerOpen = ref(false)
    const filterProps = () => ({
      data: empty.value ? [] : organizations,
      selectedKey: selectedKey.value,
      includeDescendants: includeDescendants.value,
      scopeType: scopeType.value,
      loading: loading.value,
      onSelect: (key: string) => (selectedKey.value = key),
      'onUpdate:includeDescendants': (value: boolean) => (includeDescendants.value = value),
      onRefresh: () => refreshes.value++
    })
    const control = (label: string, onClick: () => void) =>
      h('button', { type: 'button', onClick }, label)
    return () => [
      h('nav', { class: 'navigation-card-controls', 'aria-label': '导航验收控制' }, [
        ...(['user', 'role', 'employee', 'position'] as const).map((type) =>
          control(`范围 ${type}`, () => (scopeType.value = type))
        ),
        control('切换空组织', () => (empty.value = !empty.value)),
        control('切换组织加载', () => (loading.value = !loading.value)),
        control('打开组织抽屉', () => (drawerOpen.value = true)),
        h('output', { 'aria-label': '组织刷新次数' }, String(refreshes.value)),
        h('output', { 'aria-label': '已选组织键' }, selectedKey.value)
      ]),
      h('div', { class: 'navigation-card-grid' }, [
        h('div', { class: 'navigation-card-panel' }, [h(OrganizationScopeFilter, filterProps())]),
        h('div', { class: 'navigation-card-panel' }, [
          h(ProductionWorkCenterNavigator, {
            workshops: [{ id: 'workshop', name: '验收车间', code: 'WS', path: '验收车间' }],
            workCenters: Array.from({ length: 30 }, (_, index) => ({
              id: `center-${index}`,
              code: `WC-${index}`,
              name: `工作中心 ${index + 1}`
            })),
            selectedWorkshopId: 'workshop',
            selectedWorkCenterId: '',
            loading: false,
            error: '',
            showAllWorkCenters: true
          })
        ])
      ]),
      h(
        ElDrawer,
        {
          modelValue: drawerOpen.value,
          'onUpdate:modelValue': (value: boolean) => (drawerOpen.value = value),
          title: '组织范围抽屉',
          size: 340,
          appendToBody: true,
          bodyStyle: { padding: '0' }
        },
        () => h(OrganizationScopeFilter, filterProps())
      )
    ]
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'navigation-fixture-user',
  tenantId: 'navigation-fixture-tenant',
  platformSuper: false
})
app.mount('#navigation-card-fixture')
