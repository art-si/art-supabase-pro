<template>
  <div
    class="art-turnstile-captcha"
    :class="{ 'is-interaction-only': props.appearance === 'interaction-only' }"
  >
    <ArtAsyncState
      v-if="loadError || (loading && props.appearance !== 'interaction-only')"
      class="w-full"
      size="compact"
      loading-mode="skeleton"
      :skeleton-rows="1"
      :min-height="65"
      :loading="loading"
      :error="loadError"
      error-title="验证码加载失败"
      @retry="renderSafely"
    />
    <div v-show="!loadError" ref="containerRef" class="art-turnstile-captcha__widget"></div>
  </div>
</template>

<script setup lang="ts">
  import { useScriptTag } from '@vueuse/core'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'

  defineOptions({ name: 'ArtTurnstileCaptcha' })

  type TurnstileTheme = 'light' | 'dark' | 'auto'
  type TurnstileSize = 'normal' | 'compact' | 'flexible'
  type TurnstileAppearance = 'always' | 'execute' | 'interaction-only'
  type TurnstileExecution = 'render' | 'execute'

  interface TurnstileRenderOptions {
    sitekey: string
    theme?: TurnstileTheme
    size?: TurnstileSize
    appearance?: TurnstileAppearance
    execution?: TurnstileExecution
    callback?: (token: string) => void
    'expired-callback'?: () => void
    'error-callback'?: () => void
    'timeout-callback'?: () => void
  }

  interface TurnstileApi {
    render: (container: HTMLElement, options: TurnstileRenderOptions) => string
    reset: (widgetId?: string) => void
    remove: (widgetId?: string) => void
    execute: (widgetId?: string) => void
  }

  declare global {
    interface Window {
      turnstile?: TurnstileApi
    }
  }

  interface Props {
    sitekey: string
    theme?: TurnstileTheme
    size?: TurnstileSize
    appearance?: TurnstileAppearance
    execution?: TurnstileExecution
  }

  const props = withDefaults(defineProps<Props>(), {
    theme: 'auto',
    size: 'normal',
    appearance: 'always',
    execution: 'render'
  })

  const emit = defineEmits<{
    verify: [token: string]
    expired: []
    error: []
    timeout: []
  }>()

  const SCRIPT_ID = 'cloudflare-turnstile-script'
  const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

  const containerRef = ref<HTMLElement>()
  const widgetId = ref<string>()
  const loading = ref(false)
  const loadError = ref<string | null>(null)
  const { load: loadScript, unload: unloadScript } = useScriptTag(SCRIPT_SRC, undefined, {
    attrs: { id: SCRIPT_ID },
    defer: true,
    manual: true
  })
  let disposed = false
  let renderGeneration = 0
  let executeResolver: ((token: string) => void) | undefined
  let executeRejecter: ((error: Error) => void) | undefined

  const clearExecutePromise = (): void => {
    executeResolver = undefined
    executeRejecter = undefined
  }

  const handleVerify = (token: string): void => {
    executeResolver?.(token)
    clearExecutePromise()
    emit('verify', token)
  }

  const handleExecutionError = (type: 'error' | 'timeout'): void => {
    executeRejecter?.(
      new Error(type === 'timeout' ? '验证码校验超时，请重试' : '验证码校验失败，请重试')
    )
    clearExecutePromise()
    if (type === 'timeout') {
      emit('timeout')
      return
    }
    emit('error')
  }

  const loadTurnstileScript = async (): Promise<void> => {
    if (window.turnstile) return
    try {
      await loadScript()
      if (!window.turnstile) throw new Error('验证码组件不可用')
    } catch (error) {
      unloadScript()
      throw new Error('验证码组件加载失败，请重试', { cause: error })
    }
  }

  const cancelExecution = (): void => {
    executeRejecter?.(new Error('验证码校验已取消，请重试'))
    clearExecutePromise()
  }

  const removeWidget = (): void => {
    cancelExecution()
    if (widgetId.value && window.turnstile) {
      window.turnstile.remove(widgetId.value)
    }
    widgetId.value = undefined
  }

  const remove = (): void => {
    renderGeneration += 1
    loading.value = false
    loadError.value = null
    removeWidget()
  }

  const render = async (): Promise<void> => {
    const generation = ++renderGeneration
    if (disposed || !props.sitekey || !containerRef.value) {
      remove()
      return
    }

    loading.value = !window.turnstile
    loadError.value = null
    try {
      await loadTurnstileScript()
      if (disposed || generation !== renderGeneration || !window.turnstile || !containerRef.value)
        return

      removeWidget()
      widgetId.value = window.turnstile.render(containerRef.value, {
        sitekey: props.sitekey,
        theme: props.theme,
        size: props.size,
        appearance: props.appearance,
        execution: props.execution,
        callback: (token) => {
          if (!disposed && generation === renderGeneration) handleVerify(token)
        },
        'expired-callback': () => {
          if (!disposed && generation === renderGeneration) emit('expired')
        },
        'error-callback': () => {
          if (!disposed && generation === renderGeneration) handleExecutionError('error')
        },
        'timeout-callback': () => {
          if (!disposed && generation === renderGeneration) handleExecutionError('timeout')
        }
      })
    } catch (error) {
      if (disposed || generation !== renderGeneration) return
      loadError.value = '验证码组件暂时不可用，请重新加载后重试'
      throw error
    } finally {
      if (!disposed && generation === renderGeneration) loading.value = false
    }
  }

  const renderSafely = (): void => {
    void render().catch(() => emit('error'))
  }

  const reset = (): void => {
    cancelExecution()
    if (widgetId.value && window.turnstile) {
      window.turnstile.reset(widgetId.value)
    }
  }

  const execute = async (): Promise<string> => {
    await render()

    if (!widgetId.value || !window.turnstile) {
      throw new Error('验证码尚未就绪，请重试')
    }

    return await new Promise<string>((resolve, reject) => {
      executeResolver = resolve
      executeRejecter = reject
      window.turnstile?.execute(widgetId.value)
    })
  }

  watch(
    () => [props.sitekey, props.theme, props.size, props.appearance, props.execution],
    renderSafely
  )

  onMounted(renderSafely)

  onBeforeUnmount(() => {
    disposed = true
    renderGeneration += 1
    remove()
  })

  defineExpose({
    reset,
    remove,
    execute
  })
</script>

<style scoped lang="scss">
  .art-turnstile-captcha {
    flex: 1 1 100%;
    width: 100%;
    min-height: 65px;

    &__widget {
      display: flex;
      justify-content: center;
      width: 100%;

      :deep(> div) {
        width: 100% !important;
      }

      :deep(iframe) {
        width: 100% !important;
        max-width: 100%;
      }
    }

    &.is-interaction-only {
      min-height: 0;
    }
  }
</style>
