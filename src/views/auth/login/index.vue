<!-- 登录页面 -->
<template>
  <div class="auth-page auth-login-page">
    <LoginLeftView />

    <div class="auth-page__panel">
      <AuthTopBar />

      <div class="auth-right-wrap">
        <div class="form">
          <div class="form__eyebrow">
            <span><ArtSvgIcon icon="ri:shield-check-line" /></span>
            安全工作区
          </div>
          <h3 class="title">
            {{ finishingOAuth ? '正在完成登录' : showFeishuQr ? '飞书扫码登录' : loginTitle }}
          </h3>
          <p class="sub-title">
            {{
              finishingOAuth
                ? '正在验证身份并准备工作台，请稍候'
                : showFeishuQr
                  ? '使用飞书企业身份扫码，并在手机上确认'
                  : loginSubtitle || $t('login.subTitle')
            }}
          </p>
          <ElAlert
            v-if="websiteConfig.maintenanceEnabled"
            class="mt-4"
            type="warning"
            show-icon
            :closable="false"
            :title="websiteConfig.maintenanceMessage || '系统维护中，请稍后再试'"
          />
          <ElAlert
            v-if="oauthError"
            class="auth-oauth-error"
            type="error"
            show-icon
            :closable="true"
            :title="oauthError"
            @close="oauthError = ''"
          />
          <div
            v-if="finishingOAuth"
            class="auth-callback-progress"
            role="status"
            aria-live="polite"
          >
            <ArtSvgIcon icon="ri:loader-4-line" class="auth-callback-progress__spinner" />
            <span>{{ oauthProgressText }}</span>
          </div>
          <ArtForm
            custom-layout
            :show-reset="false"
            :show-submit="false"
            v-else-if="!showFeishuQr"
            ref="formRef"
            :model-value="formData"
            @update:model-value="replaceReactiveModel(formData, $event)"
            :rules="rules"
            :key="formKey"
            @submit="handleSubmit"
            form-class="mt-[25px]"
          >
            <ElFormItem prop="identifier">
              <ElInput
                ref="identifierInputRef"
                class="custom-height"
                :placeholder="$t('login.placeholder.identifier')"
                v-model.trim="formData.identifier"
                name="username"
                autocomplete="username"
                autocapitalize="none"
                :spellcheck="false"
                aria-label="邮箱或手机号"
              >
                <template #prefix><ArtSvgIcon icon="ri:user-3-line" /></template>
              </ElInput>
            </ElFormItem>
            <ElFormItem prop="password">
              <ElInput
                ref="passwordInputRef"
                class="custom-height"
                :placeholder="$t('login.placeholder.password')"
                v-model="formData.password"
                type="password"
                name="password"
                autocomplete="current-password"
                show-password
                aria-label="登录密码"
              >
                <template #prefix><ArtSvgIcon icon="ri:lock-2-line" /></template>
              </ElInput>
            </ElFormItem>

            <ElFormItem
              v-if="showTurnstile"
              class="turnstile-form-item mt-6"
              :class="{ 'is-interaction-only': turnstileAppearance === 'interaction-only' }"
            >
              <ArtTurnstileCaptcha
                ref="turnstileRef"
                :sitekey="turnstileSiteKey"
                :size="turnstileWidgetSize"
                :theme="websiteConfig.turnstileTheme || 'auto'"
                :appearance="turnstileAppearance"
                :execution="turnstileExecution"
                @verify="handleTurnstileVerify"
                @expired="resetTurnstileToken"
                @timeout="resetTurnstileToken"
                @error="resetTurnstileToken"
              />
            </ElFormItem>

            <div class="flex-cb mt-2 text-sm">
              <ElCheckbox v-model="formData.rememberPassword">{{
                $t('login.rememberPwd')
              }}</ElCheckbox>
              <RouterLink
                class="auth-page__support-link text-theme"
                :to="{ name: 'ForgetPassword' }"
                >{{ $t('login.forgetPwd') }}</RouterLink
              >
            </div>
            <div style="margin-top: 30px">
              <ElButton
                class="w-full custom-height"
                type="primary"
                native-type="submit"
                :loading="loading || websiteConfigLoading"
                :disabled="!websiteConfigLoaded || Boolean(oauthLoadingKey)"
                v-ripple
              >
                <span>{{ websiteConfigLoaded ? $t('login.btnText') : '正在加载登录配置…' }}</span>
                <ArtSvgIcon icon="ri:arrow-right-line" />
              </ElButton>
            </div>

            <div v-if="websiteConfig.registerEnabled" class="mt-5 text-sm text-gray-600">
              <span>{{ $t('login.noAccount') }}</span>
              <RouterLink class="auth-page__support-link text-theme" :to="{ name: 'Register' }">{{
                $t('login.register')
              }}</RouterLink>
            </div>
          </ArtForm>

          <div
            v-if="!finishingOAuth && !showFeishuQr && enabledAuthChannels.length"
            class="auth-channels"
          >
            <div class="auth-channels__divider"><span>其他方式</span></div>
            <ElScrollbar class="auth-channels__scrollbar" :max-height="94">
              <div class="auth-channels__icons" role="group" aria-label="第三方登录方式">
                <ArtTooltip
                  v-for="channel in enabledAuthChannels"
                  :key="channel.key"
                  :content="`${channel.label}登录`"
                  placement="top"
                  effect="dark"
                  popper-class="auth-channel-tooltip"
                  :show-after="240"
                  :hide-after="0"
                  :disabled="Boolean(oauthLoadingKey)"
                >
                  <ArtIconButton
                    class="auth-channels__button"
                    :class="`is-${channel.key}`"
                    :icon="channel.icon"
                    :label="`使用${channel.label}登录`"
                    :loading="oauthLoadingKey === channel.key"
                    :disabled="Boolean(oauthLoadingKey || loading || !websiteConfigLoaded)"
                    @click="handleAuthChannelLogin(channel)"
                  />
                </ArtTooltip>
              </div>
            </ElScrollbar>
            <p class="auth-channels__hint">首次使用需先在个人中心绑定</p>
          </div>

          <FeishuQrLogin
            v-if="!finishingOAuth && showFeishuQr && feishuQrChannel"
            :channel="feishuQrChannel"
            :redirect-to="feishuQrRedirectTo"
            @back="showFeishuQr = false"
            @redirect="handleFeishuRedirectLogin"
          />

          <div class="form__trust">
            <span class="art-icon-label"><ArtSvgIcon icon="ri:lock-line" /> TLS 安全连接</span>
            <i />
            <span>企业级权限隔离</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useEventListener } from '@vueuse/core'
  import { replaceReactiveModel } from '@/utils/form/model'
  import ArtForm from '@/components/core/forms/art-form/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import { useI18n } from 'vue-i18n'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { ElInput, ElMessage, ElNotification, type FormRules } from 'element-plus'
  import {
    checkCurrentUserAccess,
    getCurrentAuthSession,
    login,
    signInWithAuthChannel
  } from '@/api/auth'
  import { MenuProcessor } from '@/router/core/menu-processor'
  import { clearAccessibleApplicationsCache } from '@/api/system-manage/application-access'
  import { getFirstMenuPath } from '@/utils/navigation/route'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  import ArtTurnstileCaptcha from '@/components/core/forms/art-turnstile-captcha/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import FeishuQrLogin from './modules/feishu-qr-login.vue'

  import {
    isAbsoluteApplicationRedirect,
    resolveSafePostLoginRedirect
  } from '@/utils/auth-redirect'
  import { preparePostLoginData } from './modules/post-login-data'
  import {
    readBrowserPassword,
    readRememberPasswordPreference,
    readRememberedIdentifier,
    requestBrowserPasswordSave,
    writeRememberPasswordPreference,
    writeRememberedIdentifier
  } from './modules/remember-password'
  import { buildAuthCallbackUrl, getFriendlySupabaseErrorMessage } from '@/utils/supabase'

  defineOptions({ name: 'Login' })

  const { t, locale } = useI18n()
  const {
    websiteConfig,
    websiteConfigLoading,
    websiteConfigLoaded,
    loginTitle,
    loginSubtitle,
    loadWebsiteConfig
  } = useWebsiteConfig()
  const formKey = ref(0)

  // 监听语言切换，重置表单
  watch(locale, () => {
    formKey.value++
  })

  type AccountKey = 'super' | 'admin' | 'user'

  export interface Account {
    key: AccountKey
    label: string
    userName: string
    password: string
    roles: string[]
  }

  const userStore = useUserStore()
  const router = useRouter()
  const route = useRoute()
  const menuProcessor = new MenuProcessor()
  const POST_LOGIN_BACKGROUND_IDLE_MS = 5_000
  const turnstileToken = ref('')
  const turnstileRef = ref<{
    reset?: () => void
    execute?: () => Promise<string>
  }>()

  const formRef = ref<InstanceType<typeof ArtForm>>()
  const identifierInputRef = ref<InstanceType<typeof ElInput>>()
  const passwordInputRef = ref<InstanceType<typeof ElInput>>()
  const rememberPasswordPreference = readRememberPasswordPreference()
  const rememberedIdentifier = readRememberedIdentifier()

  const formData = reactive({
    account: '',
    username: '',
    identifier: rememberedIdentifier || '624944977@qq.com',
    password: rememberedIdentifier && rememberedIdentifier !== '624944977@qq.com' ? '' : '123456',
    rememberPassword: rememberPasswordPreference
  })

  const loading = ref(false)
  const oauthLoadingKey = ref('')
  const oauthError = ref('')
  const finishingOAuth = ref(route.query.auth_action === 'login')
  const oauthProgressText = ref('正在接收授权结果…')
  const showFeishuQr = ref(false)
  const feishuQrChannel = ref<Api.Auth.AuthChannel | null>(null)
  const feishuQrRedirectTo = ref('')
  const enabledAuthChannels = computed(() =>
    websiteConfigLoaded.value
      ? websiteConfig.value.authChannels.filter((channel) => channel.enabled)
      : []
  )
  const showTurnstile = computed(
    () => websiteConfigLoaded.value && websiteConfig.value.captchaEnabled
  )
  const turnstileSiteKey = computed(() => websiteConfig.value.turnstileSiteKey)
  const turnstileWidgetSize = computed(() =>
    websiteConfig.value.turnstileSize === 'compact' ? 'compact' : 'flexible'
  )
  const turnstileAppearance = computed(() =>
    websiteConfig.value.turnstileSize === 'hidden' ||
    websiteConfig.value.turnstileSize === 'flexible'
      ? 'interaction-only'
      : 'always'
  )
  const turnstileExecution = computed(() =>
    turnstileAppearance.value === 'interaction-only' ? 'execute' : 'render'
  )
  const requiresVisibleTurnstileToken = computed(
    () => showTurnstile.value && turnstileAppearance.value !== 'interaction-only'
  )

  const rules = computed<FormRules>(() => ({
    identifier: [{ required: true, message: t('login.placeholder.identifier'), trigger: 'blur' }],
    password: [{ required: true, message: t('login.placeholder.password'), trigger: 'blur' }]
  }))

  const isForbiddenRedirect = (redirect?: string): boolean => {
    if (!redirect) {
      return false
    }

    return ['/403', '/404', '/500'].includes(redirect.split('?')[0])
  }

  const resolvePostLoginPath = async (): Promise<string> => {
    const requestedRedirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : undefined
    const redirect = resolveSafePostLoginRedirect(requestedRedirect, window.location.origin)

    if (!redirect) {
      return '/'
    }

    if (!isForbiddenRedirect(redirect)) {
      return redirect
    }

    const menuList = await menuProcessor.getMenuList()
    if (!menuProcessor.validateMenuList(menuList)) {
      return '/'
    }

    return getFirstMenuPath(menuList) || '/'
  }

  onMounted(() => {
    void initializeLoginPage()
    if (rememberedIdentifier && !finishingOAuth.value) void restoreBrowserPassword()
    void nextTick(syncBrowserAutofill)
  })

  watch(
    () => formData.rememberPassword,
    (rememberPassword) => {
      writeRememberPasswordPreference(rememberPassword)
    }
  )

  const restoreBrowserPassword = async (): Promise<void> => {
    const initialPassword = formData.password
    const password = await readBrowserPassword(rememberedIdentifier)
    if (
      password &&
      formData.identifier === rememberedIdentifier &&
      formData.password === initialPassword
    ) {
      formData.password = password
    }
  }

  const syncBrowserAutofill = (): void => {
    const identifier = identifierInputRef.value?.input?.value.trim()
    const password = passwordInputRef.value?.input?.value
    if (identifier && identifier !== formData.identifier) formData.identifier = identifier
    if (password && password !== formData.password) formData.password = password
  }

  useEventListener(window, 'pageshow', syncBrowserAutofill)

  const initializeLoginPage = async (): Promise<void> => {
    if (finishingOAuth.value) {
      void loadWebsiteConfig()
      await handleOAuthCallback()
      return
    }
    await loadWebsiteConfig()
  }

  const completeAuthenticatedLogin = async (tokens: {
    accessToken: string
    refreshToken?: string
  }): Promise<void> => {
    clearAccessibleApplicationsCache()
    userStore.setToken(tokens.accessToken, tokens.refreshToken)
    userStore.setLoginStatus(true)
    const { startDictionaries } = await preparePostLoginData({
      loadDictionaries: userStore.fetchDictList,
      loadUserProfile: userStore.fetchUserInfo,
      onDictionaryError: (error) => {
        console.error('[Login] 基础字典初始化失败:', error)
      }
    })
    showLoginSuccessNotice()

    const targetPath = await resolvePostLoginPath()
    if (isAbsoluteApplicationRedirect(targetPath)) {
      window.location.replace(targetPath)
      return
    }

    await router.push(targetPath)
    scheduleDictionariesAfterNavigationIdle(startDictionaries)
  }

  const scheduleDictionariesAfterNavigationIdle = (
    startDictionaries: () => Promise<void>
  ): void => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined

    const clearIdleTimer = (): void => {
      if (!idleTimer) return
      clearTimeout(idleTimer)
      idleTimer = undefined
    }
    const stopBeforeGuard = router.beforeEach(() => {
      clearIdleTimer()
    })
    const stopAfterGuard = router.afterEach(() => {
      schedule()
    })
    const schedule = (): void => {
      clearIdleTimer()
      idleTimer = setTimeout(() => {
        idleTimer = undefined
        stopBeforeGuard()
        stopAfterGuard()
        void startDictionaries()
      }, POST_LOGIN_BACKGROUND_IDLE_MS)
    }

    schedule()
  }

  const handleOAuthCallback = async (): Promise<void> => {
    const channelKey = typeof route.query.channel === 'string' ? route.query.channel : ''
    oauthLoadingKey.value = channelKey || 'oauth'
    oauthError.value = ''
    try {
      oauthProgressText.value = '正在验证授权会话…'
      const tokens = await getCurrentAuthSession()
      oauthProgressText.value = '正在核对工作区权限…'
      await checkCurrentUserAccess(true)
      oauthProgressText.value = '正在打开工作台…'
      await completeAuthenticatedLogin(tokens)
    } catch (error) {
      oauthError.value = getFriendlySupabaseErrorMessage(error, '第三方登录未完成，请重新发起登录')
      await userStore.logOut()
      finishingOAuth.value = false
    } finally {
      oauthLoadingKey.value = ''
    }
  }

  const handleAuthChannelLogin = async (channel: Api.Auth.AuthChannel): Promise<void> => {
    oauthError.value = ''
    const requestedRedirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : undefined
    const redirectTo = buildAuthCallbackUrl(
      window.location.href,
      '/auth/login',
      'login',
      channel.key,
      requestedRedirect
    )
    if (channel.key === 'feishu' && !window.matchMedia('(max-width: 520px)').matches) {
      feishuQrChannel.value = channel
      feishuQrRedirectTo.value = redirectTo
      showFeishuQr.value = true
      return
    }
    oauthLoadingKey.value = channel.key
    try {
      await signInWithAuthChannel(channel, redirectTo)
    } catch (error) {
      oauthError.value = getFriendlySupabaseErrorMessage(
        error,
        `${channel.label}登录暂时不可用，请稍后重试`
      )
    } finally {
      oauthLoadingKey.value = ''
    }
  }

  const handleFeishuRedirectLogin = async (): Promise<void> => {
    if (!feishuQrChannel.value) return
    oauthError.value = ''
    oauthLoadingKey.value = 'feishu'
    try {
      await signInWithAuthChannel(feishuQrChannel.value, feishuQrRedirectTo.value)
    } catch (error) {
      oauthError.value = getFriendlySupabaseErrorMessage(error, '飞书登录暂时不可用，请稍后重试')
    } finally {
      oauthLoadingKey.value = ''
    }
  }

  // 登录
  const handleSubmit = async () => {
    if (!formRef.value || !websiteConfigLoaded.value || loading.value) return

    try {
      syncBrowserAutofill()
      // 表单验证
      const valid = await formRef.value.validate()
      if (!valid) return

      if (requiresVisibleTurnstileToken.value && !turnstileToken.value) {
        ElMessage.warning('请先完成人机验证')
        return
      }

      loading.value = true
      const captchaToken = await resolveCaptchaToken()

      // 登录请求
      const { identifier, password } = formData

      const params: Api.Auth.LoginParams = {
        identifier,
        password,
        captchaToken
      }
      const { data } = await login(params)
      const responseSession = data?.session
      const tokens = responseSession?.accessToken
        ? {
            accessToken: responseSession.accessToken,
            refreshToken: responseSession.refreshToken
          }
        : await getCurrentAuthSession()

      if (formData.rememberPassword) {
        if (!writeRememberedIdentifier(identifier)) {
          ElMessage.warning('浏览器未能记住账号，请检查浏览器存储设置')
        }
        void requestBrowserPasswordSave(identifier, password).then((status) => {
          if (status === 'failed') {
            ElMessage.warning('浏览器未能保存密码，可在浏览器的密码管理器中手动保存')
          }
        })
      }

      await completeAuthenticatedLogin(tokens)
    } catch (error) {
      notifyFriendlyError(error, '登录失败，请稍后重试')
    } finally {
      loading.value = false
      if (showTurnstile.value) {
        resetTurnstile()
      }
    }
  }

  const handleTurnstileVerify = (token: string) => {
    turnstileToken.value = token
  }

  const resetTurnstileToken = () => {
    turnstileToken.value = ''
  }

  const resetTurnstile = () => {
    resetTurnstileToken()
    turnstileRef.value?.reset?.()
  }

  const resolveCaptchaToken = async (): Promise<string | undefined> => {
    if (!showTurnstile.value) return undefined
    if (turnstileToken.value) return turnstileToken.value
    if (turnstileAppearance.value !== 'interaction-only') return undefined

    const token = await turnstileRef.value?.execute?.()
    turnstileToken.value = token || ''
    return token || undefined
  }

  // 登录成功提示
  const showLoginSuccessNotice = () => {
    const { userName, nickName, email } = userStore.getUserInfo
    const systemName = nickName || userName || email
    setTimeout(() => {
      ElNotification({
        title: t('login.success.title'),
        type: 'success',
        duration: 2500,
        zIndex: 10000,
        message: `${t('login.success.message')}, ${systemName}`
      })
    }, 1000)
  }
</script>

<style lang="scss" scoped>
  :deep(.turnstile-form-item .el-form-item__content) {
    width: 100%;
  }

  :deep(.turnstile-form-item.is-interaction-only) {
    height: 0;
    margin: 0;
    overflow: hidden;
  }
</style>

<style lang="scss">
  .auth-channel-tooltip.el-popper.is-dark {
    padding: 7px 10px;
    font-size: 12px;
    line-height: 16px;
    color: #fff;
    background: rgb(31 33 47 / 96%);
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: var(--art-surface-radius);
    box-shadow: 0 8px 24px rgb(15 18 32 / 18%);
  }
</style>
