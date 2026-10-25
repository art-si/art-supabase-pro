<template>
  <ArtDrawer :loading="detail.loading" ref="drawerRef">
    <ArtAsyncState
      :error="loadError"
      :empty="!detail.data"
      empty-text="识别记录不存在或无权查看"
      empty-description="请返回识别列表重新选择，或刷新后重试。"
      @retry="retryLoad"
    >
      <div v-if="detail.data" :key="detail.data.id" class="recognition-detail">
        <section class="recognition-detail__summary">
          <div class="recognition-detail__score" :class="confidenceClass">
            <strong>{{ confidence }}%</strong>
            <span>综合可信度</span>
          </div>
          <div class="recognition-detail__identity">
            <div>
              <ElTag effect="light">{{ featureLabels[detail.data.feature] }}</ElTag>
              <ArtDictDisplay
                :value="detail.data.status"
                dict-code="aiArtifactStatus"
                display="tag"
              />
            </div>
            <h3>{{ getArtifactTitle(detail.data) }}</h3>
            <p>识别结果只作为业务录入建议，最终数据以原业务页面人工确认后为准。</p>
          </div>
        </section>

        <section class="recognition-detail__context" aria-label="任务上下文">
          <div>
            <span>任务编号</span>
            <strong>{{ detail.data.id.slice(0, 8) }}</strong>
            <ElButton link type="primary" @click="copyTaskId">
              <ArtSvgIcon icon="ri:file-copy-line" />复制
            </ElButton>
          </div>
          <div>
            <span>来源单据</span>
            <strong>{{ sourceDescription }}</strong>
          </div>
          <div>
            <span>业务状态</span>
            <strong>{{ statusDescription }}</strong>
          </div>
        </section>

        <ArtSectionTitle class="recognition-detail__section">原始票据</ArtSectionTitle>
        <RecognitionSourceGallery :urls="sourceImageUrls" :expected-count="sourceImageCount" />

        <ArtSectionTitle class="recognition-detail__section">原始识别内容</ArtSectionTitle>
        <OcrOriginalText
          :text="detail.data.rawOcrText"
          title="识别结果"
          description="这里保留识别时生成的原始 OCR 文字，不随后续表单修正而变化。"
        />

        <ArtSectionTitle class="recognition-detail__section">处理进度</ArtSectionTitle>
        <div class="recognition-detail__progress" aria-label="处理进度">
          <article
            v-for="item in progressItems"
            :key="item.key"
            class="recognition-detail__progress-item"
            :class="`is-${item.state}`"
            :aria-current="item.state === 'active' ? 'step' : undefined"
          >
            <span class="recognition-detail__progress-marker" aria-hidden="true">
              <ArtSvgIcon :icon="item.icon" />
            </span>
            <div class="recognition-detail__progress-copy">
              <strong>{{ item.title }}</strong>
              <span>{{ item.description }}</span>
            </div>
            <span class="recognition-detail__progress-state">{{ item.stateLabel }}</span>
          </article>
        </div>

        <template v-if="detail.data.warnings?.length">
          <ArtSectionTitle class="recognition-detail__section">复核提示</ArtSectionTitle>
          <div class="recognition-detail__warnings">
            <div v-for="warning in detail.data.warnings" :key="warning">
              <ArtSvgIcon icon="ri:error-warning-line" /><span>{{ warning }}</span>
            </div>
          </div>
        </template>

        <ArtSectionTitle class="recognition-detail__section">识别字段</ArtSectionTitle>
        <div v-if="payloadFields.length" class="recognition-detail__fields">
          <article v-for="field in payloadFields" :key="field.key">
            <span>{{ field.label }}</span>
            <strong>{{ field.value }}</strong>
            <small v-if="field.confidence !== undefined" :class="field.level">
              字段可信度 {{ Math.round(field.confidence * 100) }}%
            </small>
            <small v-else>需人工核对</small>
          </article>
        </div>
        <ArtEmptyState
          v-else
          title="暂无可展示的结构化字段"
          description="请检查原始内容，或重新运行识别。"
          size="compact"
          :visual-size="72"
        />

        <ArtSectionTitle class="recognition-detail__section">运行与审计</ArtSectionTitle>
        <ArtDescriptions :data="auditData" :items="auditItems" :columns="2" />
      </div>
    </ArtAsyncState>

    <template #footer="{ api }">
      <ElButton @click="api.handleClose()">关闭</ElButton>
      <ElButton v-if="detail.data?.status === 'pending'" type="primary" @click="goBusinessReview">
        去原业务复核
        <ArtSvgIcon icon="ri:arrow-right-line" />
      </ElButton>
    </template>
  </ArtDrawer>
