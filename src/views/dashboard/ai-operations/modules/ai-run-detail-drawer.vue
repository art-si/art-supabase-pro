<template>
  <ArtDrawer :loading="loading" ref="drawerRef" :show-footer="false">
    <ArtAsyncState
      :error="loadError"
      :empty="!detail"
      empty-text="暂无 AI 运行详情"
      empty-description="请从运行记录中重新选择，或刷新后重试。"
      @retry="retryLoad"
    >
      <div v-if="detail" class="ai-run-detail">
        <section class="ai-run-detail__hero">
          <div class="ai-run-detail__hero-icon">
            <ArtSvgIcon icon="ri:brain-2-line" />
          </div>
          <div class="ai-run-detail__hero-copy">
            <div>
              <ArtDictDisplay dict-code="aiRunFeature" :value="detail.feature" display="text" />
              <ArtDictDisplay dict-code="aiRunStatus" :value="detail.status" display="tag" />
            </div>
            <strong>{{ detail.model }}</strong>
            <span>{{ detail.id }}</span>
          </div>
        </section>

        <section class="ai-run-detail__metrics">
          <div>
            <span>总耗时</span>
            <strong>{{ formatDurationMs(detail.latencyMs) }}</strong>
          </div>
          <div>
            <span>输入 Token</span>
            <strong>{{ formatNumberValue(detail.inputTokens ?? 0) }}</strong>
          </div>
          <div>
            <span>输出 Token</span>
            <strong>{{ formatNumberValue(detail.outputTokens ?? 0) }}</strong>
          </div>
          <div>
            <span>工具调用</span>
            <strong>{{ detail.toolCallDetails.length }}</strong>
          </div>
        </section>

        <section class="ai-run-detail__diagnosis-entry">
          <div class="ai-run-detail__diagnosis-icon">
            <ArtSvgIcon icon="ri:stethoscope-line" />
          </div>
          <div>
            <strong>AI 智能诊断</strong>
            <span>结合错误、耗时、工具调用和运行上下文，生成分级排查建议。</span>
          </div>
          <ElButton
            type="primary"
            plain
            :loading="diagnosis.loading"
            :disabled="!canDiagnose"
            @click="runDiagnosis"
          >
            <ArtSvgIcon v-if="!diagnosis.loading" icon="ri:sparkling-2-line" />
            {{ diagnosisActionLabel }}
          </ElButton>
        </section>

        <template v-if="diagnosis.data">
          <ArtSectionTitle title="智能诊断结果" />
          <section class="ai-run-detail__diagnosis-result">
            <header>
              <div>
                <ElTag :type="severityTagType" effect="dark" round>
                  {{ severityLabel }}
                </ElTag>
                <ElTag effect="plain" round>{{ categoryLabel }}</ElTag>
              </div>
              <span>置信度 {{ diagnosis.data.confidence }}%</span>
            </header>
            <p>{{ diagnosis.data.summary }}</p>
            <small>
              诊断服务 {{ diagnosis.provider }} · 模型 {{ diagnosis.model }} · Prompt
              {{ diagnosis.promptVersion }} ·
              {{ formatDurationMs(diagnosis.durationMs) }}
            </small>
          </section>

          <div v-if="diagnosis.data.rootCauses.length" class="ai-run-detail__diagnosis-section">
            <h3>可能根因</h3>
            <article
              v-for="(cause, index) in diagnosis.data.rootCauses"
              :key="`${index}-${cause.title}`"
            >
              <header>
                <strong>{{ cause.title }}</strong>
                <span>{{ cause.confidence }}%</span>
              </header>
              <p>{{ cause.evidence || '当前证据有限，建议结合服务商日志进一步确认。' }}</p>
            </article>
          </div>

          <div v-if="diagnosis.data.actions.length" class="ai-run-detail__diagnosis-section">
            <h3>处理建议</h3>
            <article
              v-for="(action, index) in diagnosis.data.actions"
              :key="`${index}-${action.title}`"
              class="is-action"
            >
              <header>
                <div>
                  <ElTag :type="priorityTagType(action.priority)" size="small" effect="light">
                    {{ action.priority }}
                  </ElTag>
                  <strong>{{ action.title }}</strong>
                </div>
                <span>{{ ownerLabel(action.owner) }}</span>
              </header>
              <ol v-if="action.steps.length">
                <li v-for="step in action.steps" :key="step">{{ step }}</li>
              </ol>
            </article>
          </div>

          <div
            v-if="diagnosis.data.prevention.length || diagnosis.data.observations.length"
            class="ai-run-detail__diagnosis-notes"
          >
            <div v-if="diagnosis.data.prevention.length">
              <strong>预防措施</strong>
              <ul
                ><li v-for="item in diagnosis.data.prevention" :key="item">{{ item }}</li></ul
              >
            </div>
            <div v-if="diagnosis.data.observations.length">
              <strong>补充观察</strong>
              <ul
                ><li v-for="item in diagnosis.data.observations" :key="item">{{ item }}</li></ul
              >
            </div>
          </div>
        </template>

        <ArtSectionTitle title="运行信息" />
        <ArtDescriptions
          :data="detail"
          :items="runInfoItems"
          :columns="2"
          class="ai-run-detail__descriptions"
        />

        <template v-if="detail.errorCode || detail.errorMessage">
          <ArtSectionTitle title="失败诊断" />
          <div class="ai-run-detail__error">
            <div>
              <ArtSvgIcon icon="ri:error-warning-line" />
              <strong>{{ detail.errorCode || 'server_error' }}</strong>
            </div>
            <p>{{ detail.errorMessage || '未记录错误详情' }}</p>
          </div>
        </template>

        <template v-if="detail.toolCallDetails.length">
          <ArtSectionTitle title="工具调用" />
          <div class="ai-run-detail__tools">
            <article v-for="tool in detail.toolCallDetails" :key="tool.id">
              <header>
                <div>
                  <ArtSvgIcon icon="ri:function-line" />
                  <strong>{{ tool.toolName }}</strong>
                </div>
                <div>
                  <span>{{ formatDurationMs(tool.latencyMs) }}</span>
                  <ElTag :type="tool.status === 'succeeded' ? 'success' : 'danger'" size="small">
                    {{ tool.status === 'succeeded' ? '成功' : '失败' }}
                  </ElTag>
                </div>
              </header>
              <ElCollapse>
                <ElCollapseItem title="查看调用参数与结果摘要">
                  <div class="ai-run-detail__json-grid">
                    <div
                      ><span>调用参数</span><pre>{{ formatJson(tool.arguments) }}</pre>
                    </div>
                    <div
                      ><span>结果摘要</span><pre>{{ formatJson(tool.resultSummary) }}</pre>
                    </div>
                  </div>
                </ElCollapseItem>
              </ElCollapse>
            </article>
          </div>
        </template>

        <template v-if="detail.messages.length">
          <ArtSectionTitle title="对话记录" />
          <div class="ai-run-detail__messages">
            <article
              v-for="message in detail.messages"
              :key="message.id"
              :class="{ 'is-user': message.role === 'user' }"
            >
              <div class="ai-run-detail__message-avatar">
                <ArtSvgIcon
                  :icon="message.role === 'user' ? 'ri:user-3-line' : 'ri:sparkling-2-fill'"
                />
              </div>
              <div>
                <header>
                  <strong>{{ message.role === 'user' ? '用户' : 'AI 助手' }}</strong>
                  <time>{{ formatDateTime(message.createTime) }}</time>
                </header>
                <p>{{ message.content }}</p>
              </div>
            </article>
          </div>
        </template>

        <ArtSectionTitle title="上下文与元数据" />
        <ElCollapse class="ai-run-detail__metadata">
          <ElCollapseItem title="页面上下文">
            <pre>{{ formatJson(detail.conversation?.context ?? {}) }}</pre>
          </ElCollapseItem>
          <ElCollapseItem title="运行元数据">
            <pre>{{ formatJson(detail.metadata) }}</pre>
          </ElCollapseItem>
        </ElCollapse>
      </div>
    </ArtAsyncState>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { formatDurationMs, formatNumberValue, createDateTimeFormatter } from '@/utils/ui/format'
  import { ElMessage } from 'element-plus'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import {
    diagnoseAiRun,
    fetchAiRunDetail,
    type AiDiagnosisOwner,
    type AiDiagnosisPriority,
    type AiRunDetail,
    type AiRunDiagnosis
  } from '@/api/ai-operations'

  defineOptions({ name: 'AiRunDetailDrawer' })

  interface OpenData {
    id: string
  }

  interface DiagnosisState {
    loading: boolean
    data?: AiRunDiagnosis
    provider: string
    model: string
    promptVersion: string
    durationMs?: number
  }

  type TagType = 'primary' | 'success' | 'warning' | 'danger' | 'info'

  const emit = defineEmits<{ diagnosed: [] }>()

  const drawerRef = ref<ArtDrawerExpose<OpenData>>()
  const detail = shallowRef<AiRunDetail>()
  const loading = ref(false)
  const loadError = shallowRef<Error | null>(null)
  const currentId = ref('')
  const diagnosis = reactive<DiagnosisState>({
    loading: false,
    data: undefined,
    provider: '',
    model: '',
    promptVersion: '',
    durationMs: undefined
  })

  const runInfoItems: ArtDescriptionItem<AiRunDetail>[] = [
    {
      key: 'feature',
      label: '功能场景',
      field: 'feature',
      dictCode: 'aiRunFeature',
      dictDisplay: 'text'
    },
    {
      key: 'status',
      label: '运行状态',
      field: 'status',
      dictCode: 'aiRunStatus',
      dictDisplay: 'tag'
    },
    {
      key: 'startedAt',
      label: '开始时间',
      field: 'startedAt',
      formatter: (value) => formatDateTime(value as string | null | undefined)
    },
    {
      key: 'finishedAt',
      label: '结束时间',
      field: 'finishedAt',
      formatter: (value) => formatDateTime(value as string | null | undefined)
    },
    { key: 'promptVersion', label: '提示词版本', field: 'promptVersion' },
    {
      key: 'executionMode',
      label: '执行模式',
      value: (data: AiRunDetail) => {
        const value = data.metadata?.executionMode
        return typeof value === 'string' ? value : undefined
      }
    },
    { key: 'createBy', label: '创建用户', field: 'createBy' },
    {
      key: 'feedback',
      label: '用户反馈',
      value: (data: AiRunDetail) => {
        const rating = data.feedback?.[0]?.rating
        if (rating === 1) return '有帮助'
        if (rating === -1) return '需要改进'
        return '暂无反馈'
      }
    }
  ]
  const canDiagnose = computed(() => detail.value?.feature !== 'operations_diagnosis')
  const diagnosisActionLabel = computed(() => {
    if (!canDiagnose.value) return '诊断记录不可递归分析'
    if (diagnosis.data) return '重新诊断'
    return detail.value?.status === 'failed' ? '诊断失败原因' : '分析运行质量'
  })
  const severityLabel = computed(() => {
    const labels = { low: '低风险', medium: '中风险', high: '高风险', critical: '严重风险' }
    return diagnosis.data ? labels[diagnosis.data.severity] : '--'
  })
  const severityTagType = computed<TagType>(() => {
    const types: Record<AiRunDiagnosis['severity'], TagType> = {
      low: 'success',
      medium: 'warning',
      high: 'danger',
      critical: 'danger'
    }
    return diagnosis.data ? types[diagnosis.data.severity] : 'info'
  })
  const categoryLabel = computed(() => {
    const labels: Record<AiRunDiagnosis['category'], string> = {
      provider: '服务商',
      configuration: '运行配置',
      prompt: 'Prompt',
      tool: '工具调用',
      data: '数据上下文',
      performance: '性能',
      unknown: '待确认'
    }
    return diagnosis.data ? labels[diagnosis.data.category] : '--'
  })

  async function handleOpen(data: OpenData): Promise<void> {
    detail.value = undefined
    currentId.value = data.id
    loadError.value = null
    resetDiagnosis()
    await drawerRef.value?.handleOpen(data, {
      title: 'AI 运行详情',
      size: 'lg',
      showFooter: false,
      contentHeight: 'calc(100vh - 78px)',
      drawerProps: {
        appendToBody: true,
        closeOnClickModal: false,
        resizable: true
      },
      onOpen: (openData) => loadDetail(openData.id),
      onReset: () => {
        detail.value = undefined
        currentId.value = ''
        loadError.value = null
        resetDiagnosis()
      }
    })
  }

  async function loadDetail(id: string): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      detail.value = await fetchAiRunDetail(id)
    } catch (error) {
      loadError.value = error instanceof Error ? error : new Error('AI 运行详情加载失败')
    } finally {
      loading.value = false
    }
  }

  function retryLoad(): void {
    if (currentId.value) void loadDetail(currentId.value)
  }

  function resetDiagnosis(): void {
    Object.assign(diagnosis, {
      loading: false,
      data: undefined,
      provider: '',
      model: '',
      promptVersion: '',
      durationMs: undefined
    })
  }

  async function runDiagnosis(): Promise<void> {
    if (!detail.value || !canDiagnose.value || diagnosis.loading) return
    diagnosis.loading = true
    try {
      const result = await diagnoseAiRun(detail.value.id)
      Object.assign(diagnosis, {
        data: result.diagnosis,
        provider: result.provider,
        model: result.model,
        promptVersion: result.promptVersion,
        durationMs: result.durationMs
      })
      emit('diagnosed')
      ElMessage.success('AI 运行诊断已完成')
    } catch (error) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, 'AI 运行诊断失败'))
    } finally {
      diagnosis.loading = false
    }
  }

  function priorityTagType(priority: AiDiagnosisPriority): TagType {
    return priority === 'P0' ? 'danger' : priority === 'P1' ? 'warning' : 'info'
  }

  function ownerLabel(owner: AiDiagnosisOwner): string {
    return { platform: '平台处理', tenant: '租户处理', provider: '服务商处理' }[owner]
  }

  const formatDateTime = createDateTimeFormatter()

  function formatJson(value: unknown): string {
    return JSON.stringify(value ?? {}, null, 2)
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .ai-run-detail {
    display: grid;
    gap: 18px;
    padding-bottom: 24px;

    &__hero {
      display: flex;
      gap: 14px;
      align-items: center;
      padding: 18px;
      background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-bg-color));
      border: 1px solid var(--el-color-primary-light-8);
      border-radius: var(--el-border-radius-base);
    }

    &__hero-icon,
    &__message-avatar {
      display: grid;
      flex-shrink: 0;
      place-items: center;
    }

    &__hero-icon {
      width: 48px;
      height: 48px;
      font-size: 23px;
      color: var(--el-color-white);
      background: linear-gradient(145deg, var(--el-color-primary), #7259e7);
      border-radius: var(--el-border-radius-base);
      box-shadow: 0 10px 24px rgb(64 116 255 / 22%);
    }

    &__hero-copy {
      display: grid;
      gap: 5px;
      min-width: 0;

      > div {
        display: flex;
        gap: 8px;
        align-items: center;
      }

      > strong {
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 16px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      > span {
        font-family: Consolas, monospace;
        font-size: 11px;
        color: var(--el-text-color-placeholder);
      }
    }

    &__metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;

      > div {
        display: grid;
        gap: 6px;
        padding: 14px;
        background: var(--el-fill-color-lighter);
        border-radius: var(--el-border-radius-base);
      }

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        font-size: 17px;
        color: var(--el-text-color-primary);
      }
    }

    &__diagnosis-entry {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 15px 16px;
      background: linear-gradient(135deg, var(--el-color-primary-light-9), var(--el-bg-color));
      border: 1px solid var(--el-color-primary-light-7);
      border-radius: var(--el-border-radius-base);

      > div:nth-child(2) {
        display: grid;
        flex: 1;
        gap: 4px;
        min-width: 0;

        strong {
          color: var(--el-text-color-primary);
        }

        span {
          font-size: 12px;
          line-height: 1.6;
          color: var(--el-text-color-secondary);
        }
      }

      .el-button {
        flex-shrink: 0;
      }
    }

    &__diagnosis-icon {
      display: grid;
      flex: 0 0 40px;
      place-items: center;
      width: 40px;
      height: 40px;
      font-size: 20px;
      color: var(--el-color-primary);
      background: var(--el-bg-color);
      border-radius: var(--el-border-radius-base);
      box-shadow: var(--el-box-shadow-lighter);
    }

    &__diagnosis-result {
      padding: 16px;
      background: var(--el-fill-color-lighter);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);

      > header,
      > header > div {
        display: flex;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
      }

      > header > span,
      > small {
        font-size: 11px;
        color: var(--el-text-color-placeholder);
      }

      > p {
        margin: 13px 0 9px;
        font-size: 14px;
        line-height: 1.8;
        color: var(--el-text-color-primary);
      }
    }

    &__diagnosis-section {
      display: grid;
      gap: 10px;

      > h3 {
        margin: 0;
        font-size: 14px;
        color: var(--el-text-color-primary);
      }

      > article {
        padding: 13px 15px;
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);

        > header,
        > header > div {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
        }

        > header > span {
          flex-shrink: 0;
          font-size: 11px;
          color: var(--el-text-color-placeholder);
        }

        > p,
        li {
          font-size: 12px;
          line-height: 1.7;
          color: var(--el-text-color-secondary);
        }

        > p {
          margin: 8px 0 0;
        }

        ol {
          padding-left: 20px;
          margin: 9px 0 0;
        }
      }
    }

    &__diagnosis-notes {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;

      > div {
        padding: 14px 15px;
        background: var(--el-fill-color-lighter);
        border-radius: var(--el-border-radius-base);
      }

      strong {
        color: var(--el-text-color-primary);
      }

      ul {
        padding-left: 18px;
        margin: 8px 0 0;
      }

      li {
        margin-bottom: 5px;
        font-size: 12px;
        line-height: 1.65;
        color: var(--el-text-color-secondary);
      }
    }

    &__descriptions {
      :deep(.el-descriptions__label) {
        width: 112px;
      }
    }

    &__error {
      padding: 14px 16px;
      color: var(--el-color-danger);
      background: var(--el-color-danger-light-9);
      border: 1px solid var(--el-color-danger-light-7);
      border-radius: var(--el-border-radius-base);

      > div {
        display: flex;
        gap: 7px;
        align-items: center;
      }

      p {
        margin: 8px 0 0;
        line-height: 1.7;
        overflow-wrap: anywhere;
      }
    }

    &__tools {
      display: grid;
      gap: 10px;

      > article {
        padding: 13px 15px;
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);

        > header,
        > header > div {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
        }
      }
    }

    &__json-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;

      span {
        display: block;
        margin-bottom: 6px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__messages {
      display: grid;
      gap: 14px;

      > article {
        display: flex;
        gap: 10px;

        &.is-user {
          .ai-run-detail__message-avatar {
            color: var(--el-color-primary);
            background: var(--el-color-primary-light-9);
          }
        }

        > div:last-child {
          min-width: 0;
        }

        header {
          display: flex;
          gap: 9px;
          align-items: center;
          margin-bottom: 5px;

          time {
            font-size: 10px;
            color: var(--el-text-color-placeholder);
          }
        }

        p {
          padding: 10px 12px;
          margin: 0;
          line-height: 1.7;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
          background: var(--el-fill-color-lighter);
          border-radius: var(--el-border-radius-base);
        }
      }
    }

    &__message-avatar {
      width: 30px;
      height: 30px;
      color: #7259e7;
      background: color-mix(in srgb, #7259e7 10%, var(--el-bg-color));
      border-radius: var(--el-border-radius-small);
    }

    pre {
      max-width: 100%;
      padding: 12px;
      margin: 0;
      font-family: Consolas, monospace;
      font-size: 11px;
      line-height: 1.6;
      color: var(--el-text-color-regular);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);
    }

    @media (width <= 640px) {
      &__metrics,
      &__json-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      &__diagnosis-notes {
        grid-template-columns: minmax(0, 1fr);
      }

      &__diagnosis-entry {
        flex-wrap: wrap;

        .el-button {
          width: 100%;
        }
      }

      &__descriptions {
        :deep(.el-descriptions__body .el-descriptions__table) {
          table-layout: auto;
        }
      }
    }
  }
</style>
