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
    <div ref="viewport" class="sql-statement-navigator__viewport min-h-0 flex-1">
      <ArtEmptyState
        v-if="!filtered.length"
        :title="keyword ? '没有匹配的语句' : '暂无 SQL 语句'"
        description="编辑器中的多条语句会自动出现在这里"
        size="compact"
      />
      <ElAutoResizer v-else :on-resize="scrollActive">
        <template #default="{ height }">
          <ElTreeV2
            ref="treeRef"
            :data="filtered"
            :height="Math.max(1, height)"
            :item-size="STATEMENT_ROW_HEIGHT"
            :props="{ value: 'startOffset', label: 'sql' }"
            :current-node-key="activeKey"
            :expand-on-click-node="false"
            :icon="undefined"
            :indent="0"
            scrollbar-always-on
          >
            <template #default="{ data: statement }">
              <button
                type="button"
                class="sql-statement-item"
                :class="{ 'is-active': activeKey === statement.startOffset }"
                :aria-label="`定位第 ${statement.order} 条语句`"
                :aria-current="activeKey === statement.startOffset ? 'true' : undefined"
                :data-statement-key="statement.startOffset"
                @keydown="navigate($event, statement.startOffset)"
                @click.stop="emit('locate', statement)"
              >
                <span class="flex items-center justify-between gap-2"
                  ><span class="font-medium">{{ statement.order }} · {{ statement.command }}</span
                  ><span class="text-xs text-g-600">第 {{ statement.lineNumber }} 行</span></span
                >
                <span class="sql-statement-item__preview" :title="statement.sql">{{
                  statement.sql
                }}</span>
              </button>
            </template>
          </ElTreeV2>
        </template>
      </ElAutoResizer>
    </div>
  </aside>
</template>
<script setup lang="ts">
  import { computed, nextTick, ref, watch } from 'vue'
  import { ElTreeV2 } from 'element-plus'
  import { ElAutoResizer } from 'element-plus/es/components/table-v2/index.mjs'
  import { sortedIndex, sortedLastIndex } from 'lodash-es'
  import type { SqlStatementRef } from '@/utils/sql-workbench'
  const props = withDefaults(
    defineProps<{ statements: SqlStatementRef[]; activeOffset: number; showHeading?: boolean }>(),
    { showHeading: true }
  )
  const emit = defineEmits<{ locate: [statement: SqlStatementRef]; collapse: [] }>()
  const keyword = ref('')
  const STATEMENT_ROW_HEIGHT = 96
  const treeRef = ref<InstanceType<typeof ElTreeV2>>()
  const viewport = ref<HTMLElement>()
  const rows = computed(() =>
    props.statements.map((statement, index) => ({ ...statement, order: index + 1 }))
  )
  const filtered = computed(() =>
    rows.value.filter((statement) =>
      statement.sql.toLowerCase().includes(keyword.value.trim().toLowerCase())
    )
  )
  const offsets = computed(() => filtered.value.map((statement) => statement.startOffset))
  const activeKey = computed(() => {
    const statement = filtered.value[sortedLastIndex(offsets.value, props.activeOffset) - 1]
    return statement && props.activeOffset < statement.endOffset ? statement.startOffset : undefined
  })
  const scrollActive = async () => {
    await nextTick()
    const key = activeKey.value ?? offsets.value[0]
    if (key === undefined) return
    treeRef.value?.scrollToNode(key, 'auto')
  }
  watch([activeKey, filtered], scrollActive, { immediate: true, flush: 'post' })
  const navigate = async (event: KeyboardEvent, key: number) => {
    const index = sortedIndex(offsets.value, key)
    const destinations: Record<string, number> = {
      ArrowDown: Math.min(filtered.value.length - 1, index + 1),
      ArrowUp: Math.max(0, index - 1),
      Home: 0,
      End: filtered.value.length - 1
    }
    const destination = destinations[event.key]
    if (destination === undefined) return
    event.preventDefault()
    event.stopPropagation()
    const target = filtered.value[destination]
    if (!target) return
    treeRef.value?.scrollToNode(target.startOffset, 'auto')
    await nextTick()
    viewport.value
      ?.querySelector<HTMLButtonElement>(`button[data-statement-key="${target.startOffset}"]`)
      ?.focus()
  }
</script>
<style scoped lang="scss">
  .sql-statement-navigator {
    background: var(--el-fill-color-extra-light);

    &__viewport {
      :deep(.el-tree-node__expand-icon) {
        display: none;
      }

      :deep(.el-tree-node__content) {
        padding: 0;
        margin: 0 8px;
        white-space: normal;
        background: transparent;
      }
    }
  }

  .sql-statement-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    min-width: 0;
    height: calc(100% - 4px);
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