</template>

<script setup lang="ts">
  import { copyTextToClipboard } from '@/utils/file/clipboard'

  import { createDateTimeFormatter, formatArtValue, formatDurationMs } from '@/utils/ui/format'
  import { formatSensitiveNumberWithAffix } from '@/utils/field-permission'

  import ArtAsyncState from '@/components/core/feedback/art-async-state/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtDescriptions from '@/components/core/base/art-descriptions/index.vue'
  import type { ArtDescriptionItem } from '@/components/core/base/art-descriptions/types'
  import ArtDictDisplay from '@/components/core/base/art-dict-display/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import OcrOriginalText from '@/components/business/ocr-original-text/index.vue'
  import RecognitionSourceGallery from './recognition-source-gallery.vue'
  import { fetchRecognitionArtifactDetail } from '@/api/intelligent-recognition'
  import { buildRecognitionBusinessRoute } from '@/utils/intelligent-recognition'
  import {
    confidencePercent,
    featureLabels,
    fieldLabels,
    getArtifactImageUrls,
    getArtifactTitle,
    getArtifactPayload,
    getPayloadRecord
  } from './recognition-config'

  defineOptions({ name: 'RecognitionDetailDrawer' })

  type Artifact = Api.IntelligentRecognition.RecognitionArtifact

  interface PayloadField {
    key: string
    label: string
    value: string
    confidence?: number
    level: string
  }

  type ProgressState = 'done' | 'active' | 'waiting' | 'stopped'

  interface ProgressItem {
    key: string
    title: string
    description: string
    state: ProgressState
    stateLabel: string
    icon: string
  }

  const router = useRouter()
  const drawerRef = ref<ArtDrawerExpose<Artifact>>()
  const detail = reactive<{ data?: Artifact; loading: boolean }>({ loading: false })
  const loadError = shallowRef<Error | null>(null)
  const requestedArtifactId = ref('')
  const confidence = computed(() => confidencePercent(detail.data?.confidence))
  const confidenceClass = computed(() =>
    confidence.value >= 85 ? 'is-high' : confidence.value >= 65 ? 'is-medium' : 'is-low'
  )
  const sourceImageUrls = computed(() => (detail.data ? getArtifactImageUrls(detail.data) : []))
  const sourceImageCount = computed(() => Number(detail.data?.metadata?.imageCount ?? 0))
  const progressItems = computed<ProgressItem[]>(() => {
    const status = detail.data?.status
    const isApplied = Boolean(detail.data?.entityId) || status === 'applied'
    const isRejected = status === 'rejected'
    const isStopped = status === 'superseded'

    return [
      {
        key: 'recognition',
        title: '智能识别',
        description: '结构化字段提取完成',
        state: 'done',
        stateLabel: '已完成',
        icon: 'ri:check-line'
      },
      {
        key: 'review',
        title: '人工复核',
        description: isStopped ? '任务已失效，无需继续复核' : '业务人员核对识别结果',
        state: status === 'pending' ? 'active' : isStopped ? 'stopped' : 'done',
        stateLabel: status === 'pending' ? '进行中' : isStopped ? '已停止' : '已完成',
        icon:
          status === 'pending'
            ? 'ri:user-search-line'
            : isStopped
              ? 'ri:close-line'
              : 'ri:check-line'
      },
      {
        key: 'archive',
        title: '业务归档',
        description: isApplied
          ? '已关联并写入业务单据'
          : isRejected
            ? '识别建议未被业务采用'
            : isStopped
              ? '任务失效，流程已终止'
              : '复核确认后进入业务单据',
        state: isApplied ? 'done' : isRejected || isStopped ? 'stopped' : 'waiting',
        stateLabel: isApplied ? '已归档' : isRejected ? '未采用' : isStopped ? '已停止' : '待处理',
        icon: isApplied
          ? 'ri:check-line'
          : isRejected || isStopped
            ? 'ri:close-line'
            : 'ri:archive-line'
      }
    ]
  })
  const sourceDescription = computed(() => {
    const count = Number(detail.data?.metadata?.imageCount ?? 0)
    const direction = String(detail.data?.metadata?.direction ?? '')
    const directionLabel =
      { output: '销项', input: '进项', receipt: '收款', payment: '付款' }[direction] || ''
    return [directionLabel, count ? `${count} 张图片` : '业务页面'].filter(Boolean).join(' · ')
  })
  const statusDescription = computed(() => {
    if (detail.data?.status === 'pending') return '等待人工确认'
    if (detail.data?.status === 'applied') return '已写入业务单据'
    if (detail.data?.status === 'rejected') return '业务未采用'
    return '记录已失效'
  })

  const payloadFields = computed<PayloadField[]>(() => {
    if (!detail.data) return []
    const payload = getPayloadRecord(getArtifactPayload(detail.data))
    return Object.entries(payload)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .slice(0, 18)
      .map(([key, value]) => {
        const score = detail.data?.fieldConfidence?.[key]
        return {
          key,
          label: fieldLabels[key] || key,
          value: formatValue(key, value),
          confidence: score,
          level:
            score === undefined
              ? ''
              : score >= 0.85
                ? 'is-high'
                : score >= 0.65
                  ? 'is-medium'
                  : 'is-low'
        }
      })
  })

  const auditData = computed(() => ({
    model: detail.data?.run?.model || '未记录',
    latency: formatDurationMs(detail.data?.run?.latencyMs),
    creator: detail.data?.createBy || '-',
    createTime: formatDateTime(detail.data?.createTime),
    reviewedAt: formatDateTime(detail.data?.reviewedAt),
    entity:
      detail.data?.entityType && detail.data?.entityId
        ? `${detail.data.entityType} / ${detail.data.entityId}`
        : '尚未关联业务单据'
  }))

  const auditItems: ArtDescriptionItem<Record<string, string>>[] = [
    { key: 'model', label: '识别模型', field: 'model' },
    { key: 'latency', label: '运行耗时', field: 'latency' },
    { key: 'creator', label: '发起人', field: 'creator' },
    { key: 'createTime', label: '发起时间', field: 'createTime' },
    { key: 'reviewedAt', label: '复核时间', field: 'reviewedAt' },
    { key: 'entity', label: '关联业务', field: 'entity', span: 2 }
  ]

  function formatValue(key: string, value: unknown): string {
    if (typeof value === 'number' && key === 'taxRate') return `${value}%`
    if (typeof value === 'number' && /amount/i.test(key)) {
      return formatSensitiveNumberWithAffix(value, { prefix: '¥' })
    }
    return formatArtValue(value, typeof value === 'boolean' ? 'boolean' : 'text', {
      emptyText: '未识别'
    })
  }

  const formatDateTime = createDateTimeFormatter({ format: 'YYYY-MM-DD HH:mm', emptyText: '-' })

  async function loadDetail(id: string): Promise<void> {
    detail.loading = true
    loadError.value = null
    try {
      const { data, error } = await fetchRecognitionArtifactDetail(id)
      if (error) throw error
      detail.data = data ?? undefined
    } catch (error) {
      loadError.value = error instanceof Error ? error : new Error('识别详情加载失败')
    } finally {
      detail.loading = false
    }
  }

  function retryLoad(): void {
    if (requestedArtifactId.value) void loadDetail(requestedArtifactId.value)
  }

  function goBusinessReview(): void {
    if (!detail.data) return
    void router.push(buildRecognitionBusinessRoute(detail.data))
    void drawerRef.value?.handleClose()
  }

  async function copyTaskId(): Promise<void> {
    if (!detail.data) return
    try {
      await copyTextToClipboard(detail.data.id)
      ElMessage.success('任务编号已复制')
    } catch {
      ElMessage.warning('复制失败，请手动复制任务编号')
    }
  }

  async function handleOpen(row: Artifact | string): Promise<void> {
    const seed = typeof row === 'string' ? undefined : row
    const id = typeof row === 'string' ? row : row.id
    requestedArtifactId.value = id
    detail.data = seed
    await drawerRef.value?.handleOpen(seed, {
      title: '识别详情与复核依据',
      size: 'lg',
      contentHeight: 'calc(100vh - 132px)',
      onOpen: () => loadDetail(id),
      onReset: () => {
        detail.data = undefined
        loadError.value = null
        requestedArtifactId.value = ''
      },
      drawerProps: { appendToBody: true, resizable: true, closeOnClickModal: false }
    })
  }

  defineExpose({ handleOpen })
