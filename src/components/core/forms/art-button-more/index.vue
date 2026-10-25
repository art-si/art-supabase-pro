<!-- 更多按钮 -->
<template>
  <div class="art-button-more" :data-trigger="resolvedTrigger">
    <ElDropdown v-if="hasAnyAuthItem" :trigger="resolvedTrigger">
      <slot name="trigger">
        <ArtIconButton icon="ri:more-2-fill" label="更多操作" class="art-button-more__trigger" />
      </slot>
      <template #dropdown>
        <ElDropdownMenu>
          <template v-for="item in dropdownList" :key="item.key">
            <ElDropdownItem
              v-if="isItemAuthorized(item)"
              :disabled="item.disabled"
              @click="handleClick(item)"
            >
              <div
                class="art-button-more__item"
                :style="{ color: item.disabled ? undefined : item.color }"
              >
                <ArtSvgIcon
                  v-if="item.icon"
                  :icon="item.icon"
                  :style="{ color: item.disabled ? undefined : item.iconColor }"
                />
                <span>{{ item.label }}</span>
              </div>
            </ElDropdownItem>
          </template>
        </ElDropdownMenu>
      </template>
    </ElDropdown>
  </div>
</template>

<script setup lang="ts">
  import { useRoute } from 'vue-router'
  import { useMediaQuery } from '@vueuse/core'
  import { useAuth } from '@/hooks/core/useAuth'
  import { useTenantScopeAccessPolicy } from '@/hooks/core/useTenantScopeAccessPolicy'
  import { resolveBusinessButtonPermission } from '@/utils/business-permission'
  import {
    actionIdentity,
    commandIcon,
    isRangeAction,
    tableActionRowKey,
    tableRowCommandsKey
  } from '@/components/core/tables/art-table-query/row-action-context'

  defineOptions({ name: 'ArtButtonMore' })

  const { hasAuth } = useAuth()
  const route = useRoute()
  const { isCrossTenantReadOnly } = useTenantScopeAccessPolicy()

  export interface ButtonMoreItem {
    /** 按钮标识，可用于点击事件 */
    key: string | number
    /** 按钮文本 */
    label: string
    /** 是否禁用 */
    disabled?: boolean
    /** 权限标识 */
    auth?: string
    /** 图标组件 */
    icon?: string
    /** 文本颜色 */
    color?: string
    /** 图标颜色（优先级高于 color） */
    iconColor?: string
  }

  interface Props {
    /** 下拉项列表 */
    list: ButtonMoreItem[] | (() => ButtonMoreItem[])
    /** 整体权限控制 */
    auth?: string
    /** 展开方式；默认在触屏点击，在支持悬停的设备悬停 */
    trigger?: 'hover' | 'click'
  }

  const props = defineProps<Props>()
  const prefersTouch = useMediaQuery('(hover: none), (pointer: coarse)')
  const resolvedTrigger = computed(() => props.trigger ?? (prefersTouch.value ? 'click' : 'hover'))

  const row = inject(tableActionRowKey, undefined)
  const rowCommands = inject(tableRowCommandsKey, undefined)
  const ownItems = computed(() => (typeof props.list === 'function' ? props.list() : props.list))
  const inheritedItems = computed(() => (row?.value ? (rowCommands?.items(row.value) ?? []) : []))
  const dropdownList = computed(() => {
    const existing = ownItems.value
      .filter((item) => !row?.value || !isRangeAction(item.key, item.label))
      .map((item) => {
        const matching = inheritedItems.value.find(
          (candidate) => actionIdentity(candidate) === actionIdentity(item)
        )
        const destructive = /delete|remove|删除|注销/.test(`${item.key}:${item.label}`)
        return {
          ...item,
          icon:
            commandIcon(item.key, item.label) ??
            matching?.icon ??
            item.icon ??
            'ri:settings-3-line',
          color: destructive ? 'var(--el-color-danger)' : item.color,
          iconColor: destructive ? 'var(--el-color-danger)' : item.iconColor
        }
      })
    return [
      ...existing,
      ...inheritedItems.value.filter(
        (item) => !existing.some((candidate) => actionIdentity(candidate) === actionIdentity(item))
      )
    ]
  })

  const resolveItemPermission = (item: ButtonMoreItem): string | undefined =>
    resolveBusinessButtonPermission(route, item.key, item.auth)

  const isItemAuthorized = (item: ButtonMoreItem): boolean => {
    const permission = resolveItemPermission(item)
    return !permission || hasAuth(permission)
  }

  // 检查是否有任何有权限的 item
  const hasAnyAuthItem = computed(() => {
    if (isCrossTenantReadOnly.value) return false
    if (props.auth && !hasAuth(props.auth)) return false
    return dropdownList.value.some(isItemAuthorized)
  })

  const emit = defineEmits<{
    (e: 'click', item: ButtonMoreItem): void
  }>()

  const handleClick = (item: ButtonMoreItem) => {
    if (item.disabled) return
    if (
      row?.value &&
      inheritedItems.value.some((candidate) => candidate.key === item.key) &&
      !ownItems.value.some((candidate) => candidate.key === item.key)
    ) {
      void rowCommands?.run(item.key, row.value)
    } else emit('click', item)
  }
</script>

<style scoped lang="scss">
  .art-button-more {
    display: inline-flex;
    flex: none;
    align-items: center;
    vertical-align: middle;

    :deep(.el-dropdown),
    :deep(.el-tooltip__trigger) {
      display: inline-flex;
      align-items: center;
      vertical-align: middle;
    }

    &__trigger {
      width: 32px;
      height: 32px;
      padding: 0;
      font-size: 14px;
      line-height: 1;
      vertical-align: middle;
      background: var(--el-fill-color-light);
    }

    &__item {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      min-width: max-content;
      white-space: nowrap;

      :deep(.art-svg-icon) {
        flex: none;
      }
    }
  }
</style>
