import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { createSharedComposable, useBreakpoints } from '@vueuse/core'
import { WORKSPACE_MENU_BREAKPOINT } from '@/config/setting'
import { MenuTypeEnum } from '@/enums/app-enum'
import { useSettingStore } from '@/store/modules/setting'
import { StorageConfig } from '@/utils/storage/storage-config'

const readDesktopMenuType = (): MenuTypeEnum | undefined => {
  const value = localStorage.getItem(StorageConfig.RESPONSIVE_MENU_TYPE_KEY)
  return Object.values(MenuTypeEnum).find((type) => type === value)
}

/** Keep the desktop preference independent of the temporary left navigation on narrow screens. */
export const useWorkspaceMenuLayout = createSharedComposable(() => {
  const settingStore = useSettingStore()
  const { menuType } = storeToRefs(settingStore)
  const isNarrow = useBreakpoints({ desktop: WORKSPACE_MENU_BREAKPOINT }).smaller('desktop')
  const storedDesktopMenuType = ref(readDesktopMenuType())
  const selectedMenuLayout = computed(() =>
    menuType.value === MenuTypeEnum.LEFT
      ? (storedDesktopMenuType.value ?? menuType.value)
      : menuType.value
  )

  const applyResponsiveMenuLayout = (type: MenuTypeEnum, desktopMenuOpen = true) => {
    const desktopMenuType = isNarrow.value && type !== MenuTypeEnum.LEFT ? type : undefined
    if (desktopMenuType !== storedDesktopMenuType.value) {
      storedDesktopMenuType.value = desktopMenuType
      if (desktopMenuType) {
        localStorage.setItem(StorageConfig.RESPONSIVE_MENU_TYPE_KEY, desktopMenuType)
      } else {
        localStorage.removeItem(StorageConfig.RESPONSIVE_MENU_TYPE_KEY)
      }
    }

    const visibleMenuType = isNarrow.value ? MenuTypeEnum.LEFT : type
    if (menuType.value !== visibleMenuType) settingStore.switchMenuLayouts(visibleMenuType)
    settingStore.setMenuOpen(!isNarrow.value && desktopMenuOpen)
  }

  watch(
    isNarrow,
    (narrow, previous) => {
      if (narrow || previous !== undefined || storedDesktopMenuType.value) {
        applyResponsiveMenuLayout(selectedMenuLayout.value)
      }
    },
    { immediate: true }
  )

  return { selectedMenuLayout, applyResponsiveMenuLayout }
})
