<template>
  <ElSkeleton
    animated
    inert
    aria-hidden="true"
    class="art-form-control-skeleton"
    :class="[`art-form-control-skeleton--${shape}`, size && `art-form-control-skeleton--${size}`]"
    :style="normalizeStyle(controlStyle)"
  >
    <template #template>
      <ElRadioGroup
        v-if="shape === 'radio-group'"
        id=""
        :size="size"
        :model-value="undefined"
        disabled
        :validate-event="false"
      >
        <component
          :is="optionType === 'button' ? ElRadioButton : ElRadio"
          v-for="(text, index) in labels"
          :key="index"
          :value="index"
          disabled
          :validate-event="false"
          >{{ text }}</component
        >
      </ElRadioGroup>
      <ElCheckboxGroup
        v-else-if="shape === 'checkbox-group'"
        :size="size"
        :model-value="emptySelection"
        disabled
        :validate-event="false"
      >
        <component
          :is="optionType === 'button' ? ElCheckboxButton : ElCheckbox"
          v-for="(text, index) in labels"
          :key="index"
          :value="index"
          disabled
          :validate-event="false"
          >{{ text }}</component
        >
      </ElCheckboxGroup>
      <ElRadio
        v-else-if="shape === 'radio'"
        id=""
        :size="size"
        :model-value="undefined"
        :value="0"
        disabled
        :validate-event="false"
        >{{ label }}</ElRadio
      >
      <ElSegmented
        v-else-if="shape === 'segment'"
        id=""
        :size="size"
        :options="labels"
        :model-value="undefined"
        disabled
        :validate-event="false"
      />
      <template v-else-if="shape === 'rate'">
        <ElSkeletonItem
          v-for="index in partCount"
          :key="index"
          variant="circle"
          class="art-form-control-skeleton__rating"
        />
      </template>
      <template v-else>
        <ElSkeletonItem
          v-if="shape === 'checkbox'"
          variant="rect"
          class="art-form-control-skeleton__check"
        />
        <span v-else-if="shape === 'colorPicker'" class="art-form-control-skeleton__baseline" />
        <ElSkeletonItem variant="rect" class="art-form-control-skeleton__rect" />
      </template>
    </template>
  </ElSkeleton>
</template>

<script setup lang="ts">
  import {
    ElCheckbox,
    ElCheckboxButton,
    ElRadio,
    ElRadioButton,
    formItemContextKey,
    useFormSize
  } from 'element-plus'
  import { normalizeStyle, provide } from 'vue'

  export type ControlSkeletonShape =
    | 'input'
    | 'number'
    | 'checkbox'
    | 'textarea'
    | 'select'
    | 'switch'
    | 'rate'
    | 'slider'
    | 'colorPicker'
    | 'radio'
    | 'radio-group'
    | 'checkbox-group'
    | 'segment'

  const props = withDefaults(
    defineProps<{
      shape?: ControlSkeletonShape
      controlSize?: unknown
      controlStyle?: unknown
      labels?: string[]
      label?: string
      optionType?: unknown
      count?: unknown
    }>(),
    { labels: () => [], label: '' }
  )
  const controlSize = computed(() =>
    props.controlSize === 'small' ||
    props.controlSize === 'default' ||
    props.controlSize === 'large'
      ? props.controlSize
      : undefined
  )
  const size = useFormSize(controlSize, { prop: true })
  // 先继承真实字段尺寸，再隔离装饰控件的 inputId 和校验注册。
  provide(formItemContextKey, undefined)
  const emptySelection: number[] = []
  const partCount = computed(() =>
    typeof props.count === 'number' && Number.isInteger(props.count) && props.count > 0
      ? props.count
      : 5
  )
</script>

