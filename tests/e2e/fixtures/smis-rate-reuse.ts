import { createApp, h } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme } from '@/hooks/core/useTheme'
import Team from '@smis/views/dual-control-system/dual-control-report/team-self-inspection-coverage/index.vue'
import Equipment from '@smis/views/dual-control-system/dual-control-report/special-equipment-risk-control-statistics/index.vue'
import Inspection from '@smis/views/dual-control-system/dual-control-report/shared/inspection-statistics-workspace.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const app = createApp({
  render: () =>
    h('main', { class: 'art-page-view h-screen p-4' }, [
      mode === 'team'
        ? h(Team)
        : mode === 'equipment'
          ? h(Equipment)
          : h(Inspection, {
              reportType: mode === 'inspection-coverage' ? 'inspection_rate' : 'missed_rate',
              pagePermission: 'Fixture:View',
              detailPermission: 'Fixture:Detail',
              exportPermission: 'Fixture:Export'
            })
    ])
})
app.use(store)
initializeTheme()
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'rate-test-user',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  [
    'Fixture:View',
    'SmisDualControlTeamSelfInspectionCoverage:View',
    'SmisDualControlSpecialEquipmentRiskControlStatistics:View'
  ].map((name) => ({ name, path: '', type: 'button', meta: { title: '查看测试报表' } }))
)
app.mount('#app')
