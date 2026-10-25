import { createApp, h } from 'vue'
import { ElTag } from 'element-plus'
import ArtEntitySummary from '@/components/core/surfaces/art-entity-summary/index.vue'
import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
import { initializeTheme } from '@/hooks/core/useTheme'
import { store } from '@/store'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const boundaryTag = (type: 'success' | 'warning', icon: string, label: string) =>
  h(ElTag, { type, effect: 'light', round: true }, () => [h(ArtSvgIcon, { icon }), label])

const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view mx-auto grid max-w-3xl gap-4 p-4' }, [
      h(
        ArtEntitySummary,
        {
          icon: 'ri:git-branch-line',
          eyebrow: 'CHANGE SCENARIO',
          title: '组织变革情景方案',
          description: '定义变革目标、影响窗口和责任人，方案评审前不会影响当前组织。'
        },
        { aside: () => boundaryTag('success', 'ri:shield-check-line', '不直接改主数据') }
      ),
      h(
        ArtEntitySummary,
        {
          icon: 'ri:user-shared-line',
          eyebrow: 'CONTINGENT WORKFORCE',
          title: '用工任务与内部责任',
          description: '外部人员准入、服务期限与内部责任保持独立审计。'
        },
        { aside: () => boundaryTag('success', 'ri:shield-check-line', '不占正式员工编制') }
      ),
      h(
        ArtEntitySummary,
        {
          icon: 'ri:folder-shield-2-line',
          eyebrow: 'EMPLOYEE RELATIONS',
          title: '员工关系敏感记录',
          description: '敏感字段在服务端独立授权，未授权用户不能读取。'
        },
        { aside: () => boundaryTag('warning', 'ri:shield-keyhole-line', '敏感字段独立授权') }
      ),
      h('section', { class: 'art-card-xs flex items-center justify-between gap-3' }, [
        h('span', { class: 'min-w-0' }, [
          h('strong', { class: 'block text-sm' }, '福利缴费金额'),
          h('small', { class: 'text-xs text-[var(--el-text-color-secondary)]' }, '服务端字段权限')
        ]),
        boundaryTag('warning', 'ri:lock-2-line', '缴费金额服务端隐藏')
      ])
    ])
})
app.use(store)
initializeTheme()
app.mount('#hr-boundary-tag')
