<template>
  <div class="art-table-cell-editor flex min-w-0 flex-col gap-1" @keydown="handleKeydown">
    <slot :value="draft" :update="updateDraft" :commit="commit" :cancel="() => emit('cancel')">
      <div class="flex min-w-0 items-center gap-1">
        <ElInputNumber
          v-if="config.name === 'number'"
          v-model="numericDraft"
          :min="config.min"
          :max="config.max"
          :precision="config.precision"
          :controls="false"
          :aria-label="label"
          class="w-full!"
          size="small"
          @change="commit"
        />
        <ElSelect
          v-else-if="config.name === 'select'"
          v-model="selectDraft"
          :aria-label="label"
          :empty-values="[null, undefined]"
          size="small"
          class="w-full!"
          @change="commit"
        >
          <ElOption
            v-for="option in config.options || []"
            :key="String(option.value)"
            :label="option.label"
            :value="option.value"
            :disabled="option.disabled"
          />
        </ElSelect>
        <ElSwitch
          v-else-if="config.name === 'switch'"
          v-model="switchDraft"
          :active-value="config.activeValue ?? true"
          :inactive-value="config.inactiveValue ?? false"
          :aria-label="label"
          size="small"
          @change="commit"
        />
        <ElDatePicker
          v-else-if="config.name === 'date' || config.name === 'datetime'"
          v-model="dateDraft"
          :aria-label="label"
          :type="config.name"
          :value-format="
            value instanceof Date
              ? undefined
              : config.name === 'date'
                ? 'YYYY-MM-DD'
                : 'YYYY-MM-DD HH:mm:ss'
          "
          size="small"
          class="w-full!"
          @change="commit"
        />
        <ElInput
          v-else
          v-model="textDraft"
          :aria-label="label"
          :type="config.name === 'textarea' ? 'textarea' : 'text'"
          :autosize="{ minRows: 2, maxRows: 6 }"
          :maxlength="config.maxLength"
          :placeholder="isNull ? 'NULL（无值）' : config.placeholder"
          size="small"
          @change="commit"
        />
        <ElButton
          v-if="config.nullable"
          size="small"
          text
          :type="isNull ? 'primary' : undefined"
          :aria-pressed="isNull"
          :aria-label="`将${label}设为 NULL`"
          @mousedown.prevent
          @click="setNull"
          >NULL</ElButton
        >
      </div>
    </slot>
  </div>
</template>
<script setup lang="ts">
  import { computed, shallowRef, watch } from 'vue'
  import { cloneDeep } from 'lodash-es'
  import type { TableEditRender } from '@/types/table-edit'
  const props = defineProps<{ value: unknown; config: TableEditRender; label: string }>()
  const emit = defineEmits<{
    commit: [value: unknown]
    cancel: []
    navigate: [direction: 'next' | 'previous' | 'down' | 'up']
  }>()
  // Element controls have different value unions; the slot boundary remains unknown.
  const draft = shallowRef<unknown>('')
  watch(
    () => props.value,
    (value) => {
      draft.value = cloneDeep(value)
    },
    { immediate: true }
  )
  const isNull = computed(() => draft.value === null)
  const switchDraft = computed({
    get: () =>
      draft.value === (props.config.activeValue ?? true)
        ? (props.config.activeValue ?? true)
        : (props.config.inactiveValue ?? false),
    set: (value: string | number | boolean) => {
      draft.value = value
    }
  })
  const selectDraft = computed({
    get: () =>
      typeof draft.value === 'string' ||
      typeof draft.value === 'number' ||
      typeof draft.value === 'boolean' ||
      draft.value === null
        ? draft.value
        : undefined,
    set: (value: unknown) => {
      draft.value = value
    }
  })
  const dateDraft = computed({
    get: () =>
      typeof draft.value === 'string' ||
      typeof draft.value === 'number' ||
      draft.value instanceof Date
        ? draft.value
        : null,
    set: (value: unknown) => {
      updateDraft(value)
    }
  })
  const textDraft = computed({
    get: () =>
      draft.value == null
        ? ''
        : typeof draft.value === 'object'
          ? JSON.stringify(draft.value)
          : String(draft.value),
    set: (value: string) => {
      draft.value = value
    }
  })
  const numericDraft = computed({
    get: () => (typeof draft.value === 'number' ? draft.value : undefined),
    set: (value: number | undefined) => {
      draft.value = value
    }
  })
  const updateDraft = (value: unknown) => {
    draft.value = cloneDeep(value)
  }
  const commit = () => {
    emit('commit', draft.value)
  }
  const setNull = () => {
    draft.value = isNull.value ? '' : null
    commit()
  }
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      emit('cancel')
      return
    }
    if (
      event.key === 'Tab' ||
      (event.key === 'Enter' &&
        (props.config.name !== 'textarea' || event.ctrlKey || event.metaKey))
    ) {
      // An open choice popup owns its own Enter/Tab behavior.
      if (
        event.target instanceof HTMLElement &&
        event.target.getAttribute('aria-expanded') === 'true'
      )
        return
      event.preventDefault()
      event.stopPropagation()
      commit()
      emit(
        'navigate',
        event.key === 'Tab'
          ? event.shiftKey
            ? 'previous'
            : 'next'
          : event.shiftKey
            ? 'up'
            : 'down'
      )
    }
  }
</script>
