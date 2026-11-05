import { createApp, h, ref } from 'vue'
import type { AppRouteRecord } from '@/types/router'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useMenuStore } from '@/store/modules/menu'
import { useUserStore } from '@/store/modules/user'
import { SETTING_DEFAULT_CONFIG } from '@/config/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { initializeTheme } from '@/hooks/core/useTheme'
import { useSettingsHandlers } from '@/components/core/layouts/art-settings-panel/composables/useSettingsHandlers'
import {
  getAppearanceConfig,
  loadAppearanceConfig,
  saveAppearanceConfig
} from '@/hooks/core/useAppearanceConfig'
import SettingActions from '@/components/core/layouts/art-settings-panel/widget/setting-actions.vue'
import { useGlobalFocusPreference } from '@/hooks/core/useGlobalFocusPreference'
import language from '@/locales'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const permission = { name: 'System:SystemParam:Edit', type: 'button' } as AppRouteRecord
document.documentElement.dataset.uiScope = 'workspace'

const app = createApp({
  setup() {
    const settings = useSettingStore()
    const menu = useMenuStore()
    const user = useUserStore()
    const focus = window.location.search.includes('focus=1') ? useGlobalFocusPreference() : null
    const { basicHandlers, boxStyleHandlers, colorHandlers } = useSettingsHandlers()
    const loadState = ref('idle')
    const saveState = ref('idle')
    initializeTheme()

    const load = () => {
      loadState.value = 'loading'
      void loadAppearanceConfig().then(
        () => (loadState.value = 'done'),
        (error: unknown) => (loadState.value = `error: ${String(error)}`)
      )
    }
    const save = () => {
      saveState.value = 'saving'
      void saveAppearanceConfig().then(
        () => (saveState.value = 'done'),
        (error: unknown) => (saveState.value = `error: ${String(error)}`)
      )
    }

    load()

    return () =>
      h('main', [
        h('output', { 'data-testid': 'appearance' }, JSON.stringify(getAppearanceConfig(settings))),
        h('output', { 'data-testid': 'defaults' }, JSON.stringify(SETTING_DEFAULT_CONFIG)),
        h('output', { 'data-testid': 'load-state' }, loadState.value),
        h('output', { 'data-testid': 'save-state' }, saveState.value),
        h('output', { 'data-testid': 'focus-state' }, String(focus?.enabled.value ?? false)),
        h('output', { 'data-testid': 'focus-ready' }, String(focus?.initialized.value ?? false)),
        h(
          'button',
          { type: 'button', onClick: () => focus?.setLocalPreference(false) },
          '本地关闭专注'
        ),
        h(
          'button',
          { type: 'button', onClick: () => focus?.setLocalPreference(true) },
          '本地开启专注'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              user.setUserInfo({
                ...user.getUserInfo,
                userId: 'second-test-user'
              } as Api.Auth.UserInfo)
          },
          '切换测试账号'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () =>
              user.setUserInfo({
                ...user.getUserInfo,
                userId: 'permission-test-user'
              } as Api.Auth.UserInfo)
          },
          '切回测试账号'
        ),
        h('button', { type: 'button', onClick: load }, '再次读取默认外观'),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              colorHandlers.selectColor('#118855')
              boxStyleHandlers.setBoxMode('shadow-mode')
              basicHandlers.customRadius('1.25')
              basicHandlers.crumbs()
            }
          },
          '调整本地外观'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              colorHandlers.selectColor('#118855')
              colorHandlers.selectColor(SETTING_DEFAULT_CONFIG.systemThemeColor)
            }
          },
          '改动后改回主题色'
        ),
        h(
          'button',
          {
            type: 'button',
            onClick: () => {
              settings.setMenuOpen(!settings.menuOpen)
              settings.reload()
              settings.systemThemeType = SystemThemeEnum.DARK
            }
          },
          '仅改变运行状态'
        ),
        h(
          'button',
          { type: 'button', onClick: () => menu.setButtonList([permission]) },
          '授予保存权限'
        ),
        h('button', { type: 'button', onClick: save }, '直接调用保存'),
        h('div', { style: { width: '380px', maxWidth: '100%', margin: '24px auto' } }, [
          h(SettingActions)
        ])
      ])
  }
})

app.use(store)
app.use(language)
app.mount('#appearance-local-preferences')
