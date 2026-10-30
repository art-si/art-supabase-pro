<template>
  <div class="sql-console-page art-full-height business-workspace-page">
    <section
      ref="workspaceElement"
      class="sql-console-container business-workspace-content art-card-xs"
    >
      <div class="sql-editor-tools">
        <div class="flex min-w-0 items-center gap-2">
          <ArtIconButton
            size="small"
            icon="ri:side-bar-line"
            :label="!isNarrow && outlineVisible ? '收起数据库资源' : '展开数据库资源'"
            :aria-expanded="!isNarrow && outlineVisible"
            @click="toggleOutline"
          />
          <span class="sql-editor-tools__title text-sm font-medium">SQL 工作区</span>
          <span class="sql-editor-tools__context text-xs text-g-600"
            >{{ statements.length }} 条语句 ·
            {{ executionSource === 'selection' ? '执行选中内容' : activeStatementLabel }}</span
          >
        </div>
        <div class="flex shrink-0 items-center gap-1">
          <EditorTools
            :sql="sqlCode"
            :scope="scopeKey"
            v-model:view="editorView"
            @replace="editorRef?.replace()"
            @comment="editorRef?.comment()"
            @format="editorRef?.format()"
            @goto="editorRef?.goToLine($event)"
            @load-file="openSqlInNewTab"
          />
          <ArtTooltip content="撤销（Ctrl/⌘ + Z）"
            ><ArtIconButton
              size="small"
              icon="ri:arrow-go-back-line"
              label="撤销 SQL 编辑"
              :disabled="!editorHistory.undo"
              @click="editorRef?.undo()"
          /></ArtTooltip>
          <ArtTooltip content="重做（Ctrl/⌘ + Shift + Z）"
            ><ArtIconButton
              size="small"
              icon="ri:arrow-go-forward-line"
              label="重做 SQL 编辑"
              :disabled="!editorHistory.redo"
              @click="editorRef?.redo()"
          /></ArtTooltip>
          <span class="h-4 w-px bg-g-300" aria-hidden="true" />
          <ArtTooltip content="查找（Ctrl/⌘ + F）"
            ><ArtIconButton
              size="small"
              icon="ri:search-line"
              label="查找 SQL 内容"
              @click="editorRef?.find()"
          /></ArtTooltip>
          <ArtTooltip content="选择光标所在语句"
            ><ArtIconButton
              size="small"
              icon="ri:cursor-line"
              label="选择当前语句"
              :disabled="!statements.length"
              @click="editorRef?.selectStatement()"
          /></ArtTooltip>
        </div>
      </div>
      <div class="sql-query-bar">
        <ElSelect
          :model-value="activeTab.connectionId"
          class="sql-query-bar__connection"
          aria-label="当前数据库连接"
          @change="selectConnection"
        >
          <template #prefix><ArtSvgIcon icon="ri:database-2-line" /></template>
          <ElOption label="当前 Supabase" value="builtin" />
          <ElOption
            v-for="item in connectionSnapshot?.connections || []"
            :key="item.id"
            :label="`${item.name} · ${getSqlDatabaseLabel(item)}`"
            :value="item.id"
            :disabled="!item.enabled"
          />
          <ElOption
            v-if="external && !connection"
            :label="`${activeTab.label} · 连接未就绪`"
            :value="activeTab.connectionId"
            disabled
          />
        </ElSelect>
        <ElScrollbar class="sql-query-bar__tabs">
          <div class="flex items-center gap-1" role="tablist" aria-label="SQL 查询页签">
            <div
              v-for="(item, index) in queryTabs.tabs"
              :key="item.id"
              class="sql-query-tab"
              :class="{ 'is-active': item.id === queryTabs.active }"
            >
              <button
                type="button"
                role="tab"
                :aria-selected="item.id === queryTabs.active"
                :tabindex="item.id === queryTabs.active ? 0 : -1"
                :title="item.label"
                @click="selectTab(item.id)"
                @keydown="navigateQueryTabs($event, index)"
                >{{ item.label }} · {{ index + 1 }}</button
              >
              <ArtIconButton
                v-if="queryTabs.tabs.length > 1"
                size="small"
                icon="ri:close-line"
                :label="`关闭查询页签 ${index + 1}`"
                @click="closeTab(item.id)"
              />
            </div>
          </div>
        </ElScrollbar>
        <ArtIconButton
          size="small"
          icon="ri:add-line"
          label="新建查询页签"
          :disabled="queryTabs.tabs.length >= 8 || (external && !connection)"
          @click="newQueryTab"
        />
        <ElButton size="small" @click="connectionManagerRef?.open()"
          ><ArtSvgIcon icon="ri:plug-line" />连接管理</ElButton
        >
      </div>
      <div class="sql-target-context" :title="connectionLabel"
        ><span class="art-icon-label truncate"
          ><ArtSvgIcon icon="ri:database-2-line" />{{ connectionLabel }}</span
        ><span
          v-if="external && dialect === 'dm'"
          class="sql-target-context__schema art-icon-label"
        >
          <span>当前 schema</span
          ><ElSelect
            :model-value="querySchema"
            size="small"
            aria-label="当前查询 schema"
            placeholder="连接默认"
            :empty-values="[null, undefined]"
            class="w-44!"
            :disabled="!connection || executing"
            @change="selectQuerySchema"
          >
            <template #prefix><ArtSvgIcon icon="ri:database-line" /></template>
            <ElOption value="" label="连接默认" /><ElOption
              v-for="schema in databaseMetadata?.schemas || []"
              :key="schema"
              :label="schema"
              :value="schema"
            />
          </ElSelect> </span
        ><span class="shrink-0">{{
          external ? SQL_DIALECT_LABELS[dialect] : '数据库管理范围'
        }}</span></div
      >
      <div
        v-if="toolsStorageError"
        class="flex items-center justify-between gap-3 px-3 py-2 text-xs text-warning"
        role="status"
        ><span>收藏或显示偏好未保存，请导出重要脚本后检查浏览器存储空间。</span
        ><ElButton link type="warning" @click="retryToolsSave">重试保存</ElButton></div
      >
      <ArtWorkspaceSplitter
        class="sql-workspace-splitter"
        :primary-size="`${navigatorWidth}px`"
        :primary-min="`${SQL_NAVIGATOR_MIN_WIDTH}px`"
        :primary-max="`${SQL_NAVIGATOR_MAX_WIDTH}px`"
        :primary-collapsed="isNarrow || !outlineVisible"
        :primary-collapsible="false"
        narrow-mode="hide"
        :breakpoint="900"
        @resize-end="rememberNavigatorWidth"
      >
        <template #primary
          ><ResourcePanel
            :key="scopeKey"
            :statements="statements"
            :active-offset="activeOffset"
            :metadata="databaseMetadata"
            :loading="metadataLoading"
            :error="metadataError"
            :dialect="dialect"
            :ensure-schema="ensureSchema"
            :statement-preference="statementGroupOpen"
            :pins="pinnedObjects"
            :queries="savedQueries"
            :has-sql="Boolean(sqlCode.trim())"
            :query-schema="querySchema"
            @query-schema="selectQuerySchema"
            @pin="togglePin"
            @save-query="saveCurrentQuery"
            @unstar-query="unstarQuery"
            @open-query="openSqlInNewTab"
            @statement-preference="statementGroupOpen = $event"
            @refresh="refreshMetadata"
            @insert="editorRef?.insertSql($event)"
            @restore="loadSql"
            @table="openPlanTable"
            @locate="locateStatement"
            @collapse="outlineVisible = false"
        /></template>
        <el-splitter layout="vertical">
          <el-splitter-panel
            v-model:size="editorPaneSize"
            :min="compactResults ? '15%' : undefined"
          >
            <div class="sql-editor-section">
              <div v-if="metadataError" class="sql-editor-section__metadata-alert" role="status">
                <span>{{ metadataError }}。关键字提示可用；表字段补全和 AI SQL 需重试加载。</span>
                <el-button link type="primary" :loading="metadataLoading" @click="preloadMetadata">
                  重试加载
                </el-button>
              </div>
              <Editor
                :key="scopeKey"
                ref="editorRef"
                v-model="sqlCode"
                :view="editorView"
                @toggle-wrap="editorView = { ...editorView, wordWrap: !editorView.wordWrap }"
                :language="dialect === 'mysql' ? 'mysql' : dialect === 'dm' ? 'dm' : 'pgsql'"
                :dialect="dialect"
                @execute="handleExecute"
                @target-change="executionSource = $event"
                @cursor-change="activeOffset = $event.startOffset"
                @history-state="editorHistory = $event"
                @ai-request="openAiDialog(aiErrorContext ? 'fix' : 'generate')"
              />
            </div>
          </el-splitter-panel>

          <el-splitter-panel :min="compactResults ? '58%' : undefined">
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
                <div
                  class="workbench-status"
                  :class="{ 'is-warning': storageError }"
                  role="status"
                  :title="draftStatus"
                >
                  {{ external ? '外接只读' : canExecute ? '数据库范围' : '仅结构与 AI' }} ·
                  {{ draftStatus }}
                </div>
                <div class="tabs-actions">
                  <div class="execution-info" aria-live="polite">
                    <span v-if="executing">执行中…</span>
                    <template v-else-if="result">
                      <span :class="result.status === 'error' ? 'text-danger' : 'text-success'">{{
                        result.status === 'error' ? '执行失败' : resultSummary
                      }}</span>
                      <span v-if="result.durationMs !== undefined">
                        · {{ result.durationMs }} ms</span
                      >
                    </template>
                  </div>
                  <ArtTooltip content="数据库结构" placement="top"
                    ><ArtIconButton
                      size="small"
                      icon="ri:database-2-line"
                      label="数据库结构"
                      @click="workbenchDrawerRef?.open('schema')"
                  /></ArtTooltip>
                  <ArtTooltip content="查询历史" placement="top"
                    ><ArtIconButton
                      size="small"
                      icon="ri:history-line"
                      label="查询历史"
                      @click="workbenchDrawerRef?.open('history')"
                  /></ArtTooltip>
                  <span class="toolbar-divider" aria-hidden="true" />
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
                    :content="
                      canExecute
                        ? `${executionSource === 'selection' ? '执行选中内容' : '执行当前语句'} (Ctrl/⌘ + Enter) · ${external ? '外接只读' : '数据库范围'}`
                        : '数据库管理操作仅限平台超级管理员'
                    "
                    placement="top"
                    :offset="8"
                  >
                    <ArtIconButton
                      size="small"
                      class="sql-run-action"
                      @click="() => handleExecute()"
                      label="执行 SQL"
                      :disabled="!sqlCode.trim() || !canExecute"
                    >
                      <template #icon
                        ><ElIcon aria-hidden="true"><VideoPlay /></ElIcon
                      ></template>
                    </ArtIconButton>
                  </ArtTooltip>
                  <ArtTooltip v-else content="执行中" placement="top" :offset="8">
                    <ArtIconButton size="small" disabled label="执行中" :loading="executing">
                      <template #icon
                        ><ElIcon aria-hidden="true"><Loading /></ElIcon
                      ></template>
                    </ArtIconButton>
                  </ArtTooltip>
                  <ArtTooltip
                    :content="
                      dialect === 'dm'
                        ? '达梦执行计划暂不可用，请使用数据库管理工具查看'
                        : canExecute
                          ? '查看执行计划（仅预估，不执行）'
                          : '执行计划仅限平台超级管理员'
                    "
                    placement="top"
                  >
                    <ArtIconButton
                      size="small"
                      icon="ri:route-line"
                      label="查看执行计划"
                      :disabled="
                        dialect === 'dm' ||
                        !canExecute ||
                        !sqlCode.trim() ||
                        planLoading ||
                        executing
                      "
                      :loading="planLoading"
                      @click="handleExplain()"
                    />
                  </ArtTooltip>
                  <ElPopover placement="bottom-end" :width="296" trigger="click">
                    <template #reference
                      ><ArtIconButton
                        size="small"
                        icon="ri:equalizer-line"
                        label="查询设置"
                        title="查询设置"
                    /></template>
                    <div class="flex flex-col gap-4">
                      <div
                        ><strong class="text-sm font-medium">查询设置</strong
                        ><p class="m-0 mt-1 text-xs leading-5 text-g-600">{{
                          external
                            ? '外接只读查询；执行端校验连接、租户和账号权限。'
                            : canExecute
                              ? '数据库管理范围，不受顶部租户筛选限制。'
                              : 'SQL 执行仅限平台超级管理员；可浏览结构及使用 AI 生成。'
                        }}</p></div
                      >
                      <div class="flex flex-col gap-2 text-xs text-g-600">
                        <span>最大返回行数</span
                        ><ElSelect v-model="maxRows" aria-label="最大返回行数" :teleported="false"
                          ><ElOption
                            v-for="count in [100, 200, 500, 1000]"
                            :key="count"
                            :label="`${count} 行`"
                            :value="count" /></ElSelect
                      ></div>
                      <div class="flex flex-col gap-2 text-xs text-g-600">
                        <span>查询超时</span
                        ><ElSelect v-model="timeoutMs" aria-label="查询超时" :teleported="false"
                          ><ElOption
                            v-for="duration in [5000, 10000, 30000]"
                            :key="duration"
                            :label="`${duration / 1000} 秒`"
                            :value="duration" /></ElSelect
                      ></div>
                      <p class="m-0 text-xs leading-5 text-g-600"
                        >超时由数据库中断。返回上限仅限制展示行数，写入语句仍会完整执行。</p
                      >
                    </div>
                  </ElPopover>
                  <ArtTooltip
                    content="导出本次原始查询结果（Excel，含全部已加载页）"
                    placement="top"
                  >
                    <ArtIconButton
                      size="small"
                      icon="ri:download-2-line"
                      label="导出查询结果"
                      :disabled="executing || !result?.rows?.length"
                      :loading="exporting"
                      @click="handleExport"
                    />
                  </ArtTooltip>
                  <ArtTooltip
                    content="格式化 SQL (Ctrl/Cmd + Shift + F)"
                    placement="top"
                    :offset="8"
                  >
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
              <details v-if="resultMessages.length" class="sql-notices">
                <summary>数据库提示 · {{ resultMessages.length }} 条</summary>
                <ElScrollbar max-height="120px"
                  ><p v-for="(message, index) in resultMessages" :key="index">{{
                    message
                  }}</p></ElScrollbar
                >
              </details>
              <ArtOverlayLoading
                v-if="executing && !result"
                loading
                overlay
                text="正在执行 SQL…"
                description="正在查询数据库并整理结果，请稍候"
                class="result-section__loading"
              />
              <div v-if="result?.truncated" class="sql-result-limit" role="status"
                >已达到返回上限，仅展示前 {{ result.maxRows ?? maxRows }} 行。可增加上限或使用 WHERE
                缩小范围。</div
              >
              <div
                v-if="result?.status === 'ok' && result.rows?.length"
                class="tabs-content result-table"
              >
                <ResultTable
                  ref="resultTableRef"
                  :loading="executing"
                  :data="result.rows"
                  :columns="result.columns"
                  :query="result.queryText || ''"
                  :metadata="databaseMetadata"
                  :dialect="dialect"
                  :default-schema="
                    dialect === 'dm'
                      ? querySchema || connection?.database || connection?.username
                      : external
                        ? connection?.database
                        : 'public'
                  "
                />
              </div>
              <ElScrollbar v-else class="tabs-content">
                <div class="tabs-content__inner">
                  <div v-if="!result" class="empty-state">
                    <ArtEmptyState
                      v-if="!executing"
                      :title="canExecute ? '等待执行 SQL' : '浏览结构与编写 SQL'"
                      :description="
                        canExecute
                          ? '执行后将在这里展示查询结果、耗时与错误信息'
                          : '可浏览数据库结构或用 AI 生成 SQL；执行需平台超级管理员权限'
                      "
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
                      :title="isQueryResult ? '执行成功，暂无数据行' : '语句执行成功'"
                      :description="
                        isQueryResult
                          ? '当前语句没有返回记录，可以调整查询条件后重新执行'
                          : `${resultSummary}，本次语句没有返回数据集`
                      "
                      size="compact"
                      :visual-size="76"
                    />
                  </div>
                </div>
              </ElScrollbar>
            </div>
          </el-splitter-panel>
        </el-splitter>
      </ArtWorkspaceSplitter>
    </section>

    <WorkbenchDrawer
      ref="workbenchDrawerRef"
      :metadata="databaseMetadata"
      :dialect="dialect"
      :loading="metadataLoading"
      :error="metadataError"
      :history="history"
      @refresh="refreshMetadata"
      @insert="editorRef?.insertSql($event)"
      @restore="loadSql"
    />

    <ExecutionPlanDrawer
      ref="planDrawerRef"
      :query="planQuery"
      :loading="planLoading"
      :error="planError"
      :data="planData"
      :dialect="dialect"
      @retry="handleExplain(true)"
      @locate-table="openPlanTable"
    />
    <ArtDrawer
      ref="outlineDrawerRef"
      :drawer-props="{ class: 'sql-resource-drawer' }"
      direction="ltr"
      :size="340"
      :show-confirm-button="false"
      :show-form-focus-button="false"
      cancel-text="关闭"
      @closed="applyPendingStatement"
    >
      <ResourcePanel
        :key="scopeKey"
        :statements="statements"
        :active-offset="activeOffset"
        :metadata="databaseMetadata"
        :loading="metadataLoading"
        :error="metadataError"
        :dialect="dialect"
        :ensure-schema="ensureSchema"
        :statement-preference="statementGroupOpen"
        :pins="pinnedObjects"
        :queries="savedQueries"
        :has-sql="Boolean(sqlCode.trim())"
        :query-schema="querySchema"
        @query-schema="selectQuerySchema"
        @pin="togglePin"
        @save-query="saveCurrentQuery"
        @unstar-query="unstarQuery"
        @open-query="openResourceQuery"
        @statement-preference="statementGroupOpen = $event"
        @refresh="refreshMetadata"
        @insert="insertResource"
        @restore="restoreResource"
        @table="openResourceTable"
        @locate="locateStatement"
        @collapse="outlineDrawerRef?.handleClose()"
      />
    </ArtDrawer>
    <ConnectionManager
      ref="connectionManagerRef"
      :base="gatewayBase"
      @connected="onGatewayConnected"
      @use="selectExternalConnection"
    />
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
  import { computed, inject, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
  import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
  import { Close, Cpu, Loading, MagicStick, VideoPlay } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { useElementSize, useMediaQuery } from '@vueuse/core'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ResourcePanel from './modules/resource-panel.vue'
  import ConnectionManager from './modules/connection-manager.vue'
  import EditorTools from './modules/editor-tools.vue'
  import { useSqlTools } from './modules/use-sql-tools'
  import { useSqlConnections } from './modules/use-sql-connections'
  import { executeSqlConnection, fetchSqlConnectionMetadata } from '@/api/sql-connections'
  import type { SqlConnection } from '@/types/sql-connections'
  import {
    normalizeExternalPlan,
    SQL_DIALECT_LABELS,
    getSqlDatabaseLabel
  } from '@/utils/sql-connections'
  import ArtDialog from '@/components/core/dialogs/art-dialog/index.vue'
  import ArtEmptyState from '@/components/core/feedback/art-empty-state/index.vue'
  import ArtOverlayLoading from '@/components/core/feedback/art-overlay-loading/index.vue'
  import type { ArtDialogExpose } from '@/components/core/dialogs/art-dialog/types'
  import { executeSql, explainSql, fetchDatabaseMetadata, generateSqlByAi } from '@/api/data-center'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { registerSqlMetadata } from '@/utils/monaco-sql-setup'
  import Editor from './modules/editor.vue'
  import ResultTable from './modules/result-table.vue'
  import WorkbenchDrawer from './modules/workbench-drawer.vue'
  import ExecutionPlanDrawer from './modules/execution-plan-drawer.vue'
  import {
    useSqlWorkspace,
    SQL_NAVIGATOR_MIN_WIDTH,
    SQL_NAVIGATOR_MAX_WIDTH
  } from './modules/use-sql-workspace'
  import { exportExcel } from '@/utils/file'
  import {
    buildCaretDiagnostic,
    getSqlStatements,
    type SqlStatementRef,
    parseSqlErrorLocation,
    type SqlErrorLocation,
    type SqlExecutionTarget
  } from '@/utils/sql-workbench'

  interface EditorInstance {
    format: () => Promise<void>
    clear: () => void
    getExecutionTarget: () => SqlExecutionTarget
    setSql: (value: string) => void
    insertSql: (value: string) => void
    revealStatement: (start: number, end: number, select?: boolean) => void
    selectStatement: () => void
    undo: () => void
    redo: () => void
    find: () => void
    replace: () => void
    comment: () => void
    goToLine: (line: number) => void
    focus: () => void
    clearErrorMarkers: () => void
    applyErrorMarker: (
      location: SqlErrorLocation | null,
      message: string,
      startOffset?: number
    ) => void
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

  const {
    identityScope,
    gatewayBase,
    snapshot: connectionSnapshot,
    tabs: queryTabs,
    activeTab,
    external,
    connection,
    dialect,
    connectionScope,
    databaseScope,
    label: connectionLabel,
    connected: onGatewayConnected,
    useConnection,
    newTab,
    selectTab: selectTabUnchecked,
    closeTab: closeTabUnchecked
  } = useSqlConnections()
  const resultTableRef = ref<InstanceType<typeof ResultTable>>()
  const allowReplaceResult = async () => {
    if (!result.value?.rows?.length) return true
    const owner = scopeKey.value
    return ((await resultTableRef.value?.confirmLeave()) ?? true) && owner === scopeKey.value
  }
  const matchedRoute = inject(matchedRouteKey, undefined)
  if (matchedRoute?.value) onBeforeRouteLeave(allowReplaceResult)
  const selectTab = async (id: string) => {
    if (id === queryTabs.value.active || (await allowReplaceResult())) selectTabUnchecked(id)
  }
  const closeTab = async (id: string) => {
    if (id !== queryTabs.value.active || (await allowReplaceResult())) closeTabUnchecked(id)
  }
  const {
    editorView,
    pins: pinnedObjects,
    queries: savedQueries,
    togglePin,
    saveQuery,
    unstarQuery,
    storageError: toolsStorageError,
    retrySave: retryToolsSave
  } = useSqlTools(computed(() => `${identityScope.value}:${databaseScope.value}`))
  const saveCurrentQuery = (name: string) => {
    if (saveQuery(name, sqlCode.value, dialect.value === 'dm' ? querySchema.value : undefined))
      ElMessage.success('脚本已收藏')
    else ElMessage.warning('请输入收藏名称；脚本须非空且不超过 100000 字符')
  }
  const openSqlInNewTab = async (sql: string, schema = querySchema.value) => {
    if (!(await allowReplaceResult())) return
    if (!newTab()) {
      ElMessage.info('最多同时打开 8 个查询页签')
      return
    }
    const owner = scopeKey.value
    await nextTick()
    if (owner === scopeKey.value) {
      querySchema.value = schema
      sqlCode.value = sql
    }
  }
  const connectionManagerRef = ref<InstanceType<typeof ConnectionManager>>()
  const selectExternalConnection = async (target: SqlConnection) => {
    if (!(await allowReplaceResult())) return
    if (!useConnection(target)) ElMessage.info('最多同时打开 8 个查询页签')
  }
  const selectConnection = async (id: string) => {
    if (!(await allowReplaceResult())) return
    if (id === 'builtin') useConnection()
    else {
      const target = connectionSnapshot.value?.connections.find((item) => item.id === id)
      if (target && !useConnection(target)) ElMessage.info('最多同时打开 8 个查询页签')
    }
  }
  const newQueryTab = async () => {
    if (!(await allowReplaceResult())) return
    if (!newTab()) ElMessage.info('最多同时打开 8 个查询页签')
  }
  const navigateQueryTabs = async (event: KeyboardEvent, index: number) => {
    const count = queryTabs.value.tabs.length
    const target =
      event.key === 'ArrowRight'
        ? (index + 1) % count
        : event.key === 'ArrowLeft'
          ? (index + count - 1) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : -1
    if (target < 0) return
    event.preventDefault()
    await selectTab(queryTabs.value.tabs[target].id)
    void nextTick(() =>
      workspaceElement.value
        ?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')
        ?.focus()
    )
  }
  const {
    sqlCode,
    history,
    scopeKey,
    storageError,
    draftStatus,
    recordExecution,
    querySchema,
    maxRows,
    timeoutMs,
    navigatorOpen,
    navigatorWidth,
    statementGroupOpen
  } = useSqlWorkspace(connectionScope, () =>
    external.value
      ? dialect.value === 'dm'
        ? 'SELECT 1 AS connection_ok FROM DUAL;'
        : 'SELECT 1 AS connection_ok;'
      : 'SELECT * FROM sys_user LIMIT 10;'
  )
  const workspaceElement = ref<HTMLElement>()
  const { width: workspaceWidth } = useElementSize(workspaceElement)
  const compactViewport = useMediaQuery('(max-width: 640px)')
  const compactResults = computed(() =>
    workspaceWidth.value > 0 ? workspaceWidth.value <= 640 : compactViewport.value
  )
  const viewportNarrow = useMediaQuery('(max-width: 900px)')
  const isNarrow = computed(() =>
    workspaceWidth.value > 0 ? workspaceWidth.value <= 900 : viewportNarrow.value
  )
  const outlineVisible = computed({
    get: () => navigatorOpen.value ?? !isNarrow.value,
    set: (value: boolean) => {
      navigatorOpen.value = value
    }
  })
  const outlineDrawerRef = ref<ArtDrawerExpose>()
  let pendingStatement: SqlStatementRef | null = null
  const statements = computed(() => getSqlStatements(sqlCode.value, dialect.value))
  const activeOffset = ref(0)
  const editorHistory = ref({ undo: false, redo: false })
  const activeStatementLabel = computed(() => {
    const index = statements.value.findIndex(
      (statement) =>
        activeOffset.value >= statement.startOffset && activeOffset.value < statement.endOffset
    )
    return index < 0 ? '当前语句' : `执行第 ${index + 1} 条`
  })
  const toggleOutline = () => {
    pendingStatement = null
    if (isNarrow.value)
      void outlineDrawerRef.value?.handleOpen(undefined, {
        title: '数据库资源',
        subtitle: '浏览对象、插入名称和定位语句',
        headerIcon: 'ri:database-2-line'
      })
    else outlineVisible.value = !outlineVisible.value
  }
  const rememberNavigatorWidth = (index: number, sizes: number[]) => {
    if (
      index === 0 &&
      !isNarrow.value &&
      outlineVisible.value &&
      Number.isFinite(sizes[0]) &&
      sizes[0] >= SQL_NAVIGATOR_MIN_WIDTH
    )
      navigatorWidth.value = Math.min(SQL_NAVIGATOR_MAX_WIDTH, sizes[0])
  }
  const locateStatement = (statement: SqlStatementRef) => {
    if (isNarrow.value) {
      pendingStatement = statement
      outlineDrawerRef.value?.handleClose()
    } else editorRef.value?.revealStatement(statement.startOffset, statement.endOffset)
  }
  const applyPendingStatement = () => {
    if (pendingStatement)
      editorRef.value?.revealStatement(pendingStatement.startOffset, pendingStatement.endOffset)
    pendingStatement = null
    const action = pendingResource
    pendingResource = null
    if (action?.kind === 'insert') editorRef.value?.insertSql(action.sql)
    if (action?.kind === 'restore') loadSql(action.sql, action.schema)
    if (action?.kind === 'new-query') void openSqlInNewTab(action.sql, action.schema)
    if (action?.kind === 'table') openPlanTable(action.schema, action.name)
  }
  let pendingResource:
    | { kind: 'insert' | 'restore' | 'new-query'; sql: string; schema?: string }
    | { kind: 'table'; schema: string; name: string }
    | null = null
  const insertResource = (sql: string) => {
    pendingResource = { kind: 'insert', sql }
    outlineDrawerRef.value?.handleClose()
  }
  const restoreResource = (sql: string, schema?: string) => {
    pendingResource = { kind: 'restore', sql, schema }
    outlineDrawerRef.value?.handleClose()
  }
  const openResourceQuery = (sql: string, schema?: string) => {
    pendingResource = { kind: 'new-query', sql, schema }
    outlineDrawerRef.value?.handleClose()
  }
  const openResourceTable = (schema: string, name: string) => {
    pendingResource = { kind: 'table', schema, name }
    outlineDrawerRef.value?.handleClose()
  }
  const loadSql = (sql: string, schema?: string) => {
    if (dialect.value === 'dm' && schema !== undefined) {
      querySchema.value = schema
      const owner = scopeKey.value
      void ensureQueryMetadata(schema).catch((error) => {
        if (owner === scopeKey.value)
          ElMessage.warning(
            getFriendlySupabaseErrorMessage(error, '当前 schema 结构加载失败，请刷新后重试')
          )
      })
    }
    editorRef.value?.setSql(sql)
    editorRef.value?.clearErrorMarkers()
    ElMessage.success('SQL 已载入编辑器，可用 Ctrl/⌘ + Z 撤销')
  }
  const openPlanTable = async (schema: string | undefined, name: string) => {
    const owner = scopeKey.value
    try {
      await ensureQueryMetadata(schema)
      if (owner !== scopeKey.value) return
    } catch (cause) {
      if (owner === scopeKey.value)
        ElMessage.warning(getFriendlySupabaseErrorMessage(cause, '对象结构加载失败，请刷新后重试'))
      return
    }
    const candidates =
      databaseMetadata.value?.tables.filter(
        (table) => table.tableName === name && (!schema || schema === table.tableSchema)
      ) || []
    void workbenchDrawerRef.value?.open('schema', {
      schema: schema || (candidates.length === 1 ? candidates[0].tableSchema : undefined),
      name
    })
  }
  const userStore = useUserStore()
  const tenantScope = useTenantScopeStore()
  const canExecute = computed(() =>
    external.value ? Boolean(connection.value?.enabled) : userStore.isPlatformSuper
  )
  const planDrawerRef = ref<InstanceType<typeof ExecutionPlanDrawer>>()
  const planLoading = ref(false)
  const planQuery = ref('')
  const planError = ref<string | null>(null)
  const planData = shallowRef<Api.DataCenter.SqlConsole.SqlExplainResponse | null>(null)
  let planSequence = 0
  let executionSequence = 0
  let aiSequence = 0
  const executionSource = ref<SqlExecutionTarget['source']>('statement')
  const exporting = ref(false)
  const workbenchDrawerRef = ref<InstanceType<typeof WorkbenchDrawer>>()
  const databaseMetadata = shallowRef<Api.DataCenter.SqlConsole.DatabaseMetadata | null>(null)
  const executing = ref(false)
  const result = ref<Api.DataCenter.SqlConsole.SqlExecuteResponse | null>(null)
  const editorPaneSize = ref<string | number>('50%')
  watch(
    compactResults,
    (compact) => {
      editorPaneSize.value = compact ? '24%' : '50%'
    },
    { immediate: true }
  )
  const editorRef = ref<EditorInstance | null>(null)
  const aiDialogRef = ref<ArtDialogExpose>()
  const metadataLoading = ref(false)
  const metadataError = ref<string | null>(null)
  let metadataPromise: Promise<Api.DataCenter.SqlConsole.DatabaseMetadata> | null = null
  let metadataSequence = 0
  const loadedSchemas = new Set<string>()
  const schemaPromises = new Map<string, Promise<void>>()
  const ensureSchema = (schema: string): Promise<void> => {
    if (!external.value || loadedSchemas.has(schema)) return Promise.resolve()
    const previous = schemaPromises.get(schema)
    if (previous) return previous
    const target = connection.value
    if (!target) return Promise.reject(new Error('连接未就绪，请打开连接管理重新连接执行端'))
    const owner = scopeKey.value
    const sequence = metadataSequence
    const pending = fetchSqlConnectionMetadata(
      gatewayBase.value,
      tenantScopeValue(),
      target.id,
      schema
    )
      .then((value) => {
        if (owner !== scopeKey.value || sequence !== metadataSequence) return
        const metadata = databaseMetadata.value
        if (!metadata) return
        databaseMetadata.value = {
          schemas: value.schemas,
          tables: [
            ...metadata.tables.filter((table) => table.tableSchema !== schema),
            ...value.tables
          ],
          columns: [
            ...metadata.columns.filter((column) => column.tableSchema !== schema),
            ...value.columns
          ],
          functions: [
            ...metadata.functions.filter((fn) => fn.routineSchema !== schema),
            ...value.functions
          ],
          foreignKeys: [
            ...metadata.foreignKeys.filter((key) => key.sourceSchema !== schema),
            ...value.foreignKeys
          ]
        }
        loadedSchemas.add(schema)
        registerSqlMetadata(databaseMetadata.value)
      })
      .finally(() => {
        if (owner === scopeKey.value && sequence === metadataSequence) schemaPromises.delete(schema)
      })
    schemaPromises.set(schema, pending)
    return pending
  }
  const selectQuerySchema = async (schema: string) => {
    if (executing.value) {
      ElMessage.info('查询执行中，请结束后再切换 schema')
      return
    }
    if (schema !== querySchema.value && !(await allowReplaceResult())) return
    const owner = scopeKey.value
    querySchema.value = schema
    try {
      await ensureQueryMetadata(schema)
    } catch (error) {
      if (owner === scopeKey.value)
        ElMessage.warning(
          getFriendlySupabaseErrorMessage(error, 'schema 结构加载失败，请刷新后重试')
        )
    }
  }
  const tenantScopeValue = () =>
    userStore.isPlatformSuper
      ? (userStore.getUserInfo.userId && tenantScope.effectiveTenantId) || 'all'
      : 'all'
  const getMetadata = (): Promise<Api.DataCenter.SqlConsole.DatabaseMetadata> => {
    if (metadataPromise) return metadataPromise
    const sequence = ++metadataSequence
    metadataLoading.value = true
    metadataPromise = (
      external.value
        ? connection.value
          ? fetchSqlConnectionMetadata(gatewayBase.value, tenantScopeValue(), connection.value.id)
          : Promise.reject(new Error('连接未就绪，请打开连接管理重新连接执行端'))
        : fetchDatabaseMetadata()
    )
      .then((metadata) => {
        if (sequence !== metadataSequence) throw new Error('数据库结构加载已更新，请重试')
        registerSqlMetadata(metadata)
        databaseMetadata.value = metadata
        metadataError.value = null
        return metadata
      })
      .catch((error: unknown) => {
        if (sequence !== metadataSequence) throw error
        metadataPromise = null
        metadataError.value = getFriendlySupabaseErrorMessage(
          error,
          '数据库结构加载失败，请稍后重试'
        )
        throw error
      })
      .finally(() => {
        if (sequence === metadataSequence) metadataLoading.value = false
      })
    return metadataPromise
  }
  const ensureQueryMetadata = async (schema?: string) => {
    const owner = scopeKey.value
    const metadata = await getMetadata()
    if (owner !== scopeKey.value) throw new Error('数据库连接已切换，请重新载入结构')
    if (schema) await ensureSchema(schema)
    if (owner !== scopeKey.value) throw new Error('数据库连接已切换，请重新载入结构')
    return databaseMetadata.value || metadata
  }
  const preloadMetadata = (): void => {
    const owner = scopeKey.value
    void getMetadata()
      .then(async () => {
        const schema = querySchema.value || connection.value?.database
        if (owner === scopeKey.value && dialect.value === 'dm' && schema) {
          try {
            await ensureQueryMetadata(schema)
          } catch (error) {
            if (owner === scopeKey.value)
              ElMessage.warning(
                getFriendlySupabaseErrorMessage(error, '当前 schema 结构加载失败，请重新选择或刷新')
              )
          }
        }
      })
      .catch(() => {
        // 错误保留在可重试提示中，SQL 编辑与执行仍可继续。
      })
  }
  const refreshMetadata = (): void => {
    if (metadataLoading.value) return
    metadataPromise = null
    loadedSchemas.clear()
    schemaPromises.clear()
    metadataSequence += 1
    preloadMetadata()
  }
  onMounted(() => {
    registerSqlMetadata({ schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] })
    preloadMetadata()
  })
  const sqlErrorLocation = ref<SqlErrorLocation | null>(null)
  const isQueryResult = computed(
    () =>
      /^(SELECT|SHOW|VALUES|TABLE|EXPLAIN)\b/i.test(result.value?.commandTag || '') ||
      Boolean(result.value?.columns?.length)
  )
  const resultSummary = computed(() => {
    if (!result.value || result.value.status !== 'ok') return ''
    const count = result.value.rowCount ?? result.value.rows?.length ?? 0
    if (isQueryResult.value && count > (result.value.rows?.length ?? 0))
      return `已加载 ${result.value.rows?.length ?? 0} / ${count} 行`
    return isQueryResult.value ? `返回 ${count} 行` : `影响 ${count} 行`
  })
  const resultMessages = computed(() => [
    ...(result.value?.warnings || []),
    ...(result.value?.notices || [])
  ])
  watch([scopeKey, () => connection.value?.updatedAt], () => {
    executionSource.value = 'statement'
    editorHistory.value = { undo: false, redo: false }
    pendingStatement = null
    pendingResource = null
    outlineDrawerRef.value?.handleClose()
    activeOffset.value = 0
    executionSequence += 1
    executing.value = false
    aiSequence += 1
    aiDialogRef.value?.handleClose()
    aiDialog.value.prompt = ''
    aiDialog.value.summary = ''
    planSequence += 1
    planLoading.value = false
    planData.value = null
    planQuery.value = ''
    planError.value = null
    planDrawerRef.value?.reset()
    workbenchDrawerRef.value?.reset()
    result.value = null
    editorRef.value?.clearErrorMarkers()
    metadataSequence += 1
    metadataPromise = null
    loadedSchemas.clear()
    schemaPromises.clear()
    databaseMetadata.value = null
    metadataError.value = null
    registerSqlMetadata({ schemas: [], tables: [], columns: [], functions: [], foreignKeys: [] })
    preloadMetadata()
  })
  watch(
    querySchema,
    () => {
      executionSequence++
      executing.value = false
      result.value = null
      planSequence++
      planLoading.value = false
      planData.value = null
      planDrawerRef.value?.reset()
      aiSequence++
      aiDialogRef.value?.handleClose()
      editorRef.value?.clearErrorMarkers()
    },
    { flush: 'sync' }
  )

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
  const handleExecute = async () => {
    if (executing.value) return
    if (!(await allowReplaceResult()) || executing.value) return
    if (!canExecute.value) {
      ElMessage.warning('数据库管理操作仅限平台超级管理员，可继续浏览结构或使用 AI 生成 SQL')
      return
    }
    const target = editorRef.value?.getExecutionTarget()
    const sqlToExecute = target?.sql || ''

    if (!sqlToExecute || !sqlToExecute.trim()) {
      ElMessage.warning('请输入 SQL 查询')
      return
    }

    executing.value = true
    const sequence = ++executionSequence
    const ownerKey = scopeKey.value
    const sourceSql = sqlCode.value
    const schemaToExecute = dialect.value === 'dm' ? querySchema.value : undefined
    result.value = null
    sqlErrorLocation.value = null
    editorRef.value?.clearErrorMarkers()

    try {
      const request = {
        query: sqlToExecute,
        maxRows: maxRows.value,
        timeoutMs: timeoutMs.value
      }
      const { data, error } =
        external.value && connection.value
          ? {
              data: await executeSqlConnection(
                gatewayBase.value,
                tenantScopeValue(),
                connection.value.id,
                {
                  ...request,
                  ...(schemaToExecute ? { schema: schemaToExecute } : {}),
                  action: 'execute'
                }
              ),
              error: null
            }
          : await executeSql(request)
      if (ownerKey !== scopeKey.value || sequence !== executionSequence) return
      if (error) {
        const sqlError = normalizeSqlConsoleError(error)
        const errorMessage = sqlError.message || '执行 SQL 时发生错误'
        const location = parseSqlErrorLocation(errorMessage)
        sqlErrorLocation.value = location
        if (sourceSql === sqlCode.value)
          editorRef.value?.applyErrorMarker(location, errorMessage, target?.startOffset)
        result.value = {
          status: 'error',
          errorMessage,
          durationMs: sqlError.durationMs,
          queryText: sqlToExecute
        }
        recordExecution(
          {
            sql: sqlToExecute,
            status: 'error',
            durationMs: sqlError.durationMs,
            schema: schemaToExecute
          },
          ownerKey
        )
        return
      }

      result.value = data ? { ...data, queryText: sqlToExecute } : data
      if (data)
        recordExecution(
          {
            sql: sqlToExecute,
            status: data.status,
            durationMs: data.durationMs,
            rowCount: data.rowCount,
            schema: schemaToExecute
          },
          ownerKey
        )
      sqlErrorLocation.value = null
      editorRef.value?.clearErrorMarkers()
    } catch (error: unknown) {
      if (ownerKey !== scopeKey.value || sequence !== executionSequence) return
      const errorMessage = getFriendlySupabaseErrorMessage(error, 'SQL 执行失败，请稍后重试')
      result.value = { status: 'error', errorMessage, queryText: sqlToExecute }
      recordExecution({ sql: sqlToExecute, status: 'error', schema: schemaToExecute }, ownerKey)
    } finally {
      if (sequence === executionSequence) executing.value = false
    }
  }

  const handleExplain = async (retry = false) => {
    if (dialect.value === 'dm') return
    if (planLoading.value || executing.value || !canExecute.value) return
    const query = retry ? planQuery.value : editorRef.value?.getExecutionTarget().sql || ''
    if (!query.trim()) {
      ElMessage.warning('请选择或输入需要分析的 SQL')
      return
    }
    const sequence = ++planSequence
    const ownerKey = scopeKey.value
    planQuery.value = query
    planData.value = null
    planError.value = null
    planLoading.value = true
    void planDrawerRef.value?.open()
    try {
      const { data, error } =
        external.value && connection.value
          ? {
              data: normalizeExternalPlan(
                await executeSqlConnection(
                  gatewayBase.value,
                  tenantScopeValue(),
                  connection.value.id,
                  { query, timeoutMs: timeoutMs.value, maxRows: maxRows.value, action: 'explain' }
                ),
                dialect.value
              ),
              error: null
            }
          : await explainSql({ query, timeoutMs: timeoutMs.value })
      if (sequence !== planSequence || ownerKey !== scopeKey.value) return
      if (error || data?.status === 'error') {
        planError.value =
          data?.errorMessage ||
          normalizeSqlConsoleError(error).message ||
          '执行计划加载失败，请重试'
      } else {
        planData.value = data
      }
    } catch (error: unknown) {
      if (sequence === planSequence && ownerKey === scopeKey.value)
        planError.value = getFriendlySupabaseErrorMessage(error, '执行计划加载失败，请重试')
    } finally {
      if (sequence === planSequence) planLoading.value = false
    }
  }

  const handleExport = async () => {
    if (exporting.value || executing.value || !result.value?.rows?.length) return
    const ownerKey = scopeKey.value
    exporting.value = true
    try {
      await exportExcel({
        data: result.value.rows,
        columns: (result.value.columns?.length
          ? result.value.columns
          : Object.keys(result.value.rows[0]).map((name) => ({ name }))
        ).map((column) => ({
          key: column.name,
          title: column.name,
          formatter: (value: unknown) =>
            value === null
              ? 'NULL'
              : typeof value === 'object'
                ? JSON.stringify(value)
                : String(value ?? '')
        })),
        filename: 'SQL查询结果',
        filenameSuffix: 'datetime',
        assertCanDownload: () => {
          if (scopeKey.value !== ownerKey) throw new Error('账号或租户已切换，请重新查询后导出')
        }
      })
      ElMessage.success('查询结果已导出')
    } catch (error: unknown) {
      ElMessage.error(getFriendlySupabaseErrorMessage(error, '导出失败，请重试'))
    } finally {
      exporting.value = false
    }
  }

  const handleFormat = async () => {
    editorRef.value?.format()
  }

  const handleClear = async () => {
    if (!(await allowReplaceResult())) return
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
        ? `修复这条 ${SQL_DIALECT_LABELS[dialect.value]} SQL，并解释改动原因。\n\n错误信息：${result.value.errorMessage}`
        : `修复这条 ${SQL_DIALECT_LABELS[dialect.value]} SQL，并解释改动原因。`
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

    const ownerKey = scopeKey.value
    const sequence = ++aiSequence
    try {
      const schema =
        dialect.value === 'dm'
          ? querySchema.value || connection.value?.database || undefined
          : undefined
      const metadata = await ensureQueryMetadata(schema)
      if (ownerKey !== scopeKey.value || sequence !== aiSequence) return false
      const aiResponse = await generateSqlByAi({
        prompt: aiDialog.value.prompt,
        dialect: dialect.value,
        schema,
        connectionKind: external.value ? 'external' : 'builtin',
        mode: aiDialog.value.mode,
        currentSql: sqlCode.value,
        metadata
      })
      const { data, error } = aiResponse
      if (ownerKey !== scopeKey.value || sequence !== aiSequence) return false

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
      if (ownerKey !== scopeKey.value || sequence !== aiSequence) return false
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
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0;
    margin: 0;
    container-name: sql-workspace;
    container-type: inline-size;
    overflow: hidden;

    .sql-query-bar {
      display: flex;
      flex-shrink: 0;
      gap: 8px;
      align-items: center;
      min-width: 0;
      padding: 6px 12px;
      border-bottom: 1px solid var(--el-border-color-lighter);

      &__connection {
        flex-shrink: 0;
        width: 210px;
      }

      &__tabs {
        flex: 1;
        min-width: 0;
        height: 32px;
      }

      .sql-query-tab {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        border-radius: var(--el-border-radius-base);

        > button:first-child {
          max-width: 160px;
          padding: 6px 10px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 12px;
          white-space: nowrap;
        }

        &:hover {
          background: var(--el-fill-color-light);
        }

        &.is-active {
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
        }

        button:focus-visible {
          outline: 2px solid var(--el-color-primary);
          outline-offset: -2px;
        }
      }
    }

    .sql-target-context {
      display: flex;
      flex-shrink: 0;
      flex-wrap: wrap;
      gap: 12px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 4px 12px;
      font-size: 11px;
      color: var(--el-text-color-secondary);
      border-bottom: 1px solid var(--el-border-color-lighter);

      &__schema {
        margin-left: auto;
      }
    }

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

  .sql-editor-tools {
    display: flex;
    flex-shrink: 0;
    gap: 12px;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--el-border-color-lighter);
  }

  .sql-workspace-splitter {
    flex: 1;
    min-height: 0;
  }

  @media (width <= 640px) {
    .sql-editor-tools__context {
      display: none;
    }
  }

  .result-section {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    container-name: sql-results;
    container-type: inline-size;
    overflow: hidden;
    background: var(--el-bg-color);

    .sql-result-limit {
      flex-shrink: 0;
      padding: 8px 16px;
      font-size: 12px;
      line-height: 1.6;
      color: var(--el-text-color-regular);
      background: var(--el-color-warning-light-9);
      border-bottom: 1px solid var(--el-border-color-lighter);
    }

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
          font-size: 12px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }
      }

      .workbench-status {
        margin-right: 16px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 12px;
        color: var(--el-text-color-secondary);
        white-space: nowrap;

        &.is-warning {
          color: var(--el-color-warning);
        }
      }

      .toolbar-divider {
        width: 1px;
        height: 16px;
        margin-inline: 2px;
        background: var(--el-border-color-lighter);
      }

      :deep(.sql-run-action) {
        color: var(--el-color-primary);
        background: var(--el-color-primary-light-9);
      }
    }

    .sql-notices {
      flex-shrink: 0;
      padding: 8px 16px;
      font-size: 12px;
      color: var(--el-text-color-regular);
      background: var(--el-color-warning-light-9);
      border-bottom: 1px solid var(--el-border-color-lighter);

      summary {
        cursor: pointer;
      }

      p {
        margin: 8px 0 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
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

  @media (width <= 900px) {
    .result-section > .tabs-header .workbench-status {
      display: none;
    }
  }

  @container sql-workspace (width <= 640px) {
    .sql-editor-tools__context {
      display: none;
    }

    .sql-console-container .sql-query-bar {
      flex-wrap: wrap;

      &__connection {
        flex: 1;
        min-width: 140px;
      }

      &__tabs {
        flex-basis: 100%;
        order: 4;
      }
    }
  }

  @container sql-results (width <= 900px) {
    .workbench-status {
      display: none;
    }
  }

  @container sql-results (width <= 640px) {
    .tabs-header {
      flex-wrap: wrap;
      height: auto !important;
      min-height: 40px;
      padding-right: 8px !important;
    }

    .tabs-actions {
      gap: 4px !important;
    }

    .execution-info {
      display: none;
    }

    .result-tabs {
      min-width: 64px;
    }
  }

  @media (width <= 640px) {
    .result-section > .tabs-header {
      flex-wrap: wrap;
      height: auto;
      min-height: 40px;
      padding-right: 8px;

      .tabs-actions {
        gap: 4px;
      }

      .execution-info {
        display: none;
      }

      .result-tabs {
        min-width: 64px;
      }
    }
  }

  :global(.sql-resource-drawer .art-drawer__content) {
    height: 100%;
    padding: 0;
  }

  :global(.sql-resource-drawer .art-drawer__scrollbar > .el-scrollbar__wrap > .el-scrollbar__view) {
    height: 100%;
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
