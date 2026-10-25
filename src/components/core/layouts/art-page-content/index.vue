<!-- 布局内容 -->
<template>
  <component :is="isFullPage ? ElScrollbar : 'div'" class="layout-content" :style="containerStyle">
    <div id="app-content-header">
      <!-- 节日滚动 -->
      <ArtFestivalTextScroll v-if="!isFullPage" />

      <!-- 路由信息调试 -->
      <div
        v-if="isOpenRouteInfo === 'true'"
        class="px-2 py-1.5 mb-3 text-sm text-g-500 bg-g-200 border-full-d rounded-md"
      >
        router meta：{{ route.meta }}
      </div>
    </div>

    <RouterView v-if="isRefresh" v-slot="{ Component, route }">
      <Transition :name="showTransitionMask ? '' : actualTransition" mode="out-in">
        <KeepAlive :max="10" :exclude="routeViewExclude">
          <component
            :is="resolveRouteView(route)"
            v-if="Component"
            :key="route.path"
            :route-component="Component"
            :style="contentStyle"
          />
        </KeepAlive>
      </Transition>
    </RouterView>

    <!-- 全屏页面切换过渡遮罩（用于提升页面切换视觉体验） -->
    <Teleport to="body">
      <div
        v-show="showTransitionMask"
        class="fixed top-0 left-0 z-[2000] w-screen h-screen pointer-events-none bg-box"
      />
    </Teleport>
  </component>
</template>
<script setup lang="ts">
  import {
    cloneVNode,
    defineComponent,
    h,
    type Component,
    type CSSProperties,
    type PropType,
    type VNode
  } from 'vue'
  import { useRoute, type RouteLocationNormalizedLoaded } from 'vue-router'
  import { ElScrollbar } from 'element-plus'
  import { useTimeoutFn } from '@vueuse/core'
  import { useAutoLayoutHeight } from '@/hooks/core/useLayoutHeight'
  import { useSettingStore } from '@/store/modules/setting'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useWorktabStore } from '@/store/modules/worktab'

  defineOptions({ name: 'ArtPageContent' })

  const route = useRoute()
  const { containerMinHeight } = useAutoLayoutHeight()
  const { pageTransition, containerWidth, refresh } = storeToRefs(useSettingStore())
  const { revision: tenantScopeRevision } = storeToRefs(useTenantScopeStore())
  const { keepAliveExclude } = storeToRefs(useWorktabStore())

  const uncachedRouteViewName = 'ArtUncachedRouteView'
  const routeViewHosts = new Map<string, Component>()
  const routeViewExclude = computed(() => [...keepAliveExclude.value, uncachedRouteViewName])

  // KeepAlive 按组件名称决定是否缓存；为每条缓存路由创建稳定的视图宿主，
  // 非缓存路由共用被排除的宿主，避免两个并列 Transition 留下旧页面。
  const createRouteViewHost = (name: string): Component =>
    defineComponent({
      name,
      inheritAttrs: false,
      props: {
        routeComponent: { type: Object as PropType<VNode>, required: true }
      },
      setup(props, { attrs }) {
        return () =>
          h('div', { ...attrs, class: 'art-page-view' }, [cloneVNode(props.routeComponent)])
      }
    })

  const uncachedRouteView = createRouteViewHost(uncachedRouteViewName)
  const resolveRouteView = (targetRoute: RouteLocationNormalizedLoaded): Component => {
    if (!targetRoute.meta.keepAlive) return uncachedRouteView

    const name = String(targetRoute.name ?? targetRoute.path)
    let host = routeViewHosts.get(name)
    if (!host) {
      host = createRouteViewHost(name)
      routeViewHosts.set(name, host)
    }
    return host
  }

  const isRefresh = shallowRef(true)
  const isOpenRouteInfo = import.meta.env.VITE_OPEN_ROUTE_INFO
  const showTransitionMask = ref(false)
  const { start: scheduleMaskClose } = useTimeoutFn(
    () => {
      showTransitionMask.value = false
    },
    50,
    { immediate: false }
  )

  // 标记是否是首次加载（浏览器刷新）
  const isFirstLoad = ref(true)

  // 检查当前路由是否需要使用无基础布局模式
  const isFullPage = computed(() => route.matched.some((r) => r.meta?.isFullPage))
  const prevIsFullPage = ref(isFullPage.value)

  // 切换动画名称：首次加载、从全屏返回时不使用动画
  const actualTransition = computed(() => {
    if (isFirstLoad.value) return ''
    if (prevIsFullPage.value && !isFullPage.value) return ''
    return pageTransition.value
  })

  // 监听全屏状态变化，显示过渡遮罩
  watch(isFullPage, (val, oldVal) => {
    if (val !== oldVal) {
      showTransitionMask.value = true
      // 延迟隐藏遮罩，给足时间让页面完成切换
      scheduleMaskClose()
    }

    nextTick(() => {
      prevIsFullPage.value = val
    })
  })

  const containerStyle = computed((): CSSProperties =>
    isFullPage.value
      ? {
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100vh',
          zIndex: 2500,
          background: 'var(--default-bg-color)'
        }
      : {
          maxWidth: containerWidth.value
        }
  )

  const contentStyle = computed((): CSSProperties => ({
    minHeight: containerMinHeight.value
  }))

  const reload = () => {
    isRefresh.value = false
    nextTick(() => {
      isRefresh.value = true
    })
  }

  watch(refresh, reload, { flush: 'post' })
  watch(tenantScopeRevision, reload, { flush: 'post' })

  // 组件挂载后标记首次加载完成
  onMounted(() => {
    // 延迟一帧，确保首次渲染完成
    nextTick(() => {
      isFirstLoad.value = false
    })
  })
</script>
