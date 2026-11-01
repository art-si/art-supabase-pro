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

  const scrollContainer = shallowRef<HTMLElement | null>(null)
  const { y } = useScroll(scrollContainer)
  const showButton = computed(() => y.value > 300)

  onMounted(() => {
    scrollContainer.value = getPageScrollContainer()
  })
</script>
