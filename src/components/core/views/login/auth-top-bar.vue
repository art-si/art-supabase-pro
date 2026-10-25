<!-- 授权页右上角组件 -->
<template>
  <div
    class="auth-top-bar absolute w-full flex-cb top-4.5 z-10 flex-c !justify-end max-[1180px]:!justify-between"
    :class="{ 'auth-top-bar--dark': isDark }"
  >
    <div class="flex-cc !hidden max-[1180px]:!flex ml-2 max-sm:ml-6">
      <ArtLogo class="icon" size="46" />
      <h1 class="text-xl ont-mediumf ml-2">{{ siteName }}</h1>
    </div>

    <div class="flex-cc gap-1.5 mr-2 max-sm:mr-5">
      <div class="color-picker-expandable relative flex-c max-sm:!hidden">
        <div
          class="color-dots absolute right-0 rounded-full flex-c gap-2 rounded-5 px-2.5 py-2 pr-9 pl-2.5 opacity-0"
        >
          <button
            v-for="(color, index) in mainColors"
            :key="color"
            type="button"
            class="color-dot relative size-5 c-p flex-cc rounded-full opacity-0"
            :class="{ active: color === systemThemeColor }"
            :style="{ background: color, '--index': index }"
            :aria-label="`切换主题色 ${color}`"
            :aria-pressed="color === systemThemeColor"
            @click="changeThemeColor(color)"
          >
            <ArtSvgIcon v-if="color === systemThemeColor" icon="ri:check-fill" class="text-white" />
          </button>
        </div>
        <button
          type="button"
          class="btn palette-btn relative z-[2] h-9 w-9 c-p flex-cc tad-300"
          aria-label="选择主题色"
          title="选择主题色"
        >
          <ArtSvgIcon
            icon="ri:palette-line"
            class="auth-top-bar__icon text-xl transition-colors duration-300"
          />
        </button>
      </div>
      <ElDropdown
        v-if="shouldShowLanguage"
        @command="changeLanguage"
        popper-class="langDropDownStyle"
      >
        <button
          type="button"
          class="btn language-btn h-9 w-9 c-p flex-cc tad-300"
          aria-label="切换语言"
          title="切换语言"
        >
          <ArtSvgIcon
            icon="ri:translate-2"
            class="auth-top-bar__icon text-[19px] transition-colors duration-300"
          />
        </button>
        <template #dropdown>
          <ElDropdownMenu>
            <div v-for="lang in languageOptions" :key="lang.value" class="lang-btn-item">
              <ElDropdownItem
                :command="lang.value"
                :class="{ 'is-selected': locale === lang.value }"
              >
                <span class="menu-txt">{{ lang.label }}</span>
                <ArtSvgIcon icon="ri:check-fill" class="text-base" v-if="locale === lang.value" />
              </ElDropdownItem>
            </div>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
      <button
        v-if="shouldShowThemeToggle"
        type="button"
        class="btn theme-btn h-9 w-9 c-p flex-cc tad-300"
        :aria-label="isDark ? '切换到浅色模式' : '切换到深色模式'"
        :aria-pressed="isDark"
        :title="isDark ? '切换到浅色模式' : '切换到深色模式'"
        @click="themeAnimation"
      >
        <ArtSvgIcon
          :icon="isDark ? 'ri:sun-fill' : 'ri:moon-line'"
          class="auth-top-bar__icon text-xl transition-colors duration-300"
        />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useSettingStore } from '@/store/modules/setting'
  import { useUserStore } from '@/store/modules/user'
  import { useHeaderBar } from '@/hooks/core/useHeaderBar'
  import { useThemeAnimation } from '@/hooks/core/useThemeAnimation'
  import { languageOptions } from '@/locales'
  import { LanguageEnum } from '@/enums/app-enum'
  import AppConfig from '@/config'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'

  defineOptions({ name: 'AuthTopBar' })
  const themeAnimation = useThemeAnimation()

  const settingStore = useSettingStore()
  const userStore = useUserStore()
  const { isDark, systemThemeColor } = storeToRefs(settingStore)
  const { shouldShowThemeToggle, shouldShowLanguage } = useHeaderBar()
  const { locale } = useI18n()
  const { siteName } = useWebsiteConfig()

  const mainColors = AppConfig.systemMainColor
  const color = systemThemeColor // css v-bind 使用

  const changeLanguage = (lang: LanguageEnum) => {
    if (locale.value === lang) return
    locale.value = lang
    userStore.setLanguage(lang)
  }

  const changeThemeColor = (color: string) => {
    if (systemThemeColor.value === color) return
    settingStore.setElementTheme(color)
    settingStore.reload()
  }
</script>

<!-- All authorization routes share this unscoped shell stylesheet through this shared component. -->
<style src="@/views/auth/login/style.css"></style>

<style scoped>
  .btn {
    color: var(--art-gray-800);
    background: transparent;
    border: 0;
    border-radius: var(--el-border-radius-base);
    box-shadow: none;
  }

  .btn:hover {
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 9%, transparent);
  }

  .btn:active {
    background: color-mix(in srgb, var(--theme-color) 14%, transparent);
  }

  .btn:focus-visible {
    color: var(--theme-color);
    outline: none;
    background: color-mix(in srgb, var(--theme-color) 14%, transparent);
    box-shadow: none;
  }

  .color-dots {
    pointer-events: none;
    background: color-mix(in srgb, var(--el-bg-color) 94%, transparent);
    box-shadow: 0 2px 12px var(--art-gray-300);
    backdrop-filter: blur(10px);
    transform: translateX(10px);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
  }

  .color-dot {
    box-shadow: 0 2px 4px rgb(0 0 0 / 15%);
    transform: translateX(20px) scale(0.8);
    transition:
      opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
      box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transition-delay: calc(var(--index) * 0.05s);
  }

  .color-dot:hover {
    box-shadow: 0 4px 8px rgb(0 0 0 / 20%);
    transform: translateX(0) scale(1.1);
  }

  .color-picker-expandable:hover .color-dots,
  .color-picker-expandable:focus-within .color-dots {
    pointer-events: auto;
    opacity: 1;
    transform: translateX(0);
  }

  .color-picker-expandable:hover .color-dot,
  .color-picker-expandable:focus-within .color-dot {
    opacity: 1;
    transform: translateX(0) scale(1);
  }

  .color-picker-expandable:hover .palette-btn :deep(.art-svg-icon),
  .color-picker-expandable:focus-within .palette-btn :deep(.art-svg-icon) {
    color: v-bind(color);
  }

  .auth-top-bar:not(.auth-top-bar--dark) .color-picker-expandable:hover .palette-btn,
  .auth-top-bar:not(.auth-top-bar--dark) .color-picker-expandable:focus-within .palette-btn {
    background: transparent;
  }

  @media (width <= 1040px) {
    h1 {
      color: #fff;
    }

    .btn :deep(.art-svg-icon) {
      color: rgb(255 255 255 / 88%) !important;
    }

    .btn {
      background: rgb(255 255 255 / 10%);
      border: 1px solid rgb(255 255 255 / 13%);
      border-radius: 50%;
      backdrop-filter: blur(12px);
    }
  }
</style>
