<template>
  <TresPerspectiveCamera :position="cameraPosition" :look-at="sceneOrigin" :fov="42" />
  <TresAmbientLight :intensity="1.4" />
  <TresPointLight :position="keyLightPosition" :intensity="58" :color="accentColor" />
  <TresPointLight :position="fillLightPosition" :intensity="32" color="#35c7d7" />

  <TresGroup ref="systemRef" :rotation="systemRotation">
    <TresMesh ref="coreRef">
      <TresTorusGeometry v-if="variant === 'treasury'" :args="[0.66, 0.24, 18, 72]" />
      <TresBoxGeometry v-else-if="variant === 'flow'" :args="[1.08, 0.76, 0.76, 5, 4, 4]" />
      <TresCylinderGeometry v-else-if="variant === 'fleet'" :args="[0.72, 0.92, 0.64, 8]" />
      <TresOctahedronGeometry v-else-if="variant === 'field'" :args="[0.86, 2]" />
      <TresSphereGeometry v-else-if="variant === 'topology'" :args="[0.78, 24, 18]" />
      <TresOctahedronGeometry v-else-if="variant === 'people'" :args="[0.8, 1]" />
      <TresIcosahedronGeometry v-else :args="[0.78, 2]" />
      <TresMeshPhysicalMaterial
        color="#173d70"
        :emissive="accentColor"
        :emissive-intensity="0.55"
        :metalness="0.86"
        :roughness="0.14"
        :clearcoat="1"
        transparent
        :opacity="0.78"
      />
    </TresMesh>

    <TresMesh ref="globeRef" :scale="globeScale">
      <TresSphereGeometry :args="[1.24, 56, 56]" />
      <TresMeshPhysicalMaterial
        color="#0c2b55"
        :emissive="accentColor"
        :emissive-intensity="0.22"
        :metalness="0.72"
        :roughness="0.24"
        :clearcoat="0.78"
        :clearcoat-roughness="0.2"
        transparent
        :opacity="0.92"
      />
    </TresMesh>

    <TresMesh ref="wireframeRef" :scale="wireframeScale">
      <TresSphereGeometry :args="[1.24, 30, 22]" />
      <TresMeshBasicMaterial :color="accentColor" wireframe transparent :opacity="0.34" />
    </TresMesh>

    <TresMesh ref="orbitOuterRef" :rotation="[1.03, 0.16, 0.18]">
      <TresTorusGeometry :args="[1.86, 0.014, 8, 160]" />
      <TresMeshBasicMaterial :color="accentColor" transparent :opacity="0.68" />
    </TresMesh>
    <TresMesh ref="orbitMiddleRef" :rotation="[1.34, -0.32, -0.46]">
      <TresTorusGeometry :args="[1.6, 0.01, 8, 150]" />
      <TresMeshBasicMaterial color="#35c7d7" transparent :opacity="0.5" />
    </TresMesh>
    <TresMesh ref="orbitVerticalRef" :rotation="[0.12, 1.25, 0.3]">
      <TresTorusGeometry :args="[1.48, 0.012, 8, 150]" />
      <TresMeshBasicMaterial :color="accentColor" transparent :opacity="0.38" />
    </TresMesh>

    <TresGroup ref="satelliteRef">
      <TresMesh :position="satellitePosition">
        <TresSphereGeometry :args="[0.075, 12, 12]" />
        <TresMeshBasicMaterial color="#ffffff" />
      </TresMesh>
      <TresPointLight :position="satellitePosition" :intensity="8" :color="accentColor" />
    </TresGroup>

    <TresGroup ref="domainSystemRef">
      <TresMesh
        v-for="bridge in domainBridges"
        :key="`bridge-${bridge.key}`"
        :position="bridge.position"
        :quaternion="bridge.quaternion"
      >
        <TresCylinderGeometry :args="[0.007, 0.022, bridge.length, 8]" />
        <TresMeshBasicMaterial
          :color="bridge.color"
          transparent
          :opacity="0.28 + bridge.score / 250"
        />
      </TresMesh>

      <TresGroup v-for="signal in domainSatellites" :key="signal.key" :position="signal.position">
        <TresMesh>
          <TresOctahedronGeometry :args="[0.115 + signal.score / 2200, 1]" />
          <TresMeshStandardMaterial
            :color="signal.color"
            :emissive="signal.color"
            :emissive-intensity="0.72"
            :metalness="0.42"
            :roughness="0.24"
          />
        </TresMesh>
        <TresPointLight :color="signal.color" :intensity="5 + signal.score / 20" />
      </TresGroup>

      <TresMesh v-for="tower in dataTowers" :key="tower.key" :position="tower.position">
        <TresBoxGeometry :args="[0.045, tower.height, 0.045]" />
        <TresMeshBasicMaterial :color="tower.color" transparent :opacity="0.72" />
      </TresMesh>
    </TresGroup>

    <TresMesh :position="floorPosition" :rotation="[-Math.PI / 2, 0, 0]">
      <TresRingGeometry :args="[1.75, 2.8, 72]" />
      <TresMeshBasicMaterial :color="accentColor" transparent :opacity="0.07" />
    </TresMesh>

    <TresMesh ref="pulseRingRef" :position="pulseFloorPosition" :rotation="[-Math.PI / 2, 0, 0]">
      <TresRingGeometry :args="[2.02, 2.08, 96]" />
      <TresMeshBasicMaterial :color="accentColor" transparent :opacity="0.42" />
    </TresMesh>
  </TresGroup>

  <TresGridHelper
    :args="[8, 24, accentColor, '#17314d']"
    :position="floorPosition"
    :rotation="[0, 0, 0]"
  />

  <TresMesh v-for="particle in particles" :key="particle.key" :position="particle.position">
    <TresSphereGeometry :args="[particle.size, 6, 6]" />
    <TresMeshBasicMaterial :color="particle.color" transparent :opacity="particle.opacity" />
  </TresMesh>
