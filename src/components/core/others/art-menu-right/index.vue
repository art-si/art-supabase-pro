<!-- 右键菜单 -->
<template>
  <Teleport to="body">
    <Transition name="context-menu" @before-enter="onBeforeEnter">
      <div
        ref="menuRef"
        v-show="visible"
        :style="menuStyle"
        class="menu-right context-menu art-card-xs min-w-[var(--menu-width)] w-[var(--menu-width)]"
      >
        <ul class="menu-list m-0 list-none" :style="menuListStyle" role="menu">
          <template v-for="item in menuItems" :key="item.key">
            <!-- 普通菜单项 -->
            <li
              v-if="!item.children"
              role="none"
              class="menu-entry relative"
              :class="{ 'is-disabled': item.disabled, 'has-line': item.showLine }"
            >
              <button
                type="button"
                role="menuitem"
                class="menu-item art-icon-label relative w-full c-p select-none rounded text-sm transition-colors duration-150"
                :style="menuItemStyle"
                :disabled="item.disabled"
                @click="handleMenuClick(item)"
              >
                <ArtSvgIcon
                  v-if="item.icon"
                  class="text-g-800"
                  :icon="item.icon"
                  aria-hidden="true"
                />
                <span
                  class="menu-label flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-g-800"
                  >{{ item.label }}</span
                >
              </button>
            </li>

            <!-- 子菜单 -->
            <li v-else role="none" class="menu-entry submenu relative">
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                class="menu-item submenu-title art-icon-label w-full c-p select-none rounded text-sm transition-colors duration-150"
                :style="menuItemStyle"
              >
                <ArtSvgIcon
                  v-if="item.icon"
                  class="text-g-800"
                  :icon="item.icon"
                  aria-hidden="true"
                />
                <span
                  class="menu-label flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-g-800"
                  >{{ item.label }}</span
                >
                <ArtSvgIcon
                  icon="ri:arrow-right-s-line"
                  class="submenu-arrow text-g-500 transition-transform duration-150"
                  aria-hidden="true"
                />
              </button>
              <ul
                class="submenu-list art-card-xs absolute left-full top-0 z-[2001] hidden w-max min-w-max list-none"
                :style="submenuListStyle"
                role="menu"
              >
                <li
                  v-for="child in item.children"
                  :key="child.key"
                  role="none"
                  class="menu-entry relative mx-1.5"
                  :class="{ 'is-disabled': child.disabled, 'has-line': child.showLine }"
                >
                  <button
                    type="button"
                    role="menuitem"
                    class="menu-item art-icon-label relative w-full c-p select-none rounded text-sm transition-colors duration-150"
                    :style="menuItemStyle"
                    :disabled="child.disabled"
                    @click="handleMenuClick(child)"
                  >
                    <ArtSvgIcon
                      v-if="child.icon"
                      class="text-g-800"
                      :icon="child.icon"
                      aria-hidden="true"
                    />
                    <span
                      class="menu-label flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-g-800"
                      >{{ child.label }}</span
                    >
                  </button>
                </li>
              </ul>
            </li>
          </template>
        </ul>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
  import type { CSSProperties } from 'vue'
  import { useEventListener, useTimeoutFn } from '@vueuse/core'

  defineOptions({ name: 'ArtMenuRight' })

  export interface MenuItemType {
    /** 菜单项唯一标识 */
    key: string
    /** 菜单项标签 */
    label: string
    /** 菜单项图标 */
    icon?: string
    /** 菜单项是否禁用 */
    disabled?: boolean
    /** 菜单项是否显示分割线 */
    showLine?: boolean
    /** 子菜单 */
    children?: MenuItemType[]
    [key: string]: unknown
  }

  interface Props {
    menuItems: MenuItemType[]
    /** 菜单宽度 */
    menuWidth?: number
    /** 子菜单宽度 */
    submenuWidth?: number
    /** 菜单项高度 */
    itemHeight?: number
    /** 边界距离 */
    boundaryDistance?: number
    /** 菜单内边距 */
    menuPadding?: number
    /** 菜单项水平内边距 */
    itemPaddingX?: number
    /** 菜单圆角 */
    borderRadius?: number
    /** 动画持续时间 */
    animationDuration?: number
  }

  const props = withDefaults(defineProps<Props>(), {
    menuWidth: 150,
    submenuWidth: 150,
    itemHeight: 32,
    boundaryDistance: 10,
    menuPadding: 5,
    itemPaddingX: 6,
    borderRadius: 6,
    animationDuration: 100
  })

  const emit = defineEmits<{
    (e: 'select', item: MenuItemType): void
    (e: 'show'): void
    (e: 'hide'): void
  }>()

  const visible = ref(false)
  const position = ref({ x: 0, y: 0 })

  const menuRef = ref<HTMLDivElement>()
  const listenersReady = ref(false)
  const listenerTarget = computed(() =>
    visible.value && listenersReady.value ? document : undefined
  )
  const { start: startListenersDelay, stop: stopListenersDelay } = useTimeoutFn(
    () => {
      if (visible.value) listenersReady.value = true
    },
    50,
    { immediate: false }
  )

  // 计算菜单样式
  const menuStyle = computed((): CSSProperties => ({
    position: 'fixed' as const,
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
    zIndex: 2000,
    width: `${props.menuWidth}px`
  }))

  // 计算菜单列表样式
  const menuListStyle = computed((): CSSProperties => ({
    padding: `${props.menuPadding}px`
  }))

  // 计算菜单项样式
  const menuItemStyle = computed((): CSSProperties => ({
    height: `${props.itemHeight}px`,
    padding: `0 ${props.itemPaddingX}px`,
    borderRadius: '4px'
  }))

  // 计算子菜单列表样式
  const submenuListStyle = computed((): CSSProperties => ({
    minWidth: `${props.submenuWidth}px`,
    padding: `${props.menuPadding}px 0`,
    borderRadius: `${props.borderRadius}px`
  }))

  // 计算菜单高度（用于边界检测）
  const calculateMenuHeight = (): number => {
    let totalHeight = props.menuPadding * 2 // 上下内边距

    props.menuItems.forEach((item) => {
      totalHeight += props.itemHeight
      if (item.showLine) {
        totalHeight += 10 // 分割线额外高度
      }
    })

    return totalHeight
  }

  // 优化的位置计算函数
  const calculatePosition = (e: MouseEvent) => {
    const screenWidth = window.innerWidth
    const screenHeight = window.innerHeight
    const menuHeight = calculateMenuHeight()

    let x = e.clientX
    let y = e.clientY

    // 检查右边界 - 优先显示在鼠标右侧，如果空间不足则显示在左侧
    if (x + props.menuWidth > screenWidth - props.boundaryDistance) {
      x = Math.max(props.boundaryDistance, x - props.menuWidth)
    }

    // 检查下边界 - 优先显示在鼠标下方，如果空间不足则向上调整
    if (y + menuHeight > screenHeight - props.boundaryDistance) {
      y = Math.max(props.boundaryDistance, screenHeight - menuHeight - props.boundaryDistance)
    }

    // 确保不会超出边界
    x = Math.max(
      props.boundaryDistance,
      Math.min(x, screenWidth - props.menuWidth - props.boundaryDistance)
    )
    y = Math.max(
      props.boundaryDistance,
      Math.min(y, screenHeight - menuHeight - props.boundaryDistance)
    )

    return { x, y }
  }

  // 处理文档点击事件
  const handleDocumentClick = (e: Event) => {
    // 检查点击是否在菜单内部
    const target = e.target
    if (target instanceof Node && menuRef.value?.contains(target)) {
      return
    }
    hide()
  }

  // 处理文档右键事件
  const handleDocumentContextmenu = () => {
    hide()
  }

  // 处理键盘事件
  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      hide()
    }
  }

  const show = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    stopListenersDelay()
    listenersReady.value = false

    // 计算位置
    position.value = calculatePosition(e)
    visible.value = true

    emit('show')

    // 延迟监听，避免打开菜单的点击事件立即关闭菜单。
    startListenersDelay()
  }

  const hide = () => {
    if (!visible.value) return

    visible.value = false
    emit('hide')

    stopListenersDelay()
    listenersReady.value = false
  }

  const handleMenuClick = (item: MenuItemType) => {
    if (item.disabled) return
    emit('select', item)
    hide()
  }

  // 动画钩子函数
  const onBeforeEnter = (el: Element) => {
    const element = el as HTMLElement
    element.style.transformOrigin = 'top left'
  }

  useEventListener(listenerTarget, 'click', handleDocumentClick)
  useEventListener(listenerTarget, 'contextmenu', handleDocumentContextmenu)
  useEventListener(listenerTarget, 'keydown', handleKeydown)

  // 导出方法供父组件调用
  defineExpose({
    show,
    hide,
    visible: computed(() => visible.value)
  })
