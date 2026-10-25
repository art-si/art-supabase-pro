<!-- 返回顶部按钮 -->
<template>
  <Transition
    enter-active-class="tad-300 ease-out"
    leave-active-class="tad-200 ease-in"
    enter-from-class="opacity-0 translate-y-2"
    enter-to-class="opacity-100 translate-y-0"
    leave-from-class="opacity-100 translate-y-0"
    leave-to-class="opacity-0 translate-y-2"
  >
    <ArtIconButton
      v-show="showButton"
      class="fixed right-10 bottom-15 size-9.5! border border-g-300"
      icon="ri:arrow-up-wide-line"
      label="返回页面顶部"
      @click="scrollToTop"
    />
  </Transition>
</template>

<script setup lang="ts">
  import { getPageScrollContainer, useCommon } from '@/hooks/core/useCommon'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'

  defineOptions({ name: 'ArtBackToTop' })

  const { scrollToTop } = useCommon()

  const showButton = ref(false)
  const scrollThreshold = 300

  onMounted(() => {
    const scrollContainer = getPageScrollContainer()
    if (scrollContainer) {
      const { y } = useScroll(scrollContainer)
      watch(y, (newY: number) => {
        showButton.value = newY > scrollThreshold
      })
    }
  })
</script>
