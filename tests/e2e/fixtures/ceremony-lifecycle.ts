import { createApp, defineComponent, h, ref } from 'vue'
import { createPinia, storeToRefs } from 'pinia'
import { useCeremony } from '@/hooks/core/useCeremony'
import { useCurrentFestival } from '@/hooks/core/useCurrentFestival'
import { useSettingsPanel } from '@/components/core/layouts/art-settings-panel/composables/useSettingsPanel'
import { useSettingsHandlers } from '@/components/core/layouts/art-settings-panel/composables/useSettingsHandlers'
import { useSettingsState } from '@/components/core/layouts/art-settings-panel/composables/useSettingsState'
import { useSettingStore } from '@/store/modules/setting'
import { festivalConfigList } from '@/config/modules/festival'
import { mittBus } from '@/utils/sys'
import { useTheme, initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { useThemeAnimation } from '@/hooks/core/useThemeAnimation'

festivalConfigList.push({
  name: '生命周期测试',
  date: '2026-10-07',
  image: '',
  count: 1,
  scrollText: '测试完成'
})
festivalConfigList.push({ name: '次日测试', date: '2026-10-08', image: '', scrollText: '次日提示' })
festivalConfigList.push({
  name: '跨日测试',
  date: '2026-10-09',
  endDate: '2026-10-10',
  image: '',
  scrollText: '跨日提示'
})
const controller = defineComponent({
  setup() {
    const { openFestival, cleanup } = useCeremony()
    const { drawerControl } = useSettingsPanel()
    const { boxStyleHandlers, basicHandlers } = useSettingsHandlers()
    const { initColorWeak } = useSettingsState()
    const settings = useSettingStore()
    const { switchThemeStyles } = useTheme()
    const themeAnimation = useThemeAnimation()
    settings.setGlobalTheme(SystemThemeEnum.LIGHT, SystemThemeEnum.LIGHT)
    initializeTheme()
    return () =>
      h('section', [
        h('button', { onClick: themeAnimation }, '切换主题效果'),
        h('button', { onClick: () => switchThemeStyles(SystemThemeEnum.DARK) }, '切换暗色'),
        h('button', { onClick: () => switchThemeStyles(SystemThemeEnum.LIGHT) }, '切换亮色'),
        h('button', { onClick: initializeTheme }, '初始化主题'),
        h('button', { onClick: () => switchThemeStyles(SystemThemeEnum.AUTO) }, '跟随系统主题'),
        h('button', { onClick: openFestival }, '启动效果'),
        h('button', { onClick: cleanup }, '关闭效果'),
        h('button', { onClick: drawerControl.handleOpen }, '打开主题延迟'),
        h('button', { onClick: drawerControl.handleClose }, '关闭主题延迟'),
        h('button', { onClick: () => boxStyleHandlers.setBoxMode('shadow-mode') }, '选择阴影'),
        h('button', { onClick: () => boxStyleHandlers.setBoxMode('border-mode') }, '选择边框'),
        h(
          'button',
          {
            onClick: () => {
              if (!settings.colorWeak) settings.setColorWeak()
              initColorWeak()
            }
          },
          '初始化色弱'
        ),
        h(
          'button',
          {
            onClick: () => {
              if (settings.colorWeak) basicHandlers.colorWeak()
            }
          },
          '关闭色弱'
        )
      ])
  }
})
const app = createApp({
  setup() {
    const setting = useSettingStore()
    setting.setFestivalDate('')
    setting.setShowFestivalText(false)
    const { showFestivalText } = storeToRefs(setting)
    const { currentFestivalData } = useCurrentFestival()
    const shared = currentFestivalData === useCurrentFestival().currentFestivalData
    const mounted = ref(true)
    const fireworks = ref(0)
    mittBus.on('triggerFireworks', () => {
      fireworks.value++
    })
    return () =>
      h('main', [
        mounted.value ? h(controller) : null,
        h(
          'output',
          { 'data-testid': 'festival' },
          JSON.stringify({
            name: currentFestivalData.value?.name ?? null,
            shared,
            allowed: setting.isShowFireworks
          })
        ),
        h(
          'button',
          {
            onClick: () => {
              mounted.value = false
            }
          },
          '卸载控制器'
        ),
        h(
          'output',
          { 'data-testid': 'state' },
          JSON.stringify({
            fireworks: fireworks.value,
            borderMode: setting.boxBorderMode,
            text: showFestivalText.value
          })
        )
      ])
  }
})
app.use(createPinia())
app.mount('#app')
