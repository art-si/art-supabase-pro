<template>
  <ArtDialog ref="dialogRef" size="lg">
    <div class="ai-config-dialog">
      <section class="ai-config-dialog__summary">
        <div class="ai-config-dialog__summary-icon">
          <ArtSvgIcon icon="ri:brain-2-line" />
        </div>
        <div>
          <span>正在配置</span>
          <ArtDictDisplay dict-code="aiRunFeature" :value="form.model.feature" display="text" />
        </div>
        <div class="ai-config-dialog__summary-actions">
          <ElTag :type="form.model.enabled ? 'success' : 'info'" round effect="light">
            {{ form.model.enabled ? '运行中' : '已停用' }}
          </ElTag>
          <ArtTooltip content="重新读取远端模型目录" placement="bottom">
            <ArtIconButton
              icon="ri:refresh-line"
              label="重新读取远端模型目录"
              :loading="catalog.loading"
              @click="refreshModelCatalog"
            />
          </ArtTooltip>
        </div>
      </section>

      <ElAlert
        :title="catalogNotice"
        :type="catalog.warning ? 'warning' : 'info'"
        :closable="false"
        show-icon
      />

      <ArtForm
        ref="formRef"
        v-model="form.model"
        :items="form.items.value"
        :rules="form.rules"
        :span="12"
        :gutter="20"
        label-position="top"
        label-width="auto"
        :show-reset="false"
        :show-submit="false"
        :validate-on-rule-change="false"
      >
        <template #model>
          <AiModelSelector
            :model-value="form.model.model"
            :models="catalog.models"
            :benchmark-results="benchmark.results"
            :benchmark-errors="benchmark.errors"
            :testing-model-id="benchmark.testingModelId"
            :loading="catalog.loading"
            show-details
            placeholder="请选择或输入主模型"
            @update:model-value="updateMainModel"
            @benchmark="runBenchmark"
          />
        </template>

        <template #visionModel>
          <AiModelSelector
            :model-value="form.model.visionModel"
            :models="visionModels"
            :benchmark-results="benchmark.results"
            :benchmark-errors="benchmark.errors"
            :testing-model-id="benchmark.testingModelId"
            :loading="catalog.loading"
            placeholder="请选择或输入视觉模型"
            @update:model-value="updateOptionalModel('visionModel', $event)"
            @benchmark="runBenchmark"
          />
        </template>

        <template #fallbackModel>
          <AiModelSelector
            :model-value="form.model.fallbackModel"
            :models="catalog.models"
            :benchmark-results="benchmark.results"
            :benchmark-errors="benchmark.errors"
            :testing-model-id="benchmark.testingModelId"
            :loading="catalog.loading"
            placeholder="请选择或输入备用模型"
            @update:model-value="updateOptionalModel('fallbackModel', $event)"
            @benchmark="runBenchmark"
          />
        </template>
      </ArtForm>
    </div>
  </ArtDialog>
</template>

