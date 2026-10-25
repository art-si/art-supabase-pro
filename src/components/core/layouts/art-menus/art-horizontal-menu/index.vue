<!-- 水平菜单 -->
<template>
  <div class="art-horizontal-menu flex-1 overflow-hidden">
    <ElMenu
      :ellipsis="true"
      mode="horizontal"
      :default-active="routerPath"
      :text-color="isDark ? 'var(--art-gray-800)' : 'var(--art-gray-700)'"
      :popper-offset="-6"
      background-color="transparent"
      :show-timeout="50"
      :hide-timeout="50"
      popper-class="horizontal-menu-popper"
      class="w-full border-none"
    >
      <HorizontalSubmenu
        v-for="item in filteredMenuItems"
        :key="item.path"
        :item="item"
        :isMobile="false"
        :level="0"
      />
    </ElMenu>
  </div>
</template>

<script setup lang="ts">
  import type { AppRouteRecord } from '@/types/router'
  import HorizontalSubmenu from './widget/horizontal-submenu.vue'
  import { filterVisibleMenuItems } from '@/utils/navigation'
  import { useSettingStore } from '@/store/modules/setting'

  defineOptions({ name: 'ArtHorizontalMenu' })

  const settingStore = useSettingStore()
  const { isDark } = storeToRefs(settingStore)

  interface Props {
    /** 菜单列表数据 */
    list: AppRouteRecord[]
  }

  const route = useRoute()

  const props = withDefaults(defineProps<Props>(), {
    list: () => []
  })

  /**
   * 过滤后的菜单项列表
   * 只显示未隐藏的菜单项
   */
  const filteredMenuItems = computed(() => {
    return filterVisibleMenuItems(props.list)
  })

  /**
   * 当前激活的路由路径
   * 用于菜单高亮显示
   */
  const routerPath = computed(() => String(route.meta.activePath || route.path))
</script>

<style scoped lang="scss">
  :global(html[data-box-mode='border-mode'] .horizontal-menu-popper .el-menu--popup) {
    box-shadow: none;
  }

  :global(html[data-box-mode='shadow-mode'] .horizontal-menu-popper .el-menu--popup) {
    box-shadow: var(--art-card-shadow-xs);
  }

  /* Remove el-menu bottom border */
  :deep(.el-menu) {
    border-bottom: none !important;
  }

  /* Remove default styles for first-level menu items */
  :deep(.el-menu-item[tabindex='0']) {
    background-color: transparent !important;
    border: none !important;
  }

  /* Remove bottom border from submenu titles */
  :deep(.el-menu--horizontal .el-sub-menu__title) {
    padding: 0 30px 0 10px !important;
    border: 0 !important;
  }

  .art-horizontal-menu {
    :deep(.el-menu--horizontal > .el-menu-item),
    :deep(.el-menu--horizontal > .el-sub-menu .el-sub-menu__title) {
      height: 40px;
      margin: 10px 2px;
      border-radius: var(--el-border-radius-base);
      transition:
        color 0.18s ease,
        background-color 0.18s ease,
        box-shadow 0.18s ease;
    }

    :deep(.el-menu--horizontal > .el-menu-item:hover),
    :deep(.el-menu--horizontal > .el-sub-menu:hover .el-sub-menu__title) {
      color: var(--theme-color) !important;
      background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color)) !important;
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--theme-color) 11%, transparent);
    }
  }
</style>
