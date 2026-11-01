<template>
  <section
    v-if="filters.length"
    aria-label="原值筛选条件"
    class="sql-result-value-filters flex min-w-0 max-w-full shrink-0 flex-col gap-1 border-b border-g-200 px-3 py-2"
  >
    <ElScrollbar max-height="128px">
      <div class="flex min-w-0 max-w-full flex-wrap items-center gap-2">
        <div
          v-for="filter in filters"
          :key="filter.id"
          class="flex min-w-0 max-w-full items-center gap-1"
        >
          <ElButton
            size="small"
            class="min-w-0 flex-1"
            :disabled="disabled"
            :aria-label="`查看筛选原值 ${filter.field}`"
            @click="emit('view', filter)"
          >
            <span class="flex min-w-0 items-center gap-1.5">
              <span class="min-w-0 max-w-32 truncate font-mono" :title="filter.field">{{
                filter.field
              }}</span>
              <span class="shrink-0">{{ filter.operator === 'include' ? '仅保留' : '排除' }}</span>
              <span
                class="min-w-0 max-w-48 truncate font-mono"
                :title="formatSqlResultFilterValue(filter.value)"
                >{{ formatSqlResultFilterValue(filter.value) }}</span
              >
            </span>
          </ElButton>
          <ArtIconButton
            size="small"
            icon="ri:close-line"
            class="shrink-0"
            :label="`移除原值筛选 ${filter.field}`"
            :disabled="disabled"
            @click="emit('remove', filter)"
          />
        </div>
        <ElButton size="small" class="shrink-0" :disabled="disabled" @click="emit('clear')">
          清除原值筛选
        </ElButton>
      </div>
      <p class="mb-0 mt-1 text-xs leading-5 text-g-700">
        仅对已加载结果按返回类型与原值精确匹配，多个条件同时满足；表格与复制跟随筛选，图表、统计和原始导出仍用全部加载结果。
      </p>
    </ElScrollbar>
  </section>
</template>

<script setup lang="ts">
  import { formatSqlResultFilterValue, type SqlResultValueFilter } from './result-value-filter'

  defineOptions({ name: 'SqlResultValueFilters' })

  interface Props {
    filters: readonly SqlResultValueFilter[]
    disabled?: boolean
  }

  defineProps<Props>()
  const emit = defineEmits<{
    view: [filter: SqlResultValueFilter]
    remove: [filter: SqlResultValueFilter]
    clear: []
  }>()
</script>
