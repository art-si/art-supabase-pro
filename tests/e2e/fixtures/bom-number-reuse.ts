import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Detail from '@mdm/views/engineering/bom-maintenance/modules/bom-detail-dialog.vue'
import Structure from '@mdm/views/engineering/bom-structure/index.vue'
import { fetchBoms } from '@mdm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const detailMode = new URLSearchParams(location.search).has('detail')
document.documentElement.style.setProperty('--art-full-height', 'calc(100vh - 32px)')
const app = createApp({
  setup() {
    const detail = ref<InstanceType<typeof Detail>>()
    return () =>
      h(
        'main',
        { class: 'art-page-view p-4' },
        detailMode
          ? [
              h(
                'button',
                {
                  onClick: async () => {
                    const result = await fetchBoms({ current: 1, size: 10 })
                    if (result.data[0]) await detail.value?.handleOpen(result.data[0])
                  }
                },
                '查看数量明细'
              ),
              h(Detail, { ref: detail })
            ]
          : [h(Structure)]
      )
  }
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'bom-number-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#bom-number')
