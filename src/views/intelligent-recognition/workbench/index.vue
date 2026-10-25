<template>
  <ArtPageShell
    :loading="loading"
    :error="loadError"
    :full-height="focusMode"
    class="recognition-workbench business-workspace-page"
    :class="{ 'is-focus-mode': focusMode, 'is-motion-ready': motionReady }"
    @retry="loadData"
  >
    <RecognitionPageHero
      v-show="!focusMode"
      title="智能识别工作台"
      subtitle="统一处理发票、运输回单和收付款凭证。AI 负责提取与风险提示，业务人员保留最终确认权。"
      :metrics="heroMetrics"
    >
      <template #action>
        <BusinessWorkspaceFocusToggle
          v-model="focusMode"
          title="隐藏概览、待办与审计摘要，只保留识别能力选择；按 Esc 可退出"
        />
        <ElButton type="primary" @click="runnerRef?.handleOpen()">
          <ArtSvgIcon icon="ri:add-line" />发起识别
        </ElButton>
      </template>
    </RecognitionPageHero>

    <section v-show="!focusMode" class="recognition-workbench__attention" aria-label="待办概况">
      <div>
        <span class="recognition-workbench__attention-icon">
          <ArtSvgIcon icon="ri:shield-check-line" />
        </span>
        <div>
          <strong>{{ attentionTitle }}</strong>
          <p>{{ attentionDescription }}</p>
        </div>
      </div>
      <ElButton plain @click="router.push('/intelligent-recognition/review')">
        进入复核队列
        <ArtSvgIcon icon="ri:arrow-right-line" />
      </ElButton>
    </section>

    <ArtSectionCard
      class="recognition-workbench__capability-workspace"
      :title="focusMode ? '选择识别能力' : '识别能力'"
      subtitle="选择业务场景，系统会进入对应的识别与人工复核流程"
    >
      <template v-if="focusMode" #actions>
        <BusinessWorkspaceFocusToggle v-model="focusMode" />
      </template>
      <div class="recognition-workbench__capabilities">
        <article v-for="item in recognitionCapabilities" :key="item.feature">
          <header>
            <div class="recognition-workbench__capability-icon">
              <ArtSvgIcon :icon="item.icon" />
            </div>
            <div>
              <ElTag size="small" effect="plain">已启用</ElTag>
              <span>{{ overview.byFeature[item.feature] ?? 0 }} 次识别</span>
            </div>
          </header>
          <h3>{{ item.title }}</h3>
          <p>{{ item.description }}</p>
          <ul>
            <li><ArtSvgIcon icon="ri:check-line" />结构化字段提取</li>
            <li><ArtSvgIcon icon="ri:check-line" />低置信度风险提示</li>
          </ul>
          <footer>
            <span>{{ item.businessLabel }}</span>
            <ElButton link type="primary" @click="runnerRef?.handleOpen(item.feature)">
              {{ item.actionLabel }}
              <ArtSvgIcon icon="ri:arrow-right-line" />
            </ElButton>
          </footer>
        </article>
      </div>
    </ArtSectionCard>

    <div v-show="!focusMode" class="recognition-workbench__lower">
      <ArtSectionCard title="标准处理路径" subtitle="识别建议不直接写入正式业务数据">
        <div class="recognition-workbench__flow">
          <template v-for="(item, index) in flowItems" :key="item.title">
            <article>
              <span>{{ index + 1 }}</span>
              <div
                ><strong>{{ item.title }}</strong
                ><small>{{ item.description }}</small></div
              >
            </article>
            <ArtSvgIcon v-if="index < flowItems.length - 1" icon="ri:arrow-right-line" />
          </template>
        </div>
      </ArtSectionCard>

      <ArtSectionCard title="最近识别" subtitle="仅展示当前账号有权访问的记录">
        <ArtTable
          :data="recentArtifacts"
          :columns="recentColumns"
          :pagination="false"
          table-layout="fixed"
          empty-text="还没有识别记录"
          empty-description="点击“发起识别”上传第一张单据。"
        >
          <template #operation="{ row }">
            <ElButton link type="primary" @click="detailRef?.handleOpen(row)">查看</ElButton>
          </template>
        </ArtTable>
      </ArtSectionCard>
    </div>

    <RecognitionWorkbenchDrawer ref="runnerRef" @created="handleCreated" />
    <RecognitionDetailDrawer ref="detailRef" />
  </ArtPageShell>
</template>

