<template>
  <ArtDrawer
    ref="drawerRef"
    size="min(760px, 100%)"
    title="编辑 JSON"
    :show-fullscreen-button="true"
    confirm-text="应用内容"
    @opened="editorVisible = true"
    @closed="handleClosed"
  >
    <div class="flex flex-col gap-3">
      <p class="m-0 text-sm text-g-600">
        {{ fieldLabel }} · 字段上方的注释说明用途、类型和可选值；应用时会去除注释并保存标准 JSON。
      </p>
      <div
        class="overflow-hidden rounded border border-g-200"
        style="height: max(360px, calc(100dvh - 220px))"
      >
        <VueMonacoEditor
          v-if="editorVisible"
          v-model:value="draft"
          language="json"
          :path="modelPath"
          :theme="settingStore.isDark ? 'vs-dark' : 'vs'"
          :options="editorOptions"
          :wrapper-style="{ height: '100%' }"
          @mount="handleEditorMounted"
        >
          <template #default><span class="sr-only">编辑器正在加载</span></template>
          <template #failure>编辑器加载失败，请关闭抽屉后重试</template>
        </VueMonacoEditor>
      </div>
      <p v-if="validationError" class="m-0 text-sm text-danger">{{ validationError }}</p>
    </div>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import VueMonacoEditor from '@guolao/vue-monaco-editor'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import { useSettingStore } from '@/store/modules/setting'
  import '@/utils/monaco-runtime'
  import { jsonDefaults, type JSONSchema } from 'monaco-editor/languages/features/json/register'
  import { getJsonParamSchema } from './json-param-schema'
  import { formatJsonWithGuides, parseJsonObjectDraft } from './json-param-editor'

  interface OpenData {
    label: string
    paramKey: string
    fieldKey: string
    value: string
    onApply: (value: string) => void
  }

  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const settingStore = useSettingStore()
  const fieldLabel = ref('')
  const draft = ref('')
  const editorVisible = ref(false)
  const editorLoading = ref(false)
  const modelPath = ref('')
  let applyValue: OpenData['onApply'] | undefined
  let previousDiagnostics: typeof jsonDefaults.diagnosticsOptions | undefined
  const editorOptions = {
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    scrollBeyondLastLine: false,
    formatOnPaste: true,
    wordWrap: 'on' as const,
    wrappingIndent: 'same' as const
  }

  const validationError = computed(() => {
    if (!draft.value.trim()) return fieldLabel.value === '扩展配置' ? '' : '请输入 JSON 对象'
    const parsed = parseJsonObjectDraft(draft.value)
    return parsed.error === 'object'
      ? '请输入 JSON 对象'
      : parsed.error === 'syntax'
        ? 'JSON 格式有误，请检查语法'
        : ''
  })

  watch(validationError, (error) => {
    drawerRef.value?.setOptions({ confirmDisabled: editorLoading.value || Boolean(error) })
  })

  const handleEditorMounted = () => {
    editorLoading.value = false
    drawerRef.value?.setLoading(false)
    drawerRef.value?.setOptions({ confirmDisabled: Boolean(validationError.value) })
  }

  const handleClosed = () => {
    editorVisible.value = false
    if (previousDiagnostics) jsonDefaults.setDiagnosticsOptions(previousDiagnostics)
    previousDiagnostics = undefined
  }

  onBeforeUnmount(handleClosed)

  const handleOpen = async (data: OpenData): Promise<void> => {
    fieldLabel.value = data.label
    modelPath.value = `inmemory://system-param/${data.paramKey}/${data.fieldKey}.json`
    const schema =
      data.fieldKey === 'extendConfigText' ? undefined : getJsonParamSchema(data.paramKey)
    const editorSchema: JSONSchema = { ...schema, type: 'object', allowComments: true }
    previousDiagnostics = jsonDefaults.diagnosticsOptions
    jsonDefaults.setDiagnosticsOptions({
      ...previousDiagnostics,
      validate: true,
      allowComments: true,
      comments: 'ignore',
      schemas: [
        ...(previousDiagnostics.schemas ?? []).filter(
          (item) => !item.uri.startsWith('inmemory://schemas/system-param/')
        ),
        {
          uri: `inmemory://schemas/system-param/${data.paramKey}/${data.fieldKey}`,
          fileMatch: [modelPath.value],
          schema: editorSchema
        }
      ]
    })
    applyValue = data.onApply
    try {
      draft.value = formatJsonWithGuides(JSON.stringify(JSON.parse(data.value)), schema)
    } catch {
      draft.value = data.value
    }
    editorLoading.value = true
    await drawerRef.value?.handleOpen(data, {
      title: `编辑${data.label}`,
      loading: true,
      loadingText: '正在加载 JSON 编辑器…',
      confirmDisabled: true,
      onConfirm: () => {
        if (validationError.value) return false
        if (!draft.value.trim()) {
          applyValue?.('')
          return true
        }
        const parsed = parseJsonObjectDraft(draft.value)
        if (!parsed.value) return false
        applyValue?.(JSON.stringify(parsed.value, null, 2))
        return true
      }
    })
  }

  defineExpose({ handleOpen })
</script>
