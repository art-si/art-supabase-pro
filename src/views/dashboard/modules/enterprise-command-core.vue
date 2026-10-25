<template>
  <div
    ref="coreRootRef"
    class="enterprise-command-core"
    :class="[`is-${mode}`, `is-scene-${sceneVariant}`]"
    role="img"
    :aria-label="`${title}，${scoreLabel} ${score} 分，${activeLabel} ${activeCount}${activeUnit}，风险事项 ${riskCount} 项`"
  >
    <div class="enterprise-command-core__scene">
      <EnterpriseCommandCanvas
        v-if="isWebGlSupported && isSceneActive"
        :accent-color="resolvedAccentColor"
        :mode="mode"
        :signals="nodes"
        :variant="sceneVariant"
        @ready="sceneReady = true"
      />
      <div v-if="!isWebGlSupported || !sceneReady" class="command-fallback-orb" aria-hidden="true">
        <i /><i />
      </div>

      <svg
        class="command-energy-links"
        viewBox="0 0 1000 520"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path :class="`is-${nodes[0]?.tone ?? 'primary'}`" d="M175 92 C295 92 350 170 500 260" />
        <path :class="`is-${nodes[1]?.tone ?? 'primary'}`" d="M825 88 C705 88 650 170 500 260" />
        <path :class="`is-${nodes[2]?.tone ?? 'primary'}`" d="M875 245 C705 245 650 250 500 260" />
        <path :class="`is-${nodes[3]?.tone ?? 'primary'}`" d="M800 438 C680 410 628 330 500 260" />
        <path :class="`is-${nodes[4]?.tone ?? 'primary'}`" d="M200 442 C320 412 372 330 500 260" />
        <path :class="`is-${nodes[5]?.tone ?? 'primary'}`" d="M125 248 C295 248 350 252 500 260" />
      </svg>

      <div class="command-hud-frame" aria-hidden="true">
        <i class="at-top-left" /><i class="at-top-right" /> <i class="at-bottom-left" /><i
          class="at-bottom-right"
        />
      </div>
      <div class="command-vignette" aria-hidden="true" />

      <div class="command-node-layer" aria-hidden="true">
        <div
          v-for="(node, index) in nodes"
          :key="node.label"
          class="command-domain-node"
          :class="[`at-${index}`, `is-${node.tone}`]"
          :title="node.caption"
        >
          <i><ArtSvgIcon :icon="node.icon" /></i>
          <div>
            <span>{{ node.label }}</span>
            <strong>{{ node.score }}<em>/100</em></strong>
          </div>
        </div>
      </div>

      <div class="command-core-summary">
        <small>{{ coreEyebrow || (mode === 'business' ? '综合运行指数' : '在途任务') }}</small>
        <strong>{{ mode === 'business' ? score : activeCount }}</strong>
        <span>{{ mode === 'business' ? scoreLabel : activeLabel }}</span>
      </div>

      <div class="command-core-title">
        <span><i /> {{ onlineLabel }}</span>
        <strong>{{ title }}</strong>
      </div>
    </div>

    <div class="enterprise-command-core__telemetry">
      <div v-for="item in telemetry" :key="item.label" :class="`is-${item.tone ?? 'primary'}`">
        <span>{{ item.label }}</span>
        <strong
          >{{ item.value }}<em v-if="item.unit">{{ item.unit }}</em></strong
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const EnterpriseCommandCanvas = defineAsyncComponent(
    () => import('./enterprise-command-canvas.vue')
  )

  type CommandMode = 'business' | 'operations'
  type CommandTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'
  type CommandSceneVariant =
    'sentinel' | 'field' | 'treasury' | 'flow' | 'fleet' | 'topology' | 'people'

  interface CommandNode {
    label: string
    score: number
    caption: string
    icon: string
    tone: CommandTone
  }

  interface CommandTelemetryItem {
    label: string
    value: string | number
    unit?: string
    tone?: CommandTone
  }

  interface Props {
    mode: CommandMode
    title: string
    score: number
    activeCount: number
    riskCount: number
    nodes: CommandNode[]
    telemetry: CommandTelemetryItem[]
    scoreLabel?: string
    activeLabel?: string
    activeUnit?: string
    coreEyebrow?: string
    onlineLabel?: string
    sceneVariant?: CommandSceneVariant
  }

  withDefaults(defineProps<Props>(), {
    scoreLabel: '综合健康度',
    activeLabel: '当前在途任务',
    activeUnit: '单',
    onlineLabel: '多域数据联动',
    sceneVariant: 'sentinel'
  })

  const coreRootRef = ref<HTMLElement | null>(null)
  const sceneReady = ref(false)
  const isSceneActive = ref(true)
  const accentColor = useCssVar('--theme-color', coreRootRef, {
    initialValue: '#635bff',
    observe: true
  })
  const resolvedAccentColor = computed(() => accentColor.value?.trim() || '#635bff')
  const isWebGlSupported = useSupported(() => {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  })

  onActivated(() => {
    isSceneActive.value = true
  })

  onDeactivated(() => {
    isSceneActive.value = false
    sceneReady.value = false
  })
