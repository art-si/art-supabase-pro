<template>
  <ArtDialog
    ref="dialogRef"
    size="lg"
    :confirm-disabled="!formRef?.readyToSubmit"
    @fullscreen-change="fullscreen = $event"
  >
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="form.items"
      :rules="form.rules"
      :root-class="fullscreen ? 'note-editor-form--fullscreen' : undefined"
      :span="12"
      :gutter="20"
      label-position="top"
      label-width="auto"
    >
      <template #content="{ value, setValue }">
        <ArtTiptapEditor
          class="note-editor"
          :model-value="typeof value === 'string' ? value : ''"
          height="280px"
          :fill-height="fullscreen"
          :max-length="20000"
          placeholder="记录此刻的想法…"
          :disabled="saving"
          :exclude-keys="['video', 'audio', 'file']"
          :image-upload="imageUpload"
          @update:model-value="updateContent($event, setValue)"
        />
      </template>
    </ArtForm>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { ElButton, ElMessage, type FormRules } from 'element-plus'
  import { h, nextTick, type ComputedRef } from 'vue'
  import { uniq } from 'lodash-es'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtTiptapEditor from '@/components/core/forms/art-tiptap-editor/index.vue'
  import type { ArtTiptapImageUpload } from '@/components/core/forms/art-tiptap-editor/types'
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { normalizeNonNullableText } from '@/utils/form/normalize'
  import { createTenantScopeReadGuard } from '@/utils/tenant-scope-context'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { fetchNoteImageUrls, getNoteActorId, saveNote, uploadNoteImage } from '@/api/notes'
  import {
    getNoteImageKeys,
    hydrateNoteContent,
    refreshNoteImageSources,
    serializeNoteContent
  } from './note-content'

  type NoteItem = Api.Notes.NoteItem
  const imageExtensions = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif']
  ])
  const imageLimit = 9
  const tagLimit = 8
  const tagLength = 40

  interface NoteForm {
    id: string
    content: string
    tags: string[]
  }

  interface NoteFormGroup {
    data: NoteForm
    items: ComputedRef<FormItem[]>
    rules: FormRules
  }

  interface StagedImage {
    file: File
    extension: string
    previewUrl: string
    path?: string
  }

  interface NoteDialogExpose {
    handleOpen: (row?: NoteItem) => Promise<void>
  }

  const emit = defineEmits<{ success: [type: 'add' | 'edit'] }>()
  const dialogRef = ref<ArtDialogExpose<NoteForm>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const originalNote = shallowRef<NoteItem>()
  const unavailablePaths = ref<string[]>([])
  const loadingImages = ref(false)
  const saving = ref(false)
  const fullscreen = ref(false)
  const stagedImages = new Map<string, StagedImage>()
  let dialogVersion = 0
  const imageKeys = computed(() => getNoteImageKeys(form.data.content))
  const imageUpload = computed<ArtTiptapImageUpload>(() => ({
    upload: stageImage,
    accept: [...imageExtensions.keys()].join(','),
    maxSize: 10 * 1024 * 1024,
    disabled: imageKeys.value.length >= imageLimit
  }))
  const createInitialForm = (): NoteForm => ({
    id: '',
    content: '',
    tags: []
  })

  const form = reactive<NoteFormGroup>({
    data: createInitialForm(),
    items: computed(() => [
      {
        key: 'tags',
        label: '标签',
        type: 'inputTag',
        span: 12,
        props: {
          max: tagLimit,
          maxlength: tagLength,
          delimiter: /[,，]/,
          disabled: saving.value,
          placeholder: '输入标签后按回车'
        }
      },
      {
        key: 'content',
        label: '笔记内容',
        type: 'slot',
        span: 24,
        formItemProps: { class: 'note-editor-field' },
        description: renderImageDescription
      }
    ]),
    rules: {
      content: [
        { required: true, message: '请输入笔记内容', trigger: 'blur' },
        { min: 1, max: 20000, message: '笔记内容长度需为 1–20000 个字符', trigger: 'blur' }
      ]
    }
  })

  function updateContent(value: string, setValue: (value: string) => void): void {
    setValue(value)
    void nextTick(() => formRef.value?.validateField('content', () => undefined))
  }

  function renderImageDescription() {
    const unavailable = unavailablePaths.value.filter((path) => imageKeys.value.includes(path))
    if (loadingImages.value) return h('span', { role: 'status' }, '正在读取已保存的图片…')
    if (unavailable.length) {
      return h('span', { class: 'inline-flex flex-wrap items-center gap-2', role: 'status' }, [
        `${unavailable.length} 张图片暂时无法预览`,
        h(
          ElButton,
          { link: true, type: 'primary', onClick: () => loadImages(unavailable) },
          () => '重试加载图片'
        )
      ])
    }
    return imageKeys.value.length >= imageLimit ? '已达到每条笔记的 9 张图片上限。' : undefined
  }

  async function loadImages(paths: string[], initial = false): Promise<void> {
    const note = originalNote.value
    const version = dialogVersion
    if (!note || !paths.length || loadingImages.value) return
    const assertScope = createTenantScopeReadGuard()
    loadingImages.value = true
    try {
      const signed = await fetchNoteImageUrls(paths)
      assertScope()
      if (version !== dialogVersion) return
      form.data.content = initial
        ? hydrateNoteContent(note.content, paths, signed)
        : refreshNoteImageSources(form.data.content, signed)
      unavailablePaths.value = paths.filter((path) => !signed.has(path))
    } catch (error) {
      notifyFriendlyError(error, '图片加载失败，请重试')
    } finally {
      if (version === dialogVersion) loadingImages.value = false
    }
  }

  async function stageImage(file: File): Promise<Api.DataCenter.Resources.ResourceListItem[]> {
    const extension = imageExtensions.get(file.type)
    if (!extension) throw new Error('请选择 JPG、PNG、WebP 或 GIF 图片')
    if (imageKeys.value.length >= imageLimit) throw new Error('每条笔记最多可添加 9 张图片')
    const key = crypto.randomUUID()
    const previewUrl = URL.createObjectURL(file)
    stagedImages.set(key, { file, extension, previewUrl })
    return [{ url: previewUrl, storagePath: key, originName: file.name, mimeType: file.type }]
  }

  function clearStagedImages(): void {
    for (const image of stagedImages.values()) URL.revokeObjectURL(image.previewUrl)
    stagedImages.clear()
  }

  onScopeDispose(clearStagedImages)

  function resetForm(): void {
    dialogVersion++
    clearStagedImages()
    fullscreen.value = false
    originalNote.value = undefined
    unavailablePaths.value = []
    loadingImages.value = false
    form.data = createInitialForm()
  }

  async function handleSubmit(assertScope: () => void): Promise<boolean> {
    if (!(await validateArtFormForSubmit(formRef.value))) return false
    const data = form.data
    const note = originalNote.value
    saving.value = true
    try {
      const pathsByKey = new Map<string, string>()
      let ownerId = note?.userId
      for (const key of imageKeys.value) {
        const image = stagedImages.get(key)
        if (image) {
          assertScope()
          if (!image.path) {
            ownerId ??= await getNoteActorId()
            assertScope()
            const path = `${ownerId}/web/${data.id}/${key}.${image.extension}`
            await uploadNoteImage(path, image.file)
            image.path = path
          }
          pathsByKey.set(key, image.path)
        } else if (note?.images.includes(key)) {
          pathsByKey.set(key, key)
        }
      }
      assertScope()
      await saveNote({
        id: data.id,
        content: serializeNoteContent(data.content, pathsByKey),
        tags: uniq(
          data.tags.map((tag) => normalizeNonNullableText(tag).slice(0, tagLength)).filter(Boolean)
        ).slice(0, tagLimit),
        images: [...pathsByKey.values()],
        expectedUpdatedAt: note?.updatedAt
      })
      ElMessage.success(note ? '笔记已保存' : '笔记已创建')
      emit('success', note ? 'edit' : 'add')
      return true
    } catch (error) {
      notifyFriendlyError(error, '笔记保存失败，请检查后重试')
      return false
    } finally {
      saving.value = false
    }
  }

  async function handleOpen(row?: NoteItem): Promise<void> {
    resetForm()
    originalNote.value = row
    form.data = {
      id: row?.id ?? crypto.randomUUID(),
      content: hydrateNoteContent(row?.content ?? '', row?.images ?? [], new Map()),
      tags: [...(row?.tags ?? [])]
    }
    const assertScope = createTenantScopeReadGuard()
    await dialogRef.value?.handleOpen(form.data, {
      title: row ? '编辑时光笔记' : '新增时光笔记',
      subtitle: row ? undefined : '新增笔记归属当前登录账号。',
      confirmText: row ? '保存修改' : '创建笔记',
      contentMaxHeight: '72vh',
      loading: Boolean(row?.images.length),
      onOpen: async (_data, api) => {
        try {
          await loadImages(row?.images ?? [], true)
        } finally {
          api.setLoading(false)
        }
      },
      onClose: () => !saving.value,
      onConfirm: () => handleSubmit(assertScope),
      onReset: resetForm
    })
  }

  defineExpose<NoteDialogExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  .note-editor {
    :deep(.tiptap img) {
      width: auto;
      max-width: min(100%, 320px);
      height: auto;
      max-height: 200px;
      object-fit: contain;
    }
  }

  .note-editor-form--fullscreen {
    flex: 1;
    min-height: 0;

    :deep(.el-form),
    :deep(.el-form > .el-row) {
      height: 100%;
    }

    :deep(.el-form > .el-row) {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      grid-template-columns: minmax(0, 1fr);
    }

    :deep([data-art-form-item-key='content']),
    :deep(.note-editor-field),
    :deep(.note-editor-field > .el-form-item__content),
    :deep(.note-editor-field .art-form-item__content) {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    :deep(.note-editor-field > .el-form-item__content) {
      flex-wrap: nowrap;
      align-items: stretch;
    }

    :deep(.note-editor-field:not(.is-error)) {
      margin-bottom: 0;
    }
  }
</style>
