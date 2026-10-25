import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import CategoryDialog from '@mdm/views/engineering/esop/modules/category-dialog.vue'
import SettingDialog from '@pmis/views/components/department-setting-dialog.vue'
import CriterionDialog from '@smis/views/dual-control-system/risk-control/risk-assessment-standard-model/modules/criterion-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const scenario = new URLSearchParams(location.search).get('scenario')
const tenantId = 'test-tenant'
const audit = {
  id: 'previous-record',
  tenantId,
  createTime: '2026-10-01T00:00:00Z',
  updateTime: '2026-10-01T00:00:00Z'
}
const app = createApp({
  setup() {
    const category = ref<InstanceType<typeof CategoryDialog>>()
    const setting = ref<InstanceType<typeof SettingDialog>>()
    const criterion = ref<InstanceType<typeof CriterionDialog>>()
    async function open(editing: boolean): Promise<void> {
      if (scenario === 'mdm') {
        await category.value?.handleOpen({
          tenantId,
          tenantOptions: [{ label: '测试租户', value: tenantId }],
          categories: [],
          row: editing
            ? {
                ...audit,
                categoryCode: 'OLD',
                categoryName: '已有分类',
                status: 'enabled',
                sort: 10
              }
            : undefined
        })
      } else if (scenario === 'pmis') {
        await setting.value?.handleOpen({
          kind: 'maintenance',
          tenantId,
          row: editing
            ? {
                ...audit,
                settingKind: 'maintenance',
                departmentId: 'department-test',
                requireAlbumPhoto: false,
                notificationMethods: ['wechat'],
                urgencyRules: [],
                employees: [],
                escalationRules: [
                  {
                    id: 'escalation-test',
                    delayMinutes: 60,
                    notificationMethods: ['wechat'],
                    notifyEmployeeIds: ['historical-employee']
                  }
                ]
              }
            : undefined
        })
      } else {
        await criterion.value?.handleOpen({
          tenantId,
          dimension: {
            id: 'dimension-test',
            tenantId,
            modelId: 'model-test',
            dimensionCode: 'L',
            dimensionName: '发生可能性',
            sort: 1,
            criteria: []
          },
          row: editing
            ? {
                ...audit,
                dimensionId: 'dimension-test',
                criterionText: '已有判定标准',
                score: 5,
                sort: 10
              }
            : undefined
        })
      }
    }
    return () =>
      h('main', { class: 'p-4' }, [
        h('button', { type: 'button', onClick: () => void open(true) }, '打开已有记录'),
        h('button', { type: 'button', onClick: () => void open(false) }, '新增记录'),
        scenario === 'mdm'
          ? h(CategoryDialog, { ref: category })
          : scenario === 'pmis'
            ? h(SettingDialog, { ref: setting })
            : h(CriterionDialog, { ref: criterion })
      ])
  }
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
useUserStore(store).setUserInfo({ userId: 'reset-test', tenantId, platformSuper: false })
app.mount('#app')
