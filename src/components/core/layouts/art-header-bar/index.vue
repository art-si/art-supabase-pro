<!-- 顶部栏 -->
<template>
  <div class="art-header-bar w-full" :class="{ 'art-header-bar--header-left': isHeaderLeftMenu }">
    <div
      class="art-header-bar__main relative box-border flex-b select-none"
      :class="[
        props.showWorkTab && (tabStyle === 'tab-card' || tabStyle === 'tab-google')
          ? 'border-b border-[var(--art-card-border)]'
          : ''
      ]"
    >
      <div class="flex-c flex-1 min-w-0 leading-15" style="display: flex">
        <!-- 系统信息  -->
        <button
          v-if="isTopMenu || isHeaderLeftMenu"
          type="button"
          class="art-header-bar__brand flex-c c-p border-0 bg-transparent"
          aria-label="返回首页"
          @click="toHome"
        >
          <ArtLogo
            class="pl-4.5 pr-2"
            :variant="isHeaderLeftMenu || width >= 1400 ? 'full' : 'mark'"
            :dark="isDark"
          />
        </button>

        <ArtLogo
          class="!hidden pl-3.5 overflow-hidden align-[-0.15em] fill-current"
          @click="toHome"
        />

        <!-- 菜单按钮 -->
        <ArtIconButton
          v-if="isLeftMenu && shouldShowMenuButton"
          icon="ri:menu-2-fill"
          label="展开或收起侧边菜单"
          class="ml-3 max-sm:ml-[7px]"
          @click="visibleMenu"
        />

        <!-- 刷新按钮 -->
        <ArtIconButton
          v-if="shouldShowRefreshButton && !isHeaderLeftMenu"
          icon="ri:refresh-line"
          label="刷新当前页面"
          class="!ml-3 refresh-btn max-sm:!hidden"
          :style="{ marginLeft: !isLeftMenu ? '10px' : '0' }"
          @click="() => reload()"
        />

        <!-- 当前路由设计参考（仅平台超级管理员） -->
        <PageDesignReference
          v-if="isPlatformSuper && shouldShowRefreshButton && !isHeaderLeftMenu"
        />

        <!-- 快速入口 -->
        <ArtFastEnter
          v-if="shouldShowFastEnter && !isHeaderLeftMenu && width >= headerBarFastEnterMinWidth"
          v-slot="{ onTriggerClick }"
        >
          <ArtIconButton
            icon="ri:function-line"
            label="打开快捷入口"
            class="ml-3"
            @click="onTriggerClick"
          />
        </ArtFastEnter>

        <!-- 面包屑 -->
        <ArtBreadcrumb
          v-if="(shouldShowBreadcrumb && isLeftMenu) || (shouldShowBreadcrumb && isDualMenu)"
        />

        <!-- 顶部菜单 -->
        <ArtHorizontalMenu v-if="isTopMenu" :list="menuList" />

        <!-- 混合菜单-顶部 -->
        <ArtMixedMenu v-if="isTopLeftMenu" :list="menuList" />
      </div>

      <div class="art-header-bar__actions flex-c">
        <PlatformTenantScopeSwitcher />
        <ArtApplicationSwitcher />

        <!-- 搜索 -->
        <button
          v-if="shouldShowGlobalSearch"
          type="button"
          aria-label="打开全局搜索"
          class="art-header-bar__search flex-cb w-40 h-9 px-2.5 c-p border rounded-custom-sm max-md:!hidden"
          @click="openSearchDialog"
        >
          <div class="flex-c">
            <ArtSvgIcon icon="ri:search-line" class="text-sm text-g-500" />
            <span class="ml-1 text-xs font-normal text-g-500">{{ $t('topBar.search.title') }}</span>
          </div>
          <div class="flex-c h-5 px-1.5 text-g-500/80 border border-g-400 rounded">
            <ArtSvgIcon v-if="isWindows" icon="vaadin:ctrl-a" class="text-sm" />
            <ArtSvgIcon v-else icon="ri:command-fill" class="text-xs" />
            <span class="ml-0.5 text-xs">k</span>
          </div>
        </button>

        <!-- 全屏按钮 -->
        <ArtIconButton
          v-if="shouldShowFullscreen"
          :icon="isFullscreen ? 'dashicons:fullscreen-exit-alt' : 'dashicons:fullscreen-alt'"
          :label="isFullscreen ? '退出全屏' : '进入全屏'"
          :class="[!isFullscreen ? 'full-screen-btn' : 'exit-full-screen-btn', 'ml-3']"
          class="max-md:!hidden"
          @click="toggleFullScreen"
        />

        <!-- 国际化按钮 -->
        <ElDropdown
          @command="changeLanguage"
          popper-class="langDropDownStyle"
          v-if="shouldShowLanguage"
        >
          <ArtIconButton icon="ri:translate-2" label="切换语言" class="language-btn text-[19px]" />
          <template #dropdown>
            <ElDropdownMenu>
              <div v-for="item in languageOptions" :key="item.value" class="lang-btn-item">
                <ElDropdownItem
                  :command="item.value"
                  :class="{ 'is-selected': locale === item.value }"
                >
                  <span class="menu-txt">{{ item.label }}</span>
                  <ArtSvgIcon icon="ri:check-fill" v-if="locale === item.value" />
                </ElDropdownItem>
              </div>
            </ElDropdownMenu>
          </template>
        </ElDropdown>

        <!-- 通知按钮 -->
        <ElBadge
          v-if="shouldShowNotification"
          :value="notificationUnreadCount"
          :max="99"
          :hidden="notificationUnreadCount === 0"
          class="notice-badge"
        >
          <ArtIconButton
            icon="ri:notification-2-line"
            :label="notificationButtonLabel"
            class="notice-button"
            @click="visibleNotice"
          />
        </ElBadge>

        <!-- 聊天按钮 -->
        <ArtIconButton
          v-if="shouldShowChat"
          icon="ri:message-3-line"
          label="打开智能助手"
          class="chat-button relative"
          @click="openChat"
        >
          <div class="breathing-dot absolute top-2 right-2 size-1.5 !bg-success rounded-full"></div>
        </ArtIconButton>

        <!-- 设置按钮 -->
        <div v-if="shouldShowSettings">
          <ElPopover :visible="showSettingGuide" placement="bottom-start" :width="190" :offset="0">
            <template #reference>
              <div class="flex-cc">
                <ArtIconButton
                  icon="ri:settings-line"
                  label="打开界面设置"
                  class="setting-btn"
                  @click="openSetting"
                />
              </div>
            </template>
            <template #default>
              <div class="setting-guide">
                <p
                  >{{ $t('topBar.guide.title')
                  }}<span :style="{ color: systemThemeColor }">
                    {{ $t('topBar.guide.theme') }} </span
                  >、<span :style="{ color: systemThemeColor }">
                    {{ $t('topBar.guide.menu') }} </span
                  >{{ $t('topBar.guide.description') }}
                </p>
                <ElButton size="small" type="primary" link @click="settingStore.hideSettingGuide()">
                  知道了
                </ElButton>
              </div>
            </template>
          </ElPopover>
        </div>

        <!-- 主题切换按钮 -->
        <ArtIconButton
          v-if="shouldShowThemeToggle"
          @click="themeAnimation"
          :icon="isDark ? 'ri:sun-fill' : 'ri:moon-line'"
          :label="isDark ? '切换浅色模式' : '切换深色模式'"
        />

        <!-- 用户头像、菜单 -->
        <ArtUserMenu />
      </div>
    </div>

    <!-- 标签页 -->
    <ArtWorkTab v-if="props.showWorkTab" />

    <!-- 通知 -->
    <ArtNotification v-model:value="showNotice" @unread-change="handleUnreadChange" />
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useRouter } from 'vue-router'
  import { useEventListener, useFullscreen, useTimeoutFn, useWindowSize } from '@vueuse/core'
  import { LanguageEnum, MenuTypeEnum } from '@/enums/app-enum'
  import { useSettingStore } from '@/store/modules/setting'
  import { useUserStore } from '@/store/modules/user'
  import { useMenuStore } from '@/store/modules/menu'
  import { languageOptions } from '@/locales'
  import { mittBus } from '@/utils/sys'
  import { useThemeAnimation } from '@/hooks/core/useThemeAnimation'
  import { useCommon } from '@/hooks/core/useCommon'
  import { useHeaderBar } from '@/hooks/core/useHeaderBar'
  import ArtUserMenu from './widget/art-user-menu.vue'
  import ArtApplicationSwitcher from './widget/art-application-switcher.vue'
  import PlatformTenantScopeSwitcher from '@/components/business/platform-tenant-scope-switcher/index.vue'
  import PageDesignReference from '@/components/business/page-design-reference/index.vue'

  defineOptions({ name: 'ArtHeaderBar' })

  interface Props {
    /** 是否由顶部栏渲染工作标签；组合布局会在内容区单独渲染 */
    showWorkTab?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    showWorkTab: true
  })

  // 检测操作系统类型
  const isWindows = navigator.userAgent.includes('Windows')

  const router = useRouter()
  const themeAnimation = useThemeAnimation()
  const { locale } = useI18n()
  const { width } = useWindowSize()

  const settingStore = useSettingStore()
  const userStore = useUserStore()
  const menuStore = useMenuStore()

  // 顶部栏功能配置
  const {
    shouldShowMenuButton,
    shouldShowRefreshButton,
    shouldShowFastEnter,
    shouldShowBreadcrumb,
    shouldShowGlobalSearch,
    shouldShowFullscreen,
    shouldShowNotification,
    shouldShowChat,
    shouldShowLanguage,
    shouldShowSettings,
    shouldShowThemeToggle,
    fastEnterMinWidth: headerBarFastEnterMinWidth
  } = useHeaderBar()

  const { menuOpen, systemThemeColor, showSettingGuide, menuType, isDark, tabStyle } =
    storeToRefs(settingStore)

  const { language, isPlatformSuper } = storeToRefs(userStore)
  const { menuList } = storeToRefs(menuStore)

  const showNotice = ref(false)
  const notificationUnreadCount = ref(0)
  const notificationButtonLabel = computed(() =>
    notificationUnreadCount.value > 0
      ? `打开通知中心，${notificationUnreadCount.value} 条未读`
      : '打开通知中心'
  )
  const { start: scheduleSettingGuide } = useTimeoutFn(
    () => settingStore.hideSettingGuide(),
    8000,
    { immediate: false }
  )

  // 菜单类型判断
  const isLeftMenu = computed(() => menuType.value === MenuTypeEnum.LEFT)
  const isHeaderLeftMenu = computed(() => menuType.value === MenuTypeEnum.HEADER_LEFT)
  const isDualMenu = computed(() => menuType.value === MenuTypeEnum.DUAL_MENU)
  const isTopMenu = computed(() => menuType.value === MenuTypeEnum.TOP)
  const isTopLeftMenu = computed(() => menuType.value === MenuTypeEnum.TOP_LEFT)

  const { isFullscreen, toggle: toggleFullscreen } = useFullscreen()

  onMounted(() => {
    initLanguage()
    if (showSettingGuide.value) {
      scheduleSettingGuide()
    }
  })

  /**
   * 切换全屏状态
   */
  const toggleFullScreen = (): void => {
    toggleFullscreen()
  }

  /**
   * 切换菜单显示/隐藏状态
   */
  const visibleMenu = (): void => {
    settingStore.setMenuOpen(!menuOpen.value)
  }

  const { homePath, refresh } = useCommon()
  const refreshDelay = ref(0)
  const { start: scheduleRefresh } = useTimeoutFn(refresh, refreshDelay, { immediate: false })

  /**
   * 跳转到首页
   */
  const toHome = (): void => {
    router.push(homePath.value)
  }

  /**
   * 刷新页面
   * @param {number} time - 延迟时间，默认为0毫秒
   */
  const reload = (time: number = 0): void => {
    refreshDelay.value = time
    scheduleRefresh()
  }

  /**
   * 初始化语言设置
   */
  const initLanguage = (): void => {
    locale.value = language.value
  }

  /**
   * 切换系统语言
   * @param {LanguageEnum} lang - 目标语言类型
   */
  const changeLanguage = (lang: LanguageEnum): void => {
    if (locale.value === lang) return
    locale.value = lang
    userStore.setLanguage(lang)
    reload(50)
  }

  /**
   * 打开设置面板
   */
  const openSetting = (): void => {
    mittBus.emit('openSetting')

    // 隐藏设置引导提示
    if (showSettingGuide.value) {
      settingStore.hideSettingGuide()
    }
  }

  /**
   * 打开全局搜索对话框
   */
  const openSearchDialog = (): void => {
    mittBus.emit('openSearchDialog')
  }

  /**
   * 点击页面其他区域关闭通知面板
   * @param {Event} e - 点击事件对象
   */
  const bodyCloseNotice = (e: MouseEvent): void => {
    if (!showNotice.value) return

    const target = e.target
    if (!(target instanceof Element)) return

    // 检查是否点击了通知按钮或通知面板内部
    const isNoticeButton = target.closest('.notice-button')
    const isNoticePanel = target.closest('.art-notification-panel')

    if (!isNoticeButton && !isNoticePanel) {
      showNotice.value = false
    }
  }

  useEventListener(document, 'click', bodyCloseNotice)

  /**
   * 切换通知面板显示状态
   */
  const visibleNotice = (): void => {
    showNotice.value = !showNotice.value
  }

  const handleUnreadChange = (count: number): void => {
    notificationUnreadCount.value = Math.max(0, count)
  }

  /**
   * 打开聊天窗口
   */
  const openChat = (): void => {
    mittBus.emit('openChat')
  }
