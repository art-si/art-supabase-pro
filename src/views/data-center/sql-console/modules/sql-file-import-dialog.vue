<template>
  <ArtDialog
    ref="dialog"
    size="lg"
    :show-form-focus-button="false"
    confirm-text="导入新页签"
    cancel-text="取消导入"
    :on-confirm="confirmImport"
    :on-close="beforeClose"
    @closed="emit('closed')"
  >
    <div class="flex min-w-0 flex-col gap-4">
      <div class="flex min-w-0 flex-wrap items-center justify-between gap-2 text-xs text-g-700">
        <span class="min-w-0 break-all font-medium">{{ file?.name || '尚未选择文件' }}</span>
        <span class="shrink-0">{{ formatSize(file?.size) }} · 仅在当前内存中读取</span>
      </div>
      <ArtForm
        v-model="selection"
        :items="encodingItems"
        :disabled="importing"
        label-position="left"
        :label-width="80"
        class="px-0! pt-0!"
      />
      <p class="m-0 text-xs leading-5 text-g-700">
        {{ bomHint }}。无法解码时请手动选择编码，不会自动猜测 GBK；文件不会自动执行。
      </p>
      <ArtSectionCard
        title="SQL 文件预览"
        :subtitle="
          preview.truncated
            ? '仅预览前 100 行 / 20,000 字符；确认后导入完整原文。'
            : '预览全部文本；确认后导入完整 SQL 文本。'
        "
        :loading="reading"
        :error="readError || decodeError"
        error-title="文件尚未就绪"
        :empty="!text"
        empty-title="尚无可导入的 SQL"
        empty-description="选择一个不超过 1 MB 的 .sql 文件，核对编码与预览后再导入。"
        :min-height="200"
        :show-scrollbar="false"
      >
        <template #loading>
          <p class="m-0 py-12 text-center text-sm text-g-700" role="status">正在读取 SQL 文件…</p>
        </template>
        <template #error-action>
          <ElButton :disabled="importing || !file" @click="retry">
            {{ bytes ? '重新解码' : '重试读取' }}
          </ElButton>
        </template>
        <PlanCodePreview
          title="SQL 预览"
          :code="preview.code"
          language="sql"
          expanded
          max-height="320px"
        />
      </ArtSectionCard>
      <p v-if="confirmError" class="m-0 text-xs leading-5 text-g-700" role="status">{{
        confirmError
      }}</p>
    </div>
    <template #footer-left>
      <ElButton :disabled="importing" aria-label="重新选择文件" @click="chooseFile"
        >重新选择</ElButton
      >
    </template>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import { formatSize } from '@/utils/file'
  import PlanCodePreview from './plan-code-preview.vue'
  import {
    decodeSqlFile,
    getSqlFilePreview,
    inspectSqlFileBom,
    sqlFileEncodingOptions,
    SqlFileImportError,
    validateSqlFile,
    type SqlFileEncoding
  } from './sql-file-import'

  const props = defineProps<{
    scope: string
    importSql: (sql: string) => Promise<boolean>
  }>()
  const emit = defineEmits<{ 'choose-file': []; closed: [] }>()
  const dialog = ref<ArtDialogExpose>()
  const file = shallowRef<File | null>(null)
  const bytes = shallowRef<Uint8Array | null>(null)
  const text = ref('')
  const selection = ref<{ encoding: SqlFileEncoding }>({ encoding: 'utf-8' })
  const reading = ref(false)
  const importing = ref(false)
  const readError = ref('')
  const decodeError = ref('')
  const confirmError = ref('')
  const active = ref(false)
  const bomHint = ref('无编码标记时默认严格按 UTF-8 读取')
  const preview = computed(() => getSqlFilePreview(text.value))
  const canConfirm = computed(
    () =>
      active.value &&
      !reading.value &&
      !importing.value &&
      Boolean(text.value) &&
      !readError.value &&
      !decodeError.value
  )
  watch(canConfirm, (ready) => dialog.value?.setOptions({ confirmDisabled: !ready }), {
    flush: 'sync'
  })
  const encodingItems: FormItem[] = [
    {
      key: 'encoding',
      label: '文件编码',
      span: 24,
      type: 'select',
      options: sqlFileEncodingOptions,
      props: {
        clearable: false,
        'aria-label': 'SQL 文件编码'
      }
    }
  ]
  let generation = 0
  let alive = true
  let manualEncoding = false
  let settingDefault = false
  const reset = (): void => {
    generation++
    active.value = false
    file.value = null
    bytes.value = null
    text.value = ''
    reading.value = false
    importing.value = false
    readError.value = ''
    decodeError.value = ''
    confirmError.value = ''
    bomHint.value = '无编码标记时默认严格按 UTF-8 读取'
    manualEncoding = false
    selection.value = { encoding: 'utf-8' }
  }
  const current = (version: number, scope: string, source: File): boolean =>
    alive &&
    active.value &&
    generation === version &&
    props.scope === scope &&
    file.value === source
  const decode = (): void => {
    if (!alive || !active.value || !bytes.value || reading.value || importing.value) return
    text.value = ''
    decodeError.value = ''
    confirmError.value = ''
    try {
      text.value = decodeSqlFile(bytes.value, selection.value.encoding)
    } catch (cause) {
      decodeError.value =
        cause instanceof SqlFileImportError
          ? cause.message
          : '文件解码失败，请切换编码或重新选择文件'
    }
  }
  const read = async (): Promise<void> => {
    const source = file.value
    if (!alive || !active.value || !source || reading.value || importing.value || bytes.value)
      return
    const version = generation
    const scope = props.scope
    reading.value = true
    readError.value = ''
    decodeError.value = ''
    confirmError.value = ''
    text.value = ''
    try {
      validateSqlFile(source.name, source.size)
      const buffer = await source.arrayBuffer()
      if (!current(version, scope, source)) return
      validateSqlFile(source.name, buffer.byteLength)
      bytes.value = new Uint8Array(buffer)
      const bom = inspectSqlFileBom(bytes.value)
      bomHint.value = bom
        ? `已识别 ${sqlFileEncodingOptions.find((option) => option.value === bom.encoding)?.label} 编码标记`
        : '无编码标记时默认严格按 UTF-8 读取'
      if (!manualEncoding) {
        settingDefault = true
        selection.value.encoding = bom?.encoding ?? 'utf-8'
        settingDefault = false
      }
    } catch (cause) {
      if (!current(version, scope, source)) return
      const message =
        cause instanceof SqlFileImportError
          ? cause.message
          : 'SQL 文件读取失败，请重试或重新选择文件'
      if (bytes.value) decodeError.value = message
      else readError.value = message
    } finally {
      if (current(version, scope, source)) {
        reading.value = false
        if (!readError.value && !decodeError.value) decode()
      }
    }
  }
  const retry = (): void => {
    if (bytes.value) decode()
    else void read()
  }
  const chooseFile = (): void => {
    if (alive && active.value && !importing.value) emit('choose-file')
  }
  const beforeClose = (): boolean => {
    if (importing.value) return false
    reset()
    return true
  }
  const confirmImport = async (): Promise<boolean> => {
    const source = file.value
    if (!source || !canConfirm.value) return false
    const version = generation
    const scope = props.scope
    const sql = text.value
    importing.value = true
    confirmError.value = ''
    try {
      await nextTick()
      if (!current(version, scope, source) || sql !== text.value) return false
      const accepted = await props.importSql(sql)
      // A successful parent import may legitimately change the tab/scope and close this dialog.
      if (!current(version, scope, source)) return false
      if (!accepted) confirmError.value = '尚未导入，文件与编码已保留，可重试或取消。'
      return accepted
    } catch (cause) {
      if (current(version, scope, source))
        confirmError.value =
          cause instanceof SqlFileImportError ? cause.message : 'SQL 文件导入未完成，请重试'
      return false
    } finally {
      if (current(version, scope, source)) importing.value = false
    }
  }
  const open = async (source: File): Promise<void> => {
    if (!alive) return
    reset()
    active.value = true
    file.value = source
    const version = generation
    const scope = props.scope
    await dialog.value?.handleOpen(undefined, {
      title: '导入 SQL 文件',
      subtitle: '核对编码与预览，确认后完整载入新页签；不会自动执行',
      confirmDisabled: !canConfirm.value
    })
    if (!current(version, scope, source)) return
    void read()
  }
  watch(
    () => selection.value.encoding,
    () => {
      if (!active.value || settingDefault) return
      manualEncoding = true
      decode()
    },
    { flush: 'sync' }
  )
  watch(
    () => props.scope,
    () => {
      reset()
      void dialog.value?.handleClose(true)
    },
    { flush: 'sync' }
  )
  onBeforeUnmount(() => {
    alive = false
    reset()
  })
  defineExpose({ open })
</script>
