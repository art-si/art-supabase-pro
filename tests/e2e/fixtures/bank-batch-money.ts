import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { useUserStore } from '@/store/modules/user'
import Batch from '@fms/views/settlement/cash-transaction/modules/cash-bank-batch-import-dialog.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const dialog = ref<InstanceType<typeof Batch>>()
const app = createApp({
  render: () =>
    h('main', { class: 'p-4' }, [
      h('button', { onClick: () => void dialog.value?.handleOpen() }, '打开流水导入'),
      h(Batch, { ref: dialog })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'bank-money-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#bank-money')
