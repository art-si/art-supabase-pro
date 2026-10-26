import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import LeaveOrganizationNavigator from '../../../modules/art-supabase-smis/src/views/basic-data/leave-information/modules/organization-navigator.vue'
import RiskOrganizationNavigator from '../../../modules/art-supabase-smis/src/views/basic-data/position-risk-list/modules/organization-navigator.vue'
import HazardousCategoryNavigator from '../../../modules/art-supabase-smis/src/views/hazardous-waste-management/hazardous-waste-catalog/modules/category-navigator.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const LONG_NAME = '测试超长组织或分类名称用于验证树节点在窄屏下保持截断且不会撑开整个页面布局'
const parameters = new URLSearchParams(location.search)
const kind = parameters.get('kind') ?? 'leave'
const organizationTree = [
  {
    id: 'org-root',
    parentId: null,
    organizationCode: 'ORG-ROOT',
    organizationName: '测试公司',
    organizationType: 'company',
    children: [
      {
        id: 'org-long',
        parentId: 'org-root',
        organizationCode: 'ORG-LONG',
        organizationName: LONG_NAME,
        organizationType: 'department',
        children: []
      },
      {
        id: 'org-other',
        parentId: 'org-root',
        organizationCode: 'ORG-OTHER',
        organizationName: '其他部门',
        organizationType: 'department',
        children: []
      }
    ]
  }
]
const categoryTree = [
  {
    id: 'category-root',
    parentId: null,
    categoryCode: 'CAT-ROOT',
    categoryName: '危废总类',
    sort: 1,
    status: 'enabled',
    catalogCount: 0,
    children: [
      {
        id: 'category-long',
        parentId: 'category-root',
        categoryCode: 'CAT-LONG',
        categoryName: LONG_NAME,
        sort: 2,
        status: 'enabled',
        catalogCount: 0,
        children: []
      },
      {
        id: 'category-other',
        parentId: 'category-root',
        categoryCode: 'CAT-OTHER',
        categoryName: '其他分类',
        sort: 3,
        status: 'enabled',
        catalogCount: 0,
        children: []
      }
    ]
  }
]

const app = createApp({
  setup() {
    const setting = useSettingStore()
    const theme = parameters.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
    setting.setGlobalTheme(theme, theme)
    setting.boxBorderMode = true
    initializeTheme()

    const selectedKey = ref(kind === 'risk' ? 'org-long' : 'all')
    const component =
      kind === 'risk'
        ? RiskOrganizationNavigator
        : kind === 'category'
          ? HazardousCategoryNavigator
          : LeaveOrganizationNavigator
    const data = kind === 'category' ? categoryTree : organizationTree

    return () =>
      h('main', { class: 'tree-frame' }, [
        h(component, {
          data,
          loading: false,
          error: null,
          selectedKey: selectedKey.value,
          onSelect: (key: string) => {
            selectedKey.value = key
          }
        }),
        h(
          'output',
          { 'data-testid': 'selected-key', style: { display: 'none' } },
          selectedKey.value
        )
      ])
  }
})

app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
setupGlobDirectives(app)
app.mount('#tree-preview')
