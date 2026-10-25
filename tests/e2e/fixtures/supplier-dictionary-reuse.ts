import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Detail from '@mdm/views/purchase-master/supplier/modules/supplier-detail.vue'
import { fetchPurchaseSuppliers } from '@mdm/api'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const detail = ref<InstanceType<typeof Detail>>()
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        {
          type: 'button',
          onClick: async () => {
            const result = await fetchPurchaseSuppliers({
              current: 1,
              size: 10,
              tenantId: 'test-tenant'
            })
            if (result.records[0]) await detail.value?.handleOpen(result.records[0])
          }
        },
        '查看测试供应商'
      ),
      h(Detail, { ref: detail, groups: [] })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'supplier-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#supplier-dictionary')
