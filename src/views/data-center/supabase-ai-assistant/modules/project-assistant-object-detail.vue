<template>
  <main class="project-assistant__detail art-card-xs">
    <div class="project-assistant__panel-title">
      <div>
        <strong>{{ selectedObject?.objectName || '对象详情' }}</strong>
        <small
          v-if="selectedObject"
          class="project-assistant__detail-description"
          :title="detail?.description || selectedObject.description || '暂无对象说明'"
        >
          {{ detail?.description || selectedObject.description || '暂无对象说明' }}
        </small>
        <small v-else>从左侧选择数据库对象</small>
      </div>
      <div class="project-assistant__detail-actions">
        <ElButton
          v-if="selectedObject"
          text
          type="primary"
          :disabled="chatSending"
          @click="emit('analyze', objectAiActions[0])"
        >
          <ArtSvgIcon icon="ri:sparkling-2-line" /> AI 解读
        </ElButton>
        <ElButton
          v-if="canEditDescription"
          text
          :type="assistantMode === 'controlled_write' ? 'warning' : 'primary'"
          @click="emit('edit-description')"
        >
          <ArtSvgIcon icon="ri:edit-2-line" /> 编辑说明
        </ElButton>
        <ElButton v-if="detail?.ddl" text type="primary" @click="emit('copy-ddl')">
          <ArtSvgIcon icon="ri:file-copy-line" /> 复制 DDL
        </ElButton>
      </div>
    </div>

    <ArtAsyncState
      v-if="selectedObject"
      class="project-assistant__detail-state"
      :loading="loading.detail"
      :loading-mode="detail ? 'mask' : 'skeleton'"
      :error="errors.detail"
      full-height
      min-height="0"
      @retry="emit('retry', selectedObject)"
    >
      <ElTabs v-model="detailTab" class="project-assistant__detail-tabs">
        <ElTabPane label="智能概览" name="insights">
          <template #label>
            <span class="project-assistant__tab-label">
              <ArtSvgIcon icon="ri:sparkling-2-line" />智能概览
            </span>
          </template>
          <ElScrollbar class="project-assistant__insights-scroll" always>
            <div class="project-assistant__insights">
              <section>
                <ArtSectionTitle :show-line="false">对象画像</ArtSectionTitle>
                <div class="project-assistant__insight-grid">
                  <article v-for="metric in objectInsights.metrics" :key="metric.label">
                    <span><ArtSvgIcon :icon="metric.icon" /></span>
                    <div>
                      <small>{{ metric.label }}</small>
                      <strong>{{ metric.value }}</strong>
                      <p>{{ metric.helper }}</p>
                    </div>
                  </article>
                </div>
              </section>

              <section>
                <ArtSectionTitle :show-line="false">治理检查</ArtSectionTitle>
                <div class="project-assistant__governance-list">
                  <article v-for="item in objectInsights.governanceChecks" :key="item.label">
                    <span :class="`is-${item.status}`">
                      <ArtSvgIcon :icon="item.icon" />
                    </span>
                    <div>
                      <strong>{{ item.label }}</strong>
                      <small>{{ item.detail }}</small>
                    </div>
                    <ElTag :type="item.status" size="small" effect="light" round>
                      {{ item.statusLabel }}
                    </ElTag>
                  </article>
                </div>
              </section>

              <section>
                <ArtSectionTitle :show-line="false">AI 分析动作</ArtSectionTitle>
                <div class="project-assistant__analysis-actions">
                  <button
                    v-for="action in objectAiActions"
                    :key="action.label"
                    type="button"
                    :disabled="chatSending"
                    @click="emit('analyze', action)"
                  >
                    <span><ArtSvgIcon :icon="action.icon" /></span>
                    <span>
                      <strong>{{ action.label }}</strong>
                      <small>{{ action.description }}</small>
                    </span>
                    <ArtSvgIcon icon="ri:arrow-right-up-line" />
                  </button>
                </div>
              </section>
            </div>
          </ElScrollbar>
        </ElTabPane>

        <ElTabPane label="对象定义" name="ddl">
          <template #label>
            <span class="project-assistant__tab-label">
              <ArtSvgIcon icon="ri:code-s-slash-line" />对象定义
            </span>
          </template>
          <ArtAsyncState
            :empty="!detail?.ddl"
            empty-text="当前对象没有可显示的定义"
            empty-description="可切换到字段或关系信息继续查看。"
            full-height
            min-height="0"
          >
            <ElScrollbar class="project-assistant__code-scroll" always>
              <pre
                class="project-assistant__code"
                aria-label="SQL 对象定义"
              ><code v-sql-highlight="detail?.ddl || ''" class="language-sql"></code></pre>
            </ElScrollbar>
          </ArtAsyncState>
        </ElTabPane>

        <ElTabPane v-if="detail?.columns?.length" label="字段" name="columns">
          <template #label>
            <span class="project-assistant__tab-label"> <ArtSvgIcon icon="ri:table-2" />字段 </span>
          </template>
          <div class="project-assistant__fields-panel">
            <div class="project-assistant__fields-toolbar">
              <ElInput v-model="fieldKeyword" clearable placeholder="搜索字段、类型或说明">
                <template #prefix><ArtSvgIcon icon="ri:search-line" /></template>
              </ElInput>
              <span>{{ filteredColumns.length }} / {{ detail.columns.length }} 个字段</span>
            </div>
            <ArtTable
              class="project-assistant__fields-table"
              :data="filteredColumns"
              :columns="fieldColumns"
              :pagination="false"
              height="100%"
              :scrollbar-always-on="false"
              stripe
            />
          </div>
        </ElTabPane>

        <ElTabPane v-if="selectedObject.objectType === 'table'" label="外键关系" name="relations">
          <template #label>
            <span class="project-assistant__tab-label">
              <ArtSvgIcon icon="ri:git-branch-line" />外键关系
            </span>
          </template>
          <ArtAsyncState
            :loading="loading.relationships"
            :loading-mode="relationships.length ? 'mask' : 'skeleton'"
            :error="errors.relationships"
            :empty="!loading.relationships && !errors.relationships && !relationships.length"
            empty-text="没有关联此外键的记录"
            empty-description="当前对象没有可查看的关联记录。"
            full-height
            min-height="0"
            @retry="emit('retry', selectedObject)"
          >
            <ElScrollbar class="project-assistant__relation-list" always>
              <article v-for="relation in relationships" :key="relation.constraintName">
                <strong>{{ relation.constraintName }}</strong>
                <span>
                  {{ relation.sourceSchema }}.{{ relation.sourceTable }} →
                  {{ relation.targetSchema }}.{{ relation.targetTable }}
                </span>
                <code>{{ relation.definition }}</code>
              </article>
            </ElScrollbar>
          </ArtAsyncState>
        </ElTabPane>
      </ElTabs>
    </ArtAsyncState>

    <ArtEmptyState
      v-else
      class="project-assistant__detail-empty"
      title="选择对象查看定义"
      description="支持表、视图、函数、触发器、RLS 策略和索引。"
    />
  </main>