<script setup lang="ts">
  import type { ColumnOption } from '@/types'
  import BusinessWorkspaceFocusToggle from '@/components/business/business-workspace-focus-toggle/index.vue'
  import {
    fetchRecognitionArtifactList,
    fetchRecognitionOverview
  } from '@/api/intelligent-recognition'
  import { formatWithDayjs } from '@/utils/time'
  import { useWorkspaceFocus } from '@/hooks/core/useWorkspaceFocus'
  import RecognitionPageHero from '../modules/recognition-page-hero.vue'
  import RecognitionWorkbenchDrawer from '../modules/recognition-workbench-drawer.vue'
  import RecognitionDetailDrawer from '../modules/recognition-detail-drawer.vue'
  import {
    confidencePercent,
    featureLabels,
    getArtifactTitle,
    recognitionCapabilities,
    type RecognitionFeature
  } from '../modules/recognition-config'

  defineOptions({ name: 'RecognitionWorkbench' })

  type Artifact = Api.IntelligentRecognition.RecognitionArtifact
  interface RunnerExpose {
    handleOpen: (feature?: RecognitionFeature) => Promise<void>
  }
  interface DetailExpose {
    handleOpen: (row: Artifact | string) => Promise<void>
  }

  const router = useRouter()
  const { focusMode } = useWorkspaceFocus()
  const loading = ref(false)
  const motionReady = ref(false)
  const loadError = shallowRef<Error | null>(null)
  const runnerRef = ref<RunnerExpose>()
  const detailRef = ref<DetailExpose>()
  const recentArtifacts = ref<Artifact[]>([])
  const overview = reactive<Api.IntelligentRecognition.RecognitionOverview>({
    total: 0,
    pending: 0,
    applied: 0,
    rejected: 0,
    lowConfidence: 0,
    pendingLowConfidence: 0,
    today: 0,
    avgConfidence: 0,
    byFeature: {}
  })

  const heroMetrics = computed(() => [
    { label: '今日识别', value: overview.today, note: '当前可见范围', tone: 'primary' as const },
    {
      label: '待业务复核',
      value: overview.pending,
      note: '需要人工确认',
      tone: 'warning' as const
    },
    {
      label: '平均可信度',
      value: `${confidencePercent(overview.avgConfidence)}%`,
      note: '结构化字段综合',
      tone: 'info' as const
    }
  ])
  const attentionTitle = computed(() =>
    overview.pending ? `有 ${overview.pending} 个识别任务等待业务复核` : '当前没有积压的复核任务'
  )
  const attentionDescription = computed(() => {
    if (!overview.pending) return '新的识别结果会自动进入复核队列，并保留完整审计记录。'
    if (overview.pendingLowConfidence) {
      return `其中 ${overview.pendingLowConfidence} 个待办可信度偏低，建议优先核对金额、单号和往来单位。`
    }
    return '队列状态健康，可按发起时间依次完成业务确认。'
  })
  const flowItems = [
    { title: '提交材料', description: '上传票据并保留来源证据' },
    { title: 'AI 提取', description: '输出字段可信度与风险提示' },
    { title: '业务复核', description: '回到原页面核对和修正' },
    { title: '审计留痕', description: '记录采用、修正与关联单据' }
  ]
  const recentColumns: ColumnOption<Artifact>[] = [
    { prop: 'title', label: '任务', minWidth: 190, formatter: (row) => getArtifactTitle(row) },
    { prop: 'feature', label: '类型', width: 120, formatter: (row) => featureLabels[row.feature] },
    {
      prop: 'confidence',
      label: '可信度',
      width: 90,
      formatter: (row) => `${confidencePercent(row.confidence)}%`
    },
    {
      prop: 'createTime',
      label: '发起时间',
      width: 150,
      formatter: (row) => formatWithDayjs(row.createTime, 'MM-DD HH:mm')
    },
    { prop: 'operation', label: '操作', width: 70, fixed: 'right', useSlot: true }
  ]

  async function loadData(): Promise<void> {
    motionReady.value = false
    loading.value = true
    loadError.value = null
    try {
      const [overviewResponse, recentResponse] = await Promise.all([
        fetchRecognitionOverview(),
        fetchRecognitionArtifactList({ from: 0, to: 5 })
      ])
      if (overviewResponse.error) throw overviewResponse.error
      if (recentResponse.error) throw recentResponse.error
      if (overviewResponse.data) Object.assign(overview, overviewResponse.data)
      recentArtifacts.value = recentResponse.data ?? []
    } catch (error) {
      loadError.value = error instanceof Error ? error : new Error('智能识别工作台加载失败')
    } finally {
      loading.value = false
      await nextTick()
      motionReady.value = true
    }
  }

  function handleCreated(artifactId: string): void {
    void router.push({ path: '/intelligent-recognition/review', query: { artifactId } })
  }

  onMounted(loadData)
