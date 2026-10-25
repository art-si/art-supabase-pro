<template>
  <div v-if="hasPermission" v-bind="attrs" class="art-permission-guard__authorized">
    <slot />
  </div>

  <section
    v-else
    v-bind="attrs"
    class="art-permission-guard art-full-height"
    :class="{ 'is-viewport-centered': viewportCentered }"
    role="status"
    aria-live="polite"
    :aria-labelledby="titleId"
  >
    <section class="art-permission-guard__panel art-card-xs">
      <div class="art-permission-guard__visual" aria-hidden="true">
        <span class="art-permission-guard__halo"></span>
        <span class="art-permission-guard__shield">
          <ArtSvgIcon icon="ri:shield-keyhole-line" />
        </span>
        <span class="art-permission-guard__status">
          <ArtSvgIcon icon="ri:lock-2-line" />
        </span>
      </div>

      <div class="art-permission-guard__content">
        <div class="art-permission-guard__eyebrow">
          <span></span>
          访问受限
        </div>
        <h1 :id="titleId">暂无查看权限</h1>
        <p> 当前账号尚未获得“{{ resolvedResourceName }}”的查看权限，因此页面内容未加载。 </p>

        <div class="art-permission-guard__guide">
          <span class="art-permission-guard__guide-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:user-settings-line" />
          </span>
          <div>
            <strong>请联系管理员为用户角色授权</strong>
            <p>
              前往“系统管理 → 角色管理”，选择该用户所属角色，并在菜单权限中勾选“{{
                resolvedResourceName
              }}”及其查看权限。
            </p>
          </div>
        </div>

        <div class="art-permission-guard__actions">
          <ElButton
            v-if="showRelogin"
            v-ripple
            type="primary"
            :loading="reloginLoading"
            @click="handleRelogin"
          >
            <ArtSvgIcon icon="ri:login-box-line" aria-hidden="true" />
            重新登录
          </ElButton>
          <ElButton v-ripple type="primary" :plain="showRelogin" @click="handleReload">
            <ArtSvgIcon icon="ri:refresh-line" aria-hidden="true" />
            重新检查权限
          </ElButton>
          <ElButton v-if="showBack" @click="handleBack">
            <ArtSvgIcon icon="ri:arrow-left-line" aria-hidden="true" />
            返回上一页
          </ElButton>
          <ElButton text @click="handleBackHome">返回工作台</ElButton>
        </div>

        <p class="art-permission-guard__note">
          <ArtSvgIcon icon="ri:information-line" aria-hidden="true" />
          {{
            showRelogin
              ? '管理员授权后，建议重新登录以同步完整权限；也可以直接重新检查当前权限。'
              : '授权完成后，请点击“重新检查权限”刷新当前账号的权限状态。'
          }}
        </p>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
  import { useRoute, useRouter } from 'vue-router'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useCommon } from '@/hooks/core/useCommon'
  import { resolveRouteInitializationTarget } from '@/router/guards/route-initialization'
  import { useUserStore } from '@/store/modules/user'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  defineOptions({ name: 'ArtPermissionGuard', inheritAttrs: false })

  interface Props {
    permission?: string
    forceDenied?: boolean
    resourceName?: string
    showBack?: boolean
    showRelogin?: boolean
    viewportCentered?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {
    permission: '',
    forceDenied: false,
    resourceName: '',
    showBack: true,
    showRelogin: false,
    viewportCentered: false
  })

  const attrs = useAttrs()
  const route = useRoute()
  const router = useRouter()
  const userStore = useUserStore()
  const { hasAuth } = useAuth()
  const { homePath } = useCommon()
  const titleId = useId()
  const reloginLoading = ref(false)

  const hasPermission = computed(() => {
    if (props.forceDenied) return false
    return props.permission ? hasAuth(props.permission) : true
  })
  const resolvedResourceName = computed(() => {
    if (props.resourceName.trim()) return props.resourceName.trim()
    return typeof route.meta.title === 'string' && route.meta.title.trim()
      ? route.meta.title.trim()
      : '当前页面'
  })
  const retryTarget = computed(() =>
    resolveRouteInitializationTarget(route.query.redirect || homePath.value || '/')
  )

  const handleReload = (): void => {
    const reloadUrl = new URL(router.resolve(retryTarget.value).href, window.location.href)
    window.history.replaceState(window.history.state, '', reloadUrl)
    window.location.reload()
  }

  const handleRelogin = async (): Promise<void> => {
    if (reloginLoading.value) return
    reloginLoading.value = true
    try {
      await userStore.logOut(retryTarget.value)
    } catch {
      ElMessage.error('退出当前账号失败，请稍后重试')
      reloginLoading.value = false
    }
  }

  const handleBack = (): void => {
    if (window.history.length > 1) {
      router.back()
      return
    }
    void router.push(homePath.value || '/dashboard')
  }

  const handleBackHome = (): void => {
    void router.push(homePath.value || '/dashboard')
  }
</script>

