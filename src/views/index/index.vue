<!-- 布局容器 -->
<template>
  <div class="app-layout" :class="{ 'app-layout--header-left': isHeaderLeftMenu }">
    <header v-if="isHeaderLeftMenu" id="app-brand-header">
      <ArtHeaderBar :show-work-tab="false" />
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
          <ArtHeaderBar />
        </div>
        <div v-else-if="showWorkTab" id="app-work-tab-header">
          <ArtWorkTab />
        </div>
        <div id="app-content">
          <ArtPageContent />
        </div>
      </ElScrollbar>
    </main>

    <div id="app-global">
      <ArtGlobalComponent />
    </div>
  </div>
</template>

<script setup lang="ts">
  import { MenuTypeEnum } from '@/enums/app-enum'
  import { useSettingStore } from '@/store/modules/setting'

  defineOptions({ name: 'AppLayout' })

  const { menuType, showWorkTab } = storeToRefs(useSettingStore())
  const isHeaderLeftMenu = computed(() => menuType.value === MenuTypeEnum.HEADER_LEFT)
</script>

<style lang="scss" scoped>
  @use './style';
</style>
