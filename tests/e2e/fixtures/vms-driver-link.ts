import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Dialog from '@vms/views/vehicle-manage/vehicle-violation/modules/driver-link-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const app = createApp({
  setup() {
    const dialog = ref<InstanceType<typeof Dialog>>()
    return () =>
      h('main', { class: 'p-4' }, [
        h(
          'button',
          {
            onClick: () =>
              dialog.value?.handleOpen({
                id: 'violation-1',
                vehicleId: 'vehicle-1',
                plateNo: '测试001',
                driverId: 'driver-1',
                driverName: '历史司机',
                linkedDriverName: '关联司机甲',
                violationBehavior: '测试记录',
                violationTime: '2026-10-23T09:00:00+08:00',
                processed: false,
                updateTime: '2026-10-25T05:00:00Z'
              })
          },
          '关联司机'
        ),
        h(Dialog, { ref: dialog })
      ])
  }
})
app
  .use(store)
  .use(language)
  .use(createRouter({ history: createMemoryHistory(), routes: [] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({ userId: 'preview', tenantId: 'test', platformSuper: true })
app.mount('#app')