<style scoped lang="scss">
  .art-permission-guard__authorized {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .art-permission-guard {
    display: grid;
    place-items: center;
    min-width: 0;
    padding: var(--art-space-4);

    &.is-viewport-centered {
      width: 100%;
      height: 100dvh;
      min-height: 100dvh;
    }

    &__panel {
      position: relative;
      display: grid;
      grid-template-columns: minmax(260px, 0.72fr) minmax(420px, 1.28fr);
      width: min(920px, 100%);
      min-height: min(520px, calc(var(--art-full-height) - var(--art-space-6)));
      overflow: hidden;
      border: 1px solid var(--art-card-border);
    }

    &__visual {
      position: relative;
      display: grid;
      place-items: center;
      overflow: hidden;
      background:
        linear-gradient(
          color-mix(in srgb, var(--theme-color) 6%, transparent) 1px,
          transparent 1px
        ),
        linear-gradient(
          90deg,
          color-mix(in srgb, var(--theme-color) 6%, transparent) 1px,
          transparent 1px
        ),
        color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
      background-size: 26px 26px;
    }

    &__halo {
      position: absolute;
      width: min(24vw, 290px);
      aspect-ratio: 1;
      background: radial-gradient(
        circle,
        color-mix(in srgb, var(--theme-color) 18%, transparent),
        transparent 68%
      );
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, transparent);
      border-radius: 50%;

      &::before,
      &::after {
        position: absolute;
        content: '';
        border: 1px solid color-mix(in srgb, var(--theme-color) 14%, transparent);
        border-radius: inherit;
      }

      &::before {
        inset: 28px;
      }

      &::after {
        inset: 58px;
      }
    }

    &__shield {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      width: 112px;
      height: 112px;
      font-size: 52px;
      color: #fff;
      background: linear-gradient(
        145deg,
        color-mix(in srgb, var(--theme-color) 78%, #fff),
        var(--theme-color)
      );
      border: 8px solid color-mix(in srgb, var(--default-box-color) 84%, transparent);
      border-radius: 32px;
      box-shadow: 0 22px 44px color-mix(in srgb, var(--theme-color) 24%, transparent);
      transform: rotate(-4deg);
    }

    &__status {
      position: absolute;
      z-index: 2;
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      margin: 92px 0 0 92px;
      font-size: 19px;
      color: #fff;
      background: var(--art-warning);
      border: 5px solid var(--default-box-color);
      border-radius: 50%;
    }

    &__content {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      padding: clamp(36px, 5vw, 64px);

      > h1 {
        margin: var(--art-space-3) 0 0;
        font-size: clamp(26px, 3vw, 34px);
        font-weight: 700;
        line-height: 1.25;
        color: var(--art-gray-900);
        letter-spacing: -0.02em;
      }

      > p {
        max-width: 560px;
        margin: var(--art-space-3) 0 0;
        font-size: 15px;
        line-height: 1.75;
        color: var(--art-gray-600);
      }
    }

    &__eyebrow {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      width: fit-content;
      font-size: 12px;
      font-weight: 700;
      color: var(--theme-color);
      letter-spacing: 0.14em;

      > span {
        width: 22px;
        height: 3px;
        background: var(--theme-color);
        border-radius: 999px;
      }
    }

    &__guide {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      gap: var(--art-space-3);
      padding: var(--art-space-4);
      margin-top: var(--art-space-5);
      background: color-mix(in srgb, var(--art-warning) 7%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--art-warning) 24%, var(--art-card-border));
      border-radius: var(--art-control-radius, var(--el-border-radius-base));

      strong {
        display: block;
        font-size: 14px;
        font-weight: 650;
        line-height: 1.5;
        color: var(--art-gray-800);
      }

      p {
        margin: 5px 0 0;
        font-size: 13px;
        line-height: 1.7;
        color: var(--art-gray-600);
      }
    }

    &__guide-icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      font-size: 20px;
      color: var(--art-warning);
      background: color-mix(in srgb, var(--art-warning) 14%, var(--default-box-color));
      border-radius: 12px;
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--art-space-2);
      align-items: center;
      margin-top: var(--art-space-5);

      :deep(.el-button) {
        min-width: 118px;
        margin-left: 0;
      }
    }

    &__note {
      display: flex;
      gap: 7px;
      align-items: flex-start;
      margin-top: var(--art-space-4) !important;
      font-size: 12px !important;
      line-height: 1.6 !important;
      color: var(--art-gray-500) !important;

      .art-svg-icon {
        flex: 0 0 auto;
        margin-top: 2px;
      }
    }

    @media (width <= 780px) {
      place-items: start stretch;
      padding: var(--art-space-2);

      &__panel {
        grid-template-columns: minmax(0, 1fr);
        min-height: auto;
      }

      &__visual {
        min-height: 190px;
      }

      &__halo {
        width: 220px;
      }

      &__shield {
        width: 86px;
        height: 86px;
        font-size: 40px;
        border-radius: 26px;
      }

      &__status {
        width: 36px;
        height: 36px;
        margin: 70px 0 0 72px;
        font-size: 16px;
      }

      &__content {
        padding: var(--art-space-5) var(--art-space-4);
      }
    }

    @media (width <= 520px) {
      &__actions {
        align-items: stretch;

        :deep(.el-button) {
          width: 100%;
        }
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      &__panel {
        animation: art-permission-panel-enter 360ms ease-out both;
      }

      &__shield {
        animation: art-permission-visual-enter 480ms 80ms ease-out both;
      }

      &__status {
        animation: art-permission-status-enter 480ms 120ms ease-out both;
      }
    }
  }

  :global(html[data-box-mode='shadow-mode'] .art-permission-guard__panel) {
    border-color: transparent;
    box-shadow: 0 22px 60px rgb(18 27 51 / 10%);
  }

  :global(html.dark[data-box-mode='shadow-mode'] .art-permission-guard__panel),
  :global(html.dark [data-box-mode='shadow-mode'] .art-permission-guard__panel) {
    box-shadow: 0 22px 60px rgb(0 0 0 / 32%);
  }

  @keyframes art-permission-panel-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes art-permission-visual-enter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.94) rotate(-4deg);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1) rotate(-4deg);
    }
  }

  @keyframes art-permission-status-enter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.92);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
