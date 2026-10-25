<template>
  <section class="login-methods">
    <div class="login-methods__head">
      <div>
        <ArtSectionTitle :show-line="false">登录方式</ArtSectionTitle>
        <p>绑定后可使用对应渠道进入同一个系统账号，租户、角色和业务权限不会改变。</p>
      </div>
      <ElButton :loading="state.loading" @click="loadIdentities">
        <ArtSvgIcon icon="ri:refresh-line" />
        刷新状态
      </ElButton>
    </div>

    <div class="login-methods__notice">
      <span aria-hidden="true"><ArtSvgIcon icon="ri:shield-user-line" /></span>
      <div>
        <strong>账号安全边界</strong>
        <p>第三方平台只验证身份。账号停用、租户失效或没有可用角色时，任何登录渠道都会被拒绝。</p>
      </div>
    </div>

    <ArtAsyncState
      :loading="state.loading"
      :error="state.error"
      :empty="!state.loading && !state.error && !methodRows.length"
      empty-text="暂无可管理的第三方登录方式"
      empty-description="请联系平台管理员在网站配置中启用认证渠道。"
      :min-height="190"
      @retry="loadIdentities"
    >
      <div class="login-methods__list">
        <article v-for="row in methodRows" :key="row.key" class="login-method-row">
          <div class="login-method-row__icon" aria-hidden="true">
            <ArtSvgIcon :icon="row.icon" />
          </div>
          <div class="login-method-row__copy">
            <div>
              <strong>{{ row.label }}</strong>
              <ElTag :type="row.identity ? 'success' : 'info'" effect="light" size="small">
                {{ row.identity ? '已绑定' : '未绑定' }}
              </ElTag>
            </div>
            <p>{{ row.description }}</p>
            <small v-if="row.identity?.email">关联账号：{{ row.identity.email }}</small>
          </div>
          <div class="login-method-row__action">
            <ElButton
              v-if="row.identity"
              type="danger"
              text
              :loading="state.activeKey === row.key"
              :disabled="identities.length < 2"
              @click="confirmUnlink(row)"
            >
              解绑
            </ElButton>
            <ElButton
              v-else-if="row.channel?.allowLinking"
              type="primary"
              plain
              :loading="state.activeKey === row.key"
              @click="startLink(row.channel)"
            >
              绑定
            </ElButton>
          </div>
        </article>
      </div>
    </ArtAsyncState>

    <p v-if="identities.length < 2 && identities.length" class="login-methods__footnote">
      当前只有一种可用凭据。请先绑定新的登录方式，再解绑现有方式。
    </p>
  </section>
</template>

<script setup lang="ts">
  import { ElMessage } from 'element-plus'
  import { omit } from 'lodash-es'
  import {
    fetchCurrentUserIdentities,
    linkCurrentUserIdentity,
    unlinkCurrentUserIdentity
  } from '@/api/auth'
  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { buildAuthCallbackUrl, getFriendlySupabaseErrorMessage } from '@/utils/supabase'

  interface LoginMethodRow {
    key: string
    label: string
    icon: string
    description: string
    channel?: Api.Auth.AuthChannel
    identity?: Api.Auth.LinkedIdentity
  }

  interface StateGroup {
    loading: boolean
    activeKey: string
    error: Error | null
  }

  const route = useRoute()
  const router = useRouter()
  const { websiteConfig, loadWebsiteConfig } = useWebsiteConfig()
  const { confirmAction } = useArtFeedback()
  const identities = ref<Api.Auth.LinkedIdentity[]>([])
  const state = reactive<StateGroup>({ loading: false, activeKey: '', error: null })

  const enabledChannels = computed(() =>
    websiteConfig.value.authChannels.filter((channel) => channel.enabled)
  )

  const methodRows = computed<LoginMethodRow[]>(() => {
    const configured = enabledChannels.value.map((channel) => ({
      key: channel.key,
      label: channel.label,
      icon: channel.icon,
      description: channel.description || `使用${channel.label}验证当前账号身份`,
      channel,
      identity: identities.value.find((identity) => identity.provider === channel.provider)
    }))
    const configuredProviders = new Set(enabledChannels.value.map((channel) => channel.provider))
    const unconfigured = identities.value
      .filter(
        (identity) => identity.provider !== 'email' && !configuredProviders.has(identity.provider)
      )
      .map((identity) => ({
        key: `identity-${identity.id}`,
        label: identity.provider,
        icon: 'ri:login-circle-line',
        description: '该登录方式已绑定，但当前未在登录页启用。',
        identity
      }))
    return [...configured, ...unconfigured]
  })

  const clearCallbackQuery = async (): Promise<void> => {
    if (!route.query.auth_action) return
    await router.replace({ path: route.path, query: omit(route.query, ['auth_action', 'channel']) })
  }

  const loadIdentities = async (): Promise<void> => {
    state.loading = true
    state.error = null
    try {
      await loadWebsiteConfig()
      identities.value = await fetchCurrentUserIdentities()
      if (route.query.auth_action === 'link') {
        const channelKey = typeof route.query.channel === 'string' ? route.query.channel : ''
        const channel = enabledChannels.value.find((item) => item.key === channelKey)
        const linked = channel
          ? identities.value.some((identity) => identity.provider === channel.provider)
          : false
        ElMessage[linked ? 'success' : 'warning'](
          linked ? `${channel?.label || '第三方'}登录已绑定` : '未检测到新的登录方式，请重试'
        )
        await clearCallbackQuery()
      }
    } catch (error) {
      state.error = new Error(
        getFriendlySupabaseErrorMessage(error, '登录方式加载失败，请稍后重试'),
        { cause: error }
      )
    } finally {
      state.loading = false
    }
  }

  const startLink = async (channel: Api.Auth.AuthChannel): Promise<void> => {
    state.activeKey = channel.key
    const redirectTo = buildAuthCallbackUrl(window.location.href, route.path, 'link', channel.key)
    try {
      await linkCurrentUserIdentity(channel, redirectTo)
    } finally {
      state.activeKey = ''
    }
  }

  const confirmUnlink = async (row: LoginMethodRow): Promise<void> => {
    if (!row.identity) return
    try {
      await confirmAction(`解绑后将不能再使用${row.label}进入当前账号。`, `解绑${row.label}登录`, {
        type: 'warning',
        confirmButtonText: '确认解绑',
        cancelButtonText: '取消',
        confirmButtonType: 'danger'
      })
    } catch {
      return
    }

    state.activeKey = row.key
    try {
      await unlinkCurrentUserIdentity(row.identity.id)
      await loadIdentities()
    } finally {
      state.activeKey = ''
    }
  }

  onMounted(() => void loadIdentities())
