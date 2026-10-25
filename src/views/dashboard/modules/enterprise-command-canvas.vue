<template>
  <TresCanvas
    class="enterprise-command-core__canvas"
    alpha
    :antialias="true"
    :clear-alpha="0"
    power-preference="high-performance"
    aria-hidden="true"
  >
    <EnterpriseCommandScene
      :accent-color="accentColor"
      :mode="mode"
      :signals="signals"
      :variant="variant"
    />
  </TresCanvas>
</template>

<script setup lang="ts">
  import { TresCanvas } from '@tresjs/core'
  import EnterpriseCommandScene from './enterprise-command-scene.vue'

  type SignalTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

  interface DomainSignal {
    label: string
    score: number
    tone: SignalTone
  }

  defineProps<{
    accentColor: string
    mode: 'business' | 'operations'
    signals: DomainSignal[]
    variant: 'sentinel' | 'field' | 'treasury' | 'flow' | 'fleet' | 'topology' | 'people'
  }>()

  const emit = defineEmits<{ ready: [] }>()
  onMounted(() => emit('ready'))
</script>
