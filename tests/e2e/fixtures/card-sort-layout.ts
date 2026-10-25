import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElInput } from 'element-plus'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import ComponentType from '@mdm/views/engineering/component-type/index.vue'
import ProductionTree from '@mdm/views/production/modules/production-tree.vue'
import AccountingReadinessPanel from '@fms/views/workbench/modules/accounting-readiness-panel.vue'
import FinanceAccountingWorkspaceShell from '@fms/views/modules/finance-accounting-workspace-shell/index.vue'
import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const app = createApp({
  render: () =>
    h(
      'main',
      { class: 'p-4', style: { height: '100dvh' } },
      params.has('production')
        ? h(ProductionTree, {
            departments: [],
            selected: '',
            loading: false,
            error: '',
            style: { width: '320px', maxWidth: '100%', height: '440px' }
          })
        : params.has('header-reflow')
          ? [
              h(
                ArtSectionCard,
                {
                  title: '核算维度',
                  subtitle: '选择维度后查看其核算项目',
                  showScrollbar: false,
                  style: { width: '320px', maxWidth: '100%', marginBottom: '16px' }
                },
                {
                  default: () => '内容区域',
                  actions: () => h(ArtIconButton, { label: '新增维度', icon: 'ri:add-line' })
                }
              ),
              h(
                ArtSectionCard,
                {
                  title: '岗位选择',
                  subtitle: '销售事业部及下级 · 共 0 个可用岗位',
                  showScrollbar: false,
                  style: { width: '320px', maxWidth: '100%' }
                },
                {
                  default: () => '内容区域',
                  actions: () => [
                    h(ElInput, {
                      placeholder: '岗位编码或名称',
                      style: { width: '231px' }
                    }),
                    h(ArtIconButton, { label: '查询岗位', icon: 'ri:search-line' })
                  ]
                }
              )
            ]
          : params.has('generic')
            ? [240, 320, 420]
                .map((width) =>
                  h(
                    ArtSectionCard,
                    {
                      title: '公共卡片头部',
                      subtitle: '较长说明文字应适应容器宽度，保持操作按钮靠右。',
                      showScrollbar: false,
                      style: { width: `${width}px`, maxWidth: '100%', marginBottom: '16px' }
                    },
                    {
                      default: () => '内容区域',
                      actions: () =>
                        ['展开', '新增', '刷新'].map((label) =>
                          h(ArtIconButton, { label, icon: 'ri:refresh-line' })
                        )
                    }
                  )
                )
                .concat([
                  h(
                    ArtEntitySummary,
                    {
                      title: '公共详情摘要',
                      description: '详情操作在窄屏保持靠右。',
                      icon: 'ri:folder-line',
                      style: { width: '320px', maxWidth: '100%', marginBottom: '16px' }
                    },
                    {
                      aside: () =>
                        ['查看', '编辑', '刷新'].map((label) =>
                          h(ArtIconButton, { label, icon: 'ri:refresh-line' })
                        )
                    }
                  ),
                  h(
                    FinanceAccountingWorkspaceShell,
                    {
                      hideMasterDeleteNotice: true,
                      style: {
                        width: '320px',
                        maxWidth: '100%',
                        height: 'auto',
                        overflow: 'visible'
                      }
                    },
                    { default: () => h(AccountingReadinessPanel, { compact: true }) }
                  )
                ])
            : h(ComponentType)
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
  userId: 'card-sort-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#card-sort-layout')
