<template>
  <section class="smart-layout-presets" aria-labelledby="smart-layout-title">
    <div class="smart-layout-presets__intro">
      <div>
        <span class="smart-layout-presets__eyebrow">
          <ArtSvgIcon icon="ri:sparkling-2-fill" />
          SMART LAYOUT
        </span>
        <h3 id="smart-layout-title">智能推荐布局</h3>
        <p>将布局、色彩与页面密度组合成经过调校的专业方案。</p>
      </div>
      <span class="smart-layout-presets__signal" aria-label="推荐方案已就绪">
        <i></i>
        已就绪
      </span>
    </div>

    <div class="smart-layout-presets__list">
      <button
        v-for="preset in presets"
        :key="preset.id"
        type="button"
        class="smart-preset-card"
        :class="{ 'is-active': isPresetActive(preset) }"
        :style="{ '--preset-color': preset.color }"
        :aria-pressed="isPresetActive(preset)"
        @click="applyPreset(preset)"
      >
        <span class="smart-preset-card__preview" :class="`is-${preset.preview}`">
          <i class="smart-preset-card__sidebar"></i>
          <i class="smart-preset-card__topbar"></i>
          <i class="smart-preset-card__accent"></i>
          <i class="smart-preset-card__panel smart-preset-card__panel--large"></i>
          <i class="smart-preset-card__panel smart-preset-card__panel--small"></i>
        </span>

        <span class="smart-preset-card__content">
          <span class="smart-preset-card__meta">
            <strong>{{ preset.name }}</strong>
            <span v-if="preset.recommended" class="smart-preset-card__recommended">推荐</span>
            <ArtSvgIcon
              v-else-if="isPresetActive(preset)"
              icon="ri:check-line"
              class="smart-preset-card__check"
            />
          </span>
          <small>{{ preset.description }}</small>
          <span class="smart-preset-card__tags">
            <em v-for="tag in preset.tags" :key="tag">{{ tag }}</em>
          </span>
        </span>

        <ArtSvgIcon icon="ri:arrow-right-up-line" class="smart-preset-card__arrow" />
      </button>
    </div>

    <p class="smart-layout-presets__notice">
      <ArtSvgIcon icon="ri:magic-line" />
      根据当前宽屏工作台推荐“极光专注”；所有方案都可在下方继续微调。
    </p>
  </section>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { storeToRefs } from 'pinia'
  import { ContainerWidthEnum, MenuThemeEnum, MenuTypeEnum } from '@/enums/app-enum'
  import { useSettingStore } from '@/store/modules/setting'
  import type { WorkTabStyle } from '@/types'
  import { useSettingsState } from '../composables/useSettingsState'

  type PresetPreview = 'focus' | 'command' | 'studio'

  interface LayoutPreset {
    id: string
    name: string
    description: string
    tags: string[]
    preview: PresetPreview
    recommended?: boolean
    color: string
    menuType: MenuTypeEnum
    menuTheme: MenuThemeEnum
    menuWidth: number
    borderMode: boolean
    containerWidth: ContainerWidthEnum
    tabStyle: WorkTabStyle
    transition: string
    radius: string
  }

  const presets: LayoutPreset[] = [
    {
      id: 'aurora-focus',
      name: '极光专注',
      description: '高辨识侧栏与轻盈卡片，适合日常高频操作。',
      tags: ['清晰导航', '鲜明层级'],
      preview: 'focus',
      recommended: true,
      color: '#635BFF',
      menuType: MenuTypeEnum.LEFT,
      menuTheme: MenuThemeEnum.DESIGN,
      menuWidth: 228,
      borderMode: false,
      containerWidth: ContainerWidthEnum.FULL,
      tabStyle: 'tab-card',
      transition: 'fade',
      radius: '0.75'
    },
    {
      id: 'data-command',
      name: '数据指挥舱',
      description: '混合导航释放纵向空间，适合表格与运营驾驶舱。',
      tags: ['信息密集', '宽屏优先'],
      preview: 'command',
      color: '#087BFF',
      menuType: MenuTypeEnum.TOP_LEFT,
      menuTheme: MenuThemeEnum.LIGHT,
      menuWidth: 216,
      borderMode: true,
      containerWidth: ContainerWidthEnum.FULL,
      tabStyle: 'tab-default',
      transition: 'slide-left',
      radius: '0.5'
    },
    {
      id: 'studio-flow',
      name: '创意流动',
      description: '双栏入口搭配高饱和强调色，视觉更大胆。',
      tags: ['沉浸体验', '快捷切换'],
      preview: 'studio',
      color: '#EC4899',
      menuType: MenuTypeEnum.DUAL_MENU,
      menuTheme: MenuThemeEnum.DESIGN,
      menuWidth: 216,
      borderMode: false,
      containerWidth: ContainerWidthEnum.FULL,
      tabStyle: 'tab-google',
      transition: 'slide-bottom',
      radius: '1'
    }
  ]

  const settingStore = useSettingStore()
  const { switchMenuLayouts } = useSettingsState()
  const {
    menuType,
    menuThemeType,
    systemThemeColor,
    boxBorderMode,
    containerWidth,
    tabStyle,
    customRadius
  } = storeToRefs(settingStore)

  const isPresetActive = (preset: LayoutPreset): boolean =>
    menuType.value === preset.menuType &&
    menuThemeType.value === preset.menuTheme &&
    systemThemeColor.value.toUpperCase() === preset.color.toUpperCase() &&
    boxBorderMode.value === preset.borderMode &&
    containerWidth.value === preset.containerWidth &&
    tabStyle.value === preset.tabStyle &&
    customRadius.value === preset.radius

  const applyPreset = (preset: LayoutPreset): void => {
    switchMenuLayouts(preset.menuType)
    settingStore.switchMenuStyles(preset.menuTheme)
    settingStore.setMenuOpenWidth(preset.menuWidth)
    settingStore.setMenuOpen(true)
    settingStore.setElementTheme(preset.color)
    settingStore.setContainerWidth(preset.containerWidth)
    settingStore.setTabStyle(preset.tabStyle)
    settingStore.setPageTransition(preset.transition)
    settingStore.setCustomRadius(preset.radius)

    if (boxBorderMode.value !== preset.borderMode) {
      settingStore.setBorderMode()
    }
    document.documentElement.setAttribute(
      'data-box-mode',
      preset.borderMode ? 'border-mode' : 'shadow-mode'
    )

    settingStore.reload()
    ElMessage.success(`已应用「${preset.name}」布局`)
  }

  defineOptions({ name: 'SmartLayoutPresets' })