</template>

<script setup lang="ts">
  import { useLoop } from '@tresjs/core'
  import { Quaternion, Vector3, type Group, type Mesh } from 'three'

  type SignalTone = 'primary' | 'success' | 'warning' | 'danger' | 'info'

  interface DomainSignal {
    label: string
    score: number
    tone: SignalTone
  }

  interface Props {
    accentColor: string
    mode: 'business' | 'operations'
    signals: DomainSignal[]
    variant: 'sentinel' | 'field' | 'treasury' | 'flow' | 'fleet' | 'topology' | 'people'
  }

  interface Particle {
    key: string
    position: Vector3
    size: number
    color: string
    opacity: number
  }

  interface DomainSatellite {
    key: string
    score: number
    color: string
    position: Vector3
  }

  interface DomainBridge extends DomainSatellite {
    length: number
    quaternion: Quaternion
  }

  interface DataTower {
    key: string
    height: number
    color: string
    position: Vector3
  }

  const props = defineProps<Props>()

  const sceneOrigin = new Vector3(0, 0, 0)
  const cameraPosition = computed(() =>
    ['flow', 'fleet'].includes(props.variant)
      ? new Vector3(0, 0.25, 7.6)
      : props.variant === 'people'
        ? new Vector3(0, 0.42, 7.25)
        : new Vector3(0, 0.35, 7)
  )
  const keyLightPosition = new Vector3(3.5, 4, 5)
  const fillLightPosition = new Vector3(-4, -2, 2)
  const satellitePosition = new Vector3(1.86, 0, 0)
  const floorPosition = new Vector3(0, -1.58, 0)
  const pulseFloorPosition = new Vector3(0, -1.55, 0)
  const wireframeScale = new Vector3(1.018, 1.018, 1.018)
  const systemRotation = computed<[number, number, number]>(() => {
    if (props.variant === 'treasury') return [0.3, 0, 0.08]
    if (props.variant === 'flow') return [0.04, 0, 0]
    if (props.variant === 'fleet') return [0.08, 0, 0]
    if (props.variant === 'people') return [0.04, 0, 0.08]
    return [0.14, 0, 0]
  })
  const globeScale = computed(() => {
    if (props.variant === 'treasury') return new Vector3(1.08, 0.58, 1.08)
    if (props.variant === 'flow') return new Vector3(1.34, 0.68, 0.84)
    if (props.variant === 'fleet') return new Vector3(1.32, 0.7, 0.9)
    if (props.variant === 'people') return new Vector3(0.88, 1.24, 0.88)
    return new Vector3(1, 1, 1)
  })

  const systemRef = shallowRef<Group | null>(null)
  const coreRef = shallowRef<Mesh | null>(null)
  const globeRef = shallowRef<Mesh | null>(null)
  const wireframeRef = shallowRef<Mesh | null>(null)
  const orbitOuterRef = shallowRef<Mesh | null>(null)
  const orbitMiddleRef = shallowRef<Mesh | null>(null)
  const orbitVerticalRef = shallowRef<Mesh | null>(null)
  const satelliteRef = shallowRef<Group | null>(null)
  const domainSystemRef = shallowRef<Group | null>(null)
  const pulseRingRef = shallowRef<Mesh | null>(null)
  const reducedMotion = usePreferredReducedMotion()

  const signalColors: Record<SignalTone, string> = {
    primary: '#7b70ff',
    success: '#2bd49b',
    warning: '#f4b653',
    danger: '#ff6474',
    info: '#35c7d7'
  }

  const domainSatellites = computed<DomainSatellite[]>(() =>
    props.signals.slice(0, 6).map((signal, index) => {
      const angle = index * (Math.PI / 3) - Math.PI / 6
      const radialOffset = index % 2 === 0 ? 2.14 : 2.38
      let position = new Vector3(
        Math.cos(angle) * radialOffset,
        Math.sin(angle) * 0.92,
        Math.sin(angle) * 0.64
      )
      if (props.variant === 'treasury') {
        position = new Vector3(Math.cos(angle) * radialOffset, Math.sin(angle) * 0.5, 0.2)
      } else if (props.variant === 'flow') {
        position = new Vector3(-2.5 + index, index % 2 === 0 ? 0.72 : -0.72, (index % 3) * 0.18)
      } else if (props.variant === 'fleet') {
        position = new Vector3(
          Math.cos(angle) * 2.55,
          Math.sin(angle) * 0.55,
          Math.sin(angle) * 0.34
        )
      } else if (props.variant === 'people') {
        position = new Vector3(
          index % 2 === 0 ? -1.55 : 1.55,
          1.35 - Math.floor(index / 2) * 1.35,
          (index % 3) * 0.2
        )
      }
      return {
        key: signal.label,
        score: signal.score,
        color: signalColors[signal.tone],
        position
      }
    })
  )

  const domainBridges = computed<DomainBridge[]>(() =>
    domainSatellites.value.map((signal) => {
      const direction = signal.position.clone()
      return {
        ...signal,
        length: direction.length(),
        position: direction.clone().multiplyScalar(0.5),
        quaternion: new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.normalize())
      }
    })
  )

  const dataTowers = computed<DataTower[]>(() =>
    Array.from({ length: 24 }, (_, index) => {
      const signal = domainSatellites.value[index % Math.max(domainSatellites.value.length, 1)]
      const score = signal?.score ?? 50
      const height = 0.16 + (score / 100) * 0.72 * (0.55 + (index % 4) * 0.15)
      const angle = index * (Math.PI / 12)
      const radius = 2.48 + (index % 3) * 0.11
      const laneOffset = ((index % 8) - 3.5) * 0.54
      const isLane = props.variant === 'flow' || props.variant === 'fleet'
      return {
        key: `tower-${index}`,
        height,
        color: signal?.color ?? props.accentColor,
        position: isLane
          ? new Vector3(
              laneOffset,
              floorPosition.y + height / 2,
              -1.1 + Math.floor(index / 8) * 1.1
            )
          : new Vector3(
              Math.cos(angle) * radius,
              floorPosition.y + height / 2,
              Math.sin(angle) * radius
            )
      }
    })
  )

  const particles: Particle[] = Array.from({ length: 26 }, (_, index) => {
    const angle = index * 2.399963
    const radius = 2.8 + (index % 5) * 0.48
    return {
      key: `particle-${index}`,
      position: new Vector3(
        Math.cos(angle) * radius,
        ((index * 37) % 19) / 4.2 - 2.1,
        -1.8 - (index % 4) * 0.72
      ),
      size: 0.018 + (index % 3) * 0.008,
      color: index % 3 === 0 ? '#35c7d7' : '#ffffff',
      opacity: 0.36 + (index % 4) * 0.12
    }
  })

  const { onBeforeRender } = useLoop()

  onBeforeRender(({ elapsed }) => {
    if (reducedMotion.value === 'reduce') return

    if (systemRef.value) {
      const speed = props.variant === 'flow' || props.variant === 'fleet' ? 0.028 : 0.08
      systemRef.value.rotation.y = elapsed * speed
    }
    if (coreRef.value) {
      coreRef.value.rotation.x = elapsed * 0.21
      coreRef.value.rotation.z = elapsed * -0.16
    }
    if (globeRef.value) globeRef.value.rotation.y = elapsed * 0.17
    if (wireframeRef.value) {
      wireframeRef.value.rotation.y = elapsed * -0.12
      wireframeRef.value.rotation.z = elapsed * 0.035
    }
    if (orbitOuterRef.value) orbitOuterRef.value.rotation.z = elapsed * 0.11
    if (orbitMiddleRef.value) orbitMiddleRef.value.rotation.z = elapsed * -0.16
    if (orbitVerticalRef.value) orbitVerticalRef.value.rotation.x = elapsed * 0.09
    if (satelliteRef.value) satelliteRef.value.rotation.z = elapsed * 0.44
    if (domainSystemRef.value) {
      domainSystemRef.value.rotation.y = elapsed * (props.mode === 'operations' ? -0.052 : -0.035)
    }
    if (pulseRingRef.value) {
      const scale = 0.96 + (Math.sin(elapsed * 1.8) + 1) * 0.055
      pulseRingRef.value.scale.setScalar(scale)
    }
  })
</script>
