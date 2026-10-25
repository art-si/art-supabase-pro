<!-- 全局组件 -->
<template>
  <component
    v-for="componentConfig in renderedComponents"
    :key="componentConfig.renderKey"
    :is="componentConfig.component"
    @vue:mounted="mountedComponents.add(componentConfig.renderKey)"
    @vue:unmounted="mountedComponents.delete(componentConfig.renderKey)"
  />
</template>

<script setup lang="ts">
  import {
    getEnabledGlobalComponents,
    type GlobalComponentConfig
  } from '@/config/modules/component'
  import { mittBus } from '@/utils/sys'
  import { ElMessage } from 'element-plus'
  import { getCurrentScope, type Component } from 'vue'
  import { useEventListener } from '@vueuse/core'
  import { useWorkspaceInteraction } from '@/hooks/core/useWorkspaceInteraction'

  defineOptions({ name: 'ArtGlobalComponent' })

  const componentScope = getCurrentScope()
  const { isLocked, lockRevision, captureIntent } = useWorkspaceInteraction()
  const enabledComponents = computed(() => getEnabledGlobalComponents())
  const loadedComponents = shallowReactive(new Map<string, Component>())
  const mountedComponents = new Set<string>()
  const pendingActivations = new Map<
    string,
    {
      isCurrentIntent: () => boolean
      replay: () => void
    }
  >()
  const getRenderKey = (config: GlobalComponentConfig): string =>
    config.activationEvent ? `${config.key}:${lockRevision.value}` : config.key
  const renderedComponents = computed(() => {
    return enabledComponents.value.flatMap((config) => {
      if (isLocked.value && config.activationEvent) return []
      const component = config.component ?? loadedComponents.get(config.key)
      // 同一轮更新中的锁屏/解锁也要销毁旧交互界面的本地状态。
      const renderKey = getRenderKey(config)
      return component ? [{ ...config, component, renderKey }] : []
    })
  })

  const loadComponent = async (config: GlobalComponentConfig): Promise<Component | undefined> => {
    if (config.component) return config.component

    const loadedComponent = loadedComponents.get(config.key)
    if (loadedComponent) return loadedComponent
    if (!config.loader) return undefined

    const { default: component } = await config.loader()
    if (componentScope?.active) loadedComponents.set(config.key, component)
    return component
  }

  const activate = async (key: string, replay: () => void): Promise<void> => {
    if (isLocked.value) return
    const config = enabledComponents.value.find((component) => component.key === key)
    if (!config || mountedComponents.has(getRenderKey(config))) return
    const pending = pendingActivations.get(key)
    if (pending) {
      // One load owns replay/error feedback; a fresh unlocked intent replaces the old one.
      pending.isCurrentIntent = captureIntent()
      pending.replay = replay
      return
    }
    const activation = { isCurrentIntent: captureIntent(), replay }
    pendingActivations.set(key, activation)

    try {
      const component = await loadComponent(config)
      if (!component || !activation.isCurrentIntent()) return
      await nextTick()
      if (activation.isCurrentIntent()) activation.replay()
    } catch (error) {
      if (!activation.isCurrentIntent()) return
      console.error(`[global-component] 加载 ${config.name} 失败`, error)
      ElMessage.error(`${config.name}加载失败，请稍后重试`)
    } finally {
      pendingActivations.delete(key)
    }
  }

  const openSettings = (): void => {
    void activate('settings-panel', () => mittBus.emit('openSetting'))
  }
  const openSearch = (): void => {
    void activate('global-search', () => mittBus.emit('openSearchDialog'))
  }
  const openChat = (): void => {
    void activate('chat-window', () => mittBus.emit('openChat'))
  }
  const triggerFireworks = (imageUrl?: string): void => {
    void activate('fireworks-effect', () => mittBus.emit('triggerFireworks', imageUrl))
  }
  const handleGlobalShortcut = (event: KeyboardEvent): void => {
    if (isLocked.value || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k')
      return
    const searchConfig = enabledComponents.value.find((config) => config.key === 'global-search')
    if (!searchConfig || mountedComponents.has(getRenderKey(searchConfig))) return

    event.preventDefault()
    openSearch()
  }

  useEventListener(document, 'keydown', handleGlobalShortcut)

  onMounted(() => {
    mittBus.on('openSetting', openSettings)
    mittBus.on('openSearchDialog', openSearch)
    mittBus.on('openChat', openChat)
    mittBus.on('triggerFireworks', triggerFireworks)
  })

  onUnmounted(() => {
    pendingActivations.clear()
    mountedComponents.clear()
    mittBus.off('openSetting', openSettings)
    mittBus.off('openSearchDialog', openSearch)
    mittBus.off('openChat', openChat)
    mittBus.off('triggerFireworks', triggerFireworks)
  })
</script>
