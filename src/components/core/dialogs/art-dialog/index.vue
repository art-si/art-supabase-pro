<template>
  <ElDialog
    ref="dialogRef"
    :model-value="visible"
    v-bind="dialogBindings"
    :class="[
      'art-dialog',
      options.size ? `art-dialog--${options.size}` : '',
      dialogClass,
      { 'is-fullscreen-toggle-enabled': options.showFullscreenButton }
    ]"
    @update:model-value="handleModelValueChange"
    @open="handleOpenedStart"
    @opened="handleOpened"
    @close="handleClosedStart"
    @closed="handleClosed"
    @open-auto-focus="emit('open-auto-focus')"
    @close-auto-focus="emit('close-auto-focus')"
  >
    <template
      v-if="
        $slots.header ||
        hasSubtitle ||
        $slots['header-actions'] ||
        formCount ||
        options.showFullscreenButton
      "
      #header="{ titleId, titleClass }"
    >
      <div class="art-dialog__header">
        <div
          class="art-dialog__header-main"
          :class="{ 'has-header-actions': $slots['header-actions'] || formCount }"
        >
          <slot v-if="$slots.header" name="header" :data="openData" :api="exposedApi" />
          <span
            v-else
            :id="titleId"
            :class="titleClass"
            role="heading"
            :aria-level="String(dialogBindings.headerAriaLevel ?? '2')"
            >{{ dialogTitle }}</span
          >
          <div v-if="hasSubtitle && !isFocusMode" class="art-dialog__subtitle">
            <slot name="subtitle" :data="openData" :api="exposedApi">
              {{ dialogSubtitle }}
            </slot>
          </div>
        </div>
        <div v-if="$slots['header-actions'] || formCount" class="art-dialog__header-actions">
          <slot name="header-actions" :data="openData" :api="exposedApi" />
          <ArtIconButton
            v-if="formCount"
            :icon="isFocusMode ? 'ri:focus-2-line' : 'ri:focus-3-line'"
            :label="isFocusMode ? '退出专注填单' : '进入专注填单'"
            :aria-pressed="isFocusMode"
            @click="toggleFocusMode"
          />
        </div>
        <ArtIconButton
          v-if="options.showFullscreenButton"
          class="el-dialog__headerbtn art-dialog__fullscreen-button"
          :icon="fullscreenIcon"
          :label="fullscreenLabel"
          @click.stop="toggleFullscreen"
        />
      </div>
    </template>

    <div
      class="art-dialog__viewport"
      :class="{ 'is-loading': contentLoading }"
      :style="{ '--art-dialog-loading-min-height': normalizedContentHeight || undefined }"
      :aria-busy="contentLoading"
    >
      <ElScrollbar
        v-if="shouldUseScrollbar"
        ref="scrollbarRef"
        :height="normalizedContentHeight"
        :max-height="normalizedContentMaxHeight"
        :always="options.scrollbarAlways"
        :native="options.nativeScrollbar"
        class="art-dialog__scrollbar"
        @wheel.capture="handleWheelBoundary"
      >
        <div
          ref="contentRef"
          class="art-dialog__content"
          :inert="contentLoading"
          :aria-hidden="contentLoading"
        >
          <component
            :is="options.content"
            v-if="options.content"
            v-bind="options.contentProps"
            :data="openData"
            :dialog-api="exposedApi"
          />
          <slot v-else :data="openData" :loading="contentLoading" :api="exposedApi" />
        </div>
      </ElScrollbar>
      <div
        v-else
        ref="contentRef"
        class="art-dialog__content"
        :inert="contentLoading"
        :aria-hidden="contentLoading"
      >
        <component
          :is="options.content"
          v-if="options.content"
          v-bind="options.contentProps"
          :data="openData"
          :dialog-api="exposedApi"
        />
        <slot v-else :data="openData" :loading="contentLoading" :api="exposedApi" />
      </div>
      <ArtOverlayLoading
        v-if="contentLoading"
        loading
        overlay
        :text="options.loadingText"
        :background="options.loadingBackground"
        :custom-class="options.loadingCustomClass"
      />
    </div>

    <template v-if="options.showFooter" #footer>
      <slot name="footer" :data="openData" :loading="confirmLoading" :api="exposedApi">
        <div class="art-dialog__footer" :class="{ 'has-left': $slots['footer-left'] }">
          <div v-if="$slots['footer-left']" class="art-dialog__footer-left">
            <slot name="footer-left" :data="openData" :loading="confirmLoading" :api="exposedApi" />
          </div>
          <div class="art-dialog__footer-actions">
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
        </div>
      </slot>
    </template>
  </ElDialog>
