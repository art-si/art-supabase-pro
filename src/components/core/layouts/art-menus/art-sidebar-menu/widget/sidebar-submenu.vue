<template>
  <template v-for="(item, index) in filteredMenuItems" :key="getUniqueKey(item, index)">
    <ElSubMenu
      v-if="hasChildren(item)"
      :index="item.path || item.meta.title"
      :level="level"
      :class="{ 'is-menu-section': menuLevel > 0 }"
    >
      <template #title>
        <div class="menu-icon flex-cc">
          <ArtSvgIcon
            :icon="item.meta.icon || ''"
            :color="menuIconColor"
            :style="{ color: menuIconColor }"
          />
        </div>
        <span class="menu-name" :title="formatMenuTitle(item.meta.title)">
          {{ formatMenuTitle(item.meta.title) }}
        </span>
        <div v-if="item.meta.showBadge" class="art-badge" style="right: 10px" />
      </template>

      <SidebarSubmenu
        :list="item.children"
        :is-mobile="isMobile"
        :level="menuLevel + 1"
        :theme="theme"
        @close="closeMenu"
      />
    </ElSubMenu>

    <ElMenuItem
      v-else
      :index="isExternalLink(item) ? '' : item.path || item.meta.title"
      :level-item="menuLevel + 1"
      @mouseenter="preloadMenuRoute(item)"
      @focusin="preloadMenuRoute(item)"
      @click="goPage(item)"
    >
      <div class="menu-icon flex-cc">
        <ArtSvgIcon
          :icon="item.meta.icon || ''"
          :color="menuIconColor"
          :style="{ color: menuIconColor }"
        />
      </div>
      <div
        v-show="item.meta.showBadge && menuLevel === 0 && !menuOpen"
        class="art-badge"
        style="right: 5px"
      />

      <template #title>
        <span class="menu-name" :title="formatMenuTitle(item.meta.title)">
          {{ formatMenuTitle(item.meta.title) }}
        </span>
        <div v-if="item.meta.showBadge" class="art-badge" />
        <div
          v-if="item.meta.showTextBadge && (menuLevel > 0 || menuOpen)"
          class="art-text-badge static! m-0! ml-2! shrink-0"
        >
          {{ item.meta.showTextBadge }}
        </div>
      </template>
    </ElMenuItem>
  </template>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import type { AppRouteRecord } from '@/types/router'
  import { formatMenuTitle } from '@/utils/router'
  import { filterVisibleMenuItems, preloadMenuRoute, startMenuJump } from '@/utils/navigation'
  import { useSettingStore } from '@/store/modules/setting'

  interface MenuTheme {
    iconColor?: string
  }

  interface Props {
    /** 菜单标题 */
    title?: string
    /** 菜单列表 */
    list?: AppRouteRecord[]
    /** 主题配置 */
    theme?: MenuTheme
    /** 是否为移动端模式 */
    isMobile?: boolean
    /** 菜单层级 */
    level?: number
  }

  interface Emits {
    /** 关闭菜单事件 */
    (e: 'close'): void
  }

  const props = withDefaults(defineProps<Props>(), {
    title: '',
    list: () => [],
    theme: () => ({}),
    isMobile: false,
    level: 0
  })

  const emit = defineEmits<Emits>()

  const settingStore = useSettingStore()

  const { menuOpen } = storeToRefs(settingStore)
  const menuIconColor = computed(() => props.theme?.iconColor)
  const menuLevel = computed(() => props.level ?? 0)

  /**
   * 过滤后的菜单项列表
   * 只显示未隐藏的菜单项
   */
  const filteredMenuItems = computed(() => filterVisibleMenuItems(props.list))

  /**
   * 跳转到指定页面
   * @param item 菜单项数据
   */
  const goPage = (item: AppRouteRecord): void => {
    closeMenu()
    startMenuJump(item)
  }

  /**
   * 关闭菜单
   * 触发父组件的关闭事件
   */
  const closeMenu = (): void => {
    emit('close')
  }

  /**
   * 判断菜单项是否包含可见的子菜单
   * @param item 菜单项数据
   * @returns 是否包含可见的子菜单
   */
  const hasChildren = (item: AppRouteRecord): boolean => {
    if (!item.children || item.children.length === 0) {
      return false
    }
    return item.children.length > 0
  }

  /**
   * 判断是否为外部链接
   * @param item 菜单项数据
   * @returns 是否为外部链接
   */
  const isExternalLink = (item: AppRouteRecord): boolean => {
    return !!(item.meta.link && !item.meta.isIframe)
  }

  /**
   * 生成唯一的 key
   * 使用 path、title 和 index 组合确保唯一性
   * @param item 菜单项数据
   * @param index 索引
   * @returns 唯一的 key
   */
  const getUniqueKey = (item: AppRouteRecord, index: number): string => {
    return `${item.path || item.meta.title || 'menu'}-${props.level}-${index}`
  }
</script>
