<template>
  <ElScrollbar class="exception-scrollbar">
    <main class="exception-page" :class="`exception-page--${data.tone}`">
      <div class="exception-page__glow exception-page__glow--top" aria-hidden="true"></div>
      <div class="exception-page__glow exception-page__glow--bottom" aria-hidden="true"></div>

      <section class="exception-page__panel" :aria-labelledby="titleId">
        <div class="exception-page__content">
          <div class="exception-page__status">
            <span class="exception-page__status-icon" aria-hidden="true">
              <ArtSvgIcon :icon="data.icon" />
            </span>
            <span>{{ data.statusLabel }}</span>
          </div>

          <p class="exception-page__code" aria-hidden="true">{{ data.title }}</p>
          <h1 :id="titleId" class="exception-page__title">{{ data.heading }}</h1>
          <p class="exception-page__description">{{ data.desc }}</p>

          <div class="exception-page__hint">
            <ArtSvgIcon icon="ri:information-line" aria-hidden="true" />
            <span>{{ data.hint }}</span>
          </div>

          <div class="exception-page__actions">
            <ElButton
              v-ripple
              type="primary"
              size="large"
              :loading="primaryLoading"
              :disabled="secondaryLoading"
              @click="handlePrimaryClick"
            >
              <ArtSvgIcon v-if="!primaryLoading" :icon="data.primaryIcon" aria-hidden="true" />
              <span>{{ data.btnText }}</span>
            </ElButton>
            <ElButton
              size="large"
              :loading="secondaryLoading"
              :disabled="primaryLoading"
              @click="handleSecondaryClick"
            >
              <ArtSvgIcon v-if="!secondaryLoading" :icon="data.secondaryIcon" aria-hidden="true" />
              <span>{{ data.secondaryBtnText }}</span>
            </ElButton>
          </div>

          <p class="exception-page__support">
            <ArtSvgIcon icon="ri:customer-service-2-line" aria-hidden="true" />
            <span>{{ data.supportText }}</span>
          </p>
        </div>

        <div class="exception-page__visual" aria-hidden="true">
          <div class="exception-page__visual-header">
            <span class="exception-page__visual-dot"></span>
            <span>{{ data.visualLabel }}</span>
            <span class="exception-page__visual-code">{{ data.title }}</span>
          </div>
          <div class="exception-page__illustration">
            <span class="exception-page__code-watermark">{{ data.title }}</span>
            <ThemeSvg :src="data.imgUrl" size="100%" />
          </div>
          <div class="exception-page__visual-footer">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      </section>
    </main>
  </ElScrollbar>
</template>

<script setup lang="ts">
  import { useCommon } from '@/hooks/core/useCommon'
  import { useUserStore } from '@/store/modules/user'

  defineOptions({ name: 'ArtException' })

  type ExceptionTone = 'warning' | 'info' | 'danger'

  interface ExceptionData {
    /** 状态码 */
    title: string
    /** 页面标题 */
    heading: string
    /** 状态标签 */
    statusLabel: string
    /** 描述 */
    desc: string
    /** 操作提示 */
    hint: string
    /** 主按钮文本 */
    btnText: string
    /** 次按钮文本 */
    secondaryBtnText: string
    /** 帮助文案 */
    supportText: string
    /** 插画区域标签 */
    visualLabel: string
    /** 状态图标 */
    icon: string
    /** 主按钮图标 */
    primaryIcon: string
    /** 次按钮图标 */
    secondaryIcon: string
    /** 语义色 */
    tone: ExceptionTone
    /** 图片地址 */
    imgUrl: string
  }

  interface ExceptionProps {
    btnEvents?: () => void | Promise<void>
    secondaryBtnEvents?: () => void | Promise<void>
    data: ExceptionData
  }

  const props = defineProps<ExceptionProps>()
  const router = useRouter()
  const userStore = useUserStore()
  const { homePath } = useCommon()
  const titleId = useId()
  const primaryLoading = ref(false)
  const secondaryLoading = ref(false)

  const backHome = async (): Promise<void> => {
    const targetHomePath = homePath.value || '/'

    if (!userStore.isLogin) {
      await router.push({
        name: 'Login',
        query: { redirect: targetHomePath }
      })
      return
    }

    await router.push(targetHomePath)
  }

  const goBack = (): void => {
    router.back()
  }

  const runAction = async (
    action: (() => void | Promise<void>) | undefined,
    loading: Ref<boolean>,
    fallback: () => void | Promise<void>
  ): Promise<void> => {
    if (primaryLoading.value || secondaryLoading.value) return

    loading.value = true
    try {
      if (action) {
        await action()
      } else {
        await fallback()
      }
    } finally {
      loading.value = false
    }
  }

  const handlePrimaryClick = (): void => {
    void runAction(props.btnEvents, primaryLoading, backHome)
  }

  const handleSecondaryClick = (): void => {
    void runAction(props.secondaryBtnEvents, secondaryLoading, goBack)
  }