</script>

<style scoped lang="scss">
  .recognition-detail {
    &__summary {
      display: flex;
      gap: 16px;
      align-items: center;
      padding: 16px;
      background: color-mix(in srgb, var(--theme-color) 4%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 12%, var(--art-card-border));
      border-radius: var(--custom-radius);
      animation: recognition-detail-panel-in var(--art-motion-duration-slow)
        var(--art-motion-ease-out) backwards;
    }

    &__score {
      display: grid;
      flex: 0 0 86px;
      place-items: center;
      width: 86px;
      height: 86px;
      border: 6px solid currentcolor;
      border-radius: 50%;
      animation: recognition-detail-score-settle var(--art-motion-duration-slow)
        var(--art-motion-ease-out) 70ms backwards;

      strong,
      span {
        display: block;
        text-align: center;
      }

      strong {
        font-size: 20px;
        line-height: 1;
      }

      span {
        margin-top: -13px;
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      &.is-high {
        color: var(--el-color-success);
      }

      &.is-medium {
        color: var(--el-color-warning);
      }

      &.is-low {
        color: var(--el-color-danger);
      }
    }

    &__identity {
      min-width: 0;

      > div {
        display: flex;
        gap: 8px;
      }

      h3 {
        margin: 9px 0 4px;
        color: var(--el-text-color-primary);
      }

      p {
        margin: 0;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-text-color-secondary);
      }
    }

    &__context {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      margin-top: 10px;
      background: var(--art-gray-50);
      border: 1px solid var(--art-card-border);
      border-radius: var(--custom-radius);
      animation: recognition-detail-panel-in var(--art-motion-duration-base)
        var(--art-motion-ease-out) 80ms backwards;

      > div {
        position: relative;
        min-width: 0;
        padding: 11px 13px;
        animation: recognition-detail-context-in var(--art-motion-duration-base)
          var(--art-motion-ease-out) backwards;

        @for $index from 1 through 3 {
          &:nth-child(#{$index}) {
            animation-delay: #{110ms + ($index - 1) * 28ms};
          }
        }
      }

      > div + div {
        border-left: 1px solid var(--art-card-border);
      }

      span,
      strong {
        display: block;
      }

      span {
        font-size: 10px;
        color: var(--el-text-color-secondary);
      }

      strong {
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      .el-button {
        position: absolute;
        top: 7px;
        right: 10px;
      }
    }

    &__section {
      margin-top: 22px;
    }

    &__progress {
      display: grid;
      gap: 4px;
      padding: 8px;
      background: var(--art-gray-50);
      border: 1px solid var(--art-card-border);
      border-radius: var(--custom-radius);
    }

    &__progress-item {
      position: relative;
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto;
      gap: 11px;
      align-items: center;
      min-height: 52px;
      padding: 7px 10px 7px 6px;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      animation: recognition-detail-progress-in var(--art-motion-duration-base)
        var(--art-motion-ease-out) backwards;

      @for $index from 1 through 3 {
        &:nth-child(#{$index}) {
          animation-delay: #{140ms + ($index - 1) * 34ms};
        }
      }

      &::after {
        position: absolute;
        top: 39px;
        bottom: -9px;
        left: 21px;
        width: 1px;
        content: '';
        background: var(--art-card-border);
      }

      &:last-child::after {
        display: none;
      }

      &.is-active {
        background: color-mix(in srgb, var(--theme-color) 7%, var(--default-box-color));
        border-color: color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
      }

      &.is-done::after {
        background: color-mix(in srgb, var(--el-color-success) 45%, var(--art-card-border));
      }
    }

    &__progress-marker {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      color: var(--el-text-color-secondary);
      background: var(--default-box-color);
      border: 1px solid var(--art-card-border);
      border-radius: 50%;

      .is-done & {
        color: var(--el-color-success);
        background: var(--el-color-success-light-9);
        border-color: var(--el-color-success-light-5);
      }

      .is-active & {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
        border-color: color-mix(in srgb, var(--theme-color) 35%, var(--art-card-border));
        animation: recognition-detail-active-marker var(--art-motion-duration-slow)
          var(--art-motion-ease-out) 250ms backwards;
      }

      .is-stopped & {
        color: var(--el-text-color-secondary);
        background: var(--art-gray-100);
      }
    }

    &__progress-copy {
      min-width: 0;

      strong,
      span {
        display: block;
      }

      strong {
        font-size: 13px;
        line-height: 18px;
        color: var(--el-text-color-primary);
      }

      span {
        margin-top: 1px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        line-height: 16px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__progress-state {
      min-width: 48px;
      padding: 3px 7px;
      font-size: 10px;
      line-height: 16px;
      color: var(--el-text-color-secondary);
      text-align: center;
      white-space: nowrap;
      background: var(--art-gray-100);
      border-radius: 999px;

      .is-done & {
        color: var(--el-color-success-dark-2);
        background: var(--el-color-success-light-9);
      }

      .is-active & {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 11%, var(--default-box-color));
      }
    }

    &__warnings {
      display: grid;
      gap: 8px;

      > div {
        display: flex;
        gap: 8px;
        align-items: flex-start;
        padding: 10px 12px;
        font-size: 12px;
        line-height: 1.6;
        color: var(--el-color-warning-dark-2);
        background: var(--el-color-warning-light-9);
        border: 1px solid var(--el-color-warning-light-7);
        border-radius: var(--el-border-radius-base);
      }
    }

    &__fields {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 9px;
      animation: recognition-detail-panel-in var(--art-motion-duration-base)
        var(--art-motion-ease-out) 150ms backwards;

      article {
        min-width: 0;
        padding: 11px 12px;
        background: var(--art-gray-50);
        border: 1px solid var(--art-card-border);
        border-radius: var(--el-border-radius-base);
      }

      span,
      strong,
      small {
        display: block;
      }

      span {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      strong {
        margin: 4px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      small {
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }

      small.is-high {
        color: var(--el-color-success);
      }

      small.is-medium {
        color: var(--el-color-warning);
      }

      small.is-low {
        color: var(--el-color-danger);
      }
    }
  }

  @keyframes recognition-detail-panel-in {
    from {
      opacity: 0;
      transform: translate3d(10px, 0, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes recognition-detail-score-settle {
    from {
      opacity: 0;
      transform: scale(0.92) rotate(-3deg);
    }

    to {
      opacity: 1;
      transform: scale(1) rotate(0);
    }
  }

  @keyframes recognition-detail-context-in {
    from {
      opacity: 0;
      transform: translate3d(-7px, 0, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes recognition-detail-progress-in {
    from {
      opacity: 0;
      transform: translate3d(0, 8px, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes recognition-detail-active-marker {
    from {
      transform: scale(0.88);
    }

    to {
      transform: scale(1);
    }
  }

  @media (width <= 640px) {
    .recognition-detail {
      &__summary {
        align-items: flex-start;
      }

      &__score {
        flex-basis: 72px;
        width: 72px;
        height: 72px;
      }

      &__fields {
        grid-template-columns: 1fr;
      }

      &__context {
        grid-template-columns: 1fr;

        > div + div {
          border-top: 1px solid var(--art-card-border);
          border-left: 0;
        }
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .recognition-detail {
      &__summary,
      &__score,
      &__context,
      &__context > div,
      &__progress-item,
      &__fields,
      &__progress-marker {
        animation: recognition-detail-fade var(--art-motion-duration-fast) ease-out backwards;
      }
    }
  }

  @keyframes recognition-detail-fade {
    from {
      opacity: 0;
    }

    to {
      opacity: 1;
    }
  }
</style>
