import { createApp, h } from 'vue'
import { ElButton, ElMessage } from 'element-plus'
import { createMemoryHistory, createRouter } from 'vue-router'
import { setupGlobDirectives } from '@/directives'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { markErrorAsUserNotified } from '@/utils/supabase/error'
import ArtTableQuery, {
  type ArtTableQueryHeaderAction
} from '@/components/core/tables/art-table-query/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(window.location.search).get('mode')
let releaseRequest: (() => void) | undefined
let attempts = 0
const action: ArtTableQueryHeaderAction = {
  key: 'run-preview',
  label: '执行测试操作',
  confirm: true,
  permission: mode === 'revoked' ? 'Fixture:Execute' : undefined,
  content: '确认执行测试操作？',
  onClick: async () => {
    document.body.dataset.attempts = String(++attempts)
    await new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    if (mode === 'failure') throw new Error('当前记录已变更，请刷新后重试')
    if (mode === 'notified') {
      ElMessage.error('测试业务操作失败，请重试')
      throw markErrorAsUserNotified(new Error('测试业务操作失败，请重试'))
    }
    document.body.dataset.completed = String(attempts)
  }
}
const app = createApp({
  render: () =>
    h('main', { class: 'p-6' }, [
      h('h1', { class: 'mb-4 text-xl' }, '表格操作状态验收'),
      h(ElButton, { onClick: () => releaseRequest?.() }, () => '结束测试请求'),
      h(ArtTableQuery, {
        data: [],
        tableColumns: [{ prop: 'name', label: '名称' }],
        headerActions: [action],
        showSearchBar: false
      })
    ])
})
app.use(store)
if (mode === 'revoked') {
  const user = useUserStore()
  const menu = useMenuStore()
  user.info = { isPlatformSuper: false }
  menu.buttonList = [{ name: 'Fixture:Execute', path: '/fixture' }]
  document.addEventListener('revoke-fixture-permission', () => {
    menu.buttonList = []
  })
}
app.use(
  createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div />' } }]
  })
)
app.use(language)
setupGlobDirectives(app)
app.mount('#table-actions-preview')
