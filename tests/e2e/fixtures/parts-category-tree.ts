import { createApp, h, shallowRef, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import CategoryDialog from '../../../modules/art-supabase-vms/src/views/basic-info/parts-category/modules/parts-category-dialog.vue'
import { fetchPartsCategoryTree } from '../../../modules/art-supabase-vms/src/api/providers/supabase/vehicle/basic-info'
import { fetchPartsCategoryTree as fetchJavaTree } from '../../../modules/art-supabase-vms/src/api/providers/java/vehicle'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const dialog = shallowRef<InstanceType<typeof CategoryDialog>>()
    const result = ref('尚未查询')
    return () =>
      h('main', { class: 'p-4' }, [
        h('button', { onClick: () => void dialog.value?.handleOpen() }, '新增类别'),
        h(
          'button',
          {
            onClick: () =>
              void dialog.value?.handleOpen({
                id: 'branch',
                parentId: 'root',
                categoryName: '待编辑类别',
                categoryCode: 'BRANCH',
                categoryLevel: 2,
                sort: 1,
                status: '1'
              })
          },
          '编辑类别'
        ),
        h(
          'button',
          {
            onClick: async () => {
              const response = await (new URLSearchParams(location.search).has('java')
                ? fetchJavaTree()
                : fetchPartsCategoryTree())
              result.value = JSON.stringify(response)
            }
          },
          '查询类别'
        ),
        h('output', { 'data-testid': 'category-result' }, result.value),
        h(CategoryDialog, { ref: dialog })
      ])
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: '00000000-0000-4000-8000-000000000001',
  userName: '测试用户',
  tenantId: '11111111-1111-4111-8111-111111111111',
  roles: ['R_USER']
})
useUserStore(store).setDictMap({
  status: [
    { label: '启用', value: '1' },
    { label: '停用', value: '0' }
  ]
})
app.mount('#category-preview')
