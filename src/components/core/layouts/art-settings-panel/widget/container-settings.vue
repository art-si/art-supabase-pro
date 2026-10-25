<template>
  <div>
    <SectionTitle :title="$t('setting.container.title')" class="mt-12.5" />
    <div class="container-options">
      <button
        v-for="option in containerWidthOptions"
        :key="option.value"
        type="button"
        :class="{ 'is-active': containerWidth === option.value }"
        :aria-pressed="containerWidth === option.value"
        @click="containerHandlers.setWidth(option.value)"
      >
        <ArtSvgIcon :icon="option.icon" />
        <span>{{ option.label }}</span>
        <small>{{ option.value === '100%' ? '充分利用屏幕空间' : '聚焦中心阅读区域' }}</small>
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
  const { containerWidth } = storeToRefs(settingStore)
  const { containerWidthOptions } = useSettingsConfig()
  const { containerHandlers } = useSettingsHandlers()
</script>

<style scoped lang="scss">
  .container-options {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;

    button {
      display: grid;
      grid-template-columns: 24px 1fr;
      gap: 2px 7px;
      align-items: center;
      min-height: 64px;
      padding: 10px;
      font: inherit;
      color: var(--art-gray-700);
      text-align: left;
      cursor: pointer;
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: calc(var(--custom-radius) + 4px);

      > svg {
        grid-row: 1 / 3;
        font-size: 18px;
        color: var(--art-gray-500);
      }

      span {
        font-size: 11px;
        font-weight: 650;
      }

      small {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 8px;
        color: var(--art-gray-500);
        white-space: nowrap;
      }

      &:hover,
      &.is-active {
        border-color: var(--theme-color);
      }

      &.is-active {
        color: var(--theme-color);
        background: var(--el-color-primary-light-9);
        box-shadow: 0 0 0 2px color-mix(in srgb, var(--theme-color) 9%, transparent);

        > svg {
          color: var(--theme-color);
        }
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }
  }
</style>
