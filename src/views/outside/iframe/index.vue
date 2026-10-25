<template>
  <div class="relative box-border w-full h-full" :aria-busy="isLoading">
    <ArtAsyncState
      v-if="!iframeUrl"
      empty
      full-height
      empty-text="未配置外部页面"
      empty-description="请联系管理员完善当前菜单的页面链接。"
    />
    <ArtOverlayLoading
      v-if="isLoading"
      loading
      overlay
      text="正在加载页面…"
      description="正在连接目标页面，请稍候"
    />
    <iframe
      v-if="iframeUrl"
      :src="iframeUrl"
      :title="String(route.meta.title || '外部业务页面')"
      frameborder="0"
      class="w-full h-full min-h-[calc(100vh-120px)] border-none"
      @load="handleIframeLoad"
    ></iframe>
  </div>
</template>

<script setup lang="ts">
  import { IframeRouteManager } from '@/router/core'

  defineOptions({ name: 'IframeView' })

  const route = useRoute()
  const isLoading = ref(false)
  const iframeUrl = ref('')

  /**
   * 初始化 iframe URL
   * 从路由配置中获取对应的外部链接地址
   */
  watch(
    () => route.path,
    (path) => {
      const url = IframeRouteManager.getInstance().findByPath(path)?.meta.link || ''
      if (iframeUrl.value === url) return
      isLoading.value = Boolean(url)
      iframeUrl.value = url
    },
    { immediate: true }
  )

  /**
   * 处理 iframe 加载完成事件
   * 隐藏加载状态
   */
  const handleIframeLoad = (): void => {
    isLoading.value = false
  }
</script>