</template>

<script setup lang="ts" generic="T = Record<string, unknown>">
  import type { DialogInstance, ScrollbarInstance } from 'element-plus'
  import type {
    ArtDialogEmits,
    ArtDialogExpose,
    ArtDialogOptions,
    ArtDialogProps,
    ArtDialogSlots,
    ArtScrollOptions
  } from './types'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import {
    artOverlayRequestScopeKey,
    mergeOverlayRecords,
    useArtOverlay
  } from '@/hooks/core/useArtOverlay'
  import { focusFirstInvalidFormField } from '@/utils/form/validation'
  import { handoffVerticalWheel } from '@/utils/ui/wheel-scroll'
  import { artFormFocusKey } from '@/components/core/forms/art-form/focus'

  defineOptions({
    name: 'ArtDialog',
    inheritAttrs: false
  })

  const props = withDefaults(defineProps<ArtDialogProps<T>>(), {
    title: '',
    subtitle: '',
    width: undefined,
    size: undefined,
    fullscreen: false,
    showFullscreenButton: true,
    fullscreenText: '全屏',
    exitFullscreenText: '退出全屏',
    loading: false,
    loadingText: '',
    loadingBackground: '',
    loadingCustomClass: '',
    contentHeight: undefined,
    contentMaxHeight: undefined,
    useScrollbar: true,
    closeOnRouteChange: true,
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
    draggable: true,
    alignCenter: true,
    center: undefined,
    overflow: undefined,
    trapFocus: undefined,
    modalPenetrable: undefined
  })

  const emit = defineEmits<ArtDialogEmits<T>>()

  const DEFAULT_CONTENT_MAX_HEIGHT = 'min(70vh, calc(100vh - 200px))'
  const MAX_CONTENT_VIEWPORT_HEIGHT = 'calc(100dvh - 160px)'

  const attrs = useAttrs()
  const route = useRoute()
  const slots = defineSlots<ArtDialogSlots<T>>()
  const dialogRef = shallowRef<DialogInstance>()
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

  const getDefaultOptions = (): ArtDialogOptions<T> => ({
    title: props.title,
    subtitle: props.subtitle,
    width: props.width,
    size: props.size,
    fullscreen: props.fullscreen,
    showFullscreenButton: props.showFullscreenButton,
    fullscreenText: props.fullscreenText,
    exitFullscreenText: props.exitFullscreenText,
    loading: props.loading,
    loadingText: props.loadingText,
    loadingBackground: props.loadingBackground,
    loadingCustomClass: props.loadingCustomClass,
    contentHeight: props.contentHeight,
    contentMaxHeight: props.contentMaxHeight,
    useScrollbar: props.useScrollbar,
    closeOnRouteChange: props.closeOnRouteChange,
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
    dialogProps: props.dialogProps,
    onOpen: props.onOpen,
    onConfirm: props.onConfirm,
    onClose: props.onClose,
    onReset: props.onReset
  })

  const mergeOptions = (
    base: ArtDialogOptions<T>,
    override: Partial<ArtDialogOptions<T>> = {}
  ): ArtDialogOptions<T> => {
    return {
      ...base,
      ...override,
      contentProps: mergeOverlayRecords(base.contentProps, override.contentProps),
      dialogProps: mergeOverlayRecords(base.dialogProps, override.dialogProps)
    }
  }

  let exposedApi!: ArtDialogExpose<T>
  const overlay = useArtOverlay<T, ArtDialogExpose<T>, ArtDialogOptions<T>>({
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

  const normalizeSize = (value?: string | number) => {
    return typeof value === 'number' ? `${value}px` : value
  }

  const clampContentSizeToViewport = (value?: string) => {
    return value ? `min(${value}, ${MAX_CONTENT_VIEWPORT_HEIGHT})` : undefined
  }

  const dialogSizeMap = {
    sm: 'var(--art-dialog-width-sm)',
    md: 'var(--art-dialog-width-md)',
    lg: 'var(--art-dialog-width-lg)',
    xl: 'var(--art-dialog-width-xl)',
    full: 'calc(100vw - 24px)'
  } as const

  const isFullscreen = computed(() => Boolean(options.value.fullscreen))

  const normalizedDialogWidth = computed(() => {
    const inheritedWidth = attrs.width as string | number | undefined
    const presetWidth = options.value.size ? dialogSizeMap[options.value.size] : undefined
    const configuredWidth = options.value.width ?? inheritedWidth
    const width = normalizeSize(configuredWidth ?? presetWidth ?? '50%')
    if (!width) return undefined
    return `min(${width}, calc(100vw - 32px))`
  })

  const normalizedContentHeight = computed(() => {
    if (isFullscreen.value) return undefined
    const height = options.value.contentHeight
    return clampContentSizeToViewport(normalizeSize(height))
  })

  const normalizedContentMaxHeight = computed(() => {
    if (isFullscreen.value) return undefined
    return clampContentSizeToViewport(
      normalizeSize(
        options.value.contentMaxHeight ?? options.value.contentHeight ?? DEFAULT_CONTENT_MAX_HEIGHT
      )
    )
  })

  const shouldUseScrollbar = computed(() => {
    return Boolean(
      options.value.useScrollbar !== false &&
      (isFullscreen.value || normalizedContentHeight.value || normalizedContentMaxHeight.value)
    )
  })

  const dialogClass = computed(() => [
    attrs.class,
    (options.value.dialogProps as Record<string, unknown> | undefined)?.class,
    { 'is-focus-mode': isFocusMode.value }
  ])

  const dialogTitle = computed(() => String(options.value.title ?? attrs.title ?? ''))
  const dialogSubtitle = computed(() => String(options.value.subtitle ?? ''))
  const hasSubtitle = computed(() => Boolean(slots.subtitle || dialogSubtitle.value))
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
    setOptions({ fullscreen: value } as Partial<ArtDialogOptions<T>>)
    emit('fullscreen-change', value)
  }

  const toggleFullscreen = () => {
    setFullscreen(!isFullscreen.value)
  }

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

  watch(
    () => route.fullPath,
    (currentPath, previousPath) => {
      if (
        currentPath !== previousPath &&
        visible.value &&
        options.value.closeOnRouteChange !== false
      ) {
        void handleClose(true)
      }
    }
  )

  const dialogBindings = computed<Record<string, unknown>>(() => {
    const runtimeProps = options.value.dialogProps ?? {}
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

    return {
      alignCenter: props.alignCenter,
      appendToBody: props.appendToBody,
      destroyOnClose: props.destroyOnClose,
      draggable: props.draggable,
      ...inheritedAttrs,
      appendTo: props.appendTo,
      top: props.top,
      zIndex: props.zIndex,
      openDelay: props.openDelay,
      closeDelay: props.closeDelay,
      modalClass: props.modalClass,
      headerClass: props.headerClass,
      bodyClass: props.bodyClass,
      footerClass: props.footerClass,
      closeIcon: props.closeIcon,
      headerAriaLevel: props.headerAriaLevel,
      center: props.center,
      overflow: props.overflow,
      trapFocus: props.trapFocus,
      modalPenetrable: props.modalPenetrable,
      transition: props.transition,
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
      title: dialogTitle.value,
      width: normalizedDialogWidth.value,
      fullscreen: Boolean(options.value.fullscreen)
    }
  })

  const getDialogInstance = () => dialogRef.value

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
    fullscreen: readonly(isFullscreen),
    focusMode: readonly(isFocusMode),
    options: readonly(options) as Readonly<Ref<ArtDialogOptions<T>>>,
    dialogRef: readonly(dialogRef),
    scrollbarRef: readonly(scrollbarRef),
    handleOpen,
    handleClose,
    handleConfirm,
    handleReset,
    setLoading,
    setConfirmLoading,
    setFullscreen,
    toggleFullscreen,
    setFocusMode,
    toggleFocusMode,
    setOptions,
    setData,
    updateData,
    getData,
    getDialogInstance,
    scrollTo
  }

  defineExpose(exposedApi)