</script>

<style scoped lang="scss">
  .smart-layout-presets {
    padding: 18px;
    margin-top: 18px;
    color: #fff;
    background:
      radial-gradient(circle at 88% 2%, rgb(34 211 238 / 30%), transparent 31%),
      radial-gradient(circle at 8% 100%, rgb(236 72 153 / 24%), transparent 36%),
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-color) 34%, #211a52) 0%,
        color-mix(in srgb, var(--theme-color) 74%, #4f46e5) 58%,
        color-mix(in srgb, var(--theme-color) 46%, #2563eb) 100%
      );
    border: 1px solid rgb(255 255 255 / 13%);
    border-radius: calc(var(--custom-radius) + 12px);
    box-shadow: 0 18px 42px color-mix(in srgb, var(--theme-color) 24%, transparent);

    &__intro {
      display: flex;
      gap: 12px;
      align-items: flex-start;
      justify-content: space-between;

      h3 {
        margin: 7px 0 4px;
        font-size: 19px;
        font-weight: 760;
        letter-spacing: -0.4px;
      }

      p {
        margin: 0;
        font-size: 11px;
        line-height: 1.65;
        color: rgb(255 255 255 / 68%);
      }
    }

    &__eyebrow,
    &__signal,
    &__notice {
      display: inline-flex;
      align-items: center;
    }

    &__eyebrow {
      gap: 5px;
      font-size: 9px;
      font-weight: 800;
      color: #a5f3fc;
      letter-spacing: 1.35px;
    }

    &__signal {
      flex: 0 0 auto;
      gap: 6px;
      padding: 5px 8px;
      font-size: 9px;
      color: rgb(255 255 255 / 78%);
      background: rgb(255 255 255 / 10%);
      border: 1px solid rgb(255 255 255 / 12%);
      border-radius: 999px;

      i {
        width: 6px;
        height: 6px;
        background: #5ee79d;
        border-radius: 50%;
        box-shadow: 0 0 0 4px rgb(94 231 157 / 12%);
      }
    }

    &__list {
      display: grid;
      gap: 9px;
      margin-top: 16px;
    }

    &__notice {
      gap: 6px;
      margin: 13px 2px 0;
      font-size: 10px;
      line-height: 1.55;
      color: rgb(255 255 255 / 66%);
    }
  }

  .smart-preset-card {
    position: relative;
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr) 18px;
    gap: 12px;
    align-items: center;
    width: 100%;
    min-height: 82px;
    padding: 10px;
    font: inherit;
    color: #fff;
    text-align: left;
    cursor: pointer;
    background: rgb(255 255 255 / 9%);
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: calc(var(--custom-radius) + 7px);
    transition:
      background-color 0.2s ease,
      border-color 0.2s ease,
      transform 0.2s ease;

    &:hover {
      background: rgb(255 255 255 / 14%);
      border-color: rgb(255 255 255 / 24%);
      transform: translateY(-1px);
    }

    &:focus-visible {
      outline: 2px solid #fff;
      outline-offset: 2px;
    }

    &.is-active {
      background: rgb(255 255 255 / 17%);
      border-color: rgb(255 255 255 / 42%);
      box-shadow: inset 3px 0 0 var(--preset-color);
    }

    &__preview {
      position: relative;
      display: block;
      width: 76px;
      height: 54px;
      overflow: hidden;
      background: #f8faff;
      border: 1px solid rgb(255 255 255 / 45%);
      border-radius: 8px;
      box-shadow: 0 8px 18px rgb(17 24 39 / 18%);

      i {
        position: absolute;
        display: block;
      }
    }

    &__sidebar {
      inset: 0 auto 0 0;
      width: 15px;
      background: #eef1ff;
      border-right: 1px solid #e3e7f3;
    }

    &__topbar {
      top: 0;
      right: 0;
      left: 15px;
      height: 9px;
      background: #fff;
      border-bottom: 1px solid #edf0f7;
    }

    &__accent {
      top: 9px;
      left: 3px;
      width: 9px;
      height: 9px;
      background: var(--preset-color);
      border-radius: 3px;
      box-shadow: 0 13px 0 color-mix(in srgb, var(--preset-color) 24%, white);
    }

    &__panel {
      right: 6px;
      background: color-mix(in srgb, var(--preset-color) 13%, white);
      border-radius: 4px;

      &--large {
        top: 15px;
        left: 21px;
        height: 18px;
      }

      &--small {
        top: 38px;
        left: 21px;
        height: 9px;
        background: #e9edf5;
      }
    }

    &__preview.is-command {
      .smart-preset-card__topbar {
        left: 0;
        height: 13px;
        background: color-mix(in srgb, var(--preset-color) 18%, white);
      }

      .smart-preset-card__sidebar {
        top: 13px;
        width: 18px;
      }

      .smart-preset-card__accent {
        top: 17px;
        left: 4px;
      }

      .smart-preset-card__panel--large,
      .smart-preset-card__panel--small {
        left: 24px;
      }
    }

    &__preview.is-studio {
      .smart-preset-card__sidebar {
        width: 24px;
        background: linear-gradient(90deg, var(--preset-color) 0 9px, #f0ebf4 9px 24px);
      }

      .smart-preset-card__topbar {
        left: 24px;
      }

      .smart-preset-card__accent {
        left: 3px;
        background: #fff;
        box-shadow: 0 13px 0 rgb(255 255 255 / 60%);
      }

      .smart-preset-card__panel--large,
      .smart-preset-card__panel--small {
        left: 30px;
      }
    }

    &__content {
      min-width: 0;

      small {
        display: block;
        margin-top: 4px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 10px;
        line-height: 1.45;
        color: rgb(255 255 255 / 64%);
        white-space: nowrap;
      }
    }

    &__meta,
    &__tags {
      display: flex;
      align-items: center;
    }

    &__meta {
      gap: 7px;

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 13px;
        font-weight: 680;
        white-space: nowrap;
      }
    }

    &__recommended {
      padding: 2px 6px;
      font-size: 8px;
      font-style: normal;
      color: #172554;
      background: #a5f3fc;
      border-radius: 999px;
    }

    &__check {
      color: #86efac;
    }

    &__tags {
      gap: 5px;
      margin-top: 7px;

      em {
        padding: 2px 5px;
        font-size: 8px;
        font-style: normal;
        color: rgb(255 255 255 / 62%);
        background: rgb(255 255 255 / 8%);
        border-radius: 4px;
      }
    }

    &__arrow {
      color: rgb(255 255 255 / 52%);
      transition: transform 0.2s ease;
    }

    &:hover &__arrow {
      transform: translate(2px, -2px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .smart-preset-card,
    .smart-preset-card__arrow {
      transition: none;
    }
  }
</style>
