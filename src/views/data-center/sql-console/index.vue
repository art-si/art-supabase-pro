<template>
  <div class="sql-console-page art-full-height business-workspace-page">
    <section class="sql-console-container business-workspace-content art-card-xs">
      <el-splitter v-model="splitRatio" layout="vertical">
        <el-splitter-panel>
          <div class="sql-editor-section">
            <div v-if="metadataError" class="sql-editor-section__metadata-alert" role="status">
              <span>{{ metadataError }}。SQL 仍可执行；自动补全和 AI SQL 暂不可用。</span>
              <el-button link type="primary" :loading="metadataLoading" @click="preloadMetadata">
                重试加载
              </el-button>
            </div>
            <Editor
              ref="editorRef"
              v-model="sqlCode"
              @execute="handleExecute"
              @ai-request="openAiDialog(aiErrorContext ? 'fix' : 'generate')"
            />
          </div>
        </el-splitter-panel>

        <el-splitter-panel>
          <div class="result-section">
            <div class="tabs-header">
              <el-tabs v-model="tabs.active" class="result-tabs">
                <el-tab-pane
                  v-for="{ label, name } in tabs.list"
                  :key="name"
                  :name="name"
                  :label="label"
                />
              </el-tabs>
              <div class="tabs-actions">
                <div class="execution-info" v-if="result?.durationMs">
                  <span class="duration">耗时 {{ result.durationMs }}ms</span>
                </div>
                <ArtTooltip content="AI 写 SQL (Ctrl/Cmd + I)" placement="top" :offset="8">
                  <ArtIconButton
                    size="small"
                    @click="openAiDialog(aiErrorContext ? 'fix' : 'generate')"
                    label="AI 写 SQL"
                  >
                    <template #icon
                      ><ElIcon aria-hidden="true"><Cpu /></ElIcon
                    ></template>
                  </ArtIconButton>
                </ArtTooltip>
                <ArtTooltip
                  v-if="!executing"
                  content="执行 (Shift + Enter)"
                  placement="top"
                  :offset="8"
                >
                  <ArtIconButton size="small" @click="() => handleExecute()" label="执行 SQL">
                    <template #icon
                      ><ElIcon aria-hidden="true"><VideoPlay /></ElIcon
                    ></template>
                  </ArtIconButton>
                </ArtTooltip>
                <ArtTooltip v-else content="执行中" placement="top" :offset="8">
                  <ArtIconButton
                    size="small"
                    @click="() => handleExecute()"
                    label="执行中"
                    :loading="executing"
                  >
                    <template #icon
                      ><ElIcon aria-hidden="true"><Loading /></ElIcon
                    ></template>
                  </ArtIconButton>
                </ArtTooltip>
                <ArtTooltip content="格式化 SQL (Ctrl/Cmd + Shift + F)" placement="top" :offset="8">
                  <ArtIconButton size="small" @click="handleFormat" label="格式化 SQL">
                    <template #icon
                      ><ElIcon aria-hidden="true"><MagicStick /></ElIcon
                    ></template>
                  </ArtIconButton>
                </ArtTooltip>
                <ArtTooltip content="清空" placement="top" :offset="8">
                  <ArtIconButton size="small" @click="handleClear" label="清空 SQL">
                    <template #icon
                      ><ElIcon aria-hidden="true"><Close /></ElIcon
                    ></template>
                  </ArtIconButton>
                </ArtTooltip>
              </div>
            </div>
            <ArtOverlayLoading
              v-if="executing && !result"
              loading
              overlay
              text="正在执行 SQL…"
              description="正在查询数据库并整理结果，请稍候"
              class="result-section__loading"
            />
            <div
              v-if="result?.status === 'ok' && result.rows?.length"
              class="tabs-content result-table"
            >
              <ResultTable :loading="executing" :data="result.rows" :columns="result.columns" />
            </div>
            <ElScrollbar v-else class="tabs-content">
              <div class="tabs-content__inner">
                <div v-if="!result" class="empty-state">
                  <ArtEmptyState
                    v-if="!executing"
                    title="等待执行 SQL"
                    description="执行后将在这里展示查询结果、耗时与错误信息"
                    size="compact"
                    :visual-size="76"
                  />
                </div>
                <div v-else-if="result.status === 'error'" class="error-panel">
                  <div class="error-toolbar">
                    <el-tag type="danger" effect="light" round>执行失败</el-tag>
                    <el-button size="small" text type="primary" @click="openAiDialog('fix')">
                      AI 修复这条 SQL
                    </el-button>
                  </div>
                  <pre class="error-message">{{ result.errorMessage }}</pre>
                  <pre v-if="errorCaretPreview" class="error-caret">{{ errorCaretPreview }}</pre>
                </div>
                <div v-else class="empty-result">
                  <ArtEmptyState
                    title="执行成功，暂无数据行"
                    description="当前语句没有返回记录，可以调整查询条件后重新执行"
                    size="compact"
                    :visual-size="76"
                  />
                </div>
              </div>
            </ElScrollbar>
          </div>
        </el-splitter-panel>
      </el-splitter>
    </section>

    <ArtDialog ref="aiDialogRef">
      <div class="ai-panel">
        <el-segmented
          v-model="aiDialog.mode"
          :options="[
            { label: '生成 SQL', value: 'generate' },
            { label: '修复 SQL', value: 'fix' }
          ]"
        />
        <el-input
          v-model="aiDialog.prompt"
          type="textarea"
          :rows="8"
          resize="none"
          placeholder="例如：查出最近 30 天注册且已启用的用户，按创建时间倒序"
        />
        <div v-if="aiDialog.summary" class="ai-summary">{{ aiDialog.summary }}</div>
      </div>
    </ArtDialog>
  </div>
