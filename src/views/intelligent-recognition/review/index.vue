<template>
  <div class="art-full-height business-workspace-page recognition-review">
    <RecognitionPageHero
      title="待复核"
      subtitle="队列已按风险优先排序。打开任务查看识别依据，确认后可携带当前结果进入原业务表单继续处理。"
      :metrics="heroMetrics"
      :loading="overviewLoading"
      :error="overviewError"
      @retry="loadOverview"
    >
      <template #action>
        <BusinessTableWorkspaceActions :table="tableRef?.tableQuery" />
      </template>
    </RecognitionPageHero>
    <RecognitionTable
      ref="tableRef"
      mode="review"
      :artifact-id="artifactId"
      @open="handleOpen"
      @business="goBusiness"
      @create="openWorkbench"
    />
    <RecognitionDetailDrawer ref="detailRef" />
  </div>
</template>

<script setup lang="ts">
  import type { ArtTableQueryExpose } from '@/components/core/tables/art-table-query/index.vue'
  import BusinessTableWorkspaceActions from '@/components/business/business-table-workspace-actions/index.vue'
  import RecognitionPageHero from '../modules/recognition-page-hero.vue'
  import RecognitionTable from '../modules/recognition-table.vue'
  import RecognitionDetailDrawer from '../modules/recognition-detail-drawer.vue'
  import { buildRecognitionBusinessRoute } from '@/utils/intelligent-recognition'
  import { confidencePercent } from '../modules/recognition-config'
  import { useRecognitionOverview } from '../modules/use-recognition-overview'

  defineOptions({ name: 'RecognitionReview' })

  type Artifact = Api.IntelligentRecognition.RecognitionArtifact
  interface DetailExpose {
    handleOpen: (row: Artifact | string) => Promise<void>
  }
  interface RecognitionTableExpose {
    tableQuery?: ArtTableQueryExpose
  }

  const route = useRoute()
  const router = useRouter()
  const tableRef = ref<RecognitionTableExpose>()
  const detailRef = ref<DetailExpose>()
  const artifactId = computed(() => String(route.query.artifactId || ''))
  const { overview, overviewLoading, overviewError, loadOverview } = useRecognitionOverview()
  const heroMetrics = computed(() => [
    { label: '待复核', value: overview.pending, note: '当前可见任务', tone: 'warning' as const },
    {
      label: '低可信待办',
      value: overview.pendingLowConfidence,
      note: '建议优先处理',
      tone: 'danger' as const
    },
    {
      label: '平均可信度',
      value: `${confidencePercent(overview.avgConfidence)}%`,
      note: '辅助判断，不替代人工',
      tone: 'info' as const
    }
  ])

  function handleOpen(row: Artifact): void {
    void detailRef.value?.handleOpen(row)
  }

  function goBusiness(row: Artifact): void {
    void router.push(buildRecognitionBusinessRoute(row))
  }

  function openWorkbench(): void {
    void router.push('/intelligent-recognition/workbench')
  }

  onMounted(() => {
    void loadOverview()
    if (artifactId.value) void detailRef.value?.handleOpen(artifactId.value)
  })
</script>
