import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import BusinessTypeDialog from '../../../modules/art-supabase-mdm/src/views/business-type/modules/business-type-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof BusinessTypeDialog>>()
    return () =>
      h('main', [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              dialog.value?.handleOpen({
                mode: 'add',
                effectiveTenantId: 'test-tenant',
                tenantOptions: [],
                menuTree: [
                  {
                    id: 'system',
                    name: 'System',
                    path: '/system',
                    type: 'folder',
                    meta: { title: '系统管理' },
                    children: [
                      {
                        id: 'user-center',
                        name: 'UserCenter',
                        path: 'user-center',
                        type: 'menu',
                        meta: { title: 'menus.system.userCenter' }
                      },
                      {
                        id: 'business-page',
                        name: 'BusinessPage',
                        path: 'business',
                        type: 'menu',
                        meta: { title: '测试业务功能' }
                      }
                    ]
                  }
                ]
              })
          },
          '新增业务类型'
        ),
        h(BusinessTypeDialog, { ref: dialog })
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
useUserStore(store).setUserInfo({
  userId: 'test-user',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#preview')
