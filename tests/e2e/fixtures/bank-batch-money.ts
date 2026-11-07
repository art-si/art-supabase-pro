import { KeepAlive, createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import Batch from '@fms/views/settlement/cash-transaction/modules/cash-bank-batch-import-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<InstanceType<typeof Batch>>()
const active = ref(true)
const successCount = ref(0)
const userStore = useUserStore(store)
const menuStore = useMenuStore(store)
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h('button', { onClick: () => void dialog.value?.handleOpen() }, '打开流水导入'),
      h(KeepAlive, null, [
        active.value
          ? h(Batch, {
              ref: dialog,
              onSuccess: () => {
                successCount.value++
                if (window.__bankBatchTest.reopenOnSuccess) void dialog.value?.handleOpen()
              }
            })
          : null
      ])
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
userStore.setUserInfo({
  userId: 'bank-money-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
declare global {
  interface Window {
    __bankBatchTest: {
      reopenOnSuccess: boolean
      reopen: () => Promise<void>
      successCount: () => number
      setPlatformSuper: (value: boolean) => void
      setActorTenant: (value: string) => void
      effectiveTenant: () => string | null
      grantImport: (value: boolean) => void
      setActive: (value: boolean) => void
    }
  }
}
window.__bankBatchTest = {
  reopenOnSuccess: false,
  reopen: async () => {
    await dialog.value?.handleOpen()
  },
  successCount: () => successCount.value,
  setPlatformSuper: (value) =>
    userStore.setUserInfo({ ...userStore.getUserInfo, platformSuper: value }),
  setActorTenant: (value) => userStore.setUserInfo({ ...userStore.getUserInfo, tenantId: value }),
  effectiveTenant: () => useTenantScopeStore(store).effectiveTenantId,
  grantImport: (value) =>
    menuStore.setButtonList(
      value
        ? [
            {
              name: 'FinanceCashTransaction:Import',
              type: 'button',
              path: '',
              meta: { title: '银行流水导入' }
            }
          ]
        : []
    ),
  setActive: (value) => {
    active.value = value
  }
}
app.mount('#bank-money')