<script setup lang="ts">
  import { notifyFriendlyError } from '@/hooks/core/useArtFeedback'
  import { validateArtFormForSubmit } from '@/utils/form/validate-art-form'
  import { normalizeNullableText } from '@/utils/form/normalize'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { ElMessage, type FormRules } from 'element-plus'
  import { cloneDeep } from 'lodash-es'
  import type { ComputedRef } from 'vue'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtForm, { type FormItem } from '@/components/core/forms/art-form/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import {
    benchmarkAiProviderModel,
    fetchAiProviderCatalog,
    updateAiFeatureConfig,
    type AiFeatureConfig,
    type AiFeatureConfigWritePayload,
    type AiModelBenchmark,
    type AiProviderModel,
    type AiProviderCatalog
  } from '@/api/ai-configuration'
  import AiModelSelector from './ai-model-selector.vue'

  interface DialogOpenData {
    editData: AiFeatureConfig
  }

  interface ArtFormExpose {
    validate: () => Promise<boolean | void>
    clearValidate: () => void
  }

  interface AiConfigFormModel extends AiFeatureConfigWritePayload {
    feature: string
  }

  interface FormGroup {
    model: AiConfigFormModel
    items: ComputedRef<FormItem[]>
    rules: FormRules<AiConfigFormModel>
  }

  interface CatalogGroup {
    loading: boolean
    count: number
    source: AiProviderCatalog['source'] | null
    warning: string | null
    models: AiProviderModel[]
  }

  interface BenchmarkGroup {
    testingModelId: string | null
    results: Map<string, AiModelBenchmark>
    errors: Map<string, string>
  }

  const emit = defineEmits<{ success: [] }>()
  const dialogRef = ref<ArtDialogExpose<DialogOpenData>>()
  const formRef = ref<ArtFormExpose>()
  const userStore = useUserStore()
  const { getDictMap } = storeToRefs(userStore)
  const catalog = reactive<CatalogGroup>({
    loading: false,
    count: 0,
    source: null,
    warning: null,
    models: []
  })
  const benchmark = reactive<BenchmarkGroup>({
    testingModelId: null,
    results: new Map<string, AiModelBenchmark>(),
    errors: new Map<string, string>()
  })

  const visionModels = computed(() => {
    const models = catalog.models.filter((item) => item.kind === 'vision')
    return models.length ? models : catalog.models
  })

  const catalogNotice = computed(() => {
    if (catalog.loading) return '正在通过 Edge Function 安全读取远端模型目录…'
    if (catalog.warning) return catalog.warning
    if (catalog.source === 'remote') {
      return `已从远端服务读取 ${catalog.count} 个模型；可对候选模型逐个测速，结果按首包延迟自动排序。`
    }
    return '模型目录与测速均由 Edge Function 代为执行，浏览器不会接触 API Key 或服务地址。'
  })

  const createInitialForm = (): AiConfigFormModel => ({
    id: '',
    feature: '',
    enabled: true,
    provider: 'openai_compatible',
    model: '',
    visionModel: null,
    fallbackModel: null,
    timeoutMs: 30000,
    maxRetries: 0,
    temperature: 0.2,
    maxTokens: 800,
    rateLimitPerMinute: 8,
    rateLimitPerDay: 100,
    promptVersion: 'v1'
  })

  const formModel = reactive<AiConfigFormModel>(createInitialForm())
  const form: FormGroup = {
    model: formModel,
    items: computed<FormItem[]>(() => [
      { label: '能力开关与模型路由', key: 'routeSection', type: 'divider', span: 24 },
      {
        label: '启用能力',
        key: 'enabled',
        type: 'switch',
        span: 6,
        description: '停用后，该能力会拒绝新的 AI 请求。'
      },
      {
        label: '服务协议',
        key: 'provider',
        type: 'select',
        span: 18,
        description:
          '当前连接使用 OpenAI 兼容协议，可接入支持标准 /models 与 /chat/completions 的服务。',
        props: {
          options: getDictMap.value.aiProvider ?? [],
          clearable: false,
          placeholder: '请选择服务协议'
        }
      },
      {
        label: '主模型',
        key: 'model',
        type: 'select',
        span: 24,
        description:
          '优先按任务能力筛选，再用当前线路实测延迟比较候选模型；目录未包含目标模型时仍可直接输入模型 ID。'
      },
      {
        label: '视觉模型',
        key: 'visionModel',
        type: 'select',
        span: 24,
        hidden: form.model.feature !== 'order_extraction',
        description: '仅在智能填单包含图片时使用；留空则回退到主模型。',
        help: '下拉列表优先展示识别为视觉或文档解析能力的模型。'
      },
      {
        label: '备用模型',
        key: 'fallbackModel',
        type: 'select',
        span: 24,
        description: '主模型暂时不可用时的备用路由；留空表示不启用。'
      },
      { label: '生成与稳定性', key: 'generationSection', type: 'divider', span: 24 },
      {
        label: '单次超时（毫秒）',
        key: 'timeoutMs',
        type: 'number',
        props: {
          min: 5000,
          max: 120000,
          step: 5000,
          controlsPosition: 'right',
          style: { width: '100%' }
        }
      },
      {
        label: '最大重试次数',
        key: 'maxRetries',
        type: 'number',
        props: {
          min: 0,
          max: 2,
          step: 1,
          stepStrictly: true,
          controlsPosition: 'right',
          style: { width: '100%' }
        }
      },
      {
        label: '随机度',
        key: 'temperature',
        type: 'number',
        props: {
          min: 0,
          max: 2,
          step: 0.1,
          precision: 2,
          controlsPosition: 'right',
          style: { width: '100%' }
        }
      },
      {
        label: '最大输出 Token',
        key: 'maxTokens',
        type: 'number',
        props: {
          min: 100,
          max: 4096,
          step: 100,
          controlsPosition: 'right',
          style: { width: '100%' }
        }
      },
      { label: '配额与版本', key: 'governanceSection', type: 'divider', span: 24 },
      {
        label: '每分钟上限',
        key: 'rateLimitPerMinute',
        type: 'number',
        props: { min: 1, max: 60, step: 1, controlsPosition: 'right', style: { width: '100%' } }
      },
      {
        label: '每日上限',
        key: 'rateLimitPerDay',
        type: 'number',
        props: { min: 1, max: 5000, step: 10, controlsPosition: 'right', style: { width: '100%' } }
      },
      {
        label: 'Prompt 版本',
        key: 'promptVersion',
        type: 'text',
        span: 24,
        description: '由 AI Prompt 中心发布或回滚时自动同步，此处仅展示当前生效版本。',
        props: { emptyText: '--', class: 'font-medium text-theme' }
      }
    ]),
    rules: {
      provider: [{ required: true, message: '请选择服务协议', trigger: 'change' }],
      model: [{ required: true, message: '请输入主模型', trigger: 'blur' }],
      timeoutMs: [{ required: true, message: '请输入单次超时', trigger: 'change' }],
      maxTokens: [{ required: true, message: '请输入最大输出 Token', trigger: 'change' }],
      rateLimitPerMinute: [{ required: true, message: '请输入每分钟上限', trigger: 'change' }],
      rateLimitPerDay: [{ required: true, message: '请输入每日上限', trigger: 'change' }]
    }
  }

  function resetForm(): void {
    Object.assign(form.model, createInitialForm())
    formRef.value?.clearValidate()
  }

  function initializeForm(data: DialogOpenData): void {
    const row = cloneDeep(data.editData)
    Object.assign(form.model, {
      id: row.id,
      feature: row.feature,
      enabled: row.enabled,
      provider: row.provider,
      model: row.model,
      visionModel: row.visionModel ?? null,
      fallbackModel: row.fallbackModel ?? null,
      timeoutMs: Number(row.timeoutMs),
      maxRetries: Number(row.maxRetries),
      temperature: Number(row.temperature),
      maxTokens: Number(row.maxTokens),
      rateLimitPerMinute: Number(row.rateLimitPerMinute),
      rateLimitPerDay: Number(row.rateLimitPerDay),
      promptVersion: row.promptVersion
    })
  }

  function applyCatalog(data: AiProviderCatalog): void {
    Object.assign(catalog, {
      count: data.models.length,
      source: data.source,
      warning: data.warning ?? null,
      models: data.models
    })
  }

  async function loadModelCatalog(forceRefresh = false): Promise<AiProviderCatalog> {
    catalog.loading = true
    try {
      const data = await fetchAiProviderCatalog({ forceRefresh })
      applyCatalog(data)
      return data
    } finally {
      catalog.loading = false
    }
  }

  function updateMainModel(value: string | null): void {
    form.model.model = value ?? ''
  }

  function updateOptionalModel(field: 'visionModel' | 'fallbackModel', value: string | null): void {
    form.model[field] = value
  }

  async function runBenchmark(modelId: string): Promise<void> {
    if (benchmark.testingModelId) return
    benchmark.testingModelId = modelId
    benchmark.errors.delete(modelId)
    try {
      const result = await benchmarkAiProviderModel(modelId)
      benchmark.results.set(result.model, result)
      ElMessage.success(
        `${result.model} 测速完成：首包 ${result.firstResponseMs} ms，总耗时 ${result.totalMs} ms`
      )
    } catch (error) {
      const message = getFriendlySupabaseErrorMessage(error, '模型测速失败，请稍后重试')
      benchmark.errors.set(modelId, message)
      ElMessage.error({ message, duration: 5000 })
    } finally {
      benchmark.testingModelId = null
    }
  }

  async function refreshModelCatalog(): Promise<void> {
    if (catalog.loading) return
    try {
      const data = await loadModelCatalog(true)
      if (data.source === 'remote') {
        ElMessage.success(`已读取 ${data.models.length} 个远端模型`)
      } else {
        ElMessage.warning(data.warning ?? '已刷新当前配置模型')
      }
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '刷新远端模型失败'))
    } finally {
      catalog.loading = false
    }
  }

  function createPayload(): AiFeatureConfigWritePayload {
    return {
      id: form.model.id,
      enabled: form.model.enabled,
      provider: form.model.provider.trim(),
      model: form.model.model.trim(),
      visionModel: normalizeNullableText(form.model.visionModel),
      fallbackModel: normalizeNullableText(form.model.fallbackModel),
      timeoutMs: Number(form.model.timeoutMs),
      maxRetries: Number(form.model.maxRetries),
      temperature: Number(form.model.temperature),
      maxTokens: Number(form.model.maxTokens),
      rateLimitPerMinute: Number(form.model.rateLimitPerMinute),
      rateLimitPerDay: Number(form.model.rateLimitPerDay),
      promptVersion: form.model.promptVersion.trim()
    }
  }

  async function handleSubmit(): Promise<boolean> {
    try {
      if (!(await validateArtFormForSubmit(formRef.value))) return false
      await updateAiFeatureConfig(createPayload())
      emit('success')
      return true
    } catch (error) {
      notifyFriendlyError(error, 'AI 运行配置保存失败，请核对配置后重试', 'warning')
      return false
    }
  }

  async function handleOpen(data: DialogOpenData): Promise<void> {
    resetForm()
    initializeForm(data)
    await dialogRef.value?.handleOpen(data, {
      title: '编辑 AI 运行配置',
      size: 'lg',
      contentMaxHeight: '72vh',
      confirmText: '保存并生效',
      onOpen: async () => {
        try {
          await loadModelCatalog()
        } catch (error) {
          catalog.warning = getFriendlySupabaseErrorMessage(error, '远端模型目录暂时不可用')
        }
      },
      onConfirm: handleSubmit,
      onReset: resetForm
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .ai-config-dialog {
    display: grid;
    gap: 18px;

    &__summary {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 14px 16px;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);

      > div:nth-child(2) {
        display: grid;
        flex: 1;
        gap: 3px;

        > span {
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__summary-actions {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    &__summary-icon {
      display: grid;
      place-items: center;
      width: 38px;
      height: 38px;
      font-size: 20px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--el-border-radius-base);
    }
  }
</style>
