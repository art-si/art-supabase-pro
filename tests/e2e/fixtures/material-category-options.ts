import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import CategoryPage from '@mdm/views/material-master/material-category/index.vue'
import CategoryDialog from '@mdm/views/material-master/material-category/modules/category-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const list = new URLSearchParams(location.search).get('mode') === 'list'
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof CategoryDialog>>()
    return () =>
      list
        ? h(CategoryPage)
        : h('main', { class: 'p-4' }, [
            h(
              'button',
              {
                type: 'button',
                onClick: () =>
                  dialog.value?.handleOpen({
                    categories: [],
                    materialTypes: [],
                    sites: [],
                    tenantId: 'test-tenant',
                    tenantOptions: [{ label: '测试租户', value: 'test-tenant' }]
                  })
              },
              '打开分类'
            ),
            h(CategoryDialog, { ref: dialog })
          ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'category-options-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList([
  { name: 'MdmMaterialCategory:View', path: '', type: 'button', meta: { title: '测试权限' } }
])
await router.isReady()
app.mount('#app')
