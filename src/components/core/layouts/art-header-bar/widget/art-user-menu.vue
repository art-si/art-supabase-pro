<!-- 用户菜单 -->
<template>
  <ElPopover
    ref="userMenuPopover"
    placement="bottom-end"
    :width="240"
    :hide-after="0"
    :offset="10"
    trigger="click"
    :show-arrow="false"
    popper-class="user-menu-popover"
    popper-style="padding: 5px 16px;"
    @show="focusFirstMenuItem"
  >
    <template #reference>
      <button
        ref="userMenuButton"
        type="button"
        class="mr-5 rounded-full max-sm:mr-[16px]"
        aria-label="打开用户菜单"
      >
        <img
          class="size-8.5 c-p rounded-full max-sm:w-6.5 max-sm:h-6.5"
          :src="userInfo.avatar || defaultAvatar"
          width="34"
          height="34"
          alt="用户头像"
        />
      </button>
    </template>
    <template #default>
      <div class="pt-3" @keydown.esc.prevent.stop="closeUserMenuAndRestoreFocus">
        <div class="flex-c pb-1 px-0">
          <img
            class="w-10 h-10 mr-3 ml-0 overflow-hidden rounded-full float-left"
            :src="userInfo.avatar || defaultAvatar"
            width="40"
            height="40"
            alt="用户头像"
          />
          <div class="w-[calc(100%-60px)] h-full">
            <span class="block text-sm font-medium text-g-800 truncate">{{
              userInfo.nickName || userInfo.userName || userInfo.email
            }}</span>
            <span class="block mt-0.5 text-xs text-g-500 truncate">{{ userInfo.email }}</span>
          </div>
        </div>
        <ul class="py-4 mt-3 border-t border-g-300/80">
          <li>
            <RouterLink class="btn-item" to="/system/user-center" @click="closeUserMenu">
              <ArtSvgIcon icon="ri:user-3-line" />
              <span>{{ $t('topBar.user.userCenter') }}</span>
            </RouterLink>
          </li>
          <li>
            <a
              class="btn-item"
              :href="WEB_LINKS.GITEE"
              target="_blank"
              rel="noopener noreferrer"
              @click="closeUserMenu"
            >
              <ArtSvgIcon icon="ri:gitee-line" />
              <span>{{ $t('topBar.user.gitee') }}</span>
            </a>
          </li>
          <li>
            <a
              class="btn-item"
              :href="WEB_LINKS.GITHUB"
              target="_blank"
              rel="noopener noreferrer"
              @click="closeUserMenu"
            >
              <ArtSvgIcon icon="ri:github-line" />
              <span>{{ $t('topBar.user.github') }}</span>
            </a>
          </li>
          <li>
            <button type="button" class="btn-item" @click="lockScreen">
              <ArtSvgIcon icon="ri:lock-line" />
              <span>{{ $t('topBar.user.lockScreen') }}</span>
            </button>
          </li>
          <li aria-hidden="true">
            <div class="w-full h-px my-2 bg-g-300/80"></div>
          </li>
          <li>
            <button type="button" class="log-out" @click="loginOut">
              {{ $t('topBar.user.logout') }}
            </button>
          </li>
        </ul>
      </div>
    </template>
  </ElPopover>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useTimeoutFn } from '@vueuse/core'
  import type { PopoverInstance } from 'element-plus'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useUserStore } from '@/store/modules/user'
  import { WEB_LINKS } from '@/utils/constants'
  import { mittBus } from '@/utils/sys'
  import defaultAvatar from '@imgs/user/avatar.webp'

  defineOptions({ name: 'ArtUserMenu' })

  const { t } = useI18n()
  const { confirmAction } = useArtFeedback()
  const userStore = useUserStore()

  const { getUserInfo: userInfo } = storeToRefs(userStore)
  const userMenuPopover = ref<PopoverInstance>()
  const userMenuButton = ref<HTMLButtonElement>()
  const { start: closeUserMenu } = useTimeoutFn(() => userMenuPopover.value?.hide(), 100, {
    immediate: false
  })
  const { start: restoreMenuFocus } = useTimeoutFn(() => userMenuButton.value?.focus(), 120, {
    immediate: false
  })

  const focusFirstMenuItem = async (): Promise<void> => {
    await nextTick()
    document.querySelector<HTMLElement>('.user-menu-popover .btn-item')?.focus()
  }

  /**
   * 打开锁屏功能
   */
  const lockScreen = (): void => {
    closeUserMenu()
    mittBus.emit('openLockScreen')
  }

  /**
   * 用户登出确认
   */
  const { start: confirmLogoutLater } = useTimeoutFn(
    async () => {
      try {
        await confirmAction(t('common.logOutTips'), t('common.tips'), {
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          customClass: 'login-out-dialog'
        })
      } catch {
        return
      }
      userStore.logOut()
    },
    200,
    { immediate: false }
  )
  const loginOut = (): void => {
    closeUserMenu()
    confirmLogoutLater()
  }

  /**
   * 关闭用户菜单弹出层
   */
  const closeUserMenuAndRestoreFocus = (): void => {
    closeUserMenu()
    restoreMenuFocus()
  }
</script>

<style scoped>
  @reference '@styles/core/tailwind.css';

  @layer components {
    .btn-item {
      @apply flex w-full items-center p-2 mb-3 text-left select-none rounded-md cursor-pointer;

      color: inherit;
      text-decoration: none;
      background: transparent;
      border: 0;
      transition:
        color 0.18s ease,
        background-color 0.18s ease;

      span {
        @apply text-sm;
      }

      .art-svg-icon {
        @apply mr-2 text-base;
      }

      &:hover {
        background-color: var(--art-gray-200);
      }
    }
  }

  .log-out {
    @apply w-full
    py-1.5
    mt-5
    text-xs
    text-center
    border
    border-g-400
    rounded-md
    hover:shadow-xl;

    cursor: pointer;
    transition:
      color 0.2s ease,
      background-color 0.2s ease,
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }
</style>
