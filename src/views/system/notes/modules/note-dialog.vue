<template>
  <ArtDialog ref="dialogRef" size="lg">
    <ArtForm
      ref="formRef"
      v-model="form.data"
      :items="form.items"
      :rules="form.rules"
      :span="12"
      :gutter="20"
      label-width="92px"
    />
    <p class="note-dialog__hint">新增笔记会归属当前登录账号；编辑时会保留移动端已上传的图片。</p>
  </ArtDialog>
</template>

<script setup lang="ts">
  import type { FormRules } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { addNote, editNote } from '@/api/notes'

  type NoteItem = Api.Notes.NoteItem

  interface NoteForm {
    id?: string
    content: string
    tagsText: string
    images: string[]
  }

  interface NoteFormGroup {
    data: NoteForm
    items: FormItem[]
    rules: FormRules
  }

  interface NoteDialogExpose {
    handleOpen: (row?: NoteItem) => Promise<void>
  }

  const emit = defineEmits<{ success: [type: 'add' | 'edit'] }>()
  const dialogRef = ref<ArtDialogExpose<NoteForm>>()
  const formRef = ref<InstanceType<typeof ArtForm>>()
  const createInitialForm = (): NoteForm => ({
    content: '',
    tagsText: '',
    images: []
  })

  const form = ref<NoteFormGroup>({
    data: createInitialForm(),
    items: [
      {
        key: 'tagsText',
        label: '标签',
        type: 'input',
        span: 12,
        props: { maxlength: 320, placeholder: '多个标签用逗号分隔，最多 8 个' }
      },
      {
        key: 'content',
        label: '笔记内容',
        type: 'input',
        span: 24,
        props: {
          type: 'textarea',
          rows: 12,
          maxlength: 20000,
          showWordLimit: true,
          placeholder: '支持移动端编辑器输出的 HTML，也可直接输入纯文本'
        }
      }
    ],
    rules: {
      content: [
        { required: true, message: '请输入笔记内容', trigger: 'blur' },
        { min: 1, max: 20000, message: '笔记内容长度需为 1–20000 个字符', trigger: 'blur' }
      ]
    }
  })

  function replaceForm(row?: NoteItem): void {
    const next = createInitialForm()
    if (row) {
      next.id = row.id
      next.content = row.content
      next.tagsText = row.tags.join('，')
      next.images = [...row.images]
    }
    form.value.data = next
  }

  async function handleSubmit(): Promise<boolean> {
    if (!(await validateArtFormForSubmit(formRef.value))) return false
    const tags = form.value.data.tagsText
      .split(/[，,]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
    const payload: Api.Notes.NotePayload = {
      id: form.value.data.id,
      content: form.value.data.content,
      tags,
      images: form.value.data.images
    }
    if (payload.id) {
      await editNote(payload)
      emit('success', 'edit')
    } else {
      await addNote(payload)
      emit('success', 'add')
    }
    return true
  }

  async function handleOpen(row?: NoteItem): Promise<void> {
    replaceForm(row)
    await dialogRef.value?.handleOpen(form.value.data, {
      title: row?.id ? '编辑时光笔记' : '新增时光笔记',
      subtitle: row?.id
        ? '更新笔记正文与标签，图片附件保持不变。'
        : '新增记录默认写入当前登录账号。',
      confirmText: row?.id ? '保存修改' : '创建笔记',
      contentMaxHeight: '72vh',
      onConfirm: handleSubmit,
      onReset: () => replaceForm(row)
    })
  }

  defineExpose<NoteDialogExpose>({ handleOpen })
</script>

<style scoped lang="scss">
  .note-dialog__hint {
    margin: -4px 0 0 92px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--el-text-color-secondary);
  }
</style>
