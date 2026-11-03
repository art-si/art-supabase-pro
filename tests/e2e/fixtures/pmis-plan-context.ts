import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { mapValues } from 'lodash-es'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import PlanDialog from '@pmis/views/components/plan-dialog.vue'
import type { PmisPlan, PmisPlanKind } from '@pmis/api'
import { pmisPlanPermissions } from '@pmis/views/components/business-permissions'
import { dictionaries } from './form-standard-wms-pmis-dictionaries'
import { employee, equipment, plan, tenantId } from './form-standard-wms-pmis-data'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const kindParam = new URLSearchParams(location.search).get('kind')
const kind: PmisPlanKind =
  kindParam === 'patrol' || kindParam === 'maintenance' || kindParam === 'preventive'
    ? kindParam
    : 'inspection'
const schedule = new URLSearchParams(location.search).get('schedule')
const planA: PmisPlan = {
  ...plan,
  id: '44444444-4444-4444-8444-444444444441',
  planKind: kind,
  planName: '验收方案 A',
  frequency:
    schedule === 'monthly17'
      ? 'monthly'
      : schedule === 'yearly10'
        ? 'yearly'
        : kind === 'inspection'
          ? 'daily'
          : 'weekly',
  frequencyValue: schedule === 'monthly17' ? 17 : schedule === 'yearly10' ? 10 : null,
  holidayPolicy: 'postpone',
  status: 'enabled',
  equipmentBindings: [{ equipment: { ...equipment, status: 'enabled' } }],
  responsibleBindings: [{ employee }]
}
const planB: PmisPlan = {
  ...planA,
  id: '44444444-4444-4444-8444-444444444442',
  planName: '验收方案 B'
}

const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof PlanDialog>>()
    const openState = ref('idle')
    const successCount = ref(0)
    let openSequence = 0
    const openPlan = async (row: PmisPlan, copy = false): Promise<void> => {
      const sequence = ++openSequence
      openState.value = 'opening'
      await dialog.value?.handleOpen({
        kind,
        row,
        copy,
        tenantOptions: [{ label: '验收租户', value: tenantId }]
      })
      if (sequence === openSequence) openState.value = 'ready'
    }
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'art-page-view min-w-0 p-4' }, [
          h('div', { class: 'flex min-w-0 flex-wrap gap-2' }, [
            h(
              ElButton,
              { 'data-testid': 'open-a', onClick: () => void openPlan(planA) },
              () => '打开方案 A'
            ),
            h(
              ElButton,
              { 'data-testid': 'open-b', onClick: () => void openPlan(planB) },
              () => '打开方案 B'
            ),
            h(
              ElButton,
              { 'data-testid': 'open-copy', onClick: () => void openPlan(planA, true) },
              () => '复制方案 A'
            ),
            h(
              ElButton,
              { 'data-testid': 'switch-route', onClick: () => void router.replace('/other') },
              () => '切换测试路由'
            ),
            h(
              ElButton,
              {
                'data-testid': 'switch-tenant',
                onClick: () =>
                  user.setUserInfo({
                    userId: 'pmis-plan-context-user',
                    tenantId: '55555555-5555-4555-8555-555555555555',
                    platformSuper: false
                  })
              },
              () => '切换认证租户'
            ),
            h(
              ElButton,
              {
                'data-testid': 'revoke-edit',
                onClick: () =>
                  menu.setButtonList(
                    [permissions.add, permissions.copy].map((name) => ({
                      name,
                      path: '',
                      type: 'button',
                      meta: { title: name }
                    }))
                  )
              },
              () => '撤销方案编辑权限'
            )
          ]),
          h('output', { 'data-testid': 'open-state' }, openState.value),
          h('output', { 'data-testid': 'success-count' }, String(successCount.value)),
          h(PlanDialog, {
            workspaceKind: kind,
            ref: dialog,
            onSuccess: () => {
              successCount.value++
            }
          })
        ])
      )
  }
})

app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/other', component: {} }
  ]
})
app.use(router)
setupGlobDirectives(app)
const user = useUserStore(store)
user.setUserInfo({
  userId: 'pmis-plan-context-user',
  tenantId,
  platformSuper: false
})
const permissions = pmisPlanPermissions[kind]
const menu = useMenuStore(store)
menu.setButtonList(
  [permissions.add, permissions.edit, permissions.copy].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: name }
  }))
)
const scope = useTenantScopeStore(store)
scope.selectedTenantId = tenantId
const fixtureDictionaries = mapValues(
  {
    ...dictionaries,
    pmisPlanFrequency: [
      ...dictionaries.pmisPlanFrequency,
      { label: '每月', value: 'monthly' },
      { label: '每季度', value: 'quarterly' },
      { label: '每年', value: 'yearly' }
    ]
  },
  (options) =>
    options.map((item) => ({
      ...item,
      name: item.label,
      code: item.value,
      status: '1'
    }))
)
user.setDictMap(fixtureDictionaries)
const theme =
  new URLSearchParams(location.search).get('theme') === 'dark'
    ? SystemThemeEnum.DARK
    : SystemThemeEnum.LIGHT
useSettingStore(store).setGlobalTheme(theme, theme)
initializeTheme()
useTheme().switchThemeStyles(theme)
await router.push('/')
await router.isReady()
app.mount('#app')
