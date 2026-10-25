<template>
  <TresPerspectiveCamera :position="cameraPosition" :look-at="sceneOrigin" :fov="40" />
  <TresAmbientLight :intensity="1.2" />
  <TresPointLight :position="keyLightPosition" :intensity="68" :color="accentColor" />
  <TresPointLight :position="fillLightPosition" :intensity="44" color="#20e3b2" />
  <TresPointLight
    :position="warningLightPosition"
    :intensity="riskCount ? 30 : 8"
    color="#ff725e"
  />

  <TresGroup ref="reactorRef" :rotation="[0.12, 0, 0]">
    <TresMesh ref="coreRef">
      <TresOctahedronGeometry :args="[0.72, 2]" />
      <TresMeshPhysicalMaterial
        color="#123a5a"
        :emissive="coreColor"
        :emissive-intensity="0.92"
        :metalness="0.7"
        :roughness="0.12"
        :clearcoat="1"
        transparent
        :opacity="0.94"
      />
    </TresMesh>

    <TresMesh ref="chamberRef">
      <TresCylinderGeometry :args="[0.92, 1.08, 2.5, 48, 1, true]" />
      <TresMeshPhysicalMaterial
        color="#0b3450"
        :emissive="accentColor"
        :emissive-intensity="0.18"
        :metalness="0.74"
        :roughness="0.18"
        :clearcoat="1"
        transparent
        :opacity="0.26"
        wireframe
      />
    </TresMesh>

    <TresGroup ref="gearOuterRef" :rotation="[Math.PI / 2, 0, 0]">
      <TresMesh>
        <TresTorusGeometry :args="[1.58, 0.11, 12, 96]" />
        <TresMeshStandardMaterial
          color="#16435f"
          :emissive="accentColor"
          :emissive-intensity="0.42"
          :metalness="0.88"
          :roughness="0.22"
        />
      </TresMesh>
      <TresMesh
        v-for="tooth in outerTeeth"
        :key="tooth.key"
        :position="tooth.position"
        :rotation="tooth.rotation"
      >
        <TresBoxGeometry :args="[0.17, 0.32, 0.14]" />
        <TresMeshStandardMaterial
          color="#1b526d"
          :emissive="accentColor"
          :emissive-intensity="0.32"
          :metalness="0.9"
          :roughness="0.24"
        />
      </TresMesh>
    </TresGroup>

    <TresGroup ref="gearInnerRef" :rotation="[Math.PI / 2, 0, 0]" :position="innerGearPosition">
      <TresMesh>
        <TresTorusGeometry :args="[0.98, 0.08, 10, 72]" />
        <TresMeshStandardMaterial
          color="#2b315f"
          :emissive="coreColor"
          :emissive-intensity="0.55"
          :metalness="0.82"
          :roughness="0.18"
        />
      </TresMesh>
      <TresMesh
        v-for="tooth in innerTeeth"
        :key="tooth.key"
        :position="tooth.position"
        :rotation="tooth.rotation"
      >
        <TresBoxGeometry :args="[0.14, 0.25, 0.11]" />
        <TresMeshStandardMaterial
          color="#3d3d78"
          :emissive="coreColor"
          :emissive-intensity="0.45"
          :metalness="0.86"
          :roughness="0.2"
        />
      </TresMesh>
    </TresGroup>

    <TresMesh ref="orbitRef" :rotation="[0.42, 0.15, 0.78]">
      <TresTorusGeometry :args="[2.15, 0.014, 8, 160]" />
      <TresMeshBasicMaterial :color="coreColor" transparent :opacity="0.7" />
    </TresMesh>
    <TresMesh ref="orbitSecondaryRef" :rotation="[1.25, 0.3, -0.46]">
      <TresTorusGeometry :args="[1.96, 0.01, 8, 150]" />
      <TresMeshBasicMaterial color="#20e3b2" transparent :opacity="0.46" />
    </TresMesh>

    <TresGroup ref="podSystemRef">
      <TresGroup v-for="pod in pods" :key="pod.key" :position="pod.position">
        <TresMesh>
          <TresDodecahedronGeometry :args="[0.14 + pod.intensity * 0.04, 0]" />
          <TresMeshStandardMaterial
            :color="pod.color"
            :emissive="pod.color"
            :emissive-intensity="0.8"
            :metalness="0.56"
            :roughness="0.2"
          />
        </TresMesh>
        <TresPointLight :color="pod.color" :intensity="4 + pod.intensity * 7" />
      </TresGroup>
    </TresGroup>

    <TresMesh :position="floorPosition" :rotation="[-Math.PI / 2, 0, 0]">
      <TresRingGeometry :args="[1.25, 2.9, 72]" />
      <TresMeshBasicMaterial :color="accentColor" transparent :opacity="0.08" />
    </TresMesh>
    <TresMesh ref="pulseRef" :position="pulsePosition" :rotation="[-Math.PI / 2, 0, 0]">
      <TresRingGeometry :args="[2.28, 2.34, 96]" />
      <TresMeshBasicMaterial :color="coreColor" transparent :opacity="0.54" />
    </TresMesh>

    <TresMesh v-for="tower in towers" :key="tower.key" :position="tower.position">
      <TresCylinderGeometry :args="[0.035, 0.07, tower.height, 6]" />
      <TresMeshBasicMaterial :color="tower.color" transparent :opacity="0.74" />
    </TresMesh>
  </TresGroup>

  <TresGridHelper :args="[9, 28, accentColor, '#12304a']" :position="floorPosition" />
  <TresMesh v-for="particle in particles" :key="particle.key" :position="particle.position">
    <TresSphereGeometry :args="[particle.size, 6, 6]" />
    <TresMeshBasicMaterial :color="particle.color" transparent :opacity="particle.opacity" />
  </TresMesh>
