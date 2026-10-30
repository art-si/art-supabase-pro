<template>
  <aside class="sql-statement-navigator flex h-full min-h-0 flex-col" aria-label="SQL 语句导航">
    <div v-if="showHeading" class="flex shrink-0 items-center justify-between gap-2 px-3 py-3">
      <span class="art-icon-label text-sm font-medium"
        ><ArtSvgIcon icon="ri:list-check" aria-hidden="true" />语句导航</span
      >
      <ArtIconButton
        size="small"
        icon="ri:side-bar-line"
        label="收起语句导航"
        @click="emit('collapse')"
      />
    </div>
    <div class="px-3 pb-3"
      ><ElInput
        v-model="keyword"
        clearable
        placeholder="搜索脚本中的语句"
        aria-label="搜索脚本中的语句"
        ><template #prefix><ArtSvgIcon icon="ri:search-line" /></template></ElInput
    ></div>
    <div class="px-3 pb-2 text-xs text-g-600"
      >{{ filtered.length }} / {{ statements.length }} 条 · 点击定位，不会执行</div
    >
    <ElScrollbar class="min-h-0 flex-1">
      <div class="flex flex-col gap-1 px-2 pb-3">
        <ArtEmptyState
          v-if="!filtered.length"
          :title="keyword ? '没有匹配的语句' : '暂无 SQL 语句'"
          description="编辑器中的多条语句会自动出现在这里"
          size="compact"
        />
        <button
          v-for="statement in filtered"
          :key="statement.startOffset"
          type="button"
          class="sql-statement-item"
          :class="{
            'is-active': activeOffset >= statement.startOffset && activeOffset < statement.endOffset
          }"
          :aria-label="`定位第 ${statement.order} 条语句`"
          @click="emit('locate', statement)"
        >
          <span class="flex items-center justify-between gap-2"
            ><span class="font-medium">{{ statement.order }} · {{ statement.command }}</span
            ><span class="text-xs text-g-600">第 {{ statement.lineNumber }} 行</span></span
          >
          <span class="sql-statement-item__preview" :title="statement.sql">{{
            statement.sql
          }}</span>
        </button>
      </div>
    </ElScrollbar>
  </aside>
</template>
<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { SqlStatementRef } from '@/utils/sql-workbench'
  const props = withDefaults(
    defineProps<{ statements: SqlStatementRef[]; activeOffset: number; showHeading?: boolean }>(),
    { showHeading: true }
  )
  const emit = defineEmits<{ locate: [statement: SqlStatementRef]; collapse: [] }>()
  const keyword = ref('')
  const filtered = computed(() =>
    props.statements
      .map((statement, index) => ({ ...statement, order: index + 1 }))
      .filter((statement) =>
        statement.sql.toLowerCase().includes(keyword.value.trim().toLowerCase())
      )
  )
</script>
<style scoped lang="scss">
  .sql-statement-navigator {
    background: var(--el-fill-color-extra-light);
  }

  .sql-statement-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    min-width: 0;
    padding: 12px;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    border: 1px solid transparent;
    border-radius: var(--el-border-radius-base);
  }

  .sql-statement-item:hover {
    background: var(--el-fill-color-light);
  }

  .sql-statement-item.is-active {
    color: var(--el-text-color-primary);
    background: var(--el-color-primary-light-9);
    border-color: var(--el-color-primary-light-5);
  }

  .sql-statement-item:focus-visible {
    outline: 2px solid var(--el-color-primary);
    outline-offset: -2px;
  }

  .sql-statement-item__preview {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    font-family: Consolas, monospace;
    line-height: 1.7;
    color: var(--el-text-color-regular);
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    -webkit-box-orient: vertical;
  }
</style>
