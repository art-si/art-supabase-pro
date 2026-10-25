<template>
  <div class="ai-planner">
    <ProjectPlannerOverview
      v-model:focus="controls.focus"
      v-model:effort="controls.effort"
      :capabilities="capabilities"
      :can-manage-workflow="canManageWorkflow"
      :generating="loading.generate"
      :priority-suggestion="prioritySuggestion"
      :pending-action="prioritySuggestion ? pendingActions[prioritySuggestion.id] : undefined"
      :metrics="metrics"
      :dict-map="getDictMap"
      @generate="handleGenerate"
      @copy="copySuggestion"
      @accept="(suggestion) => updateWorkflow(suggestion, 'accepted')"
    />

    <ArtSectionCard class="ai-planner__control-panel" preserve-content-structure>
      <template #header>
        <header class="ai-planner__toolbar">
          <div>
            <strong>建议池</strong>
            <span>{{ toolbarSubtitle }}</span>
          </div>
          <div class="ai-planner__toolbar-actions">
            <ArtTooltip content="刷新建议" placement="bottom">
              <ArtIconButton
                icon="ri:refresh-line"
                label="刷新建议"
                :loading="loading.state"
                @click="loadState(true)"
              />
            </ArtTooltip>
            <ElSegmented v-model="filters.status" :options="statusFilterOptions" />
          </div>
        </header>
      </template>

      <section v-if="state.suggestions.length" class="ai-planner__filters">
        <ElSelect v-model="filters.batchId" class="ai-planner__batch-select" placeholder="生成批次">
          <ElOption
            v-for="item in batchOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
        <ElInput
          v-model="filters.keyword"
          clearable
          class="ai-planner__filter-search"
          placeholder="搜索标题、说明、证据或风险"
        >
          <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
        </ElInput>
        <ElSelect
          v-model="filters.category"
          class="ai-planner__filter-select"
          placeholder="能力类别"
        >
          <ElOption label="全部类别" value="all" />
          <ElOption
            v-for="item in categoryOptions"
            :key="String(item.value)"
            :label="String(item.label)"
            :value="String(item.value)"
          />
        </ElSelect>
        <ElSelect v-model="filters.effort" class="ai-planner__filter-select" placeholder="工作量">
          <ElOption label="全部工作量" value="all" />
          <ElOption
            v-for="item in effortFilterOptions"
            :key="String(item.value)"
            :label="String(item.label)"
            :value="String(item.value)"
          />
        </ElSelect>
        <ElSelect v-model="filters.sort" class="ai-planner__filter-sort" placeholder="排序方式">
          <ElOption
            v-for="item in sortOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </ElSelect>
        <div class="ai-planner__filter-result">
          <span>显示 {{ filteredSuggestions.length }} / {{ scopedSuggestions.length }} 条</span>
          <ElButton v-if="hasActiveFilters" link type="primary" @click="resetFilters">
            <ArtSvgIcon icon="ri:filter-off-line" />清除筛选
          </ElButton>
        </div>
      </section>
    </ArtSectionCard>

    <div class="ai-planner__list" :aria-busy="loading.state">
      <ArtOverlayLoading
        v-if="loading.state"
        loading
        overlay
        text="正在加载项目建议…"
        description="正在获取最新建议，请稍候"
      />
      <ProjectPlannerEmptyState
        v-if="!state.suggestions.length && !loading.state"
        mode="initial"
        :generating="loading.generate"
        :generation-disabled="capabilities !== null && !capabilities.providerConfigured"
        @generate="handleGenerate"
      />
      <ProjectPlannerEmptyState
        v-else-if="!filteredSuggestions.length && !loading.state"
        mode="filtered"
        @reset-filters="resetFilters"
      />
      <ProjectSuggestionCard
        v-for="(suggestion, displayIndex) in filteredSuggestions"
        :key="suggestion.id"
        :suggestion="suggestion"
        :display-index="displayIndex"
        :pending-action="pendingActions[suggestion.id]"
        :can-manage-workflow="canManageWorkflow"
        :dict-map="getDictMap"
        @copy="copySuggestion"
        @feedback="submitFeedback"
        @workflow="updateWorkflow"
        @expand="trackExpand"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import { useUserStore } from '@/store/modules/user'
  import ProjectPlannerEmptyState from './modules/project-planner-empty-state.vue'
  import ProjectPlannerOverview from './modules/project-planner-overview.vue'
  import ProjectSuggestionCard from './modules/project-suggestion-card.vue'
  import { useProjectPlannerView } from './modules/use-project-planner-view'
  import { useProjectPlannerWorkflow } from './modules/use-project-planner-workflow'

  defineOptions({ name: 'AiProjectPlanner' })

  const userStore = useUserStore()
  const { getDictMap, isPlatformSuper } = storeToRefs(userStore)
  const {
    canManageWorkflow,
    capabilities,
    controls,
    copySuggestion,
    generateSuggestions,
    initialize,
    loadState,
    loading,
    pendingActions,
    state,
    submitFeedback,
    trackExpand,
    updateWorkflow
  } = useProjectPlannerWorkflow({ isPlatformSuper })
  const {
    batchOptions,
    categoryOptions,
    effortFilterOptions,
    filteredSuggestions,
    filters,
    hasActiveFilters,
    metrics,
    prioritySuggestion,
    resetFilters,
    scopedSuggestions,
    sortOptions,
    statusFilterOptions,
    toolbarSubtitle
  } = useProjectPlannerView({ capabilities, dictMap: getDictMap, state })

  async function handleGenerate(): Promise<void> {
    if (await generateSuggestions()) resetFilters()
  }

  onMounted(() => {
    void initialize()
  })
