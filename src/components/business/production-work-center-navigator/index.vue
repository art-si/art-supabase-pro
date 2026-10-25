<template>
  <ArtSectionCard
    :show-scrollbar="false"
    class="production-work-center-navigator"
    title="生产范围"
    subtitle="先选车间，再定位工作中心"
    :loading="loading && !hasLoaded"
    :error="error"
    :empty="hasLoaded && !error && !workshops.length && !workCenters.length"
    empty-title="暂无可用车间"
    empty-description="请先在“部门 / 产线”与“工作中心”中完成基础配置。"
    body-class="production-work-center-navigator__body"
    retryable
    @retry="$emit('refresh')"
  >
    <template #actions>
      <ArtIconButton
        icon="ri:refresh-line"
        label="刷新生产范围"
        :loading="loading"
        @click="$emit('refresh')"
      />
      <ArtIconButton
        v-if="collapsible"
        icon="ri:side-bar-line"
        label="收起生产范围"
        @click="$emit('collapse')"
      />
    </template>

    <div class="production-work-center-navigator__workshop-field">
      <label :for="selectId">车间 / 产线</label>
      <ElSelect
        :id="selectId"
        :model-value="selectedWorkshopId"
        :clearable="allowAllWorkshops"
        filterable
        :placeholder="allowAllWorkshops ? '全部车间 / 产线' : '选择车间或产线'"
        @update:model-value="$emit('select-workshop', String($event || ''))"
      >
        <ElOption
          v-for="workshop in workshops"
          :key="workshop.id"
          :label="workshop.name"
          :value="workshop.id"
        >
          <div class="production-work-center-navigator__workshop-option">
            <span>{{ workshop.name }}</span>
            <small>{{ workshop.path }}</small>
          </div>
        </ElOption>
        <template #empty>
          <ArtPickerEmpty title="没有匹配的车间或产线" />
        </template>
      </ElSelect>
    </div>

    <div class="production-work-center-navigator__section-heading">
      <ArtSectionTitle :show-line="false" :show-marker="false">工作中心</ArtSectionTitle>
      <span class="production-work-center-navigator__count">共 {{ workCenters.length }} 项</span>
    </div>

    <ElInput
      v-model="keyword"
      clearable
      placeholder="搜索工作中心编码或名称"
      aria-label="搜索工作中心"
    >
      <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
    </ElInput>

    <ElScrollbar v-if="filteredCenters.length" class="production-work-center-navigator__scroll">
      <div class="production-work-center-navigator__list">
        <button
          v-if="showAllWorkCenters"
          type="button"
          class="production-work-center-navigator__item"
          :class="{ 'is-current': !selectedWorkCenterId }"
          :aria-current="!selectedWorkCenterId ? 'true' : undefined"
          @click="$emit('select-work-center', '')"
        >
          <span class="production-work-center-navigator__item-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:apps-2-line" />
          </span>
          <span class="production-work-center-navigator__item-copy">
            <strong>全部工作中心</strong>
            <small>{{ workCenters.length }} 个中心</small>
          </span>
          <ArtSvgIcon v-if="!selectedWorkCenterId" icon="ri:check-line" aria-hidden="true" />
        </button>

        <button
          v-for="center in filteredCenters"
          :key="center.id"
          type="button"
          class="production-work-center-navigator__item"
          :class="{ 'is-current': center.id === selectedWorkCenterId }"
          :aria-current="center.id === selectedWorkCenterId ? 'true' : undefined"
          @click="$emit('select-work-center', center.id)"
        >
          <span class="production-work-center-navigator__item-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:dashboard-3-line" />
          </span>
          <span class="production-work-center-navigator__item-copy">
            <strong :title="`${center.code} · ${center.name}`">
              {{ center.code }} · {{ center.name }}
            </strong>
          </span>
          <ArtSvgIcon
            v-if="center.id === selectedWorkCenterId"
            icon="ri:check-line"
            aria-hidden="true"
          />
        </button>
      </div>
    </ElScrollbar>

    <ArtEmptyState
      v-else
      class="production-work-center-navigator__empty"
      size="compact"
      :visual-size="72"
      :title="workCenters.length ? '没有匹配的工作中心' : '当前车间暂无工作中心'"
      :description="
        workCenters.length ? '请调整编码或名称关键词。' : '可前往工作中心页面完成配置。'
      "
    />
  </ArtSectionCard>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtPickerEmpty from '@/components/core/feedback/art-picker-empty/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import ArtIconButton from '@/components/core/widget/art-icon-button/index.vue'
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'

  defineOptions({ name: 'ProductionWorkCenterNavigator' })

  export interface ProductionScopeWorkshopOption {
    id: string
    name: string
    code: string
    path: string
  }

  export interface ProductionScopeCenter {
    id: string
    code: string
    name: string
  }

  const props = withDefaults(
    defineProps<{
      workshops: ProductionScopeWorkshopOption[]
      workCenters: ProductionScopeCenter[]
      selectedWorkshopId: string
      selectedWorkCenterId: string
      loading: boolean
      error: string
      collapsible?: boolean
      allowAllWorkshops?: boolean
      showAllWorkCenters?: boolean
      selectId?: string
    }>(),
    {
      collapsible: false,
      allowAllWorkshops: false,
      showAllWorkCenters: false,
      selectId: 'production-workshop-select'
    }
  )

  defineEmits<{
    refresh: []
    collapse: []
    'select-workshop': [id: string]
    'select-work-center': [id: string]
  }>()

  const keyword = ref('')
  const hasLoaded = ref(Boolean(props.workshops.length || props.workCenters.length))
  const filteredCenters = computed(() => {
    const value = keyword.value.trim().toLocaleLowerCase()
    if (!value) return props.workCenters
    return props.workCenters.filter((center) =>
      `${center.code} ${center.name}`.toLocaleLowerCase().includes(value)
    )
  })

  watch(
    () => props.selectedWorkshopId,
    () => (keyword.value = '')
  )

  watch(
    () => props.loading,
    (loading, wasLoading) => {
      if (wasLoading && !loading) hasLoaded.value = true
    }
  )