<style scoped lang="scss">
  .art-form-control-skeleton {
    --art-form-control-placeholder-height: var(--el-component-size);
    --art-form-control-placeholder-rating-size: 18px;
    --art-form-control-placeholder-switch-width: 40px;
    --art-form-control-placeholder-switch-height: 20px;

    position: relative;
    display: inline-flex;
    align-items: center;
    inline-size: 100%;
    block-size: var(--art-form-control-placeholder-height);
    line-height: 1;

    &--select,
    &--switch,
    &--rate,
    &--slider,
    &--colorPicker {
      --art-form-control-placeholder-height: 32px;
    }

    &--select.art-form-control-skeleton--default {
      --art-form-control-placeholder-height: var(--el-component-size);
    }

    &--number {
      inline-size: 150px;

      &.art-form-control-skeleton--small {
        inline-size: 120px;
      }

      &.art-form-control-skeleton--large {
        inline-size: 180px;
      }
    }

    &--checkbox {
      --art-form-control-placeholder-height: var(--el-checkbox-height, 32px);
      --art-form-control-placeholder-check-size: 14px;
      --art-form-control-placeholder-check-radius: 2px;

      gap: var(--art-control-icon-gap);

      .art-form-control-skeleton__rect {
        position: static;
        inline-size: 96px;
        block-size: 14px;
      }
    }

    &--rate {
      gap: var(--el-rate-icon-margin, 6px);
      inline-size: auto;
      padding-inline-end: var(--el-rate-icon-margin, 6px);
    }

    &--colorPicker {
      inline-size: var(--art-form-control-placeholder-height);

      .art-form-control-skeleton__rect {
        border-radius: 4px;
      }
    }

    &--switch .art-form-control-skeleton__rect {
      position: static;
      inline-size: var(--art-form-control-placeholder-switch-width);
      block-size: var(--art-form-control-placeholder-switch-height);
      border-radius: var(--el-switch-core-border-radius, 20px);
    }

    &--slider .art-form-control-skeleton__rect {
      block-size: var(--el-slider-height, 6px);
      margin-block: auto;
    }

    &--default {
      --art-form-control-placeholder-check-size: 16px;
      --art-form-control-placeholder-check-radius: 4px;
    }

    &--small {
      --art-form-control-placeholder-height: var(--el-component-size-small);
      --art-form-control-placeholder-check-size: 12px;
      --art-form-control-placeholder-rating-size: 14px;
      --art-form-control-placeholder-switch-width: 30px;
      --art-form-control-placeholder-switch-height: 16px;
    }

    &--large {
      --art-form-control-placeholder-height: var(--el-component-size-large);
      --art-form-control-placeholder-switch-width: 50px;
      --art-form-control-placeholder-switch-height: 24px;
    }

    &--textarea {
      --art-form-control-placeholder-height: 104px;
    }

    &--radio,
    &--radio-group,
    &--checkbox-group,
    &--segment {
      block-size: auto;

      :deep(.el-radio__label),
      :deep(.el-checkbox__label),
      :deep(.el-radio-button__inner),
      :deep(.el-checkbox-button__inner),
      :deep(.el-segmented__item-label) {
        color: transparent !important;
        background-image: linear-gradient(var(--el-skeleton-color), var(--el-skeleton-color));
        background-repeat: no-repeat;
        background-position: center;
        background-clip: content-box;
        background-origin: content-box;
        background-size: 100% 12px;
      }

      :deep(.el-radio__inner),
      :deep(.el-checkbox__inner) {
        background-color: var(--el-skeleton-color) !important;
        border-color: transparent !important;
      }

      :deep(.el-radio-button__inner),
      :deep(.el-checkbox-button__inner) {
        box-shadow: none !important;
      }
    }

    &--radio,
    &--radio-group,
    &--segment {
      inline-size: auto;
      max-inline-size: 100%;
    }

    &--checkbox-group,
    &--slider {
      display: block;
    }

    &__baseline {
      inline-size: 0;
      block-size: 12px;
    }

    &__rating {
      flex: none;
      inline-size: var(--art-form-control-placeholder-rating-size);
      block-size: var(--art-form-control-placeholder-rating-size);
    }

    &__check {
      flex: none;
      inline-size: var(--art-form-control-placeholder-check-size);
      block-size: var(--art-form-control-placeholder-check-size);
      border-radius: var(--art-form-control-placeholder-check-radius);
    }

    &__rect {
      position: absolute;
      inset: 0;
      inline-size: 100%;
      block-size: 100%;
      border-radius: var(--art-control-radius);
    }
  }
</style>
