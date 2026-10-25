<template>
  <SectionTitle :title="$t('setting.theme.title')" />
  <div class="setting-box-wrap">
    <button
      type="button"
      class="setting-item"
      v-for="(item, index) in configOptions.themeList"
      :key="item.theme"
      :aria-label="`${$t(`setting.theme.list[${index}]`)}主题`"
      :aria-pressed="item.theme === systemThemeMode"
      @click="switchThemeStyles(item.theme)"
    >
      <div class="box" :class="{ 'is-active': item.theme === systemThemeMode }">
        <img :src="item.img" width="120" height="72" alt="" />
      </div>
      <p class="name">{{ $t(`setting.theme.list[${index}]`) }}</p>
    </button>
  </div>
</template>

<script setup lang="ts">
  import SectionTitle from './section-title.vue'
  import { useSettingStore } from '@/store/modules/setting'
  import { useSettingsConfig } from '../composables/useSettingsConfig'
  import { useTheme } from '@/hooks/core/useTheme'

  const settingStore = useSettingStore()
  const { systemThemeMode } = storeToRefs(settingStore)
  const { configOptions } = useSettingsConfig()
  const { switchThemeStyles } = useTheme()
</script>
