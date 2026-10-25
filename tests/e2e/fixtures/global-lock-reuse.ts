import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import { ElConfigProvider } from 'element-plus'
import { mittBus } from '@/utils/sys'
import {
  globalComponentsConfig,
  getGlobalComponentByKey,
  type GlobalComponentModule
} from '@/config/modules/component'
import GlobalComponent from '@/components/core/layouts/art-global-component/index.vue'
import GlobalSearch from '@/components/core/layouts/art-global-search/index.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'

const params = new URLSearchParams(location.search)
const config = getGlobalComponentByKey(params.get('component') ?? 'global-search')
const screenLock = getGlobalComponentByKey('screen-lock')
if (!config?.loader || !config.activationEvent || !screenLock)
  throw new Error('Invalid fixture component')
const actualLoader = config.loader
const event = config.activationEvent
const loads = ref(0)
const finishes = ref(0)
const events = ref(0)
const mounts = ref(0)
const unmounts = ref(0)
const lastPayload = ref('')
const imagePayloads = ['red', 'green', 'blue'].map(
  (color) =>
    `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${color}"/></svg>`)}`
)
const pending: Array<{
  resolve: (module: GlobalComponentModule) => void
  reject: (error: Error) => void
}> = []
globalComponentsConfig.splice(0, globalComponentsConfig.length, screenLock)
if (!params.has('standalone'))
  globalComponentsConfig.push({
    ...config,
    enabled: !params.has('disabled'),
    loader: () => {
      loads.value++
      return new Promise((resolve, reject) => pending.push({ resolve, reject }))
    }
  })
mittBus.on(event, (payload) => {
  events.value++
  lastPayload.value = typeof payload === 'string' ? payload : ''
})
document.documentElement.classList.toggle('dark', params.get('theme') === 'dark')
document.documentElement.dataset.boxMode = params.get('box') ?? 'border-mode'
const user = useUserStore(store)
user.setUserInfo({
  userId: 'global-lock-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  nickName: '全局交互验收用户',
  platformSuper: false
})
user.setLockPassword('')
user.setLockStatus(params.has('locked'))
const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/', component: { render: () => h('div') } }]
})
const app = createApp({
  setup() {
    return () =>
      h(
        ElConfigProvider,
        { zIndex: 3000 },
        {
          default: () =>
            h('main', [
              h(GlobalComponent),
              params.has('standalone') ? h(GlobalSearch) : null,
              h(
                'div',
                {
                  class: 'global-lock-fixture-controls',
                  style: {
                    position: 'fixed',
                    bottom: '8px',
                    left: '8px',
                    maxWidth: 'calc(100% - 16px)',
                    zIndex: 10000,
                    display: 'flex',
                    gap: '8px',
                    flexWrap: 'wrap'
                  }
                },
                [
                  h('button', { onClick: () => user.setLockStatus(!user.isLock) }, '切换锁屏'),
                  h(
                    'button',
                    {
                      onClick: () => {
                        user.setLockStatus(true)
                        user.setLockStatus(false)
                      }
                    },
                    '锁屏再解锁'
                  ),
                  h('button', { onClick: () => mittBus.emit(event) }, '激活组件'),
                  h(
                    'button',
                    {
                      onClick: () => {
                        user.setLockStatus(false)
                        mittBus.emit(event)
                      }
                    },
                    '解锁并激活'
                  ),
                  h(
                    'button',
                    {
                      onClick: () => {
                        user.setLockStatus(false)
                        document.dispatchEvent(
                          new KeyboardEvent('keydown', {
                            key: 'k',
                            ctrlKey: true,
                            bubbles: true,
                            cancelable: true
                          })
                        )
                      }
                    },
                    '解锁并搜索'
                  ),
                  ...imagePayloads.map((payload, index) =>
                    h(
                      'button',
                      {
                        onClick: () => mittBus.emit(event, payload),
                        'data-payload': payload
                      },
                      `激活图案${index + 1}`
                    )
                  ),
                  h(
                    'button',
                    {
                      onClick: async () => {
                        const request = pending.shift()
                        if (!request) return
                        const module = await actualLoader()
                        request.resolve({
                          default: () =>
                            h(module.default, {
                              onVnodeMounted: () => mounts.value++,
                              onVnodeUnmounted: () => unmounts.value++
                            })
                        })
                        finishes.value++
                      }
                    },
                    '完成加载'
                  ),
                  h(
                    'button',
                    {
                      onClick: () => pending.shift()?.reject(new Error('controlled loader failure'))
                    },
                    '加载失败'
                  ),
                  h('output', { 'aria-label': '加载次数' }, String(loads.value)),
                  h('output', { 'aria-label': '完成次数' }, String(finishes.value)),
                  h('output', { 'aria-label': '事件次数' }, String(events.value)),
                  h('output', { 'aria-label': '挂载次数' }, String(mounts.value)),
                  h('output', { 'aria-label': '卸载次数' }, String(unmounts.value)),
                  h('output', { 'aria-label': '锁屏状态' }, String(user.isLock)),
                  h('output', { 'aria-label': '最后激活图案', hidden: true }, lastPayload.value)
                ]
              )
            ])
        }
      )
  }
})
app.use(store)
app.use(i18n)
app.use(router)
setupGlobDirectives(app)
app.mount('#app')
