import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import MenuTypeFilter from '../../../modules/art-supabase-mdm/src/views/components/menu-type-filter.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const menuTree = [
  {
    id: 'operations',
    parentId: null,
    name: 'Operations',
    path: '/operations',
    type: 'folder' as const,
    meta: { title: '业务运营' },
    children: [
      {
        id: 'production',
        parentId: 'operations',
        name: 'Production',
        path: 'production',
        type: 'menu' as const,
        meta: { title: '生产管理' }
      },
      {
        id: 'warehouse',
        parentId: 'operations',
        name: 'Warehouse',
        path: 'warehouse',
        type: 'menu' as const,
        meta: { title: '仓储管理' }
      }
    ]
  }
]

const app = createApp({
  setup() {
    const subject = ref<'业务类型' | '单据类型'>('业务类型')
    const selectedMenuId = ref('')
    return () =>
      h('main', { class: 'preview-layout' }, [
        h(
          'button',
          {
            class: 'preview-switch',
            type: 'button',
            onClick: () => {
              subject.value = subject.value === '业务类型' ? '单据类型' : '业务类型'
            }
          },
          '切换主题'
        ),
        h(MenuTypeFilter, {
          class: 'preview-panel',
          subject: subject.value,
          data: menuTree,
          counts: { production: 2, warehouse: 1 },
          selectedMenuId: selectedMenuId.value,
          onSelect: (menuId: string) => {
            selectedMenuId.value = menuId
          }
        })
      ])
  }
})

app.use(store)
app.use(language)
setupGlobDirectives(app)
app.mount('#preview')