</template>

<script setup lang="ts">
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import type {
    ProjectAssistantSafetyMode,
    ProjectDatabaseObject,
    ProjectObjectDetail,
    ProjectRelationship
  } from '@/types/supabase-ai-assistant'
  import {
    getProjectObjectInsights,
    projectObjectFieldColumns as fieldColumns,
    type ProjectAssistantObjectAiAction
  } from './project-assistant-presenter'
  import { sqlHighlightDirective as vSqlHighlight } from './sql-highlight'

  interface Props {
    selectedObject: ProjectDatabaseObject | null
    detail: ProjectObjectDetail | null
    relationships: ProjectRelationship[]
    loading: { detail: boolean; relationships: boolean }
    errors: { detail: Error | null; relationships: Error | null }
    assistantMode: ProjectAssistantSafetyMode
    canEditDescription: boolean
    chatSending: boolean
  }

  const props = defineProps<Props>()
  const emit = defineEmits<{
    analyze: [action: ProjectAssistantObjectAiAction]
    'edit-description': []
    'copy-ddl': []
    retry: [item: ProjectDatabaseObject]
  }>()

  const detailTab = ref('ddl')
  const fieldKeyword = ref('')
  const filteredColumns = computed(() => {
    const columns = props.detail?.columns ?? []
    const keyword = fieldKeyword.value.trim().toLowerCase()
    if (!keyword) return columns
    return columns.filter((column) =>
      [column.name, column.dataType, column.defaultValue, column.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    )
  })
  const objectInsights = computed(() =>
    getProjectObjectInsights(props.detail, props.selectedObject, props.relationships)
  )
  const objectAiActions = computed(() => objectInsights.value.aiActions)

  watch(
    () => props.selectedObject,
    () => {
      detailTab.value = 'ddl'
      fieldKeyword.value = ''
    }
  )
</script>

<style scoped lang="scss">
  .project-assistant {
    &__detail {
      display: flex;
      flex-direction: column;
      min-width: 0;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    &__panel-title {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: space-between;
      min-height: 62px;
      padding: 12px 15px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      strong,
      small {
        display: block;
      }

      small {
        margin-top: 3px;
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    &__detail-actions {
      display: flex;
      flex: 0 0 auto;
      align-items: center;
    }

    &__detail-description {
      max-width: min(52vw, 720px);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &__detail-state {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
    }

    &__detail-tabs {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-height: 0;
      padding: 0 14px 14px;
      overflow: hidden;
    }

    &__detail-tabs :deep(.el-tabs__header) {
      flex: none;
    }

    &__tab-label {
      display: inline-flex;
      gap: 6px;
      align-items: center;
    }

    &__detail-tabs :deep(.el-tabs__content) {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }

    &__detail-tabs :deep(.el-tab-pane) {
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }

    &__insights-scroll,
    &__code-scroll,
    &__relation-list {
      height: 100%;
    }

    &__insights {
      display: flex;
      flex-direction: column;
      gap: 18px;
      padding: 4px 2px 16px;

      :deep(.art-section-title) {
        margin-bottom: 10px;
      }
    }

    &__insight-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
      gap: 10px;

      article {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        min-width: 0;
        padding: 13px;
        background:
          linear-gradient(145deg, var(--el-color-primary-light-9), transparent 72%),
          var(--el-bg-color);
        border: 1px solid var(--el-border-color-extra-light);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 32px;
          height: 32px;
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
          border-radius: var(--el-border-radius-base);
        }

        > div {
          min-width: 0;
        }

        small,
        strong,
        p {
          display: block;
        }

        small {
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }

        strong {
          margin-top: 2px;
          font-size: 19px;
          color: var(--el-text-color-primary);
        }

        p {
          margin: 3px 0 0;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 10px;
          color: var(--el-text-color-placeholder);
          white-space: nowrap;
        }
      }
    }

    &__governance-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 8px;

      article {
        display: flex;
        gap: 9px;
        align-items: center;
        min-width: 0;
        padding: 10px 12px;
        background: var(--el-fill-color-extra-light);
        border: 1px solid var(--el-border-color-extra-light);
        border-radius: var(--el-border-radius-base);

        > span {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 28px;
          height: 28px;
          border-radius: 50%;

          &.is-success {
            color: var(--el-color-success);
            background: var(--el-color-success-light-9);
          }

          &.is-warning {
            color: var(--el-color-warning);
            background: var(--el-color-warning-light-9);
          }

          &.is-info {
            color: var(--el-color-info);
            background: var(--el-color-info-light-9);
          }
        }

        > div {
          flex: 1;
          min-width: 0;

          strong,
          small {
            display: block;
          }

          strong {
            font-size: 12px;
          }

          small {
            margin-top: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            font-size: 10px;
            color: var(--el-text-color-secondary);
            white-space: nowrap;
          }
        }
      }
    }

    &__analysis-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 8px;

      button {
        display: flex;
        gap: 10px;
        align-items: center;
        min-width: 0;
        padding: 11px 12px;
        text-align: left;
        cursor: pointer;
        background: var(--el-bg-color);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--el-border-radius-base);
        transition:
          color 0.18s ease,
          border-color 0.18s ease,
          box-shadow 0.18s ease,
          transform 0.18s ease;

        > span:first-child {
          display: grid;
          flex: 0 0 auto;
          place-items: center;
          width: 32px;
          height: 32px;
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
          border-radius: var(--el-border-radius-base);
        }

        > span:nth-child(2) {
          flex: 1;
          min-width: 0;
        }

        strong,
        small {
          display: block;
        }

        small {
          margin-top: 3px;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }

        > svg {
          flex: 0 0 auto;
          color: var(--el-text-color-placeholder);
        }

        &:hover:not(:disabled) {
          color: var(--el-color-primary);
          border-color: var(--el-color-primary-light-6);
          box-shadow: 0 8px 20px rgb(64 128 255 / 10%);
          transform: translateY(-1px);
        }

        &:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
      }
    }

    &__fields-panel {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }

    &__fields-table {
      flex: 1;
      min-height: 0;
    }

    &__fields-toolbar {
      display: flex;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      height: 49px;
      padding-bottom: 9px;

      .el-input {
        width: min(320px, 65%);
      }

      > span {
        flex: 0 0 auto;
        font-size: 11px;
        color: var(--el-text-color-secondary);
      }
    }

    &__code {
      box-sizing: border-box;
      width: max-content;
      min-width: 100%;
      min-height: 100%;
      padding: 16px;
      margin: 0;
      font:
        12px/1.7 Consolas,
        monospace;
      color: #d7e0ff;
      white-space: pre;
      background: #111827;
      border-radius: var(--el-border-radius-base);

      code {
        display: block;
      }

      :deep(.hljs-comment),
      :deep(.hljs-quote) {
        font-style: italic;
        color: #68758f;
      }

      :deep(.hljs-keyword),
      :deep(.hljs-selector-tag),
      :deep(.hljs-literal),
      :deep(.hljs-type) {
        color: #c792ea;
      }

      :deep(.hljs-title),
      :deep(.hljs-title.function_),
      :deep(.hljs-built_in) {
        color: #82aaff;
      }

      :deep(.hljs-string),
      :deep(.hljs-regexp) {
        color: #addb67;
      }

      :deep(.hljs-number),
      :deep(.hljs-symbol) {
        color: #f78c6c;
      }

      :deep(.hljs-params),
      :deep(.hljs-variable),
      :deep(.hljs-attr) {
        color: #89ddff;
      }
    }

    &__detail-empty {
      flex: 1;
    }

    &__relation-list article {
      display: flex;
      flex-direction: column;
      gap: 7px;
      padding: 12px;
      margin: 10px 0;
      background: var(--el-fill-color-lighter);
      border-radius: var(--el-border-radius-base);
    }

    &__relation-list code {
      color: var(--el-text-color-secondary);
      white-space: pre-wrap;
    }

    @media (width <= 640px) {
      &__detail-actions {
        flex-wrap: wrap;
        justify-content: flex-end;
      }
    }
  }
</style>
