<template>
  <ElDrawer
    ref="drawerRef"
    :model-value="visible"
    v-bind="drawerBindings"
    :class="[
      'art-drawer',
      drawerClass,
      {
        'is-fullscreen': isFullscreen,
        'is-fullscreen-toggle-enabled': options.showFullscreenButton,
        'is-focus-mode': isFocusMode
      }
    ]"
    @update:model-value="handleModelValueChange"
    @open="handleOpenedStart"
    @opened="handleOpened"
    @close="handleClosedStart"
    @closed="handleClosed"
    @open-auto-focus="emit('open-auto-focus')"
    @close-auto-focus="emit('close-auto-focus')"
    @resize-start="handleResizeStart"
    @resize="handleResize"
    @resize-end="handleResizeEnd"
  >
    <template
      v-if="
        $slots.header ||
        options.headerIcon ||
        hasSubtitle ||
        formCount ||
        options.showFullscreenButton
      "
      #header="{ titleId, titleClass }"
    >
      <div class="art-drawer__header">
        <div class="art-drawer__header-main">
          <slot v-if="$slots.header" name="header" :data="openData" :api="exposedApi" />
          <div v-else-if="options.headerIcon" class="flex min-w-0 items-center gap-3">
            <span
              class="grid size-10 shrink-0 place-items-center rounded bg-primary/10 text-xl text-primary"
              aria-hidden="true"
            >
              <ArtSvgIcon :icon="options.headerIcon" />
            </span>
            <div class="min-w-0">
              <span
                :id="titleId"
                class="block text-base font-semibold text-g-900"
                role="heading"
                :aria-level="String(drawerBindings.headerAriaLevel ?? '2')"
                >{{ drawerTitle }}</span
              >
              <div v-if="hasSubtitle && !isFocusMode" class="art-drawer__subtitle">
                <slot name="subtitle" :data="openData" :api="exposedApi">
                  {{ drawerSubtitle }}
                </slot>
              </div>
            </div>
          </div>
          <span
            v-else
            :id="titleId"
            :class="titleClass"
            role="heading"
            :aria-level="String(drawerBindings.headerAriaLevel ?? '2')"
            >{{ drawerTitle }}</span
          >
          <div
            v-if="hasSubtitle && !isFocusMode && ($slots.header || !options.headerIcon)"
            class="art-drawer__subtitle"
          >
            <slot name="subtitle" :data="openData" :api="exposedApi">
              {{ drawerSubtitle }}
            </slot>
          </div>
        </div>
        <ArtIconButton
          v-if="formCount"
          :icon="isFocusMode ? 'ri:focus-2-line' : 'ri:focus-3-line'"
          :label="isFocusMode ? '退出专注填单' : '进入专注填单'"
          :aria-pressed="isFocusMode"
          @click="toggleFocusMode"
        />
        <ArtIconButton
          v-if="options.showFullscreenButton"
          class="art-drawer__fullscreen-button"
          :icon="fullscreenIcon"
          :label="fullscreenLabel"
          @click.stop="toggleFullscreen"
        />
      </div>
    </template>

    <div class="art-drawer__viewport" :aria-busy="contentLoading">
      <ElScrollbar
        ref="scrollbarRef"
        :always="options.scrollbarAlways"
        :native="options.nativeScrollbar"
        class="art-drawer__scrollbar"
        :style="
          normalizedContentHeight
            ? {
                height: normalizedContentHeight,
                maxHeight: normalizedContentHeight
              }
            : undefined
        "
        @wheel.capture="handleWheelBoundary"
      >
        <div
          ref="contentRef"
          class="art-drawer__content"
          :inert="contentLoading"
          :aria-hidden="contentLoading"
        >
          <component
            :is="options.content"
            v-if="options.content"
            v-bind="options.contentProps"
            :data="openData"
            :drawer-api="exposedApi"
          />
          <slot v-else :data="openData" :loading="contentLoading" :api="exposedApi" />
        </div>
      </ElScrollbar>
      <ArtOverlayLoading
        v-if="contentLoading"
        :loading="true"
        :overlay="true"
        :text="options.loadingText"
        :background="options.loadingBackground"
        :custom-class="options.loadingCustomClass"
      />
    </div>

    <template v-if="options.showFooter" #footer>
      <slot name="footer" :data="openData" :loading="confirmLoading" :api="exposedApi">
        <div class="art-drawer__footer">
          <ElButton
            v-if="options.showCancelButton"
            :disabled="contentLoading || confirmLoading"
            @click="() => handleClose()"
          >
            {{ options.cancelText }}
          </ElButton>
          <ElButton
            v-if="options.showConfirmButton"
            type="primary"
            :loading="confirmLoading"
            :disabled="contentLoading || options.confirmDisabled"
            @click="handleConfirm"
          >
            {{ options.confirmText }}
          </ElButton>
        </div>
      </slot>
    </template>
  </ElDrawer>
