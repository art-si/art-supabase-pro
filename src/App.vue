<template>
  <ElConfigProvider
    size="default"
    :locale="locales[language]"
    :z-index="3000"
    :card="{
      shadow: 'never'
    }"
  >
    <a class="app-skip-link" href="#main-content">跳至主要内容</a>
    <GlobalReferenceFeedback v-if="deleteReferenceContext" :context="deleteReferenceContext" />
    <RouterView v-slot="{ Component }">
      <component :is="Component" id="main-content" tabindex="-1" />
    </RouterView>
  </ElConfigProvider>
</template>
<script setup lang="ts">
  import { mittBus } from '@/utils/sys'
  import type { DeleteReferenceContext } from '@/utils/supabase/delete-reference'
  import { useUserStore } from './store/modules/user'
  import { useSettingStore } from './store/modules/setting'
  import zh from 'element-plus/es/locale/lang/zh-cn'
  import en from 'element-plus/es/locale/lang/en'
  import { systemUpgrade } from './utils/sys'
  import { toggleTransition } from './utils/ui/animation'
  import { checkStorageCompatibility } from './utils/storage'
  import { initializeTheme } from './hooks/core/useTheme'
  import { useWebsiteConfig } from './hooks/core/useWebsiteConfig'
  import i18n, { getPreferredLanguage } from './locales'
  import { fetchLoginDefaultLanguage } from '@/api/system-manage/system-param'
  import { loadAppearanceConfig } from '@/hooks/core/useAppearanceConfig'
  import { LanguageEnum } from './enums/app-enum'

  const userStore = useUserStore()
  const preferredLanguage = getPreferredLanguage()
  const initialLanguage = userStore.language
  const GlobalReferenceFeedback = defineAsyncComponent(
    () => import('@/components/business/master-data-delete-guard/global-reference-feedback.vue')
  )
  const deleteReferenceContext = shallowRef<DeleteReferenceContext>()
  const showDeleteReferences = (context: DeleteReferenceContext): void => {
    deleteReferenceContext.value = context
  }
  onMounted(() => mittBus.on('deleteReferenceBlocked', showDeleteReferences))
  onUnmounted(() => mittBus.off('deleteReferenceBlocked', showDeleteReferences))
  watch(
    () => userStore.isLogin,
    (loggedIn) => {
      if (!loggedIn) deleteReferenceContext.value = undefined
    }
  )
  const settingStore = useSettingStore()
  const { language } = storeToRefs(userStore)
  const { boxBorderMode } = storeToRefs(settingStore)
  const { loadWebsiteConfig } = useWebsiteConfig()

  watch(
    boxBorderMode,
    (enabled) => {
      document.documentElement.setAttribute(
        'data-box-mode',
        enabled ? 'border-mode' : 'shadow-mode'
      )
    },
    { immediate: true }
  )

  const locales = {
    zh: zh,
    en: en
  }

  const resolveAppLanguage = (value?: Api.SystemManage.WebsiteDefaultLanguage): LanguageEnum => {
    return value === LanguageEnum.EN ? LanguageEnum.EN : LanguageEnum.ZH
  }

  onBeforeMount(() => {
    toggleTransition(true)
    initializeTheme()
  })

  onMounted(() => {
    void loadAppearanceConfig()
    void Promise.all([loadWebsiteConfig(), fetchLoginDefaultLanguage()]).then(
      ([config, policy]) => {
        if (!userStore.isLogin && !preferredLanguage && language.value === initialLanguage) {
          const appLanguage = resolveAppLanguage(
            policy.data === LanguageEnum.EN || policy.data === LanguageEnum.ZH
              ? policy.data
              : config.defaultLanguage
          )
          language.value = appLanguage
          const globalLocale = i18n.global.locale
          if (typeof globalLocale === 'string') {
            i18n.global.locale = appLanguage
          } else {
            globalLocale.value = appLanguage
          }
        }
      }
    )
    checkStorageCompatibility()
    toggleTransition(false)
    systemUpgrade()
  })
  watch(
    () => userStore.isLogin,
    (loggedIn) => {
      if (loggedIn) void loadAppearanceConfig()
    }
  )
</script>

<style>
  .app-skip-link {
    position: fixed;
    top: 10px;
    left: 10px;
    z-index: 10000;
    padding: 9px 14px;
    color: var(--el-color-white);
    text-decoration: none;
    background: var(--el-color-primary);
    border-radius: var(--el-border-radius-base);
    box-shadow: var(--el-box-shadow-light);
    transform: translateY(-160%);
    transition: transform 0.18s ease;
  }

  .app-skip-link:focus {
    transform: translateY(0);
  }
</style>
