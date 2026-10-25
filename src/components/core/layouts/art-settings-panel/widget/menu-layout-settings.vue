<template>
  <div v-if="width > 1000">
    <SectionTitle :title="$t('setting.menuType.title')" />
    <div class="setting-box-wrap">
      <button
        type="button"
        class="setting-item"
        v-for="(item, index) in configOptions.menuLayoutList"
        :key="item.value"
        :aria-label="`${$t(`setting.menuType.list[${index}]`)}布局`"
        :aria-pressed="item.value === menuType"
        @click="switchMenuLayouts(item.value)"
      >
        <div class="box" :class="{ 'is-active': item.value === menuType, 'mt-16': index > 2 }">
          <img :src="item.img" width="120" height="72" alt="" />
        </div>
        <p class="name">{{ $t(`setting.menuType.list[${index}]`) }}</p>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import SectionTitle from './section-title.vue'
  import { useSettingStore } from '@/store/modules/setting'
  import { useSettingsConfig } from '../composables/useSettingsConfig'
  import { useSettingsState } from '../composables/useSettingsState'

  const { width } = useWindowSize()
  const settingStore = useSettingStore()
  const { menuType } = storeToRefs(settingStore)
  const { configOptions } = useSettingsConfig()
  const { switchMenuLayouts } = useSettingsState()
</script>
