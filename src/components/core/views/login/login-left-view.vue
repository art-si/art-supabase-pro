<!-- 登录、注册与密码找回页的品牌视觉区 -->
<template>
  <aside class="login-vision" aria-label="运输运营平台介绍">
    <div class="login-vision__aurora login-vision__aurora--cyan" />
    <div class="login-vision__aurora login-vision__aurora--violet" />
    <div class="login-vision__grid" />

    <header class="login-vision__brand">
      <span class="login-vision__logo"><ArtLogo size="38" /></span>
      <div>
        <strong>{{ siteName }}</strong>
        <span>TRANSPORT OPERATIONS CLOUD</span>
      </div>
    </header>

    <main class="login-vision__content">
      <div class="login-vision__copy">
        <p class="login-vision__eyebrow"><i /> 智慧运输 · 实时协同</p>
        <h1>{{ $t('login.leftView.title') }}</h1>
        <p class="login-vision__description">{{ $t('login.leftView.subTitle') }}</p>
        <div class="login-vision__features" aria-label="平台能力">
          <span class="art-icon-label"><ArtSvgIcon icon="ri:route-line" /> 全链路追踪</span>
          <span class="art-icon-label"><ArtSvgIcon icon="ri:radar-line" /> 风险预警</span>
          <span class="art-icon-label"><ArtSvgIcon icon="ri:bar-chart-box-line" /> 经营洞察</span>
        </div>
      </div>

      <section class="capability-map" aria-label="运输业务协同能力概览">
        <header class="capability-map__header">
          <div class="capability-map__heading">
            <span class="capability-map__heading-icon">
              <ArtSvgIcon icon="ri:node-tree" />
            </span>
            <div>
              <span>PLATFORM WORKFLOW</span>
              <strong>运输业务协同链路</strong>
            </div>
          </div>
          <span class="capability-map__badge">能力概览</span>
        </header>

        <div class="capability-map__workflow">
          <article>
            <span class="capability-map__step">01</span>
            <span class="capability-map__icon"><ArtSvgIcon icon="ri:file-list-3-line" /></span>
            <div><strong>订单协同</strong><span>统一承接业务需求</span></div>
          </article>
          <article>
            <span class="capability-map__step">02</span>
            <span class="capability-map__icon"><ArtSvgIcon icon="ri:route-line" /></span>
            <div><strong>智能调度</strong><span>连接运力与执行计划</span></div>
          </article>
          <article>
            <span class="capability-map__step">03</span>
            <span class="capability-map__icon"><ArtSvgIcon icon="ri:map-pin-time-line" /></span>
            <div><strong>在途可视</strong><span>持续掌握运输进程</span></div>
          </article>
          <article>
            <span class="capability-map__step">04</span>
            <span class="capability-map__icon"><ArtSvgIcon icon="ri:line-chart-line" /></span>
            <div><strong>经营洞察</strong><span>汇聚运营决策信息</span></div>
          </article>
        </div>

        <footer class="capability-map__footer">
          <span class="art-icon-label"><ArtSvgIcon icon="ri:shield-keyhole-line" /> 权限隔离</span>
          <span class="art-icon-label"><ArtSvgIcon icon="ri:git-merge-line" /> 流程联动</span>
          <span class="art-icon-label"><ArtSvgIcon icon="ri:history-line" /> 数据可溯</span>
        </footer>
      </section>
    </main>

    <footer class="login-vision__footer">
      <span>可信赖的企业级运输协同平台</span>
      <span>SECURE · CONNECTED · INTELLIGENT</span>
    </footer>
  </aside>
</template>

<script setup lang="ts">
  import { useWebsiteConfig } from '@/hooks/core/useWebsiteConfig'

  defineProps<{ hideContent?: boolean }>()

  const { siteName } = useWebsiteConfig()
</script>

