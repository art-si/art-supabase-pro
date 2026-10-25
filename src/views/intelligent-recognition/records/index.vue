<template>
  <div class="art-full-height business-workspace-page recognition-records">
    <RecognitionPageHero
      title="识别记录"
      subtitle="集中查询识别结果、模型运行信息与业务采用状态，便于追溯每一次 AI 建议。"
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
      mode="records"
      @open="handleOpen"
      @business="goBusiness"
      @review="openReview"
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

  defineOptions({ name: 'RecognitionRecords' })

  type Artifact = Api.IntelligentRecognition.RecognitionArtifact
  interface DetailExpose {
    handleOpen: (row: Artifact | string) => Promise<void>
  }
  interface RecognitionTableExpose {
    tableQuery?: ArtTableQueryExpose
  }

  const router = useRouter()
  const tableRef = ref<RecognitionTableExpose>()
  const detailRef = ref<DetailExpose>()
  const { overview, overviewLoading, overviewError, loadOverview } = useRecognitionOverview()
  const heroMetrics = computed(() => [
    { label: '累计识别', value: overview.total, note: '当前可见范围' },
    {
      label: '已业务采用',
      value: overview.applied,
      note: '完成原业务确认',
      tone: 'success' as const
    },
    {
      label: '平均可信度',
      value: `${confidencePercent(overview.avgConfidence)}%`,
      note: '历史综合表现',
      tone: 'info' as const
    }
  ])

  function handleOpen(row: Artifact): void {
    void detailRef.value?.handleOpen(row)
  }

  function goBusiness(row: Artifact): void {
    void router.push(buildRecognitionBusinessRoute(row))
  }

  function openReview(): void {
    void router.push('/intelligent-recognition/review')
  }

  onMounted(() => void loadOverview())
</script>