</template>

<script setup lang="ts" generic="T = Record<string, unknown>">
  import type { ScrollbarInstance } from 'element-plus'
  import type {
    ArtDrawerEmits,
    ArtDrawerExpose,
    ArtDrawerOptions,
    ArtDrawerProps,
    ArtDrawerSlots,
    ArtScrollOptions
  } from './types'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import {
    artOverlayRequestScopeKey,
    mergeOverlayRecords,
    useArtOverlay
  } from '@/hooks/core/useArtOverlay'
  import { focusFirstInvalidFormField } from '@/utils/form/validation'
  import { handoffVerticalWheel } from '@/utils/ui/wheel-scroll'
  import { artFormFocusKey } from '@/components/core/forms/art-form/focus'

  defineOptions({
    name: 'ArtDrawer',
    inheritAttrs: false
  })

  const props = withDefaults(defineProps<ArtDrawerProps<T>>(), {
    title: '',
    subtitle: '',
    size: '40%',
    fullscreen: false,
    showFullscreenButton: true,
    fullscreenText: '全屏',
    exitFullscreenText: '退出全屏',
    direction: 'rtl',
    loading: false,
    loadingText: '',
    loadingBackground: '',
    loadingCustomClass: '',
    contentHeight: undefined,
    showFooter: true,
    showCancelButton: true,
    showConfirmButton: true,
    cancelText: '取消',
    confirmText: '确定',
    confirmDisabled: false,
    autoClose: true,
    resetOnClose: true,
    closeOnConfirmError: false,
    scrollbarAlways: false,
    nativeScrollbar: false,
    closeOnClickModal: true,
    closeOnPressEscape: true,
    showClose: true,
    lockScroll: true,
    modal: true,
    appendToBody: true,
    destroyOnClose: true,
    withHeader: true,
    resizable: undefined,
    modalFade: undefined,
    trapFocus: undefined,
    modalPenetrable: undefined
  })

  const emit = defineEmits<ArtDrawerEmits<T>>()
  const slots = defineSlots<ArtDrawerSlots<T>>()

  const handleResizeStart = (event: MouseEvent, size: number) => emit('resize-start', event, size)
  const handleResize = (event: MouseEvent, size: number) => emit('resize', event, size)
  const handleResizeEnd = (event: MouseEvent, size: number) => emit('resize-end', event, size)

  const attrs = useAttrs()
  const drawerRef = shallowRef<unknown>()
  const scrollbarRef = shallowRef<ScrollbarInstance>()
  const contentRef = ref<HTMLElement>()
  const formCount = ref(0)
  const isFocusMode = ref(false)
  const wasFullscreenBeforeFocus = ref(false)

  provide(artFormFocusKey, {
    focusMode: readonly(isFocusMode),
    registerForm: () => {
      formCount.value += 1
      return () => {
        formCount.value = Math.max(0, formCount.value - 1)
      }
    }
  })

  const getDefaultOptions = (): ArtDrawerOptions<T> => ({
    title: props.title,
    headerIcon: props.headerIcon,
    subtitle: props.subtitle,
    size: props.size,
    fullscreen: props.fullscreen,
    showFullscreenButton: props.showFullscreenButton,
    fullscreenText: props.fullscreenText,
    exitFullscreenText: props.exitFullscreenText,
    direction: props.direction,
    loading: props.loading,
    loadingText: props.loadingText,
    loadingBackground: props.loadingBackground,
    loadingCustomClass: props.loadingCustomClass,
    contentHeight: props.contentHeight,
    showFooter: props.showFooter,
    showCancelButton: props.showCancelButton,
    showConfirmButton: props.showConfirmButton,
    cancelText: props.cancelText,
    confirmText: props.confirmText,
    confirmDisabled: props.confirmDisabled,
    autoClose: props.autoClose,
    resetOnClose: props.resetOnClose,
    closeOnConfirmError: props.closeOnConfirmError,
    scrollbarAlways: props.scrollbarAlways,
    nativeScrollbar: props.nativeScrollbar,
    content: props.content,
    contentProps: props.contentProps,
    drawerProps: props.drawerProps,
    onOpen: props.onOpen,
    onConfirm: props.onConfirm,
    onClose: props.onClose,
    onReset: props.onReset
  })

  const mergeOptions = (
    base: ArtDrawerOptions<T>,
    override: Partial<ArtDrawerOptions<T>> = {}
  ): ArtDrawerOptions<T> => {
    return {
      ...base,
      ...override,
      contentProps: mergeOverlayRecords(base.contentProps, override.contentProps),
      drawerProps: mergeOverlayRecords(base.drawerProps, override.drawerProps)
    }
  }

  let exposedApi!: ArtDrawerExpose<T>
  const overlay = useArtOverlay<T, ArtDrawerExpose<T>, ArtDrawerOptions<T>>({
    getDefaultOptions,
    mergeOptions,
    getApi: () => exposedApi,
    emitConfirm: (data) => {
      if (!props.onConfirm || options.value.onConfirm !== props.onConfirm) emit('confirm', data)
    },
    emitReset: () => {
      if (!props.onReset || options.value.onReset !== props.onReset) emit('reset')
    },
    emitError: (error) => emit('error', error),
    onConfirmRejected: () => focusFirstInvalidFormField(contentRef)
  })

  provide(artOverlayRequestScopeKey, overlay.requestScope)

  const {
    visible,
    loading: contentLoading,
    confirmLoading,
    openData,
    options,
    handleOpen,
    handleClose,
    handleConfirm,
    handleReset,
    handleModelValueChange,
    setLoading,
    setConfirmLoading,
    setOptions,
    setData,
    updateData,
    getData
  } = overlay

  onDeactivated(() => {
    void handleClose(true)
  })

  const normalizedContentHeight = computed(() => {
    if (isFullscreen.value) return undefined
    const height = options.value.contentHeight
    return typeof height === 'number' ? `${height}px` : height
  })

  const drawerSizeMap = {
    sm: 'var(--art-drawer-width-sm)',
    md: 'var(--art-drawer-width-md)',
    lg: 'var(--art-drawer-width-lg)',
    xl: 'var(--art-drawer-width-xl)',
    full: 'calc(100vw - 12px)'
  } as const

  const normalizedDrawerSize = computed(() => {
    const configuredSize = isFullscreen.value
      ? 'full'
      : (options.value.size ?? (attrs.size as string | number | undefined) ?? '40%')
    const presetSize =
      typeof configuredSize === 'string' && configuredSize in drawerSizeMap
        ? drawerSizeMap[configuredSize as keyof typeof drawerSizeMap]
        : configuredSize
    const normalizedSize = typeof presetSize === 'number' ? `${presetSize}px` : presetSize
    const viewportSize = ['ttb', 'btt'].includes(options.value.direction ?? 'rtl')
      ? 'calc(100vh - 12px)'
      : 'calc(100vw - 12px)'
    return `min(${normalizedSize}, ${viewportSize})`
  })

  const drawerClass = computed(() => [
    attrs.class,
    (options.value.drawerProps as Record<string, unknown> | undefined)?.class
  ])
  const drawerTitle = computed(() => String(options.value.title ?? attrs.title ?? ''))
  const drawerSubtitle = computed(() => String(options.value.subtitle ?? ''))
  const hasSubtitle = computed(() => Boolean(slots.subtitle || drawerSubtitle.value))
  const isFullscreen = computed(() => Boolean(options.value.fullscreen))
  const fullscreenIcon = computed(() =>
    isFullscreen.value ? 'dashicons:fullscreen-exit-alt' : 'dashicons:fullscreen-alt'
  )
  const fullscreenLabel = computed(() =>
    isFullscreen.value
      ? String(options.value.exitFullscreenText ?? '退出全屏')
      : String(options.value.fullscreenText ?? '全屏')
  )

  const setFullscreen = (value: boolean) => {
    if (isFullscreen.value === value) return
    setOptions({ fullscreen: value } as Partial<ArtDrawerOptions<T>>)
    emit('fullscreen-change', value)
    void nextTick(() => window.dispatchEvent(new Event('resize')))
  }

  const toggleFullscreen = () => setFullscreen(!isFullscreen.value)
  const setFocusMode = (value: boolean) => {
    if (isFocusMode.value === value) return
    if (value) {
      wasFullscreenBeforeFocus.value = isFullscreen.value
      isFocusMode.value = true
      setFullscreen(true)
    } else {
      isFocusMode.value = false
      setFullscreen(wasFullscreenBeforeFocus.value)
    }
    emit('focus-change', value)
  }
  const toggleFocusMode = () => setFocusMode(!isFocusMode.value)

  watch(isFullscreen, (fullscreen) => {
    if (!fullscreen && isFocusMode.value) {
      isFocusMode.value = false
      emit('focus-change', false)
    }
  })

  watch(
    () => props.loading,
    (value) => setLoading(value)
  )

  const drawerBindings = computed<Record<string, unknown>>(() => {
    const runtimeProps = options.value.drawerProps ?? {}
    const inheritedAttrs = { ...attrs } as Record<string, unknown>
    delete inheritedAttrs.class
    const runtimeBindings = { ...runtimeProps }
    delete runtimeBindings.class
    delete inheritedAttrs.modelValue
    delete inheritedAttrs['onUpdate:modelValue']
    delete inheritedAttrs.onOpen
    delete inheritedAttrs.onOpened
    delete inheritedAttrs.onClose
    delete inheritedAttrs.onClosed
    delete inheritedAttrs.onOpenAutoFocus
    delete inheritedAttrs.onCloseAutoFocus
    delete inheritedAttrs.onResizeStart
    delete inheritedAttrs.onResize
    delete inheritedAttrs.onResizeEnd

    return {
      appendToBody: props.appendToBody,
      destroyOnClose: props.destroyOnClose,
      withHeader: props.withHeader,
      ...inheritedAttrs,
      appendTo: props.appendTo,
      zIndex: props.zIndex,
      openDelay: props.openDelay,
      closeDelay: props.closeDelay,
      modalClass: props.modalClass,
      headerClass: props.headerClass,
      bodyClass: props.bodyClass,
      footerClass: props.footerClass,
      closeIcon: props.closeIcon,
      transition: props.transition,
      headerAriaLevel: props.headerAriaLevel,
      resizable: props.resizable,
      modalFade: props.modalFade,
      trapFocus: props.trapFocus,
      modalPenetrable: props.modalPenetrable,
      closeOnClickModal: props.closeOnClickModal,
      closeOnPressEscape: props.closeOnPressEscape,
      showClose: props.showClose,
      lockScroll: props.lockScroll,
      modal: props.modal,
      ...runtimeBindings,
      beforeClose: (done: () => void) =>
        overlay.handleBeforeClose(
          done,
          runtimeBindings.beforeClose ??
            props.beforeClose ??
            inheritedAttrs.beforeClose ??
            inheritedAttrs['before-close']
        ),
      title: String(options.value.title ?? inheritedAttrs.title ?? ''),
      size: normalizedDrawerSize.value,
      direction: options.value.direction ?? inheritedAttrs.direction ?? 'rtl'
    }
  })

  const getDrawerInstance = () => drawerRef.value

  const scrollTo = (scrollOptions: ArtScrollOptions) => {
    if (typeof scrollOptions === 'number') scrollbarRef.value?.scrollTo(scrollOptions)
    else scrollbarRef.value?.scrollTo(scrollOptions)
  }

  const handleWheelBoundary = (event: WheelEvent): void => {
    const scrollOwner = scrollbarRef.value?.wrapRef
    handoffVerticalWheel(event, scrollOwner, scrollOwner)
  }

  const handleOpenedStart = () => {
    if (!props.onOpen || options.value.onOpen !== props.onOpen) emit('open', openData.value)
  }
  const handleOpened = () => emit('opened', openData.value)
  const handleClosedStart = () => {
    if (!props.onClose || options.value.onClose !== props.onClose) emit('close', openData.value)
  }

  const handleClosed = () => {
    if (isFocusMode.value) {
      isFocusMode.value = false
      emit('focus-change', false)
    }
    wasFullscreenBeforeFocus.value = false
    overlay.handleClosed()
    emit('closed')
  }

  exposedApi = {
    visible: readonly(visible),
    loading: readonly(contentLoading),
    confirmLoading: readonly(confirmLoading),
    data: readonly(openData) as Readonly<Ref<T>>,
    options: readonly(options) as Readonly<Ref<ArtDrawerOptions<T>>>,
    drawerRef: readonly(drawerRef),
    scrollbarRef: readonly(scrollbarRef),
    fullscreen: readonly(isFullscreen),
    focusMode: readonly(isFocusMode),
    handleOpen,
    handleClose,
    handleConfirm,
    handleReset,
    setLoading,
    setConfirmLoading,
    setOptions,
    setData,
    updateData,
    getData,
    getDrawerInstance,
    setFullscreen,
    toggleFullscreen,
    setFocusMode,
    toggleFocusMode,
    scrollTo
  }

  defineExpose(exposedApi)
