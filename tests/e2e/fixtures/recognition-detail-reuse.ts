import { createApp, h, ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import language from '@/locales'
import { store } from '@/store'
import { useUserStore } from '@/store/modules/user'
import { useSettingStore } from '@/store/modules/setting'
import { setupGlobDirectives } from '@/directives'
import { initializeTheme, useTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import Detail from '@/views/intelligent-recognition/modules/recognition-detail-drawer.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const darkTheme = new URLSearchParams(location.search).get('theme') === 'dark'
const detail = ref<InstanceType<typeof Detail>>()
const app = createApp({
  render: () =>
    h(ElConfigProvider, { locale: zhCn }, () =>
      h('main', [
        h(
          'button',
          { type: 'button', onClick: () => detail.value?.handleOpen('recognition-test') },
          '查看测试识别'
        ),
        h(Detail, { ref: detail })
      ])
    )
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
initializeTheme()
document.documentElement.dataset.uiScope = 'workspace'
useTheme().switchThemeStyles(darkTheme ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT)
document.documentElement.dataset.boxMode = useSettingStore(store).boxBorderMode
  ? 'border-mode'
  : 'shadow-mode'
app.mount('#recognition-detail')
