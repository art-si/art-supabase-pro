<template>
  <ArtDataSelect
    ref="selectRef"
    v-bind="props"
    mode="tree"
    :multiple="false"
    @update:model-value="(value) => emit('update:modelValue', value)"
    @update:selected-data="(rows) => emit('update:selectedData', rows)"
    @change="(value, rows) => emit('change', value, rows)"
    @confirm="(value, rows) => emit('confirm', value, rows)"
    @clear="emit('clear')"
    @open="emit('open')"
    @close="emit('close')"
    @load-error="(error) => emit('load-error', error)"
  >
    <template v-if="$slots.trigger" #trigger="slotProps">
      <slot name="trigger" v-bind="slotProps" />
    </template>
    <template v-if="$slots.empty" #empty>
      <slot name="empty" />
    </template>
  </ArtDataSelect>
</template>

<script setup lang="ts" generic="T extends object = DataSelectRecord">
  import { dataSelectDefaults } from './defaults'
  import ArtDataSelect from './index.vue'
  import type {
    DataSelectRecord,
    ArtDataSelectEmits,
    ArtDataSelectExpose,
    ArtDataSelectSingleProps
  } from './types'

  defineOptions({ name: 'ArtTreeSingleSelect' })

  const props = withDefaults(defineProps<ArtDataSelectSingleProps<T>>(), {
    ...dataSelectDefaults,
    showPagination: false,
    showSelectedPanel: false
  })
  const emit = defineEmits<ArtDataSelectEmits<T>>()
  const selectRef = ref<ArtDataSelectExpose>()

  defineExpose<ArtDataSelectExpose>({
    open: () => selectRef.value?.open() ?? Promise.resolve(),
    close: () => selectRef.value?.close(),
    clear: () => selectRef.value?.clear(),
    reload: () => selectRef.value?.reload() ?? Promise.resolve()
  })
</script>