</script>

<style scoped>
  .menu-right {
    --menu-width: v-bind('props.menuWidth + "px"');
    --border-radius: v-bind('props.borderRadius + "px"');

    border-radius: var(--border-radius) !important;
  }

  .submenu-list {
    border-radius: var(--border-radius) !important;
  }

  .menu-item {
    font-family: inherit;
    color: inherit;
    text-align: left;
    background: transparent;
    border: 0;

    &:hover:not(:disabled) {
      background: var(--art-hover-color);
    }

    &:focus-visible {
      color: var(--theme-color);
      outline: none;
      background: color-mix(in srgb, var(--theme-color) 8%, var(--default-box-color));
      box-shadow: var(--art-themed-action-focus-shadow);
    }
  }

  .menu-entry.has-line {
    margin-bottom: 10px;
  }

  .menu-entry.has-line::after {
    position: absolute;
    right: 0;
    bottom: -5px;
    left: 0;
    height: 1px;
    content: '';
    background-color: var(--art-gray-300);
  }

  .menu-entry.is-disabled {
    color: var(--el-text-color-disabled);
    cursor: not-allowed;
  }

  .menu-entry.is-disabled:hover .menu-item {
    background-color: transparent !important;
  }

  .menu-entry.is-disabled i:not(.submenu-arrow),
  .menu-entry.is-disabled :deep(.art-svg-icon) {
    color: var(--el-text-color-disabled) !important;
  }

  .menu-entry.is-disabled .menu-label {
    color: var(--el-text-color-disabled) !important;
  }

  .menu-entry.submenu:hover .submenu-list,
  .menu-entry.submenu:focus-within .submenu-list {
    display: block;
  }

  .menu-entry.submenu:hover .submenu-title .submenu-arrow,
  .menu-entry.submenu:focus-within .submenu-title .submenu-arrow {
    transform: rotate(90deg);
  }

  /* 动画样式 */
  .context-menu-enter-active,
  .context-menu-leave-active {
    transition:
      opacity v-bind('props.animationDuration + "ms"') ease-out,
      transform v-bind('props.animationDuration + "ms"') ease-out;
  }

  .context-menu-enter-from,
  .context-menu-leave-to {
    opacity: 0;
    transform: scale(0.9);
  }

  .context-menu-enter-to,
  .context-menu-leave-from {
    opacity: 1;
    transform: scale(1);
  }
</style>