</script>

<style scoped lang="scss">
  .production-work-center-navigator {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;

    :deep(.production-work-center-navigator__body) {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 12px;
      min-height: 0;
    }

    &__workshop-field {
      display: grid;
      gap: 7px;

      label {
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-regular);
      }

      .el-select {
        width: 100%;
      }
    }

    &__workshop-option {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;

      span,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      small {
        max-width: 58%;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-top: 2px;

      :deep(.art-section-title) {
        margin: 0;
        font-size: 13px;
      }

      .production-work-center-navigator__count {
        flex: none;
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
      }
    }

    &__scroll {
      flex: 1;
      min-height: 0;
    }

    &__list {
      display: grid;
      gap: 4px;
      padding-right: 4px;
    }

    &__item {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 18px;
      gap: 10px;
      align-items: center;
      width: 100%;
      min-height: 58px;
      padding: 8px 10px;
      font: inherit;
      color: var(--el-text-color-regular);
      text-align: left;
      cursor: pointer;
      background: transparent;
      border: 1px solid transparent;
      border-radius: var(--el-border-radius-base);
      transition:
        color var(--art-motion-duration-fast),
        background-color var(--art-motion-duration-fast),
        border-color var(--art-motion-duration-fast),
        box-shadow var(--art-motion-duration-fast);

      &:hover {
        background: var(--art-gray-100);
        border-color: var(--el-border-color-lighter);
      }

      &.is-current {
        color: var(--theme-color);
        background: color-mix(in srgb, var(--theme-color) 10%, var(--default-box-color));
        border-color: color-mix(in srgb, var(--theme-color) 20%, transparent);
        box-shadow: inset 3px 0 0 var(--theme-color);
      }

      &:focus-visible {
        outline: 2px solid var(--theme-color);
        outline-offset: 2px;
      }
    }

    &__item-icon {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      color: var(--theme-color);
      background: var(--default-box-color);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__item-copy {
      display: grid;
      min-width: 0;

      strong,
      small {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      strong {
        font-size: 13px;
        font-weight: 600;
        color: currentcolor;
      }

      small {
        margin-top: 3px;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__empty {
      flex: 1;
      min-height: 0;
    }
  }
</style>
