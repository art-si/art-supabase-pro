<template>
  <ArtDialog
    ref="dialogRef"
    :width="width"
    :fullscreen="fullscreen"
    show-footer
    :use-scrollbar="false"
    :dialog-props="dialogProps"
    @closed="handleClosed"
  >
    <div class="art-resource-picker__content">
      <ResourcePanel
        v-model="modelValue"
        v-bind="panelProps"
        :footer-target="footerTarget"
        @cancel="handleCancel"
        @confirm="handleConfirm"
      />
    </div>
    <template #footer>
      <div ref="footerTarget" class="art-resource-picker__footer" />
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ResourcePanel from './panel.vue'
  import type { Resource, ResourcePanelProps } from './type.ts'

  defineOptions({ name: 'ArtResourcePicker' })

  interface ArtResourcePickerProps extends ResourcePanelProps {
    title?: string
    width?: string | number
    fullscreen?: boolean
  }

  const props = withDefaults(defineProps<ArtResourcePickerProps>(), {
    title: '资源选择器',
    width: '960px',
    fullscreen: false,
    multiple: false,
    limit: undefined,
    pageSize: 30,
    showAction: true,
    dbClickConfirm: false,
    defaultFileType: ''
  })

  const emit = defineEmits<{
    cancel: []
    confirm: [selected: Resource[]]
  }>()

  const visibleModel = defineModel<boolean>('visible', { default: false })
  const modelValue = defineModel<string | string[] | undefined>()
  const dialogRef = ref<ArtDialogExpose<void>>()
  const footerTarget = ref<HTMLElement>()

  const dialogProps = {
    appendToBody: true,
    closeOnClickModal: false
  }

  const panelProps = computed<ResourcePanelProps>(() => ({
    resourceTenantId: props.resourceTenantId,
    multiple: props.multiple,
    limit: props.limit,
    pageSize: props.pageSize,
    internalScroll: true,
    showAction: props.showAction,
    showCopyActions: props.showCopyActions,
    showPasteUpload: props.showPasteUpload,
    showRenameAction: props.showRenameAction,
    dbClickConfirm: props.dbClickConfirm,
    defaultFileType: props.defaultFileType,
    fileTypes: props.fileTypes
  }))

  const openDialog = async () => {
    await dialogRef.value?.handleOpen(undefined, {
      title: props.title,
      width: props.width,
      fullscreen: props.fullscreen,
      showFooter: true,
      useScrollbar: false
    })
  }

  const closeDialog = async () => {
    await dialogRef.value?.handleClose(true)
  }

  const handleCancel = () => {
    emit('cancel')
    visibleModel.value = false
    void closeDialog()
  }

  const handleConfirm = (selected: Resource[]) => {
    emit('confirm', selected)
    visibleModel.value = false
    void closeDialog()
  }

  const handleClosed = () => {
    visibleModel.value = false
  }

  watch(
    () => visibleModel.value,
    (visible) => {
      if (visible) {
        void openDialog()
        return
      }

      if (unref(dialogRef.value?.visible)) {
        void closeDialog()
      }
    },
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .art-resource-picker__content {
    height: min(620px, calc(100dvh - 176px));
    min-height: 0;
  }

  .art-resource-picker__footer {
    width: 100%;
  }
</style>
