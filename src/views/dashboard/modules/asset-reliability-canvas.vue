<template>
  <TresCanvas
    class="asset-reliability-core__canvas"
    alpha
    :antialias="true"
    :clear-alpha="0"
    power-preference="high-performance"
    aria-hidden="true"
  >
    <AssetReliabilityScene
      :accent-color="accentColor"
      :health="health"
      :has-data="hasData"
      :risk-count="riskCount"
      :connected-rate="connectedRate"
    />
  </TresCanvas>
</template>

<script setup lang="ts">
  import { TresCanvas } from '@tresjs/core'
  import AssetReliabilityScene from './asset-reliability-scene.vue'

  defineProps<{
    accentColor: string
    health: number
    hasData: boolean
    riskCount: number
    connectedRate: number
  }>()

  const emit = defineEmits<{ ready: [] }>()
  onMounted(() => emit('ready'))
</script>
