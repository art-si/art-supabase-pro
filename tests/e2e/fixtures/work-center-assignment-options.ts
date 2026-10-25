import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import PersonnelDialog from '@mdm/views/production/work-center/modules/personnel-dialog.vue'
import DevicesDialog from '@mdm/views/production/work-center/modules/devices-dialog.vue'
import CenterDialog from '@mdm/views/production/work-center/modules/center-dialog.vue'
import { createWorkCenter } from '@mdm/views/production/work-center/modules/center-policy'
import type { WorkCenter } from '@mdm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const row: WorkCenter = {
  ...createWorkCenter(),
  id: 'test-center',
  tenantId: 'test-tenant',
  code: 'WC-001',
  name: '测试工作中心',
  createBy: '',
  createTime: '',
  updateTime: '',
  qrToken: '',
  department: null,
  operationControlCode: null,
  mainCenter: null
}
const devices = new URLSearchParams(location.search).get('mode') === 'devices'
const center = new URLSearchParams(location.search).get('mode') === 'center'
const app = createApp({
  setup() {
    const personnel = ref<InstanceType<typeof PersonnelDialog>>()
    const equipment = ref<InstanceType<typeof DevicesDialog>>()
    const editor = ref<InstanceType<typeof CenterDialog>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              center
                ? editor.value?.handleOpen({ mode: 'edit', row, departments: [] })
                : devices
                  ? equipment.value?.handleOpen(row)
                  : personnel.value?.handleOpen(row)
          },
          '打开安排'
        ),
        center
          ? h(CenterDialog, { ref: editor })
          : devices
            ? h(DevicesDialog, { ref: equipment })
            : h(PersonnelDialog, { ref: personnel })
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
  userId: 'assignment-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
useMenuStore(store).setButtonList(
  ['MdmWorkCenter:Personnel', 'MdmWorkCenter:Devices'].map((name) => ({
    name,
    path: '',
    type: 'button',
    meta: { title: '测试权限' }
  }))
)
await router.isReady()
app.mount('#app')
