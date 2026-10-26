import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElTag } from 'element-plus'
import language from '@/locales'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
import '../../../modules/art-supabase-mes/src/views/production-execution/modules/production-detail-intro.scss'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const cases = {
  defect: {
    icon: 'ri:shield-flash-line',
    code: 'DEF-2026-001',
    title: '表面划伤需要返工确认的生产不良原因',
    description: 'TASK-2026-001',
    status: '制程不良',
    tone: 'warning'
  },
  event: {
    icon: 'ri:calendar-event-line',
    code: 'WO-2026-001',
    title: '设备停机等待维修人员确认的执行事件',
    description: 'TASK-2026-002',
    status: '进行中',
    tone: 'primary'
  },
  mold: {
    icon: 'ri:tools-line',
    code: 'MOLD-2026-001',
    title: '高精度外壳注塑模具A生产装配记录',
    description: '第一工作中心',
    status: '上模中',
    tone: 'warning'
  }
} as const

const parameters = new URLSearchParams(location.search)
const kind = parameters.get('kind')
const detail = cases[kind === 'event' || kind === 'mold' ? kind : 'defect']

const app = createApp({
  setup() {
    const setting = useSettingStore()
    const theme = parameters.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
    setting.setGlobalTheme(theme, theme)
    setting.boxBorderMode = true
    initializeTheme()

    return () =>
      h('main', { class: 'detail-frame' }, [
        h('div', { class: 'mes-production-detail-intro' }, [
          h('span', { 'aria-hidden': 'true' }, h(ArtSvgIcon, { icon: detail.icon })),
          h('div', [h('small', detail.code), h('h3', detail.title), h('p', detail.description)]),
          h(ElTag, { type: detail.tone, effect: 'plain' }, () => detail.status)
        ])
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
app.mount('#detail-preview')