</script>

<style scoped lang="scss">
  :global(.art-drawer) {
    max-width: 100vw;
  }

  @media (width <= 640px) {
    :global(.art-drawer) {
      width: calc(100vw - 12px) !important;
      max-width: calc(100vw - 12px);
    }
  }

  :global(.art-drawer.is-fullscreen) {
    width: calc(100vw - 12px) !important;
    max-width: calc(100vw - 12px);
  }

  :global(.art-drawer.is-focus-mode .art-drawer__content) {
    width: min(100%, 1120px);
    margin-inline: auto;
  }

  :global(.art-drawer.is-focus-mode .art-form .el-form-item) {
    margin-bottom: 14px;
  }

  :global(.art-drawer.is-focus-mode .art-entity-summary),
  :global(.art-drawer.is-focus-mode [data-art-overlay-focus-hide]) {
    display: none;
  }

  :global(.art-drawer .el-drawer__body) {
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 0;
    overflow: hidden;
    overscroll-behavior: contain;
  }

  .art-drawer__header-main {
    flex: 1;
    min-width: 0;
  }

  .art-drawer__header {
    display: flex;
    gap: 8px;
    align-items: center;
    width: 100%;
    min-width: 0;
  }

  .art-drawer__fullscreen-button {
    flex: 0 0 auto;
    font-size: 18px;
  }

  .art-drawer__subtitle {
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
    overflow-wrap: anywhere;
  }

  :global(.art-drawer .el-drawer__header .art-icon-button),
  :global(.art-drawer .el-drawer__close-btn) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    color: var(--el-text-color-secondary);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--art-control-radius);
    transition:
      color var(--art-motion-duration-fast) ease,
      background-color var(--art-motion-duration-fast) ease,
      box-shadow var(--art-motion-duration-fast) ease;
  }

  :global(.art-drawer .el-drawer__header .art-icon-button:hover),
  :global(.art-drawer .el-drawer__close-btn:hover) {
    color: var(--theme-color) !important;
    background: color-mix(in srgb, var(--theme-color) 10%, transparent) !important;
    border-color: transparent;
    box-shadow: var(--art-themed-action-hover-shadow);
  }

  :global(.art-drawer .el-drawer__header .art-icon-button:active),
  :global(.art-drawer .el-drawer__close-btn:active) {
    background: color-mix(in srgb, var(--theme-color) 16%, transparent) !important;
    box-shadow: var(--art-themed-action-active-shadow);
  }

  :global(.art-drawer .el-drawer__header .art-icon-button:focus-visible),
  :global(.art-drawer .el-drawer__close-btn:focus-visible) {
    color: var(--theme-color) !important;
    outline: none;
    background: color-mix(in srgb, var(--theme-color) 9%, transparent) !important;
    box-shadow: var(--art-themed-action-focus-shadow);
  }

  .art-drawer__content {
    box-sizing: border-box;
    min-height: 100%;
    padding: var(--art-drawer-content-padding, var(--el-drawer-padding-primary));
  }

  .art-drawer__viewport {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .art-drawer__scrollbar {
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;

    :deep(.el-scrollbar__wrap) {
      overscroll-behavior: contain;
    }
  }

  .art-drawer__footer {
    display: flex;
    gap: var(--art-space-2);
    align-items: center;
    justify-content: flex-end;

    > .el-button {
      min-width: 72px;
      margin-left: 0;
    }
  }
</style>