</template>

<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { Close, Cpu, Loading, MagicStick, VideoPlay } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { executeSql, fetchDatabaseMetadata, generateSqlByAi } from '@/api/data-center'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { registerSqlMetadata } from '@/utils/monaco-sql-setup'
  import Editor from './modules/editor.vue'
  import ResultTable from './modules/result-table.vue'
  import {
    buildCaretDiagnostic,
    parseSqlErrorLocation,
    type SqlErrorLocation
  } from '@/utils/sql-workbench'

  interface EditorInstance {
    format: () => Promise<void>
    clear: () => void
    getSqlToExecute: () => string
    setSql: (value: string) => void
    focus: () => void
    clearErrorMarkers: () => void
    applyErrorMarker: (location: SqlErrorLocation | null, message: string) => void
  }

  interface SqlConsoleError {
    message?: string
    durationMs?: number
  }

  const normalizeSqlConsoleError = (error: unknown): SqlConsoleError => {
    if (!error || typeof error !== 'object') return {}
    const record = error as Record<string, unknown>
    return {
      message: typeof record.message === 'string' ? record.message : undefined,
      durationMs: typeof record.durationMs === 'number' ? record.durationMs : undefined
    }
  }

  const sqlCode = ref('SELECT * FROM sys_user LIMIT 10;')
  const executing = ref(false)
  const result = ref<Api.DataCenter.SqlConsole.SqlExecuteResponse | null>(null)
  const splitRatio = ref(0.6)
  const editorRef = ref<EditorInstance | null>(null)
  const aiDialogRef = ref<ArtDialogExpose>()
  const metadataLoading = ref(false)
  const metadataError = ref<string | null>(null)
  let metadataPromise: Promise<Api.DataCenter.SqlConsole.DatabaseMetadata> | null = null
  const getMetadata = (): Promise<Api.DataCenter.SqlConsole.DatabaseMetadata> => {
    if (metadataPromise) return metadataPromise
    metadataLoading.value = true
    metadataPromise = fetchDatabaseMetadata()
      .then((metadata) => {
        registerSqlMetadata(metadata)
        metadataError.value = null
        return metadata
      })
      .catch((error: unknown) => {
        metadataPromise = null
        metadataError.value = getFriendlySupabaseErrorMessage(
          error,
          '数据库结构加载失败，请稍后重试'
        )
        throw error
      })
      .finally(() => {
        metadataLoading.value = false
      })
    return metadataPromise
  }
  const preloadMetadata = (): void => {
    void getMetadata().catch(() => {
      // 错误保留在可重试提示中，SQL 编辑与执行仍可继续。
    })
  }
  onMounted(() => {
    registerSqlMetadata({ schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] })
    preloadMetadata()
  })
  const sqlErrorLocation = ref<SqlErrorLocation | null>(null)

  const tabs = ref({
    active: 'result',
    list: [{ name: 'result', label: '结果' }]
  })

  const aiDialog = ref({
    mode: 'generate' as 'generate' | 'fix',
    prompt: '',
    summary: ''
  })

  const aiErrorContext = computed(() => result.value?.status === 'error')

  // 把后端错误里的 LINE / ^ 信息整理成可读预览，方便在结果面板快速判断问题。
  const errorCaretPreview = computed(() => {
    if (!result.value?.queryText || !sqlErrorLocation.value) return ''
    return buildCaretDiagnostic(result.value.queryText, sqlErrorLocation.value)
  })

  // 执行逻辑同时负责清空旧标记，并在失败时把错误位置重新画回 Monaco。
  const handleExecute = async (sql?: string) => {
    const sqlToExecute = sql || editorRef.value?.getSqlToExecute() || sqlCode.value

    if (!sqlToExecute || !sqlToExecute.trim()) {
      ElMessage.warning('请输入 SQL 查询')
      return
    }

    executing.value = true
    result.value = null
    sqlErrorLocation.value = null
    editorRef.value?.clearErrorMarkers()

    try {
      const { data, error } = await executeSql({ query: sqlToExecute })
      if (error) {
        const sqlError = normalizeSqlConsoleError(error)
        const errorMessage = sqlError.message || '执行 SQL 时发生错误'
        const location = parseSqlErrorLocation(errorMessage)
        sqlErrorLocation.value = location
        editorRef.value?.applyErrorMarker(location, errorMessage)
        result.value = {
          status: 'error',
          errorMessage,
          durationMs: sqlError.durationMs,
          queryText: sqlToExecute
        }
        return
      }

      result.value = data
      sqlErrorLocation.value = null
      editorRef.value?.clearErrorMarkers()
    } finally {
      executing.value = false
    }
  }

  const handleFormat = async () => {
    editorRef.value?.format()
  }

  const handleClear = () => {
    editorRef.value?.clear()
    editorRef.value?.clearErrorMarkers()
    sqlErrorLocation.value = null
    result.value = null
  }

  const openAiDialog = (mode: 'generate' | 'fix' = 'generate') => {
    // 用户填写提示词时并行预取 schema，生成按钮不再额外串行等待元数据。
    preloadMetadata()
    aiDialog.value.mode = mode
    aiDialog.value.summary = ''

    if (mode === 'fix') {
      aiDialog.value.prompt = result.value?.errorMessage
        ? `修复这条 PostgreSQL，并解释改动原因。\n\n错误信息：${result.value.errorMessage}`
        : '修复这条 PostgreSQL，并解释改动原因。'
      void openAiDialogRef(mode)
      return
    }

    aiDialog.value.prompt = ''
    void openAiDialogRef(mode)
  }

  const openAiDialogRef = (mode: 'generate' | 'fix') =>
    aiDialogRef.value?.handleOpen(undefined, {
      title: 'AI SQL 助手',
      size: 'md',
      contentMaxHeight: '60vh',
      confirmText: mode === 'fix' ? '修复 SQL' : '生成 SQL',
      onConfirm: handleAiGenerate
    })

  // AI 生成会带上当前 schema 摘要，避免模型在表名和关联关系上瞎猜。
  const handleAiGenerate = async (): Promise<boolean> => {
    if (!aiDialog.value.prompt.trim()) {
      ElMessage.warning('请输入需求描述')
      return false
    }

    try {
      const metadata = await getMetadata()
      const aiResponse = await generateSqlByAi({
        prompt: aiDialog.value.prompt,
        mode: aiDialog.value.mode,
        currentSql: sqlCode.value,
        metadata
      })
      const { data, error } = aiResponse

      if (error || !data?.sql) {
        const aiError = normalizeSqlConsoleError(error)
        ElMessage.error(
          aiError.message || 'AI SQL 功能未配置。请在 Supabase Edge Function 中配置模型密钥。'
        )
        return false
      }

      editorRef.value?.setSql(data.sql)
      editorRef.value?.clearErrorMarkers()
      sqlErrorLocation.value = null
      aiDialog.value.summary = data.summary || ''
      const warnings = (data.warnings ?? []).filter(Boolean)
      if (warnings.length) {
        ElMessage.warning({
          message: `AI SQL 已写入编辑器，请确认：${warnings.join('；')}`,
          duration: 6000,
          showClose: true
        })
      } else {
        ElMessage.success(
          data.model ? `AI SQL 已写入编辑器（${data.model}）` : 'AI SQL 已写入编辑器'
        )
      }
      return true
    } catch (error) {
      ElMessage.error(
        metadataError.value || getFriendlySupabaseErrorMessage(error, 'AI SQL 生成失败，请稍后重试')
      )
      return false
    }
  }
