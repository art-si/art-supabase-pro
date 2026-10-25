import { createApp, h, ref } from 'vue'
import { store } from '@/store'
import { useSettingStore } from '@/store/modules/setting'
import { initializeTheme } from '@/hooks/core/useTheme'
import { SystemThemeEnum } from '@/enums/app-enum'
import ArtTurnstileCaptcha from '@/components/core/forms/art-turnstile-captcha/index.vue'
import FeishuQrLogin from '@/views/auth/login/modules/feishu-qr-login.vue'
import '@styles/core/tailwind.css'
import '@styles/index.scss'

const params = new URLSearchParams(location.search)
const mounted = ref(true)
const sitekey = ref('fixture-key')
const count = Number(params.get('count') || 1)
const captcha = ref<InstanceType<typeof ArtTurnstileCaptcha>>()
const outcome = ref('尚未校验')
const verified = ref(0)
const errors = ref(0)
const channel: Api.Auth.AuthChannel = {
  key: 'feishu',
  label: '飞书',
  provider: 'custom:feishu',
  icon: 'ri:qr-code-line',
  enabled: true,
  allowLinking: true
}

const execute = async (): Promise<void> => {
  outcome.value = '等待校验'
  try {
    outcome.value = (await captcha.value?.execute()) || '组件已卸载'
  } catch (error) {
    outcome.value = error instanceof Error ? error.message : '校验失败'
  }
}

const app = createApp({
  setup() {
    const setting = useSettingStore()
    const theme = params.get('theme') === 'dark' ? SystemThemeEnum.DARK : SystemThemeEnum.LIGHT
    setting.setGlobalTheme(theme, theme)
    initializeTheme()
    return () =>
      h('main', { class: 'p-4', style: { maxWidth: '400px', margin: '0 auto' } }, [
        h('h1', { class: 'mb-4 text-xl' }, '登录 SDK 生命周期验收'),
        h('div', { class: 'mb-4 flex flex-wrap gap-2' }, [
          h(
            'button',
            { type: 'button', onClick: () => (mounted.value = !mounted.value) },
            '切换挂载'
          ),
          h(
            'button',
            { type: 'button', onClick: () => (sitekey.value += '-changed') },
            '更新验证码配置'
          ),
          h('button', { type: 'button', onClick: execute }, '执行验证码'),
          h('button', { type: 'button', onClick: () => captcha.value?.reset() }, '重置验证码'),
          h('button', { type: 'button', onClick: () => captcha.value?.remove() }, '移除验证码')
        ]),
        h('p', { 'data-testid': 'mount-status' }, mounted.value ? '已挂载' : '已卸载'),
        h('output', { 'data-testid': 'captcha-outcome', class: 'block' }, outcome.value),
        h('output', { 'data-testid': 'captcha-verified', class: 'block' }, String(verified.value)),
        h('output', { 'data-testid': 'captcha-errors', class: 'block' }, String(errors.value)),
        mounted.value &&
          (params.get('kind') === 'feishu'
            ? h(FeishuQrLogin, {
                channel,
                redirectTo: `${location.origin}/#/auth/login`,
                onBack: () => (mounted.value = false)
              })
            : Array.from({ length: count }, (_, index) =>
                h(ArtTurnstileCaptcha, {
                  key: index,
                  ref: index === 0 ? captcha : undefined,
                  sitekey: sitekey.value,
                  execution: 'execute',
                  size: 'flexible',
                  onVerify: () => (verified.value += 1),
                  onError: () => (errors.value += 1)
                })
              ))
      ])
  }
})
app.use(store)
app.mount('#auth-sdk-preview')
