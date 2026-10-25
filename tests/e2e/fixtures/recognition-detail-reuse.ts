import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import Detail from '@/views/intelligent-recognition/modules/recognition-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

document.documentElement.classList.toggle(
  'dark',
  new URLSearchParams(location.search).get('theme') === 'dark'
)
const detail = ref<InstanceType<typeof Detail>>()
const app = createApp({
  render: () =>
    h('main', [
      h(
        'button',
        { type: 'button', onClick: () => detail.value?.handleOpen('recognition-test') },
        '查看测试识别'
      ),
      h(Detail, { ref: detail })
    ])
})
app.use(store)
app.use(language)
app.use(createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: {} }] }))
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'recognition-test',
  tenantId: 'test-tenant',
  platformSuper: true
})
app.mount('#recognition-detail')
