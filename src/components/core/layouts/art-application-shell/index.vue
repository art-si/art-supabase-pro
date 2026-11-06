<!-- 布局容器 -->
<template>
  <div class="app-layout" :class="{ 'app-layout--header-left': isHeaderLeftMenu }">
    <header v-if="isHeaderLeftMenu" id="app-brand-header">
      <slot name="header"><ArtHeaderBar :show-work-tab="false" /></slot>
    </header>

    <aside id="app-sidebar">
      <ArtSidebarMenu />
    </aside>

    <main id="app-main">
      <ElScrollbar
        class="app-main__scrollbar"
        wrap-class="app-main__scroll-wrap"
        view-class="app-main__scroll-view"
      >
        <div v-if="!isHeaderLeftMenu" id="app-header">
          <slot name="header"><ArtHeaderBar /></slot>
        </div>
        <div v-else-if="showWorkTab" id="app-work-tab-header">
          <ArtWorkTab />
        </div>
        <div id="app-content">
          <div v-if="$slots.default" class="layout-content"><slot /></div>
          <ArtPageContent v-else />
        </div>
      </ElScrollbar>
    </main>

    <div v-if="props.showGlobalComponents" id="app-global">
      <ArtGlobalComponent />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { MenuTypeEnum } from '@/enums/app-enum'
  import { useSettingStore } from '@/store/modules/setting'

  defineOptions({ name: 'ArtApplicationShell' })

  const props = withDefaults(
    defineProps<{ showGlobalComponents?: boolean; showWorkTab?: boolean }>(),
    {
      showGlobalComponents: true,
      showWorkTab: undefined
    }
  )

  const { menuType, showWorkTab: configuredWorkTab } = storeToRefs(useSettingStore())
  const showWorkTab = computed(() => props.showWorkTab ?? configuredWorkTab.value)
  const isHeaderLeftMenu = computed(() => menuType.value === MenuTypeEnum.HEADER_LEFT)
</script>

<style lang="scss" scoped>
  @use './style';
</style>
