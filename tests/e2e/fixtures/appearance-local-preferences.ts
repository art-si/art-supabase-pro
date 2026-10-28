import { createApp, h, ref } from 'vue'
import type { AppRouteRecord } from '@/types/router'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { useMenuStore } from '@/store/modules/menu'
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
import language from '@/locales'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const permission = { name: 'System:SystemParam:Edit', type: 'button' } as AppRouteRecord
document.documentElement.dataset.uiScope = 'workspace'

const app = createApp({
  setup() {
    const settings = useSettingStore()
    const menu = useMenuStore()
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
