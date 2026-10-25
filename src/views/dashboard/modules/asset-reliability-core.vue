<template>
  <div ref="rootRef" class="asset-reliability-core" role="img" :aria-label="coreSummary">
    <AssetReliabilityCanvas
      v-if="isWebGlSupported && isSceneActive"
      :accent-color="resolvedAccentColor"
      :health="health"
      :has-data="hasData"
      :risk-count="riskCount"
      :connected-rate="connectedRate"
      @ready="sceneReady = true"
    />
    <div v-if="!isWebGlSupported || !sceneReady" class="asset-reactor-fallback" aria-hidden="true">
      <i /><i /><i />
    </div>

    <div class="asset-reactor-rings" aria-hidden="true"><i /><i /><i /></div>
    <div class="asset-reactor-scan" aria-hidden="true" />
    <div class="asset-reactor-reticle" aria-hidden="true">
      <i class="is-top" /><i class="is-right" /><i class="is-bottom" /><i class="is-left" />
    </div>

    <div class="asset-reactor-center">
      <span><i /> RELIABILITY CORE</span>
      <strong>{{ hasData ? health : '—' }}</strong>
      <small>{{ hasData ? '设备综合健康度' : '等待设备接入' }}</small>
    </div>

    <div class="asset-reactor-status" :class="`is-${healthTone}`">
      {{ statusText }}
    </div>

    <div class="asset-reactor-nodes" aria-hidden="true">
      <div v-for="(node, index) in nodes" :key="node.label" :class="`at-${index}`">
        <i><ArtSvgIcon :icon="node.icon" /></i>
        <span>{{ node.label }}</span>
        <strong
          >{{ node.value }}<em>{{ node.unit }}</em></strong
        >
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  const AssetReliabilityCanvas = defineAsyncComponent(
    () => import('./asset-reliability-canvas.vue')
  )

  interface Props {
    health: number
    total: number
    connectedRate: number
    faultCount: number
    openRepairCount: number
    overdueCount: number
    riskCount: number
  }

  const props = defineProps<Props>()
  const rootRef = ref<HTMLElement | null>(null)
  const sceneReady = ref(false)
  const isSceneActive = ref(true)
  const accentColor = useCssVar('--theme-color', rootRef, {
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
  const hasData = computed(() => props.total > 0)
  const coreSummary = computed(() =>
    hasData.value
      ? `设备综合健康度 ${props.health} 分，当前故障 ${props.faultCount} 台，未闭环维修 ${props.openRepairCount} 单`
      : '暂无在册设备，等待设备数据接入'
  )

  const healthTone = computed(() => {
    if (!hasData.value) return 'info'
    if (props.health >= 90) return 'success'
    if (props.health >= 75) return 'primary'
    if (props.health >= 60) return 'warning'
    return 'danger'
  })
  const healthLabel = computed(() => {
    if (!hasData.value) return '暂无设备数据'
    if (props.health >= 90) return '运行稳定'
    if (props.health >= 75) return '重点观察'
    if (props.health >= 60) return '需安排检修'
    return '高风险运行'
  })
  const statusText = computed(() => {
    if (!hasData.value) return '暂无设备数据 · 等待资产接入'
    return `${healthLabel.value} · ${props.faultCount ? `${props.faultCount} 台故障` : '设备状态稳定'}`
  })
  const nodes = computed(() => [
    { label: '设备总量', value: props.total, unit: '台', icon: 'ri:database-2-line' },
    { label: '信号接入', value: props.connectedRate, unit: '%', icon: 'ri:wireless-charging-line' },
    { label: '维修工单', value: props.openRepairCount, unit: '单', icon: 'ri:tools-line' },
    { label: '逾期任务', value: props.overdueCount, unit: '项', icon: 'ri:alarm-warning-line' }
  ])
</script>

<style scoped lang="scss">
  .asset-reliability-core {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 48%, rgb(32 227 178 / 14%), transparent 24%),
      linear-gradient(rgb(53 199 215 / 5%) 1px, transparent 1px),
      linear-gradient(90deg, rgb(53 199 215 / 5%) 1px, transparent 1px), rgb(2 12 22 / 74%);
    background-size:
      auto,
      32px 32px,
      32px 32px,
      auto;
    border: 1px solid rgb(53 199 215 / 16%);
    border-radius: var(--el-border-radius-small);
    box-shadow:
      inset 0 0 72px rgb(0 0 0 / 42%),
      inset 0 0 54px rgb(32 227 178 / 5%);

    &__canvas {
      position: absolute !important;
      inset: 0;
      width: 100% !important;
      height: 100% !important;
    }
  }

  .asset-reactor-rings {
    position: absolute;
    inset: 50% auto auto 50%;
    width: min(38vw, 440px);
    aspect-ratio: 1;
    pointer-events: none;
    transform: translate(-50%, -50%);

    i {
      position: absolute;
      inset: 0;
      border: 1px solid rgb(53 199 215 / 11%);
      border-radius: 50%;
      animation: assetRingPulse 4.5s ease-in-out infinite;
    }

    i:nth-child(2) {
      inset: 11%;
      border-color: color-mix(in srgb, var(--screen-accent) 18%, transparent);
      animation-delay: -1.5s;
    }

    i:nth-child(3) {
      inset: 23%;
      border-color: rgb(32 227 178 / 17%);
      animation-delay: -3s;
    }
  }

  .asset-reactor-scan {
    position: absolute;
    top: -15%;
    right: 5%;
    left: 5%;
    height: 34%;
    pointer-events: none;
    background: linear-gradient(transparent, rgb(32 227 178 / 8%), transparent);
    filter: blur(1px);
    animation: assetScan 6s ease-in-out infinite;
  }

  .asset-reactor-reticle {
    position: absolute;
    inset: 16px;
    pointer-events: none;

    i {
      position: absolute;
      background: rgb(53 199 215 / 26%);
      box-shadow: 0 0 8px rgb(53 199 215 / 18%);
    }

    .is-top,
    .is-bottom {
      left: 50%;
      width: 34px;
      height: 1px;
      transform: translateX(-50%);
    }

    .is-top {
      top: 0;
    }

    .is-bottom {
      bottom: 0;
    }

    .is-left,
    .is-right {
      top: 50%;
      width: 1px;
      height: 34px;
      transform: translateY(-50%);
    }

    .is-left {
      left: 0;
    }

    .is-right {
      right: 0;
    }
  }

  .asset-reactor-center {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: 2;
    display: grid;
    justify-items: center;
    pointer-events: none;
    transform: translate(-50%, -47%);

    span {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      font-size: 8px;
      font-weight: 800;
      color: #b7f9e5;
      letter-spacing: 1.6px;
    }

    span i {
      width: 5px;
      height: 5px;
      background: #20e3b2;
      border-radius: 50%;
      box-shadow: 0 0 10px #20e3b2;
    }

    strong {
      margin: 5px 0 2px;
      font-size: clamp(38px, 4vw, 62px);
      line-height: 0.95;
      color: #fff;
      text-shadow:
        0 0 20px rgb(32 227 178 / 42%),
        0 3px 10px rgb(0 0 0 / 70%);
    }

    small {
      font-size: 10px;
      color: var(--screen-text-muted);
    }
  }

  .asset-reactor-status {
    position: absolute;
    bottom: 23px;
    left: 50%;
    z-index: 2;
    min-width: 170px;
    padding: 7px 16px;
    font-size: 10px;
    font-weight: 700;
    color: #d9fff3;
    text-align: center;
    background: rgb(32 227 178 / 9%);
    border: 1px solid rgb(32 227 178 / 22%);
    clip-path: polygon(9px 0, calc(100% - 9px) 0, 100% 50%, calc(100% - 9px) 100%, 9px 100%, 0 50%);
    transform: translateX(-50%);

    &.is-warning {
      color: #ffe2a8;
      background: rgb(244 182 83 / 9%);
      border-color: rgb(244 182 83 / 24%);
    }

    &.is-info {
      color: #d8dcff;
      background: rgb(99 91 255 / 9%);
      border-color: rgb(99 91 255 / 24%);
    }

    &.is-danger {
      color: #ffd3d8;
      background: rgb(255 100 116 / 9%);
      border-color: rgb(255 100 116 / 26%);
    }
  }

  .asset-reactor-nodes {
    position: absolute;
    inset: 0;
    pointer-events: none;

    > div {
      position: absolute;
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      min-width: 152px;
      padding: 8px 10px;
      background: linear-gradient(90deg, rgb(5 28 40 / 90%), rgb(10 42 57 / 72%));
      border: 1px solid rgb(53 199 215 / 22%);
      border-radius: 3px;
      box-shadow: 0 0 18px rgb(32 227 178 / 6%);
    }

    > div::after {
      position: absolute;
      top: 50%;
      width: clamp(34px, 5vw, 80px);
      height: 1px;
      content: '';
      background: linear-gradient(90deg, rgb(53 199 215 / 32%), transparent);
    }

    .at-0 {
      top: 13%;
      left: 3%;
    }

    .at-1 {
      top: 13%;
      right: 3%;
    }

    .at-2 {
      bottom: 14%;
      left: 5%;
    }

    .at-3 {
      right: 5%;
      bottom: 14%;
    }

    .at-0::after,
    .at-2::after {
      right: calc(-1 * clamp(34px, 5vw, 80px));
    }

    .at-1::after,
    .at-3::after {
      left: calc(-1 * clamp(34px, 5vw, 80px));
      transform: rotate(180deg);
    }

    i {
      display: grid;
      place-items: center;
      width: 30px;
      height: 30px;
      font-size: 15px;
      color: #55ecc5;
      background: rgb(32 227 178 / 9%);
      border: 1px solid rgb(32 227 178 / 18%);
      border-radius: 50%;
    }

    span {
      font-size: 9px;
      color: var(--screen-text-muted);
      white-space: nowrap;
    }

    strong {
      font-size: 17px;
      color: var(--screen-text-strong);
    }

    em {
      margin-left: 2px;
      font-size: 8px;
      font-style: normal;
      color: var(--screen-text-muted);
    }
  }

  .asset-reactor-fallback {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 180px;
    aspect-ratio: 1;
    border: 12px solid rgb(32 227 178 / 16%);
    border-radius: 50%;
    box-shadow:
      0 0 70px rgb(32 227 178 / 16%),
      inset 0 0 45px rgb(32 227 178 / 14%);
    transform: translate(-50%, -50%);

    i {
      position: absolute;
      inset: 22%;
      border: 5px solid color-mix(in srgb, var(--screen-accent) 48%, transparent);
      border-radius: 50%;
    }
  }

  @keyframes assetRingPulse {
    0%,
    100% {
      opacity: 0.36;
      transform: scale(0.96);
    }

    50% {
      opacity: 0.8;
      transform: scale(1.03);
    }
  }

  @keyframes assetScan {
    0%,
    100% {
      transform: translateY(0);
    }

    50% {
      transform: translateY(360%);
    }
  }

  @media (width <= 1360px) {
    .asset-reactor-nodes > div {
      min-width: 132px;
      padding: 6px 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .asset-reactor-rings i,
    .asset-reactor-scan {
      animation: none;
    }
  }
</style>
