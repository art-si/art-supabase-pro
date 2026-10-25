import { useCommon } from './useCommon'
import { useTheme } from './useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import { useSettingStore } from '@/store/modules/setting'

/** Create one theme controller in the caller's component scope. */
export function useThemeAnimation(): (event: MouseEvent) => void {
  const { switchThemeStyles } = useTheme()
  const { refresh } = useCommon()
  const settings = useSettingStore()
  const toggleTheme = (): void => {
    switchThemeStyles(
      settings.systemThemeType === SystemThemeEnum.LIGHT
        ? SystemThemeEnum.DARK
        : SystemThemeEnum.LIGHT
    )
    refresh()
  }
  return (event) => {
    if (
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      event.detail === 0 ||
      !document.startViewTransition
    ) {
      toggleTheme()
      return
    }
    const { clientX: x, clientY: y } = event
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))
    document.documentElement.style.setProperty('--x', `${x}px`)
    document.documentElement.style.setProperty('--y', `${y}px`)
    document.documentElement.style.setProperty('--r', `${radius}px`)
    document.startViewTransition(toggleTheme)
  }
}
