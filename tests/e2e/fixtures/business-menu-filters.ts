import { createApp, h, ref } from 'vue'
import language from '@/locales'
import { store } from '@/store'
import { setupGlobDirectives } from '@/directives'
import type { AppRouteRecord } from '@/types/router'
import WorkflowMenuFilter from '@/views/workflow/definition/modules/workflow-business-menu-filter.vue'
import NumberMenuFilter from '@/views/system/document-number/modules/document-number-menu-filter.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const menuTree: AppRouteRecord[] = [
  {
    id: 'sales',
    name: 'Sales',
    path: '/sales',
    meta: { title: '销售管理' },
    children: [
      {
        id: 'contract',
        name: 'ScmSalesContract',
        path: '/sales/contract',
        meta: { title: '销售合同' }
      },
      { id: 'order', name: 'ScmSalesOrder', path: '/sales/order', meta: { title: '销售订单' } },
      {
        id: 'unconnected',
        name: 'Unconnected',
        path: '/sales/unconnected',
        meta: { title: '未接入菜单' }
      }
    ]
  }
]
const scenes: Api.SystemManage.DocumentNumberSceneItem[] = ['contract', 'order'].map((menuId) => ({
  menuId,
  ruleKey: `${menuId}_number`,
  ruleName: menuId === 'contract' ? '合同编号' : '订单编号',
  fieldLabel: '业务编号',
  category: 'business_document',
  targetTable: 'fixture',
  targetColumn: 'number',
  defaultTemplate: 'TEST-{SEQ}',
  defaultResetCycle: 'none',
  manualRequired: false,
  enabled: true
}))

const app = createApp({
  setup() {
    const mode = ref<'workflow' | 'number'>('workflow')
    const selected = ref('')
    const loading = ref(false)
    const empty = ref(false)
    const error = ref('')
    const result = ref('')
    const refreshCount = ref(0)
    const refresh = () => {
      refreshCount.value++
      error.value = ''
      loading.value = false
    }
    const control = (label: string, onClick: () => void) =>
      h('button', { type: 'button', onClick }, label)
    return () =>
      h('main', { class: 'preview-layout' }, [
        h('nav', { class: 'preview-controls', 'aria-label': '测试状态' }, [
          control('切换入口', () => {
            mode.value = mode.value === 'workflow' ? 'number' : 'workflow'
            selected.value = ''
            result.value = ''
          }),
          control('切换加载', () => {
            loading.value = !loading.value
          }),
          control('切换空数据', () => {
            empty.value = !empty.value
          }),
          control('模拟错误', () => {
            error.value = '业务目录暂不可用，请重试。'
          })
        ]),
        mode.value === 'workflow'
          ? h(WorkflowMenuFilter, {
              class: 'preview-panel',
              data: empty.value ? [] : menuTree,
              selectedMenuId: selected.value,
              loading: loading.value,
              error: error.value,
              onRefresh: refresh,
              onSelect: (menuId: string, types: string[], label: string) => {
                selected.value = menuId
                result.value = JSON.stringify({ menuId, types, label })
              }
            })
          : h(NumberMenuFilter, {
              class: 'preview-panel',
              data: empty.value ? [] : menuTree,
              scenes,
              selectedMenuId: selected.value,
              loading: loading.value,
              onRefresh: refresh,
              onSelect: (menuId: string) => {
                selected.value = menuId
                result.value = menuId
              }
            }),
        h('output', { class: 'preview-result', 'aria-label': '选择结果' }, result.value),
        h('output', { 'aria-label': '刷新次数' }, String(refreshCount.value))
      ])
  }
})
app.use(store)
app.use(language)
setupGlobDirectives(app)
app.mount('#preview')