</script>

<style scoped lang="scss">
  :global(.art-dialog) {
    max-width: calc(100vw - 32px);
  }

  :global(.art-dialog:not(.is-fullscreen)) {
    display: flex;
    flex-direction: column;
    max-height: calc(100dvh - 16px);
    overflow: hidden;
  }

  :global(.art-dialog:not(.is-fullscreen) > .el-dialog__header),
  :global(.art-dialog:not(.is-fullscreen) > .el-dialog__footer) {
    flex: none;
  }

  :global(.art-dialog:not(.is-fullscreen) > .el-dialog__body) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(.art-dialog > .el-dialog__body) {
    overscroll-behavior: contain;
  }

  :global(.art-dialog.is-fullscreen) {
    display: flex;
    flex-direction: column;
    max-width: none;
    overflow: hidden;
  }

  :global(.art-dialog.is-fullscreen > .el-dialog__header),
  :global(.art-dialog.is-fullscreen > .el-dialog__footer) {
    flex: none;
  }

  :global(.art-dialog.is-fullscreen > .el-dialog__body) {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(.art-dialog.is-fullscreen .art-dialog__viewport),
  :global(.art-dialog.is-fullscreen .art-dialog__viewport > .art-dialog__content),
  :global(.art-dialog.is-fullscreen .art-dialog__scrollbar) {
    height: 100%;
    min-height: 0;
  }

  :global(.art-dialog.is-focus-mode .art-dialog__content) {
    box-sizing: border-box;
    width: min(100%, 1120px);
    margin-inline: auto;
  }

  :global(.art-dialog.is-focus-mode .art-form .el-form-item) {
    margin-bottom: 14px;
  }

  :global(.art-dialog.is-focus-mode .art-entity-summary),
  :global(.art-dialog.is-focus-mode [data-art-dialog-focus-hide]) {
    display: none;
  }

  .art-dialog {
    &__header {
      display: flex;
      align-items: center;
      min-width: 0;
      min-height: 24px;
    }

    &__header-main {
      flex: 1;
      min-width: 0;

      &.has-header-actions {
        padding-right: 72px;
      }
    }

    &__header-actions {
      position: absolute;
      top: 12px;
      right: 92px;
      display: flex;
      gap: 8px;
      align-items: center;
      min-height: 32px;
    }

    &__fullscreen-button {
      right: 52px !important;
    }

    &__viewport {
      position: relative;
      min-width: 0;

      &.is-loading {
        min-height: min(
          var(--art-dialog-loading-min-height, clamp(320px, 54dvh, 580px)),
          calc(100dvh - 220px)
        );
      }
    }

    &__content {
      box-sizing: border-box;
      min-height: 1px;
      padding: var(
        --art-dialog-content-padding,
        var(--art-space-4) var(--art-space-5) var(--art-space-5)
      );
    }

    &__subtitle {
      margin-top: 3px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 13px;
      line-height: 20px;
      color: var(--el-text-color-secondary);
      overflow-wrap: anywhere;
    }

    &__scrollbar {
      width: 100%;

      :deep(.el-scrollbar__wrap) {
        overscroll-behavior: contain;
      }
    }

    &__footer {
      display: flex;
      gap: 0;
      align-items: center;
      justify-content: flex-end;
      width: 100%;

      &.has-left {
        justify-content: space-between;
      }
    }

    &__footer-left {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 14px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
    }

    &__footer-actions {
      display: flex;
      flex: none;
      gap: var(--art-space-2);

      > .el-button {
        min-width: 72px;
        margin-left: 0;
      }
    }
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn) {
    top: 12px;
    right: 16px;
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
      border-color var(--art-motion-duration-fast) ease,
      box-shadow var(--art-motion-duration-fast) ease;
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn:hover) {
    color: var(--theme-color);
    background: color-mix(in srgb, var(--theme-color) 9%, transparent);
    border-color: transparent;
    box-shadow: var(--art-themed-action-hover-shadow);
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn:focus-visible) {
    color: var(--theme-color);
    outline: none;
    box-shadow: var(--art-themed-action-focus-shadow);
  }

  :global(.art-dialog > .el-dialog__header .el-dialog__headerbtn .el-dialog__close) {
    position: static;
    width: 18px;
    height: 18px;
    color: currentcolor;
    background: transparent !important;
    border-radius: 0;
  }

  :global(.art-dialog > .el-dialog__body .art-dialog__content > .art-form) {
    padding: 0 !important;
  }
</style>
