<!-- 表格按钮 -->
<template>
  <button
    v-if="canAccess"
    type="button"
    class="art-button-table"
    :class="[
      buttonClass,
      type ? `is-${type}` : '',
      { 'is-disabled': isDisabled, 'is-label-visible': showLabel }
    ]"
    :style="buttonStyle"
    :aria-busy="loading"
    :aria-disabled="isDisabled"
    :disabled="isDisabled"
    :aria-label="accessibleLabel"
    :title="accessibleLabel"
    @click="handleClick"
  >
    <ArtSvgIcon :icon="iconContent" :class="{ 'animate-spin': loading }" />
    <span v-if="showLabel" class="art-button-table__label">{{ accessibleLabel }}</span>
  </button>
</template>

<script setup lang="ts">
  import { useRoute } from 'vue-router'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeAccessPolicy } from '@/hooks/core/useTenantScopeAccessPolicy'
  import { resolveBusinessButtonPermission } from '@/utils/business-permission'
  import {
    actionIdentity,
    tableActionRowKey,
    tableRowCommandsKey
  } from '@/components/core/tables/art-table-query/row-action-context'

  defineOptions({ name: 'ArtButtonTable' })

  interface Props {
    /** 按钮类型 */
    type?: 'add' | 'edit' | 'delete' | 'more' | 'sign' | 'view'
    /** 按钮图标 */
    icon?: string
    /** 按钮样式类 */
    iconClass?: string
    /** icon 颜色 */
    iconColor?: string
    /** 按钮背景色 */
    buttonBgColor?: string
    /*按钮权限*/
    permission?: string
    /** 是否显示加载状态 */
    loading?: boolean
    /** 是否禁用点击 */
    disabled?: boolean
    /** 业务动作名称，用于按钮标题和无障碍文本 */
    label?: string
    /** 是否直接显示业务动作文字 */
    showLabel?: boolean
  }

  const props = withDefaults(defineProps<Props>(), {})
  const route = useRoute()
  const { hasAuth } = useAuth()
  const actionRow = inject(tableActionRowKey, undefined)
  const rowCommands = inject(tableRowCommandsKey, undefined)
  const deleteIsInMore = computed(
    () =>
      props.type === 'delete' &&
      actionRow?.value &&
      rowCommands
        ?.items(actionRow.value)
        .some((item) => actionIdentity(item) === 'delete' && (!item.auth || hasAuth(item.auth)))
  )
  const { isCrossTenantReadOnly } = useTenantScopeAccessPolicy()

  const resolvedPermission = computed(() =>
    resolveBusinessButtonPermission(route, props.type, props.permission)
  )
  const isMutationAction = computed(() =>
    ['add', 'edit', 'delete', 'sign'].includes(String(props.type))
  )
  const canAccess = computed(
    () =>
      !deleteIsInMore.value &&
      !(isCrossTenantReadOnly.value && isMutationAction.value) &&
      (!resolvedPermission.value || hasAuth(resolvedPermission.value))
  )

  const emit = defineEmits<{
    (e: 'click'): void
  }>()

  // 默认按钮配置
  const defaultButtons = {
    add: { icon: 'ri:add-fill', label: '新增' },
    edit: { icon: 'ri:pencil-line', label: '编辑' },
    delete: { icon: 'ri:delete-bin-5-line', label: '删除' },
    sign: { icon: 'ri:checkbox-circle-line', label: '确认' },
    view: { icon: 'ri:eye-line', label: '查看' },
    more: { icon: 'ri:more-2-fill', label: '更多操作' }
  } as const

  const isDisabled = computed(() => props.disabled || props.loading)

  // 获取图标内容
  const iconContent = computed(() => {
    if (props.loading) return 'ri:loader-4-line'
    return props.icon || (props.type ? defaultButtons[props.type]?.icon : '') || ''
  })

  // 获取按钮样式类
  const buttonClass = computed(() => {
    return props.iconClass || ''
  })

  const accessibleLabel = computed(() => {
    if (props.loading) return '处理中'
    return props.label || (props.type ? defaultButtons[props.type]?.label : '表格操作')
  })

  const buttonStyle = computed(() => ({
    '--art-table-button-background': props.buttonBgColor,
    '--art-table-button-color': props.iconColor
  }))

  const handleClick = () => {
    if (isDisabled.value) return
    emit('click')
  }
</script>

<style scoped lang="scss">
  .art-button-table {
    --art-table-button-semantic: var(--art-action-more);
    --art-action-color: var(--art-table-button-color, var(--art-table-button-semantic));
    --art-table-button-border-color: color-mix(
      in srgb,
      var(--art-table-button-semantic) 14%,
      transparent
    );
    --art-table-button-hover-border-color: color-mix(
      in srgb,
      var(--art-table-button-semantic) 34%,
      transparent
    );
    --art-table-button-rest-shadow: inset 0 1px 0 rgb(255 255 255 / 28%);

    position: relative;
    z-index: 1;
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    margin-right: 10px;
    font: inherit;
    font-size: 14px;
    vertical-align: middle;
    color: var(--art-table-button-color, var(--art-table-button-semantic));
    cursor: pointer;
    background: var(
      --art-table-button-background,
      color-mix(in srgb, var(--art-table-button-semantic) 11%, var(--default-box-color))
    );
    border: 1px solid var(--art-table-button-border-color);
    border-radius: var(--el-border-radius-base);
    box-shadow: var(--art-table-button-rest-shadow);
    transition:
      color 0.18s ease,
      background-color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease;

    &.is-add {
      --art-table-button-semantic: var(--art-action-add);
    }

    &.is-edit {
      --art-table-button-semantic: var(--art-action-edit);
    }

    &.is-delete {
      --art-table-button-semantic: var(--art-action-delete);
    }

    &.is-sign {
      --art-table-button-semantic: var(--art-action-sign);
    }

    &.is-view {
      --art-table-button-semantic: var(--art-action-view);
    }

    &.is-label-visible {
      display: inline-flex;
      gap: var(--art-control-icon-gap);
      width: auto;
      min-width: 32px;
      padding: 0 10px;
    }

    &:hover:not(.is-disabled) {
      color: var(--art-action-color);
      background: color-mix(
        in srgb,
        var(--art-table-button-semantic) 19%,
        var(--default-box-color)
      );
      border-color: var(--art-table-button-hover-border-color);
      box-shadow: var(--art-themed-action-hover-shadow);
    }

    &:active:not(.is-disabled) {
      background: color-mix(
        in srgb,
        var(--art-table-button-semantic) 25%,
        var(--default-box-color)
      );
      border-color: var(--art-table-button-hover-border-color);
      box-shadow: var(--art-themed-action-active-shadow);
    }

    &:focus-visible {
      outline: none;
      border-color: var(--art-table-button-hover-border-color);
      box-shadow: var(--art-themed-action-focus-shadow);
    }

    &.is-disabled {
      cursor: not-allowed;
      box-shadow: none;
      opacity: 0.48;
    }

    &__label {
      line-height: 1;
      white-space: nowrap;
    }
  }

  :global(html[data-box-mode='shadow-mode'] .art-button-table) {
    --art-table-button-border-color: transparent;
    --art-table-button-hover-border-color: transparent;
    --art-table-button-rest-shadow: 0 3px 8px
      color-mix(in srgb, var(--art-table-button-semantic) 9%, transparent);
  }

  @media (prefers-reduced-motion: reduce) {
    .art-button-table {
      transition: none;
    }
  }
</style>