</script>

<style scoped lang="scss">
  .sql-console-page {
    height: var(--art-full-height);
  }

  .sql-console-container {
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0;
    margin: 0;
    overflow: hidden;

    .sql-editor-section {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      min-height: 0;

      &__metadata-alert {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        font-size: 13px;
        line-height: 1.5;
        color: var(--el-text-color-regular);
        background: var(--el-color-warning-light-9);
        border-bottom: 1px solid var(--el-color-warning-light-5);

        > span {
          min-width: 0;
          overflow-wrap: anywhere;
        }
      }
    }
  }

  .result-section {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--el-bg-color);

    > .tabs-header {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      justify-content: space-between;
      height: 40px;
      padding-right: 16px;
      border-bottom: 1px solid var(--el-border-color);

      .result-tabs {
        flex: 1;

        :deep(.el-tabs__header) {
          margin: 0;

          .el-tabs__nav-wrap {
            padding: 0 1rem;

            &::after {
              display: none;
            }
          }
        }

        :deep(.el-tabs__content) {
          display: none;
        }
      }

      .tabs-actions {
        display: flex;
        gap: 8px;
        align-items: center;

        .execution-info {
          margin-right: 12px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
        }
      }
    }

    > .result-section__loading {
      top: 40px;
      height: auto;
    }

    > .tabs-content {
      position: relative;
      flex: 1;
      min-width: 0;
      min-height: 0;

      :deep(.el-scrollbar__view) {
        min-height: 100%;
      }

      .tabs-content__inner {
        min-height: 100%;
      }

      .empty-state {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100%;
        padding: 40px;

        :deep(.el-empty) {
          height: 100%;
          padding: 0;

          .el-empty__image {
            height: 80%;
          }
        }
      }

      .error-panel {
        padding: 16px;

        .error-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .error-message,
        .error-caret {
          margin: 0;
          font-family: Consolas, 'Courier New', monospace;
          line-height: 1.6;
          color: var(--el-color-error);
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .error-caret {
          padding: 12px;
          margin-top: 12px;
          background: color-mix(in srgb, var(--el-color-error) 6%, transparent);
          border-radius: var(--el-border-radius-base);
        }
      }

      .empty-result {
        padding: 40px;
      }
    }

    > .result-table {
      overflow: hidden;

      :deep(.art-table) {
        height: 100% !important;
      }

      :deep(.el-table) {
        margin: 0;

        &::before {
          width: 0;
        }

        .el-table__inner-wrapper {
          &::before,
          &::after {
            background-color: transparent;
          }

          .el-table__border-left-patch {
            background-color: transparent;
          }
        }
      }
    }
  }

  .ai-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;

    .ai-summary {
      padding: 12px 14px;
      line-height: 1.6;
      color: var(--el-text-color-secondary);
      background: var(--el-fill-color-light);
      border-radius: var(--el-border-radius-base);
    }
  }
</style>
