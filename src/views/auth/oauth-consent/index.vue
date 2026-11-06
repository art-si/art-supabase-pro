<template>
  <div class="auth-page">
    <LoginLeftView />
    <div class="auth-page__panel">
      <AuthTopBar />
      <div class="flex min-h-0 flex-1 items-center justify-center px-5 py-10">
        <ArtSectionCard
          class="w-full max-w-lg"
          title="授权登录"
          subtitle="使用亿企工场账号安全访问接入应用。"
          :loading="consent.loading"
          :error="consent.error"
          @retry="load"
        >
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
    </div>
  </div>
</template>
<script setup lang="ts">
  import '../login/style.css'
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
