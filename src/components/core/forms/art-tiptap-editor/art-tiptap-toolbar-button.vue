<template>
  <button
    v-if="!tooltip"
    class="art-tiptap-toolbar-button"
    :class="buttonClass"
    type="button"
    :disabled="disabled"
    :aria-label="label"
    :aria-pressed="toggle ? active : undefined"
    @mousedown.prevent
    @click="$emit('click')"
  >
    <ArtSvgIcon :icon="icon" aria-hidden="true" />
    <span v-if="text" class="art-tiptap-toolbar-button__text">{{ text }}</span>
    <span v-if="showLabel" class="art-tiptap-toolbar-button__label">{{ label }}</span>
    <ArtSvgIcon
      v-if="dropdown"
      class="art-tiptap-toolbar-button__dropdown"
      icon="ri:arrow-down-s-line"
      aria-hidden="true"
    />
  </button>
  <ArtTooltip
    v-else
    :content="label"
    placement="top"
    :show-after="350"
    popper-class="art-tiptap-editor-tooltip"
  >
    <button
      class="art-tiptap-toolbar-button"
      :class="buttonClass"
      type="button"
      :disabled="disabled"
      :aria-label="label"
      :aria-pressed="toggle ? active : undefined"
      @mousedown.prevent
      @click="$emit('click')"
    >
      <ArtSvgIcon :icon="icon" aria-hidden="true" />
      <span v-if="text" class="art-tiptap-toolbar-button__text">{{ text }}</span>
      <span v-if="showLabel" class="art-tiptap-toolbar-button__label">{{ label }}</span>
      <ArtSvgIcon
        v-if="dropdown"
        class="art-tiptap-toolbar-button__dropdown"
        icon="ri:arrow-down-s-line"
        aria-hidden="true"
      />
    </button>
  </ArtTooltip>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  defineOptions({ name: 'ArtTiptapToolbarButton' })

  const props = withDefaults(
    defineProps<{
      label: string
      icon: string
      active?: boolean
      toggle?: boolean
      disabled?: boolean
      danger?: boolean
      showLabel?: boolean
      text?: string
      dropdown?: boolean
      tooltip?: boolean
    }>(),
    {
      active: false,
      toggle: false,
      disabled: false,
      danger: false,
      showLabel: false,
      text: '',
      dropdown: false,
      tooltip: true
    }
  )

  defineEmits<{ click: [] }>()

  const buttonClass = computed(() => ({
    'is-active': props.active,
    'is-danger': props.danger,
    'has-text': props.text,
    'has-dropdown': props.dropdown
  }))
</script>