</script>

<style scoped lang="scss">
  .ai-planner {
    display: grid;
    gap: 16px;
    width: 100%;
    min-width: 0;
    padding-bottom: 20px;

    &__toolbar-actions {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    &__control-panel {
      position: sticky;
      top: 8px;
      z-index: 4;
      overflow: hidden;
      box-shadow: var(--el-box-shadow-lighter);
    }

    &__toolbar {
      display: flex;
      gap: 16px;
      align-items: center;
      justify-content: space-between;
      padding: 14px 18px;
      background: linear-gradient(
        90deg,
        color-mix(in srgb, var(--theme-color) 5%, transparent),
        transparent 36%
      );

      > div:first-child {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }

      span {
        color: var(--el-text-color-secondary);
      }
    }

    &__filters {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
      border-top: 1px solid var(--el-border-color-lighter);
    }

    &__filter-search {
      flex: 1 1 300px;
      min-width: 220px;
    }

    &__batch-select {
      flex: 0 0 238px;
    }

    &__filter-select {
      flex: 0 0 150px;
    }

    &__filter-sort {
      flex: 0 0 166px;
    }

    &__filter-result {
      display: flex;
      flex: 0 0 auto;
      gap: 9px;
      align-items: center;
      min-width: 150px;
      margin-left: auto;
      font-size: 12px;
      color: var(--el-text-color-secondary);

      :deep(.el-button) {
        gap: 4px;
      }
    }

    &__list {
      position: relative;
      min-height: 240px;
    }
  }

  @media (width <= 1100px) {
    .ai-planner {
      &__toolbar {
        flex-direction: column;
        align-items: flex-start;
      }

      &__filters {
        flex-wrap: wrap;
      }

      &__filter-search {
        flex-basis: 100%;
      }

      &__filter-result {
        margin-left: 0;
      }
    }
  }

  @media (width <= 680px) {
    .ai-planner {
      &__toolbar-actions {
        flex-direction: column;
        align-items: stretch;
        width: 100%;
      }

      &__control-panel {
        position: static;
      }

      &__filter-search,
      &__batch-select,
      &__filter-select,
      &__filter-sort,
      &__filter-result {
        flex: 1 1 100%;
        width: 100%;
      }
    }
  }
</style>