</script>

<style lang="scss" scoped>
  .art-header-bar {
    background: transparent;

    &__main {
      min-height: var(--art-header-height);
      line-height: var(--art-header-height);
    }

    &__brand {
      min-width: 0;
      height: 44px;
      padding-right: var(--art-space-2);
      color: var(--art-gray-900);
      border-radius: var(--art-control-radius);

      &:focus-visible {
        outline: none;
        box-shadow: var(--art-themed-action-focus-shadow);
      }
    }

    &__actions {
      flex: 0 0 auto;
      gap: 6px;
      padding-right: var(--art-page-padding);
    }

    &__search {
      color: var(--art-gray-700);
      background: color-mix(in srgb, var(--default-box-color) 78%, transparent);
      border-color: var(--art-layout-divider);
      transition:
        color var(--art-motion-duration-fast) ease,
        background-color var(--art-motion-duration-fast) ease,
        border-color var(--art-motion-duration-fast) ease,
        box-shadow var(--art-motion-duration-fast) ease;

      &:hover {
        color: var(--art-gray-900);
        background: var(--default-box-color);
        border-color: color-mix(in srgb, var(--theme-color) 24%, var(--art-layout-divider));
        box-shadow: var(--art-themed-action-hover-shadow);
      }

      &:focus-visible {
        color: var(--art-gray-900);
        outline: none;
        box-shadow: var(--art-themed-action-focus-shadow);
      }
    }
  }

  .setting-guide {
    display: grid;
    gap: 6px;

    p {
      margin: 0;
      font-size: 13px;
      line-height: 1.65;
      color: var(--art-gray-700);
    }

    .el-button {
      justify-self: end;
      min-height: 28px;
      padding-inline: 6px;
    }
  }

  /* Custom animations */
  @keyframes rotate180 {
    0% {
      transform: rotate(0);
    }

    100% {
      transform: rotate(180deg);
    }
  }

  @keyframes shake {
    0% {
      transform: rotate(0);
    }

    25% {
      transform: rotate(-5deg);
    }

    50% {
      transform: rotate(5deg);
    }

    75% {
      transform: rotate(-5deg);
    }

    100% {
      transform: rotate(0);
    }
  }

  @keyframes expand {
    0% {
      transform: scale(1);
    }

    50% {
      transform: scale(1.1);
    }

    100% {
      transform: scale(1);
    }
  }

  @keyframes shrink {
    0% {
      transform: scale(1);
    }

    50% {
      transform: scale(0.9);
    }

    100% {
      transform: scale(1);
    }
  }

  @keyframes moveUp {
    0% {
      transform: translateY(0);
    }

    50% {
      transform: translateY(-3px);
    }

    100% {
      transform: translateY(0);
    }
  }

  @keyframes breathing {
    0% {
      opacity: 0.4;
      transform: scale(0.9);
    }

    50% {
      opacity: 1;
      transform: scale(1.1);
    }

    100% {
      opacity: 0.4;
      transform: scale(0.9);
    }
  }

  /* Hover animation classes */
  .refresh-btn:hover :deep(.art-svg-icon) {
    animation: rotate180 0.5s;
  }

  .language-btn:hover :deep(.art-svg-icon) {
    animation: moveUp 0.4s;
  }

  .setting-btn:hover :deep(.art-svg-icon) {
    animation: rotate180 0.5s;
  }

  .full-screen-btn:hover :deep(.art-svg-icon) {
    animation: expand 0.6s forwards;
  }

  .exit-full-screen-btn:hover :deep(.art-svg-icon) {
    animation: shrink 0.6s forwards;
  }

  .notice-button:hover :deep(.art-svg-icon) {
    animation: shake 0.5s ease-in-out;
  }

  .notice-badge {
    display: inline-flex;

    :deep(.el-badge__content) {
      top: 1px;
      right: 1px;
      min-width: 17px;
      height: 17px;
      padding: 0 5px;
      font-size: 10px;
      font-weight: 700;
      line-height: 15px;
      color: var(--el-color-white);
      border: 1px solid var(--default-bg-color);
      box-shadow: 0 2px 6px color-mix(in srgb, var(--el-color-danger) 24%, transparent);
      transform: translate(48%, -38%);
    }
  }

  .chat-button:hover :deep(.art-svg-icon) {
    animation: shake 0.5s ease-in-out;
  }

  /* Breathing animation for chat dot */
  .breathing-dot {
    animation: breathing 1.5s ease-in-out infinite;
  }

  /* iPad breakpoint adjustments */
  @media screen and (width <= 768px) {
    .logo2 {
      display: block !important;
    }
  }

  @media screen and (width <= 640px) {
    .btn-box {
      width: 40px;
    }
  }
</style>