</template>

<script setup lang="ts">
  import { useLoop } from '@tresjs/core'
  import { Vector3, type Group, type Mesh } from 'three'

  interface Props {
    accentColor: string
    health: number
    hasData: boolean
    riskCount: number
    connectedRate: number
  }

  interface GearTooth {
    key: string
    position: Vector3
    rotation: [number, number, number]
  }

  const props = defineProps<Props>()
  const reducedMotion = usePreferredReducedMotion()

  const sceneOrigin = new Vector3(0, 0.1, 0)
  const cameraPosition = new Vector3(0, 0.45, 7.4)
  const keyLightPosition = new Vector3(3.5, 4.2, 4)
  const fillLightPosition = new Vector3(-4, 1.2, 2)
  const warningLightPosition = new Vector3(2.2, -1.4, 2.6)
  const floorPosition = new Vector3(0, -1.72, 0)
  const pulsePosition = new Vector3(0, -1.69, 0)
  const innerGearPosition = new Vector3(0, 0, 0.24)

  const reactorRef = shallowRef<Group | null>(null)
  const coreRef = shallowRef<Mesh | null>(null)
  const chamberRef = shallowRef<Mesh | null>(null)
  const gearOuterRef = shallowRef<Group | null>(null)
  const gearInnerRef = shallowRef<Group | null>(null)
  const orbitRef = shallowRef<Mesh | null>(null)
  const orbitSecondaryRef = shallowRef<Mesh | null>(null)
  const podSystemRef = shallowRef<Group | null>(null)
  const pulseRef = shallowRef<Mesh | null>(null)

  const coreColor = computed(() => {
    if (!props.hasData) return props.accentColor
    if (props.health < 60 || props.riskCount > 10) return '#ff6474'
    if (props.health < 80 || props.riskCount > 0) return '#f4b653'
    return '#20e3b2'
  })

  const createTeeth = (count: number, radius: number, prefix: string): GearTooth[] =>
    Array.from({ length: count }, (_, index) => {
      const angle = (index / count) * Math.PI * 2
      return {
        key: `${prefix}-${index}`,
        position: new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0),
        rotation: [0, 0, angle - Math.PI / 2]
      }
    })

  const outerTeeth = createTeeth(24, 1.7, 'outer')
  const innerTeeth = createTeeth(18, 1.08, 'inner')

  const pods = computed(() => {
    const values = [props.health, props.connectedRate, Math.max(0, 100 - props.riskCount * 8), 100]
    const colors = [
      coreColor.value,
      '#35c7d7',
      props.riskCount ? '#ff725e' : '#20e3b2',
      props.accentColor
    ]
    return values.map((value, index) => {
      const angle = index * (Math.PI / 2) + 0.45
      return {
        key: `pod-${index}`,
        intensity: Math.max(0.2, value / 100),
        color: colors[index],
        position: new Vector3(Math.cos(angle) * 2.16, Math.sin(angle) * 1.08, Math.sin(angle) * 0.7)
      }
    })
  })

  const towers = computed(() =>
    Array.from({ length: 28 }, (_, index) => {
      const angle = index * (Math.PI / 14)
      const healthFactor = 0.35 + props.health / 150
      const height = (0.2 + (index % 5) * 0.11) * healthFactor
      return {
        key: `tower-${index}`,
        height,
        color:
          index % 6 === 0 && props.riskCount
            ? '#ff725e'
            : index % 2
              ? '#20e3b2'
              : props.accentColor,
        position: new Vector3(
          Math.cos(angle) * (2.45 + (index % 2) * 0.17),
          floorPosition.y + height / 2,
          Math.sin(angle) * (2.45 + (index % 2) * 0.17)
        )
      }
    })
  )

  const particles = Array.from({ length: 34 }, (_, index) => {
    const angle = index * 2.399963
    const radius = 2.9 + (index % 5) * 0.5
    return {
      key: `particle-${index}`,
      position: new Vector3(
        Math.cos(angle) * radius,
        ((index * 29) % 21) / 4.4 - 2.25,
        -1.5 - (index % 5) * 0.62
      ),
      size: 0.015 + (index % 3) * 0.007,
      color: index % 4 === 0 ? '#20e3b2' : index % 3 === 0 ? '#35c7d7' : '#ffffff',
      opacity: 0.34 + (index % 4) * 0.13
    }
  })

  const { onBeforeRender } = useLoop()

  onBeforeRender(({ elapsed }) => {
    if (reducedMotion.value === 'reduce') return

    if (reactorRef.value) reactorRef.value.rotation.y = elapsed * 0.08
    if (coreRef.value) {
      coreRef.value.rotation.y = elapsed * 0.55
      coreRef.value.rotation.z = elapsed * -0.32
      coreRef.value.scale.setScalar(0.92 + (Math.sin(elapsed * 2.2) + 1) * 0.055)
    }
    if (chamberRef.value) chamberRef.value.rotation.y = elapsed * -0.18
    if (gearOuterRef.value) gearOuterRef.value.rotation.z = elapsed * 0.26
    if (gearInnerRef.value) gearInnerRef.value.rotation.z = elapsed * -0.42
    if (orbitRef.value) orbitRef.value.rotation.z = elapsed * 0.13
    if (orbitSecondaryRef.value)
      orbitSecondaryRef.value.rotation.x = 1.25 + Math.sin(elapsed * 0.42) * 0.16
    if (podSystemRef.value) podSystemRef.value.rotation.z = elapsed * -0.18
    if (pulseRef.value) {
      const scale = 0.94 + (Math.sin(elapsed * 1.8) + 1) * 0.06
      pulseRef.value.scale.setScalar(scale)
    }
  })
</script>
