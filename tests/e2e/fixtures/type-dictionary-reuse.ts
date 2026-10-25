import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import DocumentPage from '@mdm/views/document-type/index.vue'
import BusinessPage from '@mdm/views/business-type/index.vue'
import DocumentDialog from '@mdm/views/document-type/modules/document-type-dialog.vue'
import BusinessDialog from '@mdm/views/business-type/modules/business-type-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const documentRef = ref<InstanceType<typeof DocumentDialog>>()
const businessRef = ref<InstanceType<typeof BusinessDialog>>()
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'art-page-view h-screen p-4' },
      mode === 'document-list'
        ? [h(DocumentPage)]
        : mode === 'business-list'
          ? [h(BusinessPage)]
          : [
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => {
                    const data = {
                      mode: 'add' as const,
                      effectiveTenantId: 'test-tenant',
                      tenantOptions: [],
                      menuTree: []
                    }
                    if (mode === 'document-production') {
                      return documentRef.value?.handleOpen({
                        ...data,
                        selectedMenuId: 'work-order',
                        menuTree: [
                          {
                            id: 'work-order',
                            name: 'MesWorkOrder',
                            path: '/mes/work-order',
                            type: 'menu',
                            meta: { title: '生产工单' }
                          }
                        ]
                      })
                    }
                    return mode === 'document'
                      ? documentRef.value?.handleOpen(data)
                      : businessRef.value?.handleOpen(data)
                  }
                },
                '打开表单'
              ),
              mode?.startsWith('document')
                ? h(DocumentDialog, { ref: documentRef })
                : h(BusinessDialog, { ref: businessRef })
            ]
    )
})
app.use(store)
app.use(language)
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: {} }]
  })
)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'type-dictionary-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['MdmDocumentType:View', 'MdmBusinessType:View'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
)
app.mount('#type-dictionary-reuse')
