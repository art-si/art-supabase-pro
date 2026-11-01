import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { setupGlobDirectives } from '@/directives'
import AccessoryProcessing from '@mdm/views/engineering/accessory-processing/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const tenantId = '11111111-1111-4111-8111-111111111111'
const app = createApp({
  render: () => h(ElConfigProvider, { locale: zhCn }, () => h(AccessoryProcessing))
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({ userId: 'recognition-test', tenantId, platformSuper: true } as Api.Auth.UserInfo)
const scope = useTenantScopeStore(store)
scope.tenantOptions = [
  { id: tenantId, tenantCode: 'TEST', tenantName: '验收租户', builtinType: 'business' }
]
scope.scopeOwnerUserId = 'recognition-test'
scope.setTenantScope(tenantId)
user.setDictMap({
  mdmMaterialSource: [{ label: '自制', value: 'self_made' }],
  mdmAccessoryCodingFilter: [
    { label: '全部编码状态', value: 'all' },
    { label: '待编码', value: 'pending' },
    { label: '已编码', value: 'coded' }
  ]
})
const settings = useSettingStore(store)
const theme =
  new URLSearchParams(location.search).get('theme') === 'dark'
    ? SystemThemeEnum.DARK
    : SystemThemeEnum.LIGHT
settings.setGlobalTheme(theme, theme)
initializeTheme()
await router.push('/')
await router.isReady()
app.mount('#app')
