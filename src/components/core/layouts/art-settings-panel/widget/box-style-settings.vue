<template>
  <div>
    <SectionTitle :title="$t('setting.box.title')" class="mt-10" />
    <div class="setting-segmented">
      <button
        v-for="option in boxStyleOptions"
        :key="option.value"
        type="button"
        :class="{ 'is-active': isActive(option.type) }"
        :aria-pressed="isActive(option.type)"
        @click="boxStyleHandlers.setBoxMode(option.type)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
  import SectionTitle from './section-title.vue'
  import { useSettingStore } from '@/store/modules/setting'
  import { useSettingsConfig } from '../composables/useSettingsConfig'
  import { useSettingsHandlers } from '../composables/useSettingsHandlers'
  import { storeToRefs } from 'pinia'

  const settingStore = useSettingStore()
  const { boxBorderMode } = storeToRefs(settingStore)
  const { boxStyleOptions } = useSettingsConfig()
  const { boxStyleHandlers } = useSettingsHandlers()

  // 判断当前选项是否激活
  const isActive = (type: 'border-mode' | 'shadow-mode') => {
    return type === 'border-mode' ? boxBorderMode.value : !boxBorderMode.value
  }
</script>

<style scoped lang="scss">
  .setting-segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    padding: 4px;
    background: var(--art-gray-200);
    border: 1px solid var(--art-card-border);
    border-radius: calc(var(--custom-radius) + 4px);

    button {
      height: 36px;
      padding: 0 10px;
      font: inherit;
      font-size: 11px;
      color: var(--art-gray-600);
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--custom-radius);

      &:hover {
        color: var(--art-gray-900);
      }

      &.is-active {
        font-weight: 650;
        color: var(--theme-color);
        background: var(--default-box-color);
        box-shadow: 0 4px 12px rgb(31 41 55 / 8%);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
      }
    }
  }
</style>
