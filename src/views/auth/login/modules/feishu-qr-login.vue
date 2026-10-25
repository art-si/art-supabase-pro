<template>
  <section class="feishu-qr" aria-label="飞书扫码登录">
    <div class="feishu-qr__surface">
      <div
        :id="containerId"
        ref="containerRef"
        class="feishu-qr__code"
        :class="{ 'is-hidden': status !== 'ready' && status !== 'confirming' }"
        aria-label="飞书登录二维码"
      ></div>
      <ArtAsyncState
        v-if="status === 'loading' || status === 'error'"
        class="w-full"
        size="compact"
        :min-height="310"
        :loading="status === 'loading'"
        :error="status === 'error' ? errorMessage : null"
        error-title="飞书二维码加载失败"
        :retryable="false"
      />
    </div>

    <p class="feishu-qr__instruction">
      <ArtSvgIcon icon="ri:qr-scan-2-line" />
      用飞书 App 扫一扫，并在手机上确认
    </p>
    <p class="feishu-qr__status" role="status" aria-live="polite">
      {{ status === 'confirming' ? '已确认，正在完成登录…' : '请使用该飞书应用所在企业的身份扫码' }}
    </p>

    <p class="feishu-qr__help">
      手机提示“无法以当前身份登录”？请在飞书 App
      中切换到应用所属企业身份；如果使用的是飞书个人身份，请改用网页授权登录。
    </p>

    <div class="feishu-qr__actions">
      <button type="button" class="feishu-qr__action" @click="emit('redirect')">
        <ArtSvgIcon icon="ri:external-link-line" />
        飞书网页授权登录
      </button>
      <button
        type="button"
        class="feishu-qr__action"
        :disabled="status === 'loading' || status === 'confirming'"
        @click="refreshQr"
      >
        <ArtSvgIcon icon="ri:refresh-line" />
        刷新二维码
      </button>
      <button type="button" class="feishu-qr__action" @click="emit('back')">
        返回账号密码登录
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
  import { useEventListener, useScriptTag } from '@vueuse/core'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import { prepareFeishuQrLogin } from '@/api/auth'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'

  interface FeishuQrInstance {
    matchOrigin: (origin: string) => boolean
    matchData: (data: unknown) => boolean
  }

  interface FeishuQrOptions {
    id: string
    goto: string
    width: string
    height: string
    style: string
  }

  declare global {
    interface Window {
      QRLogin?: (options: FeishuQrOptions) => FeishuQrInstance
    }
  }

  const props = defineProps<{
    channel: Api.Auth.AuthChannel
    redirectTo: string
  }>()
  const emit = defineEmits<{ back: []; redirect: [] }>()
  const SDK_URL =
    'https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/passport/qrcode/LarkSSOSDKWebQRCode-1.0.3.js'
  const SDK_ID = 'feishu-qr-login-sdk'
  const { load: loadScript, unload: unloadScript } = useScriptTag(SDK_URL, undefined, {
    attrs: { id: SDK_ID },
    manual: true
  })
  const containerId = `feishu-login-${crypto.randomUUID()}`
  const containerRef = ref<HTMLElement>()
  const status = ref<'loading' | 'ready' | 'confirming' | 'error'>('loading')
  const errorMessage = ref('')
  let disposed = false
  let generation = 0
  let goto = ''
  let qrInstance: FeishuQrInstance | undefined

  const loadSdk = async (): Promise<void> => {
    if (window.QRLogin) return
    try {
      await loadScript()
      if (!window.QRLogin) throw new Error('飞书扫码组件不可用')
    } catch (error) {
      unloadScript()
      throw new Error('飞书扫码组件加载失败，请重试', { cause: error })
    }
  }

  const handleMessage = (event: MessageEvent<unknown>): void => {
    const iframe = containerRef.value?.querySelector('iframe')
    if (
      status.value !== 'ready' ||
      event.origin !== 'https://passport.feishu.cn' ||
      event.source !== iframe?.contentWindow ||
      !qrInstance?.matchOrigin(event.origin) ||
      !qrInstance.matchData(event.data)
    ) {
      return
    }
    const data = event.data
    const tmpCode =
      data && typeof data === 'object' && 'tmp_code' in data ? data.tmp_code : undefined
    if (typeof tmpCode !== 'string' || !tmpCode || tmpCode.length > 2048) return

    const authorizationUrl = new URL(goto)
    authorizationUrl.searchParams.set('tmp_code', tmpCode)
    status.value = 'confirming'
    window.location.assign(authorizationUrl.toString())
  }

  const refreshQr = async (): Promise<void> => {
    const currentGeneration = ++generation
    status.value = 'loading'
    errorMessage.value = ''
    qrInstance = undefined
    containerRef.value?.replaceChildren()
    try {
      const authorizationUrl = await prepareFeishuQrLogin(props.channel, props.redirectTo)
      await loadSdk()
      if (disposed || currentGeneration !== generation) return
      const instance = window.QRLogin?.({
        id: containerId,
        goto: authorizationUrl,
        width: '280',
        height: '290',
        style: 'width:280px;height:290px;border:0;max-width:100%'
      })
      if (!instance || !containerRef.value?.querySelector('iframe')) {
        throw new Error('飞书二维码生成失败')
      }
      goto = authorizationUrl
      qrInstance = instance
      status.value = 'ready'
    } catch (error) {
      if (disposed || currentGeneration !== generation) return
      errorMessage.value = getFriendlySupabaseErrorMessage(error, '飞书二维码加载失败，请稍后重试')
      status.value = 'error'
    }
  }

  useEventListener(window, 'message', handleMessage)

  onMounted(() => {
    void refreshQr()
  })
  onBeforeUnmount(() => {
    disposed = true
    generation += 1
    containerRef.value?.replaceChildren()
  })
