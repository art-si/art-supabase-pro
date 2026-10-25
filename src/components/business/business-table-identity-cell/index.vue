<template>
  <div class="business-table-identity-cell" :class="icon ? `is-${iconTone}` : undefined">
    <span v-if="icon" class="business-table-identity-cell__icon" aria-hidden="true">
      <ArtSvgIcon :icon="icon" />
    </span>
    <div class="business-table-identity-cell__content">
      <strong :title="primaryText">{{ primaryText }}</strong>
      <small :title="secondaryText">{{ secondaryText }}</small>
      <span v-if="tertiaryText" :title="tertiaryText">{{ tertiaryText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'

  defineOptions({ name: 'BusinessTableIdentityCell' })

  const props = withDefaults(
    defineProps<{
      primary?: string | number | null
      secondary?: string | number | null
      tertiary?: string | number | null
      icon?: string
      iconTone?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
    }>(),
    {
      primary: undefined,
      secondary: undefined,
      tertiary: undefined,
      icon: '',
      iconTone: 'primary'
    }
  )

  const normalizeText = (value: string | number | null | undefined, fallback = '—'): string => {
    if (value === null || value === undefined || value === '') return fallback
    return String(value)
  }

  const primaryText = computed(() => normalizeText(props.primary))
  const secondaryText = computed(() => normalizeText(props.secondary))
  const tertiaryText = computed(() =>
    props.tertiary === null || props.tertiary === undefined || props.tertiary === ''
      ? ''
      : String(props.tertiary)
  )
</script>

<style scoped lang="scss">
  .business-table-identity-cell {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
    line-height: 1.35;

    &__icon {
      display: grid;
      flex: 0 0 auto;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--business-table-identity-accent, var(--theme-color));
      background: color-mix(
        in srgb,
        var(--business-table-identity-accent, var(--theme-color)) 9%,
        var(--default-box-color)
      );
      border-radius: var(--el-border-radius-base);

      svg {
        width: 17px;
        height: 17px;
      }
    }

    &__content {
      display: grid;
      gap: 2px;
      min-width: 0;
    }

    strong,
    small,
    &__content > span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    strong {
      font-size: 14px;
      font-weight: 650;
      color: var(--art-gray-900);
    }

    small {
      font-size: 12px;
      color: var(--art-gray-600);
    }

    &__content > span {
      font-size: 11px;
      color: var(--art-gray-500);
    }

    &.is-success {
      --business-table-identity-accent: var(--el-color-success);
    }

    &.is-warning {
      --business-table-identity-accent: var(--el-color-warning);
    }

    &.is-danger {
      --business-table-identity-accent: var(--el-color-danger);
    }

    &.is-info {
      --business-table-identity-accent: var(--el-color-info);
    }
  }
</style>
