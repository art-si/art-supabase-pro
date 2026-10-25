import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import Guard from '@/components/business/master-data-delete-guard/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'
const params = new URLSearchParams(location.search)
const all = params.get('mode') === 'all'
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.theme = params.get('theme') ?? 'light'
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
let failed = params.has('fail')
let cleaned = false
const records = ['草稿报价', '草稿发票', '已开具票据'].map((recordNo, index) => ({
  resourceId: 'customer-test',
  dependencyCode: 'test',
  recordId: String(index),
  targetId: String(index),
  recordNo,
  recordStatus: index === 2 ? '已开具' : '草稿',
  recordAmount: index === 0 ? 12345.67 : index === 1 ? 0 : null,
  createdAt: '',
  cleanupAllowed: index !== 2
}))
const app = createApp({
  setup() {
    const guard = ref<InstanceType<typeof Guard>>()
    const open = () =>
      guard.value?.inspect({
        resourceLabel: '客户',
        resources: [{ id: 'customer-test', label: '测试客户' }],
        fetchDependencies: async () => {
          if (failed) {
            failed = false
            throw new Error('检查失败，请重试')
          }
          return cleaned ? records.slice(2) : records
        },
        dependencyMeta: {
          test: {
            label: '客户关联资料',
            unit: '条',
            description: '草稿允许清理，已生效票据需保留。',
            actionLabel: '查看记录',
            routeName: 'Record',
            routeQuery: (record) => ({
              fromCustomerDelete: '1',
              customerName: '测试客户',
              selected: record.recordId
            }),
            order: 1
          }
        },
        cleanup: {
          selectionMode: all ? 'all' : undefined,
          actionLabel: all ? '一键清理可删除项' : '清理选中项',
          confirmMessage: (count) => '将永久清理 ' + count + ' 项安全资料，是否继续？',
          run: async (selected) => {
            document.body.dataset.cleaned = selected.map((item) => item.recordId).join(',')
            cleaned = true
            return selected.length
          }
        }
      })
    return () =>
      h('main', { class: 'p-4' }, [
        h('button', { onClick: open }, '检查客户关联'),
        h(Guard, { ref: guard })
      ])
  }
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: {} },
    { path: '/record', name: 'Record', component: {} }
  ]
})
router.afterEach((route) => {
  document.body.dataset.query = JSON.stringify(route.query)
})
app.use(router)
app.mount('#app')