</script>

<style scoped>
  .feishu-qr {
    margin-top: 24px;
    text-align: center;
  }

  .feishu-qr__surface {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 310px;
    background: var(--el-fill-color-light);
    border: 1px solid var(--el-border-color-light);
    border-radius: var(--art-control-radius);
  }

  .feishu-qr__code {
    width: 280px;
    max-width: 100%;
    height: 290px;
    overflow: hidden;
    background: var(--el-bg-color);
  }

  .feishu-qr__code.is-hidden {
    display: none;
  }

  .feishu-qr__instruction {
    display: flex;
    gap: 7px;
    align-items: center;
    justify-content: center;
    margin: 20px 0 0;
    font-size: 14px;
    line-height: 22px;
    color: var(--el-text-color-primary);
  }

  .feishu-qr__instruction .art-svg-icon {
    font-size: 18px;
    color: var(--theme-color);
  }

  .feishu-qr__status {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 18px;
    color: var(--el-text-color-secondary);
  }

  .feishu-qr__help {
    max-width: 320px;
    margin: 12px auto 0;
    font-size: 12px;
    line-height: 18px;
    color: var(--el-text-color-secondary);
  }

  .feishu-qr__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    align-items: center;
    justify-content: center;
    margin-top: 22px;
  }

  .feishu-qr__action {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    justify-content: center;
    min-height: 36px;
    padding: 0 8px;
    font-size: 12px;
    color: var(--theme-color);
    cursor: pointer;
    background: transparent;
    border: 0;
    border-radius: var(--art-control-radius);
  }

  .feishu-qr__action:hover {
    background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
  }

  .feishu-qr__action:focus-visible {
    outline: 2px solid var(--theme-color);
    outline-offset: 2px;
  }

  .feishu-qr__action:disabled {
    color: var(--el-text-color-disabled);
    cursor: not-allowed;
  }

  @media (pointer: coarse) {
    .feishu-qr__action {
      min-height: 44px;
    }
  }
</style>
