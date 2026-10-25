import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import PersonDialog from '@mdm/views/production/modules/person-dialog.vue'
import DepartmentDialog from '@mdm/views/production/modules/department-dialog.vue'
import TemplateDialog from '@mdm/views/production/operation-template/modules/template-dialog.vue'
import ShiftScheduleDialog from '@mdm/views/production/shift-scheduling/modules/shift-schedule-dialog.vue'
import QrDialog from '@mdm/views/production/work-center/modules/qr-dialog.vue'
import { createWorkCenter } from '@mdm/views/production/work-center/modules/center-policy'
import { createDepartment } from '@mdm/views/production/modules/production-model'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const department = mode === 'department'
const app = createApp({
  setup() {
    if (mode === 'qr') {
      const editor = ref<InstanceType<typeof QrDialog>>()
      return () =>
        h('main', { class: 'p-4' }, [
          h(
            'button',
            {
              type: 'button',
              onClick: () =>
                editor.value?.handleOpen(
                  [1, 2].map((index) => ({
                    ...createWorkCenter(),
                    id: `center-${index}`,
                    tenantId: 'test-tenant',
                    code: `WC-00${index}`,
                    name: `测试工作中心 ${index}`,
                    qrToken: `center-token-${index}`,
                    department: null,
                    operationControlCode: null,
                    mainCenter: null,
                    createBy: 'qa',
                    createTime: '2026-10-01T00:00:00Z',
                    updateTime: '2026-10-01T00:00:00Z'
                  }))
                )
            },
            '打开二维码'
          ),
          h(QrDialog, { ref: editor })
        ])
    }
    if (mode === 'template') {
      const editor = ref<InstanceType<typeof TemplateDialog>>()
      return () =>
        h('main', { class: 'p-4' }, [
          h(
            'button',
            { type: 'button', onClick: () => editor.value?.handleOpen({ mode: 'add' }) },
            '打开编辑'
          ),
          h(TemplateDialog, { ref: editor })
        ])
    }
    if (mode === 'shift') {
      const editor = ref<InstanceType<typeof ShiftScheduleDialog>>()
      return () =>
        h('main', { class: 'p-4' }, [
          h(
            'button',
            {
              type: 'button',
              onClick: () =>
                editor.value?.handleOpen({
                  mode: 'add',
                  department: {
                    ...createDepartment(),
                    id: 'test-department',
                    tenantId: 'test-tenant',
                    name: '测试产线',
                    code: 'LINE-01'
                  }
                })
            },
            '打开编辑'
          ),
          h(ShiftScheduleDialog, { ref: editor })
        ])
    }
    const person = ref<InstanceType<typeof PersonDialog>>()
    const organization = ref<InstanceType<typeof DepartmentDialog>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              department
                ? organization.value?.handleOpen({ departments: [] })
                : person.value?.handleOpen({ departments: [] })
          },
          '打开编辑'
        ),
        department ? h(DepartmentDialog, { ref: organization }) : h(PersonDialog, { ref: person })
      ])
  }
})
app.use(store)
app.use(language)
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: {} }]
})
app.use(router)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'identity-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
await router.isReady()
app.mount('#app')
