<template>
  <div class="auth-page">
    <LoginLeftView />
    <div class="auth-page__panel flex flex-col">
      <AuthTopBar />
      <ElScrollbar class="consent-scroll min-h-0 flex-1">
        <div class="consent-stage">
          <ArtSectionCard
            class="w-full max-w-lg"
            :show-marker="false"
            :min-height="240"
            loading-mode="skeleton"
            error-title="暂时无法连接应用"
            :loading="consent.loading"
            :error="consent.error"
            @retry="load"
          >
            <template #header>
              <header class="px-8 pt-8 max-sm:px-6">
                <span class="art-icon-label text-sm font-medium text-theme">
                  <ArtSvgIcon icon="ri:shield-check-line" />统一身份认证
                </span>
                <h1 class="mt-5 text-2xl font-semibold text-g-900">{{
                  consent.loading ? '正在连接应用' : consent.error ? '连接未完成' : '授权登录'
                }}</h1>
                <p class="mt-3 text-sm leading-6 text-g-700">{{
                  consent.loading
                    ? '正在确认你的登录状态，完成后将自动继续。'
                    : '使用统一账号，安全进入你的应用工作空间。'
                }}</p>
              </header>
            </template>
            <template #loading>
              <div
                class="flex min-h-60 flex-col items-center justify-center gap-6 px-4 py-8 text-center"
                role="status"
                aria-live="polite"
              >
                <div
                  class="consent-symbol flex size-20 items-center justify-center rounded-full text-theme"
                >
                  <ElIcon class="is-loading" :size="32"><Loading /></ElIcon>
                </div>
                <div
                  ><p class="text-base font-medium text-g-900">正在安全连接</p
                  ><p class="mt-2 text-sm leading-6 text-g-700">请稍候，无需重复操作</p></div
                >
              </div>
            </template>
            <template #footer>
              <p class="art-icon-label justify-center px-4 py-2 text-xs text-g-700"
                ><ArtSvgIcon icon="ri:lock-line" />安全授权 · 应用访问权限由接入应用管理</p
              >
            </template>
            <template v-if="consent.details">
              <div class="mb-5 flex items-center gap-3"
                ><ArtSvgIcon icon="ri:shield-keyhole-line" class="text-theme text-3xl" /><div
                  ><p class="font-semibold text-g-900">{{
                    consent.details.client.name || '接入应用'
                  }}</p
                  ><p class="mt-1 text-sm text-g-700">请求使用你的统一身份登录</p></div
                ></div
              >
              <p class="mb-4 break-all text-sm text-g-700"
                >当前账号：{{ consent.details.user.email }}</p
              >
              <div class="rounded-custom-sm bg-g-100 p-4"
                ><p class="mb-2 font-medium">此应用请求读取</p
                ><ul class="space-y-2 text-sm text-g-700"
                  ><li v-for="scope in requestedScopes" :key="scope.code">{{ scope.label }}</li></ul
                ></div
              >
              <p class="mt-4 break-all text-xs leading-5 text-g-700"
                >授权后返回：{{ callbackOrigin }}。应用内的访问范围由该应用单独管理。</p
              >
              <ElAlert
                v-if="consent.decisionError"
                class="mt-4"
                :title="consent.decisionError"
                type="error"
                :closable="false"
                show-icon
              />
              <div class="mt-6 flex justify-end gap-3"
                ><ElButton :disabled="consent.submitting" @click="decide(false)">取消授权</ElButton
                ><ElButton type="primary" :loading="consent.submitting" @click="decide(true)"
                  >同意并继续</ElButton
                ></div
              >
            </template>
          </ArtSectionCard>
        </div>
      </ElScrollbar>
    </div>
  </div>
</template>
<script setup lang="ts">
  import '../login/style.css'
  import { Loading } from '@element-plus/icons-vue'
  import {
    resumeFirstPartyOAuthAuthorization,
    decideOAuthAuthorization
  } from '@/api/oauth-authorization'
  import { oauthConsentLoginTarget, resolveOAuthAuthorizationId } from '@/utils/oauth-authorization'
  import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'

  const route = useRoute(),
    router = useRouter()
  const consent = reactive<{
    loading: boolean
    submitting: boolean
    error: string
    decisionError: string
    details?: OAuthAuthorizationDetails
  }>({ loading: true, submitting: false, error: '', decisionError: '' })
  const authorizationId = computed(() =>
    resolveOAuthAuthorizationId(
      route.query.authorization_id ||
        new URL(window.location.href).searchParams.get('authorization_id')
    )
  )
  const scopeLabels: Record<string, string> = {
    openid: '统一账号标识',
    email: '邮箱地址',
    profile: '基本个人资料'
  }
  const requestedScopes = computed(() =>
    (consent.details?.scope.split(' ').filter(Boolean) || []).map((code) => ({
      code,
      label: scopeLabels[code] || code
    }))
  )
  const callbackOrigin = computed(() => {
    try {
      return consent.details ? new URL(consent.details.redirect_uri).origin : ''
    } catch {
      return ''
    }
  })
  async function load(): Promise<void> {
    Object.assign(consent, { loading: true, error: '', details: undefined })
    try {
      if (!authorizationId.value) throw new Error('缺少有效的授权请求，请返回应用重新发起登录')
      const result = await resumeFirstPartyOAuthAuthorization(authorizationId.value)
      if (result.status === 'login-required') {
        await router.replace(oauthConsentLoginTarget(authorizationId.value))
        return
      }
      if (result.status === 'redirect') {
        window.location.assign(result.url)
        return
      }
      consent.details = result.details
    } catch {
      consent.error = '授权请求加载失败，请返回应用重新发起登录，或点击重试'
    } finally {
      consent.loading = false
    }
  }
  async function decide(approve: boolean): Promise<void> {
    if (!authorizationId.value || consent.submitting) return
    Object.assign(consent, { submitting: true, decisionError: '' })
    try {
      window.location.assign(await decideOAuthAuthorization(authorizationId.value, approve))
    } catch {
      consent.decisionError = '授权处理失败，请重试或返回应用重新登录'
    } finally {
      consent.submitting = false
    }
  }
  onMounted(load)
</script>

<style scoped lang="scss">
  .consent-scroll {
    :deep(.el-scrollbar__view) {
      display: flex;
      min-height: 100%;
    }
  }

  .consent-stage {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    min-width: 0;
    padding: 88px 24px 48px;

    .consent-symbol {
      background: color-mix(in srgb, var(--theme-color) 9%, var(--el-bg-color));
    }

    @media (width <= 640px) {
      padding: 80px 20px 24px;
    }

    @media (prefers-reduced-motion: reduce) {
      .is-loading {
        animation: none;
      }
    }
  }
</style>
