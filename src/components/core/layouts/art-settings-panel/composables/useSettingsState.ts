import { useSettingStore } from '@/store/modules/setting'
import { MenuThemeEnum, MenuTypeEnum } from '@/enums/app-enum'

/**
 * 设置状态管理
 */
export function useSettingsState() {
  const settingStore = useSettingStore()

  // 色弱模式初始化
  const initColorWeak = () => {
    document.documentElement.classList.toggle('color-weak', settingStore.colorWeak)
  }

  // 菜单布局切换
  const switchMenuLayouts = (type: MenuTypeEnum) => {
    if (
      type === MenuTypeEnum.LEFT ||
      type === MenuTypeEnum.HEADER_LEFT ||
      type === MenuTypeEnum.TOP_LEFT
    ) {
      settingStore.setMenuOpen(true)
    }
    settingStore.switchMenuLayouts(type)
    if (type === MenuTypeEnum.DUAL_MENU) {
      settingStore.switchMenuStyles(MenuThemeEnum.DESIGN)
      settingStore.setMenuOpen(true)
    }
  }

  return {
    // 方法
    initColorWeak,
    switchMenuLayouts
  }
}
