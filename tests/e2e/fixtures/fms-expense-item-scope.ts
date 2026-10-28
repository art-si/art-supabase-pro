import { createApp, defineComponent, h, nextTick, ref, watch } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useMenuStore } from '@/store/modules/menu'
import { useUserStore } from '@/store/modules/user'
import { useTenantScopeStore } from '@/store/modules/tenant-scope'
import { setupGlobDirectives } from '@/directives'
import ExpenseItemPage from '../../../modules/art-supabase-fms/src/views/settlement/expense-item/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const Shell = defineComponent({
  setup() {
    const showRoute = ref(true)
    const tenantScope = useTenantScopeStore()
    // Match ArtPageContent's RouterView v-if lifecycle on tenant revision.
    watch(
      () => tenantScope.revision,
      () => {
        showRoute.value = false
        void nextTick(() => {
          showRoute.value = true
        })
      },
      { flush: 'post' }
    )
    return () => h('div', { class: 'art-page-view' }, [showRoute.value ? h(ExpenseItemPage) : null])
  }
})

const app = createApp(Shell)
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'expense-item-scope-test',
  tenantId: 'tenant-platform',
  platformSuper: true
})
useMenuStore(store).setButtonList(
  ['View', 'Add', 'Edit', 'AddChild', 'Delete'].map((action) => ({
    name: `FinanceExpenseItem:${action}`,
    path: '',
    type: 'button'
  }))
)
const tenantScope = useTenantScopeStore(store)
await tenantScope.loadTenantOptions(true)
document
  .getElementById('scope-all')
  ?.addEventListener('click', () => tenantScope.setTenantScope(null))
document
  .getElementById('scope-a')
  ?.addEventListener('click', () =>
    tenantScope.setTenantScope('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
  )
document
  .getElementById('scope-b')
  ?.addEventListener('click', () =>
    tenantScope.setTenantScope('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  )
app.mount('#expense-item-scope-preview')
