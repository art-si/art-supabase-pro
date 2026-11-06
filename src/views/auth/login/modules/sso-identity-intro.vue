<template>
  <aside class="sso-identity-intro" aria-label="统一身份中心">
    <header class="sso-identity-intro__brand">
      <ArtLogo size="36" />
      <div
        ><strong>{{ siteName }}</strong
        ><span>统一身份中心</span></div
      >
    </header>
    <div class="sso-identity-intro__content">
      <p class="sso-identity-intro__eyebrow">企业应用 · 统一账号</p>
      <h1>一个账号，<br />连接工作空间</h1>
      <p class="sso-identity-intro__description"
        >使用熟悉的统一账号登录，安全访问已经开通的应用与服务。</p
      >
      <div class="sso-identity-intro__application">
        <span class="sso-identity-intro__application-icon"
          ><ArtSvgIcon icon="ri:apps-2-line"
        /></span>
        <div><strong>BFF 平台</strong><p>应用管理与访问授权</p></div>
      </div>
    </div>
    <footer class="art-icon-label"
      ><ArtSvgIcon icon="ri:shield-check-line" /><span
        >账号统一管理 · 应用权限独立配置</span
      ></footer
    >
  </aside>
</template>
<script setup lang="ts">
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'
  const { siteName } = useWebsiteConfig()
</script>
<style scoped>
  .sso-identity-intro {
    display: flex;
    flex: 0 0 44%;
    flex-direction: column;
    justify-content: space-between;
    min-width: 320px;
    padding: clamp(32px, 4vw, 64px);
    color: var(--art-gray-900);
    background: color-mix(in srgb, var(--theme-color) 5%, var(--el-bg-color-page));
    border-right: 1px solid var(--el-border-color-lighter);
  }

  .sso-identity-intro__brand {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .sso-identity-intro__brand strong {
    display: block;
    font-size: 20px;
    font-weight: 650;
  }

  .sso-identity-intro__brand span {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    color: var(--art-gray-700);
  }

  .sso-identity-intro__content {
    max-width: 360px;
    padding-block: 64px;
  }

  .sso-identity-intro__eyebrow {
    margin-bottom: 20px;
    font-size: 13px;
    font-weight: 600;
    color: var(--art-primary-text);
  }

  .sso-identity-intro h1 {
    font-size: clamp(28px, 3vw, 44px);
    font-weight: 650;
    line-height: 1.35;
    letter-spacing: -0.025em;
  }

  .sso-identity-intro__description {
    max-width: 320px;
    margin-top: 22px;
    font-size: 14px;
    line-height: 1.9;
    color: var(--art-gray-700);
  }

  .sso-identity-intro__application {
    display: flex;
    gap: 14px;
    align-items: center;
    padding-top: 28px;
    margin-top: 36px;
    border-top: 1px solid var(--el-border-color);
  }

  .sso-identity-intro__application-icon {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--theme-color);
    background: var(--el-bg-color);
    border: 1px solid var(--el-border-color-lighter);
    border-radius: var(--art-control-radius);
  }

  .sso-identity-intro__application-icon :deep(.art-svg-icon) {
    width: 22px;
    height: 22px;
  }

  .sso-identity-intro__application strong {
    font-size: 15px;
    font-weight: 600;
  }

  .sso-identity-intro__application p {
    margin-top: 5px;
    font-size: 12px;
    color: var(--art-gray-700);
  }

  .sso-identity-intro footer {
    font-size: 12px;
    line-height: 1.7;
    color: var(--art-gray-700);
  }

  @media (width <= 800px) {
    .sso-identity-intro {
      display: none;
    }
  }
</style>