</script>

<style lang="scss" scoped>
  .exception-scrollbar {
    height: 100dvh;
  }

  .exception-page {
    --exception-accent: var(--theme-color);
    --exception-soft: color-mix(in srgb, var(--exception-accent) 9%, var(--default-box-color));

    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100dvh;
    padding: clamp(24px, 5vw, 72px);
    overflow: hidden;
    color: var(--art-gray-900);
    background:
      radial-gradient(
        circle at 8% 12%,
        color-mix(in srgb, var(--theme-color) 10%, transparent),
        transparent 30%
      ),
      radial-gradient(
        circle at 94% 86%,
        color-mix(in srgb, var(--exception-accent) 8%, transparent),
        transparent 28%
      ),
      var(--default-bg-color);

    &--warning {
      --exception-accent: var(--art-warning);
    }

    &--danger {
      --exception-accent: var(--art-danger);
    }

    &__glow {
      position: absolute;
      width: 260px;
      height: 260px;
      pointer-events: none;
      border: 1px solid color-mix(in srgb, var(--theme-color) 14%, transparent);
      border-radius: 50%;
      opacity: 0.72;

      &::before,
      &::after {
        position: absolute;
        inset: 28px;
        content: '';
        border: 1px solid color-mix(in srgb, var(--theme-color) 10%, transparent);
        border-radius: 50%;
      }

      &::after {
        inset: 64px;
      }

      &--top {
        top: -150px;
        right: 10%;
      }

      &--bottom {
        bottom: -170px;
        left: 5%;
      }
    }

    &__panel {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: minmax(0, 0.94fr) minmax(380px, 1.06fr);
      width: min(1120px, 100%);
      min-height: min(620px, calc(100dvh - 64px));
      overflow: hidden;
      background: color-mix(in srgb, var(--default-box-color) 96%, transparent);
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-feature-radius, calc(var(--custom-radius) * 2));
    }

    &__content {
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
      padding: clamp(48px, 6vw, 84px);
    }

    &__status {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      width: fit-content;
      padding: 7px 12px 7px 8px;
      margin-bottom: 24px;
      font-size: 12px;
      font-weight: 650;
      color: var(--exception-accent);
      letter-spacing: 0.04em;
      background: color-mix(in srgb, var(--exception-accent) 9%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--exception-accent) 22%, transparent);
      border-radius: 999px;
    }

    &__status-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      font-size: 15px;
      color: #fff;
      background: var(--exception-accent);
      border-radius: 50%;
    }

    &__code {
      margin: 0 0 8px;
      font-size: clamp(64px, 7vw, 92px);
      font-weight: 800;
      line-height: 0.95;
      color: var(--art-gray-900);
      letter-spacing: -0.06em;
    }

    &__title {
      margin: 16px 0 0;
      font-size: clamp(26px, 3vw, 36px);
      font-weight: 700;
      line-height: 1.25;
      color: var(--art-gray-900);
      letter-spacing: -0.02em;
    }

    &__description {
      max-width: 470px;
      margin: 14px 0 0;
      font-size: 16px;
      line-height: 1.75;
      color: var(--art-gray-600);
    }

    &__hint {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      max-width: 470px;
      padding: 12px 14px;
      margin-top: 24px;
      font-size: 13px;
      line-height: 1.6;
      color: var(--art-gray-700);
      background: color-mix(in srgb, var(--art-gray-100) 72%, var(--default-box-color));
      border: 1px solid var(--art-card-border);
      border-radius: var(--art-control-radius, var(--el-border-radius-base));

      > i {
        flex: 0 0 auto;
        margin-top: 3px;
        font-size: 16px;
        color: var(--exception-accent);
      }
    }

    &__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 28px;

      :deep(.el-button) {
        min-width: 132px;
        height: 44px;
        padding-inline: 20px;
        margin-left: 0;
        font-weight: 600;
        border-radius: var(--art-control-radius, var(--el-border-radius-base));

        .art-svg-icon {
          font-size: 17px;
        }
      }
    }

    &__support {
      display: flex;
      gap: 8px;
      align-items: center;
      margin: 32px 0 0;
      font-size: 12px;
      line-height: 1.6;
      color: var(--art-gray-500);

      > i {
        font-size: 15px;
      }
    }

    &__visual {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 520px;
      margin: 20px;
      overflow: hidden;
      background:
        linear-gradient(
          color-mix(in srgb, var(--exception-accent) 5%, transparent) 1px,
          transparent 1px
        ),
        linear-gradient(
          90deg,
          color-mix(in srgb, var(--exception-accent) 5%, transparent) 1px,
          transparent 1px
        ),
        var(--exception-soft);
      background-size: 28px 28px;
      border: 1px solid color-mix(in srgb, var(--exception-accent) 16%, var(--art-card-border));
      border-radius: calc(var(--art-feature-radius, var(--custom-radius)) - 4px);
    }

    &__visual-header {
      display: flex;
      gap: 9px;
      align-items: center;
      height: 52px;
      padding: 0 18px;
      font-size: 11px;
      font-weight: 650;
      color: var(--art-gray-600);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      border-bottom: 1px solid
        color-mix(in srgb, var(--exception-accent) 13%, var(--art-card-border));
    }

    &__visual-dot {
      width: 8px;
      height: 8px;
      background: var(--exception-accent);
      border-radius: 50%;
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--exception-accent) 11%, transparent);
    }

    &__visual-code {
      margin-left: auto;
      color: var(--exception-accent);
    }

    &__illustration {
      position: relative;
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      min-height: 0;
      padding: 36px;

      > .theme-svg {
        position: relative;
        z-index: 1;
        width: min(100%, 470px) !important;
        height: auto !important;
        aspect-ratio: 4 / 3;
        filter: drop-shadow(
          0 18px 28px color-mix(in srgb, var(--exception-accent) 12%, transparent)
        );
      }
    }

    &__code-watermark {
      position: absolute;
      top: 50%;
      left: 50%;
      font-size: clamp(140px, 19vw, 240px);
      font-weight: 800;
      line-height: 1;
      color: color-mix(in srgb, var(--exception-accent) 7%, transparent);
      letter-spacing: -0.08em;
      user-select: none;
      transform: translate(-52%, -52%);
    }

    &__visual-footer {
      display: flex;
      gap: 7px;
      align-items: center;
      height: 44px;
      padding: 0 18px;
      border-top: 1px solid color-mix(in srgb, var(--exception-accent) 13%, var(--art-card-border));

      > span {
        width: 18px;
        height: 4px;
        background: color-mix(in srgb, var(--exception-accent) 28%, transparent);
        border-radius: 999px;

        &:first-child {
          width: 44px;
          background: var(--exception-accent);
        }
      }
    }

    @media (width <= 900px) {
      padding: 24px;

      &__panel {
        grid-template-columns: 1fr;
        min-height: auto;
      }

      &__content {
        padding: 52px;
      }

      &__visual {
        min-height: 390px;
        margin-top: 0;
      }

      &__illustration {
        padding: 20px 32px;

        > .theme-svg {
          width: min(100%, 410px) !important;
        }
      }
    }

    @media (width <= 560px) {
      padding: 12px;

      &__panel {
        border-radius: var(--custom-radius);
      }

      &__content {
        padding: 36px 24px 28px;
      }

      &__status {
        margin-bottom: 20px;
      }

      &__code {
        font-size: 64px;
      }

      &__title {
        margin-top: 12px;
        font-size: 25px;
      }

      &__description {
        font-size: 15px;
      }

      &__actions {
        flex-direction: column;

        :deep(.el-button) {
          width: 100%;
        }
      }

      &__support {
        align-items: flex-start;
        margin-top: 24px;
      }

      &__visual {
        min-height: 300px;
        margin: 0 12px 12px;
      }

      &__visual-header {
        height: 46px;
      }

      &__illustration {
        padding: 12px;
      }

      &__visual-footer {
        height: 36px;
      }
    }

    @media (prefers-reduced-motion: no-preference) {
      &__panel {
        animation: exception-panel-enter 420ms ease-out both;
      }

      &__illustration > .theme-svg {
        animation: exception-illustration-enter 560ms 80ms ease-out both;
      }
    }
  }

  :global(html[data-box-mode='border-mode'] .exception-page__panel) {
    border-color: var(--art-card-border);
    box-shadow: none;
  }

  :global(html[data-box-mode='shadow-mode'] .exception-page__panel) {
    border-color: transparent;
    box-shadow: 0 26px 70px rgb(18 27 51 / 10%);
  }

  :global(html.dark[data-box-mode='shadow-mode'] .exception-page__panel),
  :global(html.dark [data-box-mode='shadow-mode'] .exception-page__panel) {
    box-shadow: 0 26px 70px rgb(0 0 0 / 34%);
  }

  @keyframes exception-panel-enter {
    from {
      opacity: 0;
      transform: translateY(12px);
    }

    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes exception-illustration-enter {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.97);
    }

    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
