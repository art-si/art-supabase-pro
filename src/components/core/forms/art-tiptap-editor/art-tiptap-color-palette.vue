<template>
  <div class="art-tiptap-color-palette" role="group" :aria-label="label">
    <button
      class="art-tiptap-color-palette__swatch is-reset"
      :class="{ 'is-selected': !modelValue }"
      type="button"
      aria-label="恢复默认颜色"
      title="恢复默认颜色"
      @click="emit('select', '')"
    />
    <button
      v-for="color in colors"
      :key="color"
      class="art-tiptap-color-palette__swatch"
      :class="{ 'is-selected': modelValue.toLowerCase() === color.toLowerCase() }"
      :style="{ '--swatch-color': color }"
      type="button"
      :aria-label="`${label} ${color}`"
      :title="color"
      @click="emit('select', color)"
    />
    <label class="art-tiptap-color-palette__custom" title="自定义颜色">
      <ArtSvgIcon icon="ri:palette-line" aria-hidden="true" />
      <span class="sr-only">选择自定义颜色</span>
      <input type="color" :value="modelValue || fallbackColor" @input="handleCustomColor" />
    </label>
  </div>
</template>

<script setup lang="ts">
  defineOptions({ name: 'ArtTiptapColorPalette' })

  withDefaults(
    defineProps<{
      label: string
      colors: readonly string[]
      modelValue?: string
      fallbackColor?: string
    }>(),
    {
      modelValue: '',
      fallbackColor: '#5b5ce2'
    }
  )

  const emit = defineEmits<{ select: [value: string] }>()

  const handleCustomColor = (event: Event) => {
    emit('select', (event.target as HTMLInputElement).value)
  }
</script>