</script>

<style scoped lang="scss">
  .recognition-workbench {
    :deep(.art-async-state) {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    &__attention {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 13px 16px;
      margin-bottom: 0;
      background: color-mix(in srgb, var(--theme-color) 5%, var(--default-box-color));
      border: 1px solid color-mix(in srgb, var(--theme-color) 18%, var(--art-card-border));
      border-radius: var(--custom-radius);

      > div {
        display: flex;
        gap: 11px;
        align-items: center;
        min-width: 0;
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin: 3px 0 0;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__attention-icon {
      display: grid;
      flex: 0 0 36px;
      place-items: center;
      width: 36px;
      height: 36px;
      font-size: 18px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 10%, transparent);
      border-radius: 50%;
      transition:
        color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        background-color var(--art-motion-duration-fast) var(--art-motion-ease-out),
        transform var(--art-motion-duration-base) var(--art-motion-ease-out);
    }

    &__capabilities {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;

      article {
        position: relative;
        min-width: 0;
        padding: 17px;
        overflow: hidden;
        background: var(--default-box-color);
        border: 1px solid var(--art-card-border);
        border-radius: var(--custom-radius);
        transition:
          border-color var(--art-motion-duration-fast) var(--art-motion-ease-out),
          box-shadow var(--art-motion-duration-base) var(--art-motion-ease-out),
          transform var(--art-motion-duration-fast) var(--art-motion-ease-out);

        > header {
          display: flex;
          align-items: center;
          justify-content: space-between;

          > div:last-child {
            display: flex;
            gap: 8px;
            align-items: center;
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }
        }

        h3 {
          margin: 14px 0 6px;
          color: var(--el-text-color-primary);
        }

        p {
          min-height: 44px;
          margin: 0;
          font-size: 12px;
          line-height: 1.7;
          color: var(--el-text-color-secondary);
        }

        ul {
          display: flex;
          gap: 12px;
          padding: 0;
          margin: 12px 0 0;
          list-style: none;

          li {
            display: inline-flex;
            gap: 4px;
            align-items: center;
            font-size: 11px;
            color: var(--el-text-color-secondary);
          }

          svg {
            color: var(--el-color-success);
          }
        }

        > footer {
          display: flex;
          gap: 8px;
          align-items: center;
          justify-content: space-between;
          padding-top: 12px;
          margin-top: 14px;
          border-top: 1px solid var(--art-border-dashed-color);
        }

        > footer > span {
          display: inline-flex;
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    &__capability-icon {
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      font-size: 21px;
      color: var(--theme-color);
      background: color-mix(in srgb, var(--theme-color) 9%, transparent);
      border-radius: var(--custom-radius);
      transition: transform var(--art-motion-duration-base) var(--art-motion-ease-out);
    }

    &__lower {
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(400px, 0.9fr);
      gap: 14px;
    }

    &__flow {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 150px;

      > svg {
        flex: 0 0 auto;
        color: var(--el-text-color-secondary);
      }

      article {
        display: flex;
        gap: 9px;
        align-items: center;
        min-width: 0;
      }

      article > span {
        display: grid;
        flex: 0 0 30px;
        place-items: center;
        width: 30px;
        height: 30px;
        font-weight: 700;
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 9%, transparent);
        border-radius: 50%;
      }

      strong,
      small {
        display: block;
      }

      strong {
        font-size: 12px;
        color: var(--el-text-color-primary);
      }

      small {
        max-width: 108px;
        margin-top: 3px;
        font-size: 10px;
        line-height: 1.5;
        color: var(--el-text-color-secondary);
      }
    }

    &.is-focus-mode {
      height: 100%;
      min-height: 0;

      :deep(> .art-async-state) {
        height: 100%;
      }

      .recognition-workbench__capability-workspace {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-height: 0;
      }

      :deep(.recognition-workbench__capability-workspace > .art-page-section__body) {
        display: flex;
        flex: 1;
        align-items: center;
        min-height: 0;
      }

      .recognition-workbench__capabilities {
        width: 100%;
      }
    }

    &.is-motion-ready {
      .recognition-workbench__attention,
      .recognition-workbench__capability-workspace,
      .recognition-workbench__lower > * {
        animation: recognition-workbench-reveal var(--art-motion-duration-slow)
          var(--art-motion-ease-out) backwards;
      }

      .recognition-workbench__attention {
        animation-delay: 50ms;
      }

      .recognition-workbench__attention-icon {
        animation: recognition-attention-settle var(--art-motion-duration-base)
          var(--art-motion-ease-out) 140ms backwards;
      }

      .recognition-workbench__capability-workspace {
        animation-delay: 90ms;
      }

      .recognition-workbench__capabilities article {
        animation: recognition-capability-reveal var(--art-motion-duration-slow)
          var(--art-motion-ease-out) backwards;

        @for $index from 1 through 4 {
          &:nth-child(#{$index}) {
            animation-delay: #{110ms + ($index - 1) * 36ms};
          }
        }
      }

      .recognition-workbench__lower > * {
        animation-delay: 220ms;

        &:nth-child(2) {
          animation-delay: 270ms;
        }
      }
    }

    &__capabilities article:hover &__capability-icon,
    &__capabilities article:focus-within &__capability-icon {
      transform: translate3d(0, -2px, 0) scale(1.05);
    }

    &__capabilities article :deep(.el-button svg) {
      transition: transform var(--art-motion-duration-fast) var(--art-motion-ease-out);
    }

    &__capabilities article:hover :deep(.el-button svg),
    &__capabilities article:focus-within :deep(.el-button svg) {
      transform: translate3d(3px, 0, 0);
    }
  }

  @keyframes recognition-workbench-reveal {
    from {
      opacity: 0;
      transform: translate3d(0, 12px, 0) scale(0.992);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0) scale(1);
    }
  }

  @keyframes recognition-capability-reveal {
    from {
      opacity: 0;
      transform: translate3d(0, 10px, 0);
    }

    to {
      opacity: 1;
      transform: translate3d(0, 0, 0);
    }
  }

  @keyframes recognition-attention-settle {
    from {
      opacity: 0.4;
      transform: scale(0.88);
    }

    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  :global([data-box-mode='border-mode'] .recognition-workbench__capabilities article:hover),
  :global([data-box-mode='border-mode'] .recognition-workbench__capabilities article:focus-within) {
    border-color: color-mix(in srgb, var(--theme-color) 42%, var(--art-card-border));
  }

  :global([data-box-mode='shadow-mode'] .recognition-workbench__capabilities article:hover),
  :global([data-box-mode='shadow-mode'] .recognition-workbench__capabilities article:focus-within) {
    box-shadow: 0 8px 24px color-mix(in srgb, var(--theme-color) 10%, transparent);
    transform: translateY(-1px);
  }

  @media (width <= 1500px) {
    .recognition-workbench {
      &__capabilities {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  }

  @media (width <= 1100px) {
    .recognition-workbench {
      &__lower {
        grid-template-columns: 1fr;
      }

      &__flow {
        flex-wrap: wrap;
        gap: 14px;
      }
    }
  }

  @media (width <= 640px) {
    .recognition-workbench {
      &__capabilities {
        grid-template-columns: 1fr;
      }

      &__attention {
        align-items: stretch;
      }

      &__attention,
      &__capabilities article > footer {
        flex-direction: column;
        align-items: flex-start;
      }

      &__attention > .el-button {
        width: 100%;
      }

      &__capabilities article ul {
        flex-direction: column;
        gap: 5px;
      }

      &__flow {
        flex-direction: column;
        align-items: stretch;
      }

      &__flow > svg {
        align-self: center;
        transform: rotate(90deg);
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .recognition-workbench {
      &.is-motion-ready .recognition-workbench__attention,
      &.is-motion-ready .recognition-workbench__attention-icon,
      &.is-motion-ready .recognition-workbench__capability-workspace,
      &.is-motion-ready .recognition-workbench__capabilities article,
      &.is-motion-ready .recognition-workbench__lower > * {
        animation: none;
      }

      &__attention-icon,
      &__capability-icon,
      &__capabilities article,
      &__capabilities article :deep(.el-button svg) {
        transition: none;
      }

      &__capabilities article:hover &__capability-icon,
      &__capabilities article:focus-within &__capability-icon,
      &__capabilities article:hover :deep(.el-button svg),
      &__capabilities article:focus-within :deep(.el-button svg) {
        transform: none;
      }
    }
  }
</style>