</script>

<style scoped lang="scss">
  .login-methods {
    display: grid;
    gap: var(--art-space-4);
    padding: 24px 26px 28px;

    &__head {
      display: flex;
      gap: var(--art-space-4);
      align-items: flex-start;
      justify-content: space-between;
      min-width: 0;

      :deep(.art-section-title) {
        margin: 0;
      }

      p {
        margin: 3px 0 0 11px;
        font-size: 13px;
        line-height: 21px;
        color: var(--el-text-color-secondary);
      }
    }

    &__notice {
      display: flex;
      gap: var(--art-space-3);
      align-items: flex-start;
      padding: 14px 16px;
      background: var(--el-color-primary-light-9);
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--custom-radius);

      > span {
        display: grid;
        flex: 0 0 34px;
        place-items: center;
        width: 34px;
        height: 34px;
        font-size: 17px;
        color: var(--el-color-primary);
        background: var(--default-box-color);
        border-radius: var(--art-control-radius);
      }

      strong {
        font-size: 13px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        line-height: 20px;
        color: var(--el-text-color-secondary);
      }
    }

    &__list {
      display: grid;
      gap: var(--art-space-2);
    }

    &__footnote {
      margin: 0;
      font-size: 12px;
      color: var(--el-text-color-secondary);
    }

    .login-method-row {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) max-content;
      gap: var(--art-space-3);
      align-items: center;
      min-width: 0;
      padding: 14px 16px;
      background: var(--art-gray-100);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--custom-radius);

      &__icon {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        font-size: 21px;
        color: var(--el-color-primary);
        background: var(--default-box-color);
        border: 1px solid var(--el-color-primary-light-8);
        border-radius: var(--art-control-radius);
      }

      &__copy {
        min-width: 0;

        > div {
          display: flex;
          flex-wrap: wrap;
          gap: var(--art-space-2);
          align-items: center;
        }

        strong {
          font-size: 14px;
          color: var(--el-text-color-primary);
        }

        p,
        small {
          margin: 3px 0 0;
          font-size: 12px;
          line-height: 20px;
          color: var(--el-text-color-secondary);
        }

        small {
          display: block;
        }
      }

      &__action {
        .el-button {
          min-width: 68px;
          margin: 0;
        }
      }
    }

    @media (width <= 600px) {
      padding: 18px 16px 22px;

      &__head {
        flex-direction: column;
      }

      .login-method-row {
        grid-template-columns: 40px minmax(0, 1fr);

        &__icon {
          width: 40px;
          height: 40px;
        }

        &__action {
          grid-column: 2;
        }
      }
    }
  }
</style>
