<template>
  <div>
    <SectionTitle :title="$t('setting.color.title')" class="mt-10" />
    <div class="setting-colors">
      <button
        v-for="color in configOptions.mainColors"
        :key="color"
        type="button"
        class="setting-colors__item"
        :class="{ 'is-active': color === systemThemeColor }"
        :style="{ '--setting-color': color }"
        :aria-label="`选择主题色 ${color}`"
        :aria-pressed="color === systemThemeColor"
        @click="colorHandlers.selectColor(color)"
      >
        <ArtSvgIcon
          icon="ri:check-fill"
          class="setting-colors__check"
          v-show="color === systemThemeColor"
        />
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
  const { systemThemeColor } = storeToRefs(settingStore)
  const { configOptions } = useSettingsConfig()
  const { colorHandlers } = useSettingsHandlers()
</script>

<style scoped lang="scss">
  .setting-colors {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;

    &__item {
      position: relative;
      display: grid;
      place-items: center;
      width: 31px;
      height: 31px;
      padding: 0;
      color: #fff;
      cursor: pointer;
      background: var(--setting-color);
      border: 3px solid var(--default-box-color);
      border-radius: 50%;
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--setting-color) 30%, transparent);
      transition:
        box-shadow 0.18s ease,
        transform 0.18s ease;

      &:hover {
        transform: translateY(-2px) scale(1.04);
      }

      &.is-active {
        box-shadow:
          0 0 0 2px var(--setting-color),
          0 6px 14px color-mix(in srgb, var(--setting-color) 34%, transparent);
      }

      &:focus-visible {
        outline: 2px solid var(--setting-color);
        outline-offset: 3px;
      }
    }

    &__check {
      font-size: 13px;
      color: #fff;
    }
  }
</style>
