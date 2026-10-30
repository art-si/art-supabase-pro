import { createApp, h, onMounted } from 'vue'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useMenuStore } from '@/store/modules/menu'
import { setupGlobDirectives } from '@/directives'
import { useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import language from '@/locales'
import TrailerManage from '@vms/views/trailer-manage/index.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const darkTheme = new URLSearchParams(location.search).get('theme') === 'dark'

useUserStore(store).setUserInfo({
  userId: 'trailer-reference-test-user',
  tenantId: '22222222-2222-4222-8222-222222222222',
  platformSuper: true,
  nickName: '挂车定位验收用户'
})
useUserStore(store).setLoginStatus(true)
useMenuStore(store).setButtonList([
  { name: 'TrailerManage:View', path: '', type: 'button', meta: { title: '挂车查看' } }
])

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/vms/trailer-manage', name: 'TrailerManage', component: TrailerManage }]
})
const app = createApp({
  setup() {
    const { switchThemeStyles } = useTheme()
    onMounted(() => {
      if (darkTheme) switchThemeStyles(SystemThemeEnum.DARK)
    })
    const changeRecord = (recordId: string) =>
      router.push({ path: '/vms/trailer-manage', query: { fromMasterDelete: '1', recordId } })
    return () =>
      h('main', { class: 'art-page-view min-h-screen p-4' }, [
        h('div', { class: 'mb-3 flex gap-2' }, [
          h(
            'button',
            { type: 'button', onClick: () => changeRecord('trailer-ref-a') },
            '定位挂车 A'
          ),
          h(
            'button',
            { type: 'button', onClick: () => changeRecord('trailer-ref-b') },
            '定位挂车 B'
          )
        ]),
        h(RouterView)
      ])
  }
})
app.use(store)
app.use(router)
app.use(language)
setupGlobDirectives(app)
await router.push('/vms/trailer-manage?fromMasterDelete=1&recordId=trailer-ref-a')
await router.isReady()
app.mount('#vms-trailer-reference-location')
