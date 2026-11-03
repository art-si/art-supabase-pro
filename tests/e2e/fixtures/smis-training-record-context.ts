import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElButton, ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { useSettingStore } from '@/store/modules/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import TrainingRecordDialog from '@smis/views/qualification-training/training-management/safety-training-record/modules/training-record-dialog.vue'
import { dictionaries, tenantId } from './form-standard-smis-data'
import { trainingPlan, trainingRecord } from './form-standard-smis-batch-six-data'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const recordA = {
  ...trainingRecord,
  id: '44444444-4444-4444-8444-444444444441',
  recordNo: 'TR-CONTEXT-A'
}
const recordB = {
  ...trainingRecord,
  id: '44444444-4444-4444-8444-444444444442',
  recordNo: 'TR-CONTEXT-B'
}
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof TrainingRecordDialog>>()
    const successCount = ref(0)
    const openState = ref('idle')
    let openSequence = 0
    const openRecord = async (row: typeof recordA): Promise<void> => {
      const sequence = ++openSequence
      openState.value = 'opening'
      await dialog.value?.handleOpen({ row, planOptions: [trainingPlan] })
      if (sequence === openSequence) openState.value = 'ready'
    }
    return () =>
      h(ElConfigProvider, { locale: zhCn }, () =>
        h('main', { class: 'art-page-view min-w-0 p-4' }, [
          h(
            ElButton,
            { 'data-testid': 'open-a', onClick: () => void openRecord(recordA) },
            () => '打开培训记录 A'
          ),
          h(
            ElButton,
            { 'data-testid': 'open-b', onClick: () => void openRecord(recordB) },
            () => '打开培训记录 B'
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
                  userId: 'training-record-context-user',
                  tenantId: '55555555-5555-4555-8555-555555555555',
                  platformSuper: false
                })
            },
            () => '切换认证租户'
          ),
          h(
            ElButton,
            {
              'data-testid': 'revoke-submit',
              onClick: () => menu.setButtonList(makePermissions(['Add', 'Edit']))
            },
            () => '撤销归档权限'
          ),
          h(
            ElButton,
            {
              'data-testid': 'revoke-edit',
              onClick: () => menu.setButtonList(makePermissions(['Add', 'Submit']))
            },
            () => '撤销编辑权限'
          ),
          h('output', { 'data-testid': 'success-count' }, String(successCount.value)),
          h('output', { 'data-testid': 'open-state' }, openState.value),
          h(TrainingRecordDialog, {
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
  userId: 'training-record-context-user',
  tenantId,
  platformSuper: false
})
const makePermissions = (actions: readonly ('Add' | 'Edit' | 'Submit')[]) =>
  actions.map((action) => ({
    name: `SmisSafetyTrainingRecord:${action}`,
    path: '',
    type: 'button',
    meta: { title: action }
  }))
const menu = useMenuStore(store)
menu.setButtonList(makePermissions(['Add', 'Edit', 'Submit']))
const scope = useTenantScopeStore(store)
scope.selectedTenantId = tenantId
user.setDictMap(dictionaries)
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