</script>

<style scoped lang="scss">
  .enterprise-command-core {
    position: relative;
    display: grid;
    flex: 1;
    grid-template-rows: minmax(300px, 1fr) auto;
    min-height: 0;
    overflow: hidden;

    &__scene {
      position: relative;
      min-height: 300px;
      overflow: hidden;
      background:
        radial-gradient(
          circle at 50% 48%,
          color-mix(in srgb, var(--screen-accent) 16%, transparent),
          transparent 27%
        ),
        linear-gradient(
          color-mix(in srgb, var(--screen-accent) 7%, transparent) 1px,
          transparent 1px
        ),
        linear-gradient(
          90deg,
          color-mix(in srgb, var(--screen-accent) 7%, transparent) 1px,
          transparent 1px
        ),
        rgb(4 14 27 / 70%);
      background-size:
        auto,
        34px 34px,
        34px 34px,
        auto;
      border: 1px solid color-mix(in srgb, var(--screen-accent) 20%, transparent);
      border-radius: var(--el-border-radius-small);
      box-shadow:
        inset 0 0 54px rgb(0 0 0 / 30%),
        inset 0 0 50px color-mix(in srgb, var(--screen-accent) 7%, transparent);
    }

    &__canvas {
      position: absolute !important;
      inset: 0;
      width: 100% !important;
      height: 100% !important;
    }

    &__telemetry {
      display: grid;
      grid-template-columns: repeat(var(--domain-telemetry-count, 4), minmax(0, 1fr));
      gap: 1px;
      margin-top: 9px;
      overflow: hidden;
      background: var(--screen-line);
      border: 1px solid var(--screen-line);
      border-radius: var(--el-border-radius-small);

      > div {
        position: relative;
        display: grid;
        gap: 4px;
        min-width: 0;
        padding: 9px 12px 10px;
        background: rgb(7 22 39 / 92%);

        &::before {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 48%;
          height: 2px;
          content: '';
          background: var(--screen-accent);
          box-shadow: 0 0 10px var(--screen-accent);
        }

        &.is-success::before {
          background: var(--screen-success);
          box-shadow: 0 0 10px var(--screen-success);
        }

        &.is-warning::before {
          background: var(--screen-warning);
          box-shadow: 0 0 10px var(--screen-warning);
        }

        &.is-danger::before {
          background: var(--screen-danger);
          box-shadow: 0 0 10px var(--screen-danger);
        }

        &.is-info::before {
          background: var(--screen-cyan);
          box-shadow: 0 0 10px var(--screen-cyan);
        }
      }

      span {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 9px;
        color: var(--screen-text-muted);
        white-space: nowrap;
      }

      strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 16px;
        color: var(--screen-text-strong);
        white-space: nowrap;
      }

      em {
        margin-left: 3px;
        font-size: 9px;
        font-style: normal;
        font-weight: 500;
        color: var(--screen-text-muted);
      }
    }
  }

  .command-energy-links {
    position: absolute;
    inset: 0;
    z-index: 2;
    width: 100%;
    height: 100%;
    pointer-events: none;

    path {
      opacity: 0.42;
      filter: drop-shadow(0 0 4px currentcolor);
      fill: none;
      stroke: var(--screen-accent-soft);
      stroke-width: 0.85;
      stroke-dasharray: 4 9;
      vector-effect: non-scaling-stroke;
    }

    path.is-success {
      color: var(--screen-success);
      stroke: currentcolor;
    }

    path.is-info {
      color: var(--screen-cyan);
      stroke: currentcolor;
    }

    path.is-danger {
      color: var(--screen-danger);
      stroke: currentcolor;
    }

    path.is-warning {
      color: var(--screen-warning);
      stroke: currentcolor;
    }

    path.is-primary {
      color: var(--screen-accent-soft);
      stroke: currentcolor;
    }
  }

  .command-hud-frame {
    position: absolute;
    inset: 14px;
    z-index: 3;
    pointer-events: none;

    i {
      position: absolute;
      width: 28px;
      height: 28px;
      border-color: rgb(53 199 215 / 34%);
      filter: drop-shadow(0 0 4px rgb(53 199 215 / 20%));

      &::after {
        position: absolute;
        width: 4px;
        height: 4px;
        content: '';
        background: rgb(53 199 215 / 72%);
        box-shadow: 0 0 8px rgb(53 199 215 / 48%);
      }
    }

    .at-top-left {
      top: 0;
      left: 0;
      border-top-style: solid;
      border-top-width: 1px;
      border-left-style: solid;
      border-left-width: 1px;

      &::after {
        top: -3px;
        left: -3px;
      }
    }

    .at-top-right {
      top: 0;
      right: 0;
      border-top-style: solid;
      border-top-width: 1px;
      border-right-style: solid;
      border-right-width: 1px;

      &::after {
        top: -3px;
        right: -3px;
      }
    }

    .at-bottom-left {
      bottom: 0;
      left: 0;
      border-bottom-style: solid;
      border-bottom-width: 1px;
      border-left-style: solid;
      border-left-width: 1px;

      &::after {
        bottom: -3px;
        left: -3px;
      }
    }

    .at-bottom-right {
      right: 0;
      bottom: 0;
      border-right-style: solid;
      border-right-width: 1px;
      border-bottom-style: solid;
      border-bottom-width: 1px;

      &::after {
        right: -3px;
        bottom: -3px;
      }
    }
  }

  .command-vignette {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      linear-gradient(90deg, rgb(3 11 21 / 72%), transparent 25% 75%, rgb(3 11 21 / 72%)),
      linear-gradient(rgb(3 11 21 / 35%), transparent 20% 78%, rgb(3 11 21 / 65%));
  }

  .command-fallback-orb {
    position: absolute;
    top: 49%;
    left: 50%;
    width: 176px;
    height: 176px;
    background: radial-gradient(
      circle at 34% 28%,
      #fff,
      var(--screen-accent) 12%,
      #102b53 56%,
      #06101d 82%
    );
    border: 1px solid var(--screen-accent-soft);
    border-radius: 50%;
    box-shadow:
      0 0 22px color-mix(in srgb, var(--screen-accent) 65%, transparent),
      0 0 72px color-mix(in srgb, var(--screen-accent) 32%, transparent);
    transform: translate(-50%, -50%);

    i {
      position: absolute;
      top: 50%;
      left: 50%;
      width: 260px;
      height: 92px;
      border: 1px solid color-mix(in srgb, var(--screen-accent) 45%, transparent);
      border-radius: 50%;
      transform: translate(-50%, -50%) rotate(-14deg);

      &:last-child {
        width: 220px;
        height: 220px;
        transform: translate(-50%, -50%) rotateY(72deg);
      }
    }
  }

  .command-node-layer {
    position: absolute;
    inset: 0;
  }

  .command-domain-node {
    position: absolute;
    z-index: 3;
    display: flex;
    gap: 8px;
    align-items: center;
    width: 136px;
    min-width: 0;
    padding: 7px 9px;
    color: var(--screen-accent-soft);
    background: linear-gradient(100deg, rgb(8 27 47 / 96%), rgb(18 46 75 / 78%));
    border: 1px solid color-mix(in srgb, currentcolor 28%, transparent);
    border-radius: var(--el-border-radius-small);
    box-shadow:
      inset 0 1px rgb(255 255 255 / 5%),
      0 8px 22px rgb(0 0 0 / 28%),
      0 0 18px color-mix(in srgb, currentcolor 10%, transparent);

    &::after {
      position: absolute;
      top: 50%;
      width: 42px;
      height: 1px;
      content: '';
      background: linear-gradient(90deg, currentcolor, transparent);
      opacity: 0.46;
    }

    > i {
      display: grid;
      flex: none;
      place-items: center;
      width: 25px;
      height: 25px;
      background: color-mix(in srgb, currentcolor 14%, transparent);
      border: 1px solid color-mix(in srgb, currentcolor 28%, transparent);
      border-radius: 50%;
      box-shadow: 0 0 12px color-mix(in srgb, currentcolor 22%, transparent);
    }

    > div {
      display: grid;
      min-width: 0;
    }

    span {
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 10px;
      color: var(--screen-text-muted);
      white-space: nowrap;
    }

    strong {
      margin-top: 2px;
      font-size: 16px;
      line-height: 1;
      color: var(--screen-text-strong);
    }

    em {
      margin-left: 2px;
      font-size: 10px;
      font-style: normal;
      font-weight: 500;
      color: var(--screen-text-muted);
    }

    &.is-success {
      color: var(--screen-success);
    }

    &.is-warning {
      color: var(--screen-warning);
    }

    &.is-danger {
      color: var(--screen-danger);
    }

    &.is-info {
      color: var(--screen-cyan);
    }

    &.at-0 {
      top: 12%;
      left: 6%;

      &::after {
        left: 100%;
      }
    }

    &.at-1 {
      top: 11%;
      right: 6%;

      &::after {
        right: 100%;
        transform: rotate(180deg);
      }
    }

    &.at-2 {
      top: 43%;
      right: 2%;

      &::after {
        right: 100%;
        transform: rotate(180deg);
      }
    }

    &.at-3 {
      right: 8%;
      bottom: 10%;

      &::after {
        right: 100%;
        transform: rotate(180deg);
      }
    }

    &.at-4 {
      bottom: 9%;
      left: 8%;

      &::after {
        left: 100%;
      }
    }

    &.at-5 {
      top: 44%;
      left: 2%;

      &::after {
        left: 100%;
      }
    }
  }

  .command-core-summary {
    position: absolute;
    top: 49%;
    left: 50%;
    z-index: 4;
    display: grid;
    place-content: center;
    justify-items: center;
    width: 142px;
    height: 142px;
    text-align: center;
    text-shadow: 0 2px 14px rgb(0 0 0 / 95%);
    pointer-events: none;
    transform: translate(-50%, -50%);

    small {
      font-size: 10px;
      font-weight: 800;
      color: rgb(225 239 255 / 78%);
      letter-spacing: 1.3px;
    }

    strong {
      margin: 5px 0 2px;
      font-size: 48px;
      line-height: 1;
      color: #fff;
    }

    span {
      font-size: 11px;
      color: rgb(225 239 255 / 86%);
    }
  }

  .command-core-title {
    position: absolute;
    bottom: 7%;
    left: 50%;
    z-index: 4;
    display: grid;
    justify-items: center;
    min-width: 190px;
    transform: translateX(-50%);

    span {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      font-size: 10px;
      font-weight: 800;
      color: var(--screen-cyan);
      letter-spacing: 0.6px;
      text-shadow: 0 0 10px rgb(53 199 215 / 70%);

      i {
        width: 5px;
        height: 5px;
        background: var(--screen-success);
        border-radius: 50%;
        box-shadow: 0 0 8px var(--screen-success);
      }
    }

    strong {
      margin-top: 3px;
      font-size: 10px;
      color: var(--screen-text-strong);
      letter-spacing: 0.7px;
    }
  }

  @media (width <= 1360px) {
    .enterprise-command-core {
      grid-template-rows: minmax(280px, 1fr) auto;

      &__scene {
        min-height: 280px;
      }
    }

    .command-domain-node {
      width: 122px;
    }
  }

  @media (height <= 850px) and (width > 1100px) {
    .enterprise-command-core {
      grid-template-rows: minmax(248px, 1fr) auto;

      &__scene {
        min-height: 248px;
      }

      &__telemetry {
        margin-top: 6px;

        > div {
          gap: 2px;
          padding: 6px 10px 7px;
        }

        strong {
          font-size: 14px;
        }
      }
    }
  }

  @media (width <= 1100px) {
    .enterprise-command-core {
      grid-template-rows: 420px auto;

      &__scene {
        min-height: 420px;
      }

      &__telemetry {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 640px) {
    .enterprise-command-core {
      grid-template-rows: 500px auto;

      &__scene {
        min-height: 500px;
      }

      &__telemetry {
        grid-template-columns: 1fr;
      }
    }

    .command-domain-node {
      width: 106px;

      &.at-0,
      &.at-5 {
        left: 1%;
      }

      &.at-1,
      &.at-2 {
        right: 1%;
      }
    }
  }
</style>
