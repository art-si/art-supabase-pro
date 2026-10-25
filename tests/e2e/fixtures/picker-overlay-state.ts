import { createApp, h, ref } from 'vue'
import { useEventListener } from '@vueuse/core'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import language from '@/locales'
import { useUserStore } from '@/store/modules/user'
import { setupGlobDirectives } from '@/directives'
import ArtResourcePicker from '@/components/core/forms/art-resource-picker/index.vue'
import ArtAddressPicker from '@/components/core/forms/art-address-picker/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const mode = new URLSearchParams(location.search).get('mode')
const app = createApp({
  setup() {
    const visible = ref(false)
    const address = ref<InstanceType<typeof ArtAddressPicker>>()
    useEventListener(window, 'keydown', (event) => {
      if (event.key === 'F8') visible.value = false
    })
    return () =>
      h('main', { class: 'art-page-view min-h-screen p-4' }, [
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              mode === 'address' ? address.value?.openPicker() : (visible.value = true)
          },
          '打开选择器'
        ),
        mode === 'address'
          ? h(ArtAddressPicker, { ref: address, amapKey: 'sdk-test-key', hideRegionSelector: true })
          : h(ArtResourcePicker, {
              visible: visible.value,
              'onUpdate:visible': (value: boolean) => {
                visible.value = value
              }
            }),
        h('output', { 'aria-label': '外部显示状态' }, String(visible.value))
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
useUserStore(store).setUserInfo({
  userId: 'picker-state-test',
  tenantId: 'test-tenant',
  platformSuper: false
})
app.mount('#picker-overlay-state')
