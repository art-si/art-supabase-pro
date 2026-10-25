<template>
  <ElTooltip
    ref="tooltipRef"
    v-bind="{ ...$attrs, ...props }"
    :show-arrow="false"
    :transition="TOOLTIP_TRANSITION"
    :popper-class="mergedPopperClass"
    :popper-options="boundedPopperOptions"
  >
    <slot />
    <template v-if="$slots.content" #content>
      <slot name="content" />
    </template>
  </ElTooltip>
</template>

<script setup lang="ts">
  import { useTooltipProps, type TooltipInstance } from 'element-plus'

  defineOptions({ name: 'ArtTooltip', inheritAttrs: false })

  const TOOLTIP_TRANSITION = 'art-tooltip-motion'
  const props = defineProps({
    ...useTooltipProps,
    offset: {
      ...useTooltipProps.offset,
      default: 6
    }
  })
  const tooltipRef = ref<TooltipInstance>()

  const mergedPopperClass = computed(() =>
    ['art-tooltip', props.popperClass].filter(Boolean).join(' ')
  )
  const boundedPopperOptions = computed(() => ({
    ...props.popperOptions,
    modifiers: [
      ...(props.popperOptions.modifiers ?? []),
      {
        name: 'preventOverflow' as const,
        options: {
          rootBoundary: 'viewport' as const,
          padding: 12,
          altAxis: true
        }
      },
      {
        name: 'flip' as const,
        options: { padding: 12 }
      }
    ]
  }))

  defineExpose({
    hide: () => tooltipRef.value?.hide(),
    onOpen: (event?: Event) => tooltipRef.value?.onOpen(event),
    onClose: (event?: Event) => tooltipRef.value?.onClose(event),
    updatePopper: () => tooltipRef.value?.updatePopper()
  })
</script>

<style lang="scss">
  .art-tooltip {
    max-width: calc(100vw - 24px);
    overflow-wrap: anywhere;
  }

  .art-tooltip-motion-enter-active,
  .art-tooltip-motion-leave-active {
    will-change: opacity, translate, scale;
  }

  .art-tooltip-motion-enter-active {
    transition:
      opacity var(--art-motion-duration-fast) var(--art-motion-ease-out),
      translate var(--art-motion-duration-base) var(--art-motion-ease-out),
      scale var(--art-motion-duration-base) var(--art-motion-ease-out);
  }

  .art-tooltip-motion-leave-active {
    transition:
      opacity var(--art-motion-duration-fast) var(--art-motion-ease-in),
      translate var(--art-motion-duration-fast) var(--art-motion-ease-in),
      scale var(--art-motion-duration-fast) var(--art-motion-ease-in);
  }

  .art-tooltip-motion-enter-from,
  .art-tooltip-motion-leave-to {
    opacity: 0;
    scale: 0.96;

    &[data-popper-placement^='top'] {
      translate: 0 4px;
    }

    &[data-popper-placement^='bottom'] {
      translate: 0 -4px;
    }

    &[data-popper-placement^='left'] {
      translate: 4px 0;
    }

    &[data-popper-placement^='right'] {
      translate: -4px 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .art-tooltip-motion-enter-active,
    .art-tooltip-motion-leave-active {
      transition-duration: 0.01ms;
    }

    .art-tooltip-motion-enter-from,
    .art-tooltip-motion-leave-to {
      scale: 1;
      translate: none;
    }
  }
</style>