<style lang="scss" scoped>
  .login-vision {
    position: relative;
    display: flex;
    flex: 0 0 min(58vw, 1100px);
    flex-direction: column;
    min-width: 560px;
    height: 100%;
    padding: clamp(28px, 3vw, 54px) clamp(32px, 4.2vw, 80px);
    overflow: hidden;
    color: #fff;
    background:
      radial-gradient(circle at 6% 8%, rgb(43 221 255 / 22%), transparent 25%),
      linear-gradient(138deg, #101b5e 0%, #3b1fa8 46%, #5c35ee 72%, #087bff 130%);

    &::after {
      position: absolute;
      right: -16%;
      bottom: -24%;
      width: 54vw;
      max-width: 860px;
      aspect-ratio: 1;
      content: '';
      border: 1px solid rgb(255 255 255 / 14%);
      border-radius: 50%;
      box-shadow:
        0 0 0 64px rgb(255 255 255 / 3%),
        0 0 0 128px rgb(255 255 255 / 2%);
    }

    &__aurora {
      position: absolute;
      pointer-events: none;
      border-radius: 50%;
      filter: blur(4px);

      &--cyan {
        top: 14%;
        right: 1%;
        width: 280px;
        height: 280px;
        background: rgb(0 229 255 / 20%);
        filter: blur(70px);
      }

      &--violet {
        bottom: -12%;
        left: 18%;
        width: 380px;
        height: 380px;
        background: rgb(236 72 153 / 17%);
        filter: blur(90px);
      }
    }

    &__grid {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgb(255 255 255 / 14%) 1px, transparent 1px),
        linear-gradient(90deg, rgb(255 255 255 / 14%) 1px, transparent 1px);
      background-size: 54px 54px;
      opacity: 0.13;
      mask-image: linear-gradient(120deg, #000, transparent 72%);
    }

    &__brand,
    &__content,
    &__footer {
      position: relative;
      z-index: 2;
    }

    &__brand {
      display: flex;
      gap: 13px;
      align-items: center;

      > div {
        display: grid;
        gap: 3px;
      }

      strong {
        max-width: 360px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 17px;
        letter-spacing: 0.2px;
        white-space: nowrap;
      }

      span:not(.login-vision__logo) {
        font-size: 9px;
        font-weight: 700;
        color: rgb(255 255 255 / 55%);
        letter-spacing: 1.5px;
      }
    }

    &__logo {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 50px;
      height: 50px;
      background: rgb(255 255 255 / 12%);
      border: 1px solid rgb(255 255 255 / 18%);
      border-radius: var(--el-border-radius-base);
      box-shadow: inset 0 1px 0 rgb(255 255 255 / 17%);
      backdrop-filter: blur(14px);
    }

    &__content {
      display: grid;
      grid-template-columns: minmax(0, 0.94fr) minmax(340px, 1.06fr);
      gap: clamp(34px, 4vw, 76px);
      align-items: center;
      margin: auto 0;
    }

    &__copy {
      min-width: 0;
      animation: vision-enter 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;

      h1 {
        max-width: 560px;
        margin: 19px 0 18px;
        font-size: clamp(38px, 3.3vw, 62px);
        font-weight: 750;
        line-height: 1.08;
        letter-spacing: -1.5px;
      }
    }

    &__eyebrow {
      display: inline-flex;
      gap: 9px;
      align-items: center;
      margin: 0;
      font-size: 12px;
      font-weight: 700;
      color: #79ecff;
      letter-spacing: 1px;

      i {
        width: 7px;
        height: 7px;
        background: #34f5c5;
        border-radius: 50%;
        box-shadow: 0 0 0 6px rgb(52 245 197 / 14%);
      }
    }

    &__description {
      max-width: 500px;
      margin: 0;
      font-size: 15px;
      line-height: 1.8;
      color: rgb(255 255 255 / 67%);
    }

    &__features {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 30px;

      span {
        display: inline-flex;
        gap: 7px;
        align-items: center;
        padding: 8px 11px;
        font-size: 11px;
        color: rgb(255 255 255 / 78%);
        background: rgb(255 255 255 / 8%);
        border: 1px solid rgb(255 255 255 / 11%);
        border-radius: 999px;
      }
    }

    &__footer {
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: rgb(255 255 255 / 43%);
      letter-spacing: 0.6px;
    }
  }

  .capability-map {
    position: relative;
    min-width: 0;
    padding: clamp(24px, 2vw, 34px);
    overflow: hidden;
    background: linear-gradient(145deg, rgb(255 255 255 / 17%), rgb(255 255 255 / 7%));
    border: 1px solid rgb(255 255 255 / 18%);
    border-radius: var(--art-feature-radius);
    box-shadow: 0 34px 90px rgb(6 8 45 / 34%);
    backdrop-filter: blur(28px);
    transform: perspective(1100px) rotateY(-5deg) rotateX(2deg);
    animation: preview-enter 0.8s 0.1s cubic-bezier(0.22, 1, 0.36, 1) both;

    &::before {
      position: absolute;
      top: -80px;
      right: -80px;
      width: 190px;
      height: 190px;
      content: '';
      background: rgb(46 228 255 / 19%);
      border-radius: 50%;
      filter: blur(34px);
    }

    &__header,
    &__footer {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    &__header {
      gap: 18px;
    }

    &__heading {
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 0;

      > div {
        display: grid;
        gap: 4px;
        min-width: 0;

        > span {
          font-size: 8px;
          font-weight: 800;
          color: #78f0df;
          letter-spacing: 1.4px;
        }

        strong {
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 15px;
          white-space: nowrap;
        }
      }
    }

    &__heading-icon {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      width: 38px;
      height: 38px;
      font-size: 19px;
      color: #132163;
      background: linear-gradient(145deg, #7bf5e0, #58d7ff);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 10px 24px rgb(0 15 55 / 24%);
    }

    &__badge {
      flex: 0 0 auto;
      padding: 6px 9px;
      font-size: 9px;
      font-weight: 700;
      color: rgb(255 255 255 / 68%);
      background: rgb(255 255 255 / 8%);
      border: 1px solid rgb(255 255 255 / 12%);
      border-radius: 999px;
    }

    &__workflow {
      position: relative;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
      margin: 26px 0;

      &::before,
      &::after {
        position: absolute;
        z-index: -1;
        content: '';
      }

      &::before {
        top: 50%;
        right: 16%;
        left: 16%;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgb(103 229 255 / 44%), transparent);
      }

      &::after {
        top: 18%;
        bottom: 18%;
        left: 50%;
        width: 1px;
        background: linear-gradient(transparent, rgb(103 229 255 / 36%), transparent);
      }

      article {
        position: relative;
        display: grid;
        grid-template-columns: auto minmax(0, 1fr);
        gap: 11px;
        align-items: center;
        min-width: 0;
        padding: 16px;
        background: rgb(18 22 85 / 27%);
        border: 1px solid rgb(255 255 255 / 11%);
        border-radius: var(--el-border-radius-base);
        box-shadow: inset 0 1px 0 rgb(255 255 255 / 6%);

        > div {
          display: grid;
          gap: 5px;
          min-width: 0;

          strong {
            font-size: 12px;
          }

          span {
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 9px;
            color: rgb(255 255 255 / 48%);
            white-space: nowrap;
          }
        }
      }
    }

    &__step {
      position: absolute;
      top: 8px;
      right: 9px;
      font-size: 8px;
      font-weight: 800;
      color: rgb(255 255 255 / 22%);
      letter-spacing: 1px;
    }

    &__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      font-size: 16px;
      color: #71eced;
      background: rgb(78 225 255 / 10%);
      border: 1px solid rgb(109 231 255 / 14%);
      border-radius: var(--el-border-radius-base);
    }

    &__footer {
      gap: 8px;
      padding-top: 20px;
      font-size: 10px;
      color: rgb(255 255 255 / 58%);
      border-top: 1px solid rgb(255 255 255 / 10%);

      span {
        display: inline-flex;
        gap: 5px;
        align-items: center;

        + span {
          margin-left: auto;
        }
      }
    }
  }

  @keyframes vision-enter {
    from {
      opacity: 0;
      transform: translateX(-24px);
    }

    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes preview-enter {
    from {
      opacity: 0;
      transform: perspective(1100px) rotateY(-5deg) rotateX(2deg) translateY(30px);
    }

    to {
      opacity: 1;
      transform: perspective(1100px) rotateY(-5deg) rotateX(2deg) translateY(0);
    }
  }

  @media only screen and (width <= 1460px) {
    .login-vision {
      flex-basis: 54vw;
      min-width: 520px;

      &__content {
        grid-template-columns: 1fr;
      }

      &__copy h1 {
        font-size: clamp(36px, 4vw, 52px);
      }

      .capability-map {
        display: none;
      }
    }
  }

  @media only screen and (width <= 1040px) {
    .login-vision {
      position: absolute;
      inset: 0;
      min-width: 0;
      padding: 24px;
      pointer-events: none;
      background: linear-gradient(150deg, #161f66, #5234dd 58%, #087bff 130%);

      &::after,
      &__brand,
      &__content,
      &__footer {
        display: none;
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .login-vision__copy,
    .capability-map {
      animation: none;
    }
  }
</style>
