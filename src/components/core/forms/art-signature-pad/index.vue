<template>
  <div class="art-signature-pad">
    <div class="art-signature-pad__paper">
      <img v-if="uploadedImage" :src="modelValue" alt="手写签名预览" width="960" height="400" />
      <canvas
        v-else
        ref="canvasRef"
        width="960"
        height="400"
        aria-label="手写签名区域，可用鼠标或触屏书写，也可使用下方上传图片"
        @pointerdown="beginStroke"
        @pointermove="drawStroke"
        @pointerup="endStroke"
        @pointercancel="endStroke"
        @lostpointercapture="endStroke"
      />
      <span v-if="!modelValue" class="art-signature-pad__hint">请在此区域手写签名</span>
    </div>
    <div class="mt-2 flex flex-wrap items-start justify-between gap-3">
      <ArtUploadImage
        :model-value="uploadedImage ? modelValue : ''"
        :resource-tenant-id="resourceTenantId"
        :disabled="disabled"
        :show-resource-picker="false"
        :size="68"
        :file-size="2 * 1024 * 1024"
        file-type="image/png,image/jpeg,image/webp"
        title="上传签名"
        preview-fit="contain"
        @update:model-value="setUploadedImage"
      />
      <ElButton :disabled="disabled || !modelValue" @click="clear">清除签名</ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { nextTick, ref, computed, watch } from 'vue'
  import { ElButton } from 'element-plus'
  import ArtUploadImage from '@/components/core/forms/art-upload-image/index.vue'

  defineOptions({ name: 'ArtSignaturePad' })
  const props = withDefaults(
    defineProps<{
      modelValue?: string
      resourceTenantId: string
      disabled?: boolean
    }>(),
    { modelValue: '', disabled: false }
  )
  const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
  const canvasRef = ref<HTMLCanvasElement>()
  const uploadedImage = computed(() => !!props.modelValue && !props.modelValue.startsWith('data:'))
  let activePointer: number | null = null
  let previousPoint: { x: number; y: number } | undefined

  const point = (event: PointerEvent, canvas: HTMLCanvasElement) => {
    const bounds = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - bounds.left) * canvas.width) / bounds.width,
      y: ((event.clientY - bounds.top) * canvas.height) / bounds.height
    }
  }
  const beginStroke = (event: PointerEvent) => {
    const canvas = canvasRef.value
    if (
      props.disabled ||
      !canvas ||
      activePointer !== null ||
      (event.pointerType === 'mouse' && event.button !== 0)
    )
      return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    activePointer = event.pointerId
    previousPoint = point(event, canvas)
    const context = canvas.getContext('2d')
    if (!context) return
    context.fillStyle = '#222'
    context.beginPath()
    context.arc(previousPoint.x, previousPoint.y, 2, 0, Math.PI * 2)
    context.fill()
  }
  const drawStroke = (event: PointerEvent) => {
    const canvas = canvasRef.value
    if (props.disabled || !canvas || activePointer !== event.pointerId || !previousPoint) return
    event.preventDefault()
    const context = canvas.getContext('2d')
    if (!context) return
    const current = point(event, canvas)
    context.lineWidth = 4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#222'
    context.beginPath()
    context.moveTo(previousPoint.x, previousPoint.y)
    context.lineTo(current.x, current.y)
    context.stroke()
    previousPoint = current
  }
  const endStroke = (event: PointerEvent) => {
    if (activePointer !== event.pointerId) return
    activePointer = null
    previousPoint = undefined
    const canvas = canvasRef.value
    if (canvas) emit('update:modelValue', canvas.toDataURL('image/png'))
  }
  const clear = () => {
    activePointer = null
    previousPoint = undefined
    canvasRef.value?.getContext('2d')?.clearRect(0, 0, 960, 280)
    emit('update:modelValue', '')
  }
  const setUploadedImage = (value: string | string[]) => {
    if (props.disabled) return
    activePointer = null
    emit('update:modelValue', Array.isArray(value) ? value[0] || '' : value)
  }
  watch(
    () => props.modelValue,
    async (value) => {
      if (value) return
      await nextTick()
      canvasRef.value?.getContext('2d')?.clearRect(0, 0, 960, 280)
    }
  )
</script>

<style scoped lang="scss">
  .art-signature-pad {
    width: 100%;
    min-width: 0;

    &__paper {
      position: relative;
      overflow: hidden;
      background: #fff;
      border: 1px dashed var(--el-border-color);
      border-radius: var(--el-border-radius-base);

      canvas,
      img {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 12 / 5;
        touch-action: none;
        object-fit: contain;
      }
    }

    &__hint {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #737373;
      pointer-events: none;
    }
  }
</style>
