import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { router } from '@/router'
import { createCachedRouteLoader } from '@/router/core/component-loader'
import i18n from '@/locales'
import { setupGlobDirectives } from '@/directives'
import GlobalSearch from '@/components/core/layouts/art-global-search/index.vue'
import '@/assets/styles/core/tailwind.css'
import '@/assets/styles/index.scss'
const app = createApp({
  setup() {
    const mounted = ref(true)
    const user = useUserStore()
    const loads = ref(0)
    let complete: (() => void) | undefined
    let fail: (() => void) | undefined
    const navigationFixture = new URLSearchParams(location.search).has('navigation')
    if (navigationFixture) {
      const target = {
        path: '/search-preload-test',
        name: 'SearchPreloadTest',
        meta: { title: '预加载验收页面' }
      }
      useMenuStore().setMenuList([target])
      user.setSearchHistory([])
      router.addRoute({
        ...target,
        component: createCachedRouteLoader(() => {
          loads.value++
          return new Promise((resolve, reject) => {
            complete = () => resolve({ default: { render: () => h('p', '预加载目标页面') } })
            fail = () => reject(new Error('isolated preload failure'))
          })
        })
      })
    }
    return () =>
      h('main', { class: 'p-4' }, [
        navigationFixture
          ? h(
              'nav',
              {
                style: {
                  position: 'fixed',
                  bottom: '8px',
                  left: '8px',
                  zIndex: 10000,
                  maxWidth: 'calc(100vw - 16px)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '8px'
                }
              },
              [
                h(
                  'button',
                  { type: 'button', onClick: () => user.setLockStatus(!user.isLock) },
                  '切换锁定状态'
                ),
                h('button', { type: 'button', onClick: () => complete?.() }, '完成预加载'),
                h('button', { type: 'button', onClick: () => fail?.() }, '拒绝预加载'),
                h('output', { 'aria-label': '预加载次数' }, String(loads.value)),
                h('output', { 'aria-label': '当前路径' }, router.currentRoute.value.path),
                h('output', { 'aria-label': '历史次数' }, String(user.searchHistory.length))
              ]
            )
          : null,
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              mounted.value = !mounted.value
            }
          },
          '切换搜索组件'
        ),
        mounted.value ? h(GlobalSearch) : null
      ])
  }
})
app.use(store)
app.use(i18n)
setupGlobDirectives(app)
useUserStore(store).setUserInfo({
  userId: 'search-lifecycle-test',
  tenantId: '11111111-1111-4111-8111-111111111111',
  platformSuper: false
})
app.mount('#app')
