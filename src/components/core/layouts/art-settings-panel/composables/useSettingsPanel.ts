import { ref, computed, watch } from 'vue'
import { useSettingStore } from '@/store/modules/setting'
import { storeToRefs } from 'pinia'
import { useTimeoutFn, tryOnScopeDispose } from '@vueuse/core'
import AppConfig from '@/config'
import { SILVER_MIST_ACCENT, SILVER_MIST_LEGACY_ACCENT } from '@/config/setting'
import { SystemThemeEnum } from '@/enums/app-enum'
import { mittBus } from '@/utils/sys'
import { useTheme } from '@/hooks/core/useTheme'
import { useCeremony } from '@/hooks/core/useCeremony'
import { useWorkspaceMenuLayout } from '@/hooks/core/useWorkspaceMenuLayout'
import { useSettingsState } from './useSettingsState'
import { useSettingsHandlers } from './useSettingsHandlers'

/**
 * 设置面板核心逻辑管理
 */
export function useSettingsPanel() {
  const settingStore = useSettingStore()
  const { systemThemeType, systemThemeMode } = storeToRefs(settingStore)

  // Composables
  const { openFestival, cleanup } = useCeremony()
  const { setSystemTheme, setSystemAutoTheme } = useTheme()
  const { initColorWeak } = useSettingsState()
  const { selectedMenuLayout, applyResponsiveMenuLayout } = useWorkspaceMenuLayout()
  const { domOperations } = useSettingsHandlers()

  // 响应式状态
  const showDrawer = ref(false)

  // 计算属性
  const systemThemeColor = computed(() => settingStore.systemThemeColor as string)

  // 主题相关处理
  const useThemeHandlers = () => {
    // 初始化系统颜色
    const initSystemColor = () => {
      if (settingStore.workspaceAppearance === 'silver-mist') {
        if (systemThemeColor.value === SILVER_MIST_LEGACY_ACCENT) {
          settingStore.setElementTheme(SILVER_MIST_ACCENT)
          return
        }
        if (systemThemeColor.value === SILVER_MIST_ACCENT) return
      }
      if (!AppConfig.systemMainColor.includes(systemThemeColor.value)) {
        settingStore.setElementTheme(AppConfig.systemMainColor[0])
        settingStore.reload()
      }
    }

    // 初始化系统主题
    const initSystemTheme = () => {
      if (systemThemeMode.value === SystemThemeEnum.AUTO) {
        setSystemAutoTheme()
      } else {
        setSystemTheme(systemThemeType.value)
      }
    }

    return {
      initSystemColor,
      initSystemTheme
    }
  }

  // 抽屉控制
  const useDrawerControl = () => {
    const themeChangeTimer = useTimeoutFn(
      () => domOperations.setBodyClass('theme-change', true),
      500,
      { immediate: false }
    )

    // 打开抽屉
    const handleOpen = () => {
      // 延迟添加 theme-change class，避免抽屉打开动画受影响
      themeChangeTimer.start()
    }

    // 关闭抽屉
    const handleClose = () => {
      themeChangeTimer.stop()
      // 立即移除 theme-change class
      domOperations.setBodyClass('theme-change', false)
    }
    tryOnScopeDispose(handleClose)

    // 打开设置
    const openSetting = () => {
      showDrawer.value = true
    }

    // 关闭设置
    const closeDrawer = () => {
      showDrawer.value = false
    }

    return {
      handleOpen,
      handleClose,
      openSetting,
      closeDrawer
    }
  }

  const drawerControl = useDrawerControl()

  // Props 变化监听
  const usePropsWatcher = (props: { open?: boolean }) => {
    watch(
      () => props.open,
      (val: boolean | undefined) => {
        if (val !== undefined) {
          showDrawer.value = val
        }
      }
    )
  }

  // 初始化设置
  const useSettingsInitializer = () => {
    const themeHandlers = useThemeHandlers()
    const { openSetting } = drawerControl

    const initializeSettings = () => {
      mittBus.on('openSetting', openSetting)
      themeHandlers.initSystemColor()
      initColorWeak()

      themeHandlers.initSystemTheme()
      openFestival()
    }

    const cleanupSettings = () => {
      mittBus.off('openSetting', openSetting)
      cleanup()
    }

    return {
      initializeSettings,
      cleanupSettings
    }
  }

  return {
    // 状态
    showDrawer,
    selectedMenuLayout,

    // 方法组合
    applyResponsiveMenuLayout,
    useThemeHandlers,
    drawerControl,
    usePropsWatcher,
    useSettingsInitializer
  }
}
