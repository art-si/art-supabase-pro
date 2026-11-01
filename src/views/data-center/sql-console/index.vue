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
            :scope="editorActionScope"
            :import-sql="openSqlInNewTab"
            v-model:view="editorView"
            @replace="editorRef?.replace()"
            @comment="editorRef?.comment()"
            @format="editorRef?.format()"
            @goto="editorRef?.goToLine($event)"
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
        <ElButton size="small" @click="openQueryApis()"
          ><ArtSvgIcon icon="ri:code-box-line" />查询 API</ElButton
        >
        <ArtTooltip
          v-if="userStore.isPlatformSuper && !external"
          content="将当前语句发布为带参数的只读查询 API"
        >
          <ArtIconButton
            size="small"
            icon="ri:share-box-line"
            label="发布为查询 API"
            :disabled="executing || !sqlCode.trim()"
            @click="openQueryApis(true)"
          />
        </ArtTooltip>
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
            :ensure-table="ensureTable"
            :ensure-functions="ensureFunctions"
            :search-metadata="external ? undefined : searchMetadata"
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
              <div
                v-if="metadataError || completionError"
                class="sql-editor-section__metadata-alert"
                role="status"
              >
                <span
                  >{{ metadataError || completionError }}。关键字提示可用；表字段补全和 AI SQL
                  需重试加载。</span
                >
                <el-button
                  link
                  type="primary"
                  :loading="metadataLoading"
                  @click="retryCompletionMetadata"
                >
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
                  <ResultComparisonControls
                    ref="comparisonControlsRef"
                    compact
                    :result="resultSnapshotInput"
                    :owner="resultOwnerKey"
                    :disabled="executing"
                  />
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
                  <ArtTooltip
                    v-else
                    :content="
                      dialect === 'dm' && external
                        ? '当前达梦驱动仅支持查询超时，请等待查询结束'
                        : cancelRequested
                          ? '取消请求已发送，正在等待数据库结束'
                          : '取消正在执行的查询'
                    "
                    placement="top"
                    :offset="8"
                  >
                    <ArtIconButton
                      size="small"
                      icon="ri:stop-circle-line"
                      label="取消查询"
                      :loading="cancelling"
                      :disabled="cancelRequested || (external && dialect === 'dm')"
                      @click="handleCancel"
                    />
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
                  <ResultExportControls
                    compact
                    :result="resultSnapshotInput"
                    :owner="resultOwnerKey"
                    :disabled="executing"
                  />
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
              <div
                v-if="executing || result"
                class="execution-info flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-g-200 px-4 py-1 text-xs leading-4 text-g-700 tabular-nums"
              >
                <span
                  aria-live="polite"
                  :class="
                    result && !executing
                      ? queryCancelled
                        ? 'text-g-700'
                        : result.status === 'error'
                          ? 'text-danger'
                          : 'text-success'
                      : ''
                  "
                  >{{
                    executing
                      ? cancelRequested
                        ? '等待数据库结束…'
                        : '执行中…'
                      : queryCancelled
                        ? '已取消'
                        : result?.status === 'error'
                          ? '执行失败'
                          : resultSummary
                  }}</span
                >
                <template v-if="executing && executionWaitMs !== null">
                  <span class="sql-execution-wait" aria-live="off"
                    >已等待 {{ Math.floor(executionWaitMs / 1000) }} 秒</span
                  >
                  <span v-if="executionTimeoutMs !== null" aria-live="off"
                    >本次时限 {{ formatDurationMs(executionTimeoutMs) }}</span
                  >
                </template>
                <template v-else-if="result">
                  <span v-if="validExecutionDuration" :title="`${result.durationMs} ms`"
                    >执行端 {{ formatDurationMs(result.durationMs) }}</span
                  >
                  <span
                    v-if="executionWaitMs !== null"
                    aria-live="off"
                    title="从发送请求到响应整理完成，包含身份验证、网络与客户端处理；不等同于数据库执行耗时。"
                    >浏览器总等待 {{ formatDurationMs(executionWaitMs) }}</span
                  >
                </template>
              </div>
              <ArtOverlayLoading
                v-if="executing && !result"
                loading
                :min-height="0"
                :text="cancelRequested ? '正在取消查询…' : '正在执行 SQL…'"
                :description="
                  cancelRequested
                    ? '已请求数据库停止执行，正在等待事务结束'
                    : '正在查询数据库并整理结果，请稍候'
                "
                class="min-h-0 flex-1"
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
                  :owner="historyActionScope"
                  :truncated="result.truncated"
                  :columns="result.columns"
                  :query="result.queryText || ''"
                  :metadata="databaseMetadata"
                  :ensure-metadata="
                    () =>
                      ensureQueryMetadata(querySchema || undefined, result?.queryText).then(
                        () => undefined
                      )
                  "
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
              <ElScrollbar v-else-if="!executing" class="tabs-content">
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
                  <ArtEmptyState
                    v-else-if="queryCancelled"
                    title="查询已取消"
                    description="数据库已结束本次执行，可以修改 SQL 后重新查询。"
                    size="compact"
                    :visual-size="76"
                  />
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
      :ensure-table="ensureTable"
      :search-metadata="external ? undefined : searchMetadata"
      :dialect="dialect"
      :loading="metadataLoading"
      :error="metadataError"
      :history="history"
      :owner="historyActionScope"
      :history-actions-disabled-reason="historyActionsDisabledReason"
      :history-new-tab-disabled-reason="historyNewTabDisabledReason"
      @refresh="refreshMetadata"
      @insert="insertWorkbenchSql"
      @restore="restoreWorkbenchSql"
      @restore-history="restoreHistorySql"
      @open-query="openWorkbenchQuery"
    />

    <ExecutionPlanDrawer
      ref="planDrawerRef"
      :query="planQuery"
      :loading="planLoading"
      :cancelling="planCancelling"
      :cancel-requested="planCancelRequested"
      :cancelled="planCancelled"
      :error="planError"
      :data="planData"
      :dialect="dialect"
      @retry="handleExplain(true)"
      @cancel="handleCancelPlan"
      @locate-table="openPlanTable"
    />
    <component :is="queryApiComponent" v-if="queryApiComponent" ref="queryApiManagerRef" />
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
        :ensure-table="ensureTable"
        :ensure-functions="ensureFunctions"
        :search-metadata="external ? undefined : searchMetadata"
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
          :disabled="aiBusy || Boolean(aiApplying)"
          :options="[
            { label: '生成 SQL', value: 'generate' },
            { label: '修复 SQL', value: 'fix' }
          ]"
        />
        <el-input
          v-model="aiDialog.prompt"
          :disabled="aiBusy || Boolean(aiApplying)"
          type="textarea"
          :rows="8"
          resize="none"
          placeholder="例如：查出最近 30 天注册且已启用的用户，按创建时间倒序"
        />
        <AiSqlResult
          v-if="aiProposal"
          :sql="aiProposal.sql"
          :summary="aiProposal.summary"
          :warnings="aiProposal.warnings"
          :model="aiProposal.model"
          :source-changed="aiSourceChanged"
          :disabled-reason="aiLoadDisabledReason"
          :new-tab-disabled-reason="historyNewTabDisabledReason"
          :applying="aiApplying"
          @open-query="applyAiSql('new')"
          @apply-current="applyAiSql('current')"
        />
      </div>
    </ArtDialog>
  </div>
</template>

<script setup lang="ts">
  import {
    computed,
    inject,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref,
    shallowRef,
    watch
  } from 'vue'
  import { matchedRouteKey, onBeforeRouteLeave } from 'vue-router'
  import { Close, Cpu, MagicStick, VideoPlay } from '@element-plus/icons-vue'
  import { ElMessage } from 'element-plus'
  import { useElementSize, useIntervalFn, useMediaQuery } from '@vueuse/core'
  import { formatDurationMs } from '@/utils/ui/format'
  import { useLazyComponent } from '@/hooks/core/useLazyComponent'
  import type QueryApiManager from './modules/query-api-manager.vue'
  import ArtWorkspaceSplitter from '@/components/core/layouts/art-workspace-splitter/index.vue'
  import ArtDrawer from '@/components/core/drawers/art-drawer/index.vue'
  import type { ArtDrawerExpose } from '@/components/core/drawers/art-drawer/types'
  import ResourcePanel from './modules/resource-panel.vue'
  import ConnectionManager from './modules/connection-manager.vue'
  import EditorTools from './modules/editor-tools.vue'
  import AiSqlResult from './modules/ai-sql-result.vue'
  import { useSqlTools } from './modules/use-sql-tools'
  import { useSqlConnections } from './modules/use-sql-connections'
  import { cancelSqlConnection, executeSqlConnection } from '@/api/sql-connections'
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
  import { cancelSql, executeSql, explainSql, generateSqlByAi } from '@/api/data-center'
  import { useUserStore } from '@/store/modules/user'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { getFriendlySupabaseErrorMessage } from '@/utils/supabase'
  import { registerSqlMetadata, registerSqlMetadataLoader } from '@/utils/monaco-sql-setup'
  import { useSqlMetadata } from './modules/use-sql-metadata'
  import Editor from './modules/editor.vue'
  import ResultTable from './modules/result-table.vue'
  import ResultComparisonControls from './modules/result-comparison-controls.vue'
  import ResultExportControls from './modules/result-export-controls.vue'
  import type { SqlResultSnapshotInput } from './modules/result-compare'
  import WorkbenchDrawer from './modules/workbench-drawer.vue'
  import ExecutionPlanDrawer from './modules/execution-plan-drawer.vue'
  import {
    useSqlWorkspace,
    SQL_NAVIGATOR_MIN_WIDTH,
    SQL_NAVIGATOR_MAX_WIDTH
  } from './modules/use-sql-workspace'
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
    getContentRevision: () => number
    applyErrorMarker: (
      location: SqlErrorLocation | null,
      message: string,
      startOffset?: number
    ) => void
  }

  interface SqlConsoleError {
    message?: string
    durationMs?: number
    code?: string
    position?: unknown
    query?: unknown
    hasPosition: boolean
    hasQuery: boolean
  }

  const normalizeSqlConsoleError = (error: unknown): SqlConsoleError => {
    if (!error || typeof error !== 'object') return { hasPosition: false, hasQuery: false }
    const record = error as Record<string, unknown>
    return {
      message:
        typeof record.errorMessage === 'string'
          ? record.errorMessage
          : typeof record.message === 'string'
            ? record.message
            : undefined,
      code:
        typeof record.errorCode === 'string'
          ? record.errorCode
          : typeof record.code === 'string'
            ? record.code
            : undefined,
      durationMs:
        typeof record.durationMs === 'number' &&
        Number.isFinite(record.durationMs) &&
        record.durationMs >= 0
          ? record.durationMs
          : undefined,
      position: record.errorPosition,
      query: record.errorQuery,
      hasPosition: Object.hasOwn(record, 'errorPosition'),
      hasQuery: Object.hasOwn(record, 'errorQuery')
    }
  }

  const userStore = useUserStore()
  const tenantScope = useTenantScopeStore()
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
  const workspaceActionRevision = ref(0)
  const querySchemaRevision = ref(0)
  let workspaceActionAlive = true
  const allowReplaceResult = async () => {
    if (!result.value?.rows?.length) return true
    const owner = scopeKey.value
    const revision = workspaceActionRevision.value
    return (
      ((await resultTableRef.value?.confirmLeave()) ?? true) &&
      workspaceActionAlive &&
      revision === workspaceActionRevision.value &&
      owner === scopeKey.value
    )
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
  const openSqlInNewTab = async (
    sql: string,
    schema = querySchema.value,
    acceptSource?: () => boolean
  ): Promise<boolean> => {
    if (!workspaceActionAlive || acceptSource?.() === false) return false
    if (executing.value) {
      ElMessage.info('查询仍在执行，请先等待完成或取消查询')
      return false
    }
    if (external.value && !connection.value) {
      ElMessage.info('当前数据库连接未就绪，请先重新连接执行端')
      return false
    }
    if (queryTabs.value.tabs.length >= 8) {
      ElMessage.info('最多同时打开 8 个查询页签')
      return false
    }
    const origin = scopeKey.value
    const revision = workspaceActionRevision.value
    const schemaRevision = querySchemaRevision.value
    const allowed = await allowReplaceResult()
    if (
      !allowed ||
      acceptSource?.() === false ||
      executing.value ||
      (external.value && !connection.value) ||
      !workspaceActionAlive ||
      revision !== workspaceActionRevision.value ||
      schemaRevision !== querySchemaRevision.value ||
      origin !== scopeKey.value
    )
      return false
    if (!newTab()) {
      ElMessage.info('最多同时打开 8 个查询页签')
      return false
    }
    const owner = scopeKey.value
    const targetRevision = workspaceActionRevision.value
    // The target storage loads during this tick, including its own default schema reset.
    await nextTick()
    if (
      !workspaceActionAlive ||
      executing.value ||
      (external.value && !connection.value) ||
      targetRevision !== workspaceActionRevision.value ||
      owner !== scopeKey.value
    )
      return false
    querySchema.value = schema
    sqlCode.value = sql
    return true
  }
  const connectionManagerRef = ref<InstanceType<typeof ConnectionManager>>()
  const queryApiManagerRef = ref<InstanceType<typeof QueryApiManager>>()
  const { component: queryApiComponent, load: loadQueryApis } = useLazyComponent(
    () => import('./modules/query-api-manager.vue')
  )
  const openQueryApis = async (publish = false) => {
    if (publish && (!userStore.isPlatformSuper || external.value)) return
    const owner = identityScope.value
    const query = publish ? editorRef.value?.getExecutionTarget().sql : undefined
    try {
      await loadQueryApis()
      if (owner === identityScope.value)
        await queryApiManagerRef.value?.open(query ? { sql: query } : undefined)
    } catch (error) {
      ElMessage.warning(getFriendlySupabaseErrorMessage(error, '查询 API 面板加载失败，请稍后重试'))
    }
  }
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
  const workspaceOwnerScope = computed(() =>
    JSON.stringify([scopeKey.value, userStore.isPlatformSuper, connection.value?.updatedAt])
  )
  const editorActionScope = computed(() =>
    JSON.stringify([workspaceOwnerScope.value, workspaceActionRevision.value])
  )
  const historyActionScope = computed(() =>
    JSON.stringify([editorActionScope.value, querySchema.value, querySchemaRevision.value])
  )
  const captureWorkspaceActionGuard = (): (() => boolean) => {
    const owner = scopeKey.value
    const revision = workspaceActionRevision.value
    const schemaRevision = querySchemaRevision.value
    return () =>
      workspaceActionAlive &&
      owner === scopeKey.value &&
      revision === workspaceActionRevision.value &&
      schemaRevision === querySchemaRevision.value
  }
  const historyActionsDisabledReason = computed(() =>
    executing.value
      ? '查询正在执行，完成或取消后可载入历史。'
      : external.value && !connection.value
        ? '当前数据库连接未就绪，请先重新连接执行端；仍可预览历史。'
        : ''
  )
  const historyNewTabDisabledReason = computed(() =>
    queryTabs.value.tabs.length >= 8 ? '最多同时打开 8 个查询页签，请先关闭不用的页签。' : ''
  )
  const workspaceElement = ref<HTMLElement>()
  const { width: workspaceWidth, height: workspaceHeight } = useElementSize(workspaceElement)
  const compactViewport = useMediaQuery('(max-width: 640px)')
  const compactResults = computed(
    () =>
      (workspaceWidth.value > 0 ? workspaceWidth.value <= 640 : compactViewport.value) ||
      (workspaceHeight.value > 0 && workspaceHeight.value <= 720)
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
      const revision = workspaceActionRevision.value
      const schemaRevision = querySchemaRevision.value
      void ensureQueryMetadata(schema).catch((error) => {
        if (
          workspaceActionAlive &&
          owner === scopeKey.value &&
          revision === workspaceActionRevision.value &&
          schemaRevision === querySchemaRevision.value
        )
          ElMessage.warning(
            getFriendlySupabaseErrorMessage(error, '当前 schema 结构加载失败，请刷新后重试')
          )
      })
    }
    editorRef.value?.setSql(sql)
    editorRef.value?.clearErrorMarkers()
    ElMessage.success('SQL 已载入编辑器，可用 Ctrl/⌘ + Z 撤销')
  }
  const insertWorkbenchSql = (sql: string, owner: string): void => {
    if (workspaceActionAlive && owner === historyActionScope.value) editorRef.value?.insertSql(sql)
  }
  const openWorkbenchQuery = (
    sql: string,
    schema: string | undefined,
    owner: string
  ): Promise<boolean> =>
    owner === historyActionScope.value ? openSqlInNewTab(sql, schema) : Promise.resolve(false)
  const restoreWorkbenchSql = (sql: string, schema: string | undefined, owner: string): void => {
    if (workspaceActionAlive && owner === historyActionScope.value) loadSql(sql, schema)
  }
  const restoreHistorySql = async (
    sql: string,
    schema: string | undefined,
    owner: string
  ): Promise<void> => {
    if (
      !workspaceActionAlive ||
      historyActionsDisabledReason.value ||
      owner !== historyActionScope.value
    )
      return
    const sourceEditor = editorRef.value
    if (!sourceEditor) {
      ElMessage.info('编辑器尚未就绪，请稍后重试')
      return
    }
    const revision = sourceEditor.getContentRevision()
    if (
      !(await allowReplaceResult()) ||
      !workspaceActionAlive ||
      Boolean(historyActionsDisabledReason.value) ||
      owner !== historyActionScope.value ||
      sourceEditor !== editorRef.value ||
      revision !== sourceEditor.getContentRevision()
    )
      return
    result.value = null
    loadSql(sql, schema)
  }
  const openPlanTable = async (schema: string | undefined, name: string) => {
    const isCurrent = captureWorkspaceActionGuard()
    try {
      await ensureQueryMetadata(schema)
      if (!isCurrent()) return
      const metadata = await getMetadata()
      if (!isCurrent()) return
      const candidates = metadata.tables.filter(
        (table) => table.tableName === name && (!schema || schema === table.tableSchema)
      )
      const target =
        candidates.length === 1
          ? candidates[0]
          : candidates.find((table) => table.tableSchema === 'public')
      if (target) await ensureTable(target.tableSchema, target.tableName)
      if (!isCurrent()) return
    } catch (cause) {
      if (isCurrent())
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
  const canExecute = computed(() =>
    external.value ? Boolean(connection.value?.enabled) : userStore.isPlatformSuper
  )
  const planDrawerRef = ref<InstanceType<typeof ExecutionPlanDrawer>>()
  const planLoading = ref(false)
  const planCancelling = ref(false)
  const planCancelRequested = ref(false)
  const planCancelled = ref(false)
  let cancelPlan: (() => Promise<void>) | null = null
  let planIsCurrent: (() => boolean) | null = null
  const planQuery = ref('')
  const planError = ref<string | null>(null)
  const planData = shallowRef<Api.DataCenter.SqlConsole.SqlExplainResponse | null>(null)
  let planSequence = 0
  let executionSequence = 0
  const resetPlanState = (): void => {
    planSequence++
    planLoading.value = false
    planCancelling.value = false
    planCancelRequested.value = false
    planCancelled.value = false
    cancelPlan = null
    planIsCurrent = null
    planQuery.value = ''
    planError.value = null
    planData.value = null
    planDrawerRef.value?.reset()
  }
  const createQueryCancel = (requestId: string): (() => Promise<void>) => {
    const target = connection.value
    const base = gatewayBase.value
    const tenant = tenantScopeValue()
    return external.value && target
      ? () => cancelSqlConnection(base, tenant, target.id, requestId)
      : () => cancelSql(requestId)
  }
  const handleCancelPlan = async () => {
    const isCurrent = planIsCurrent
    if (
      !planLoading.value ||
      !cancelPlan ||
      planCancelling.value ||
      planCancelRequested.value ||
      !isCurrent?.()
    )
      return
    const cancel = cancelPlan
    planCancelling.value = true
    try {
      await cancel()
      if (isCurrent() && planLoading.value) planCancelRequested.value = true
    } catch (error) {
      if (isCurrent() && planLoading.value)
        ElMessage.warning(
          getFriendlySupabaseErrorMessage(error, '取消分析失败，请重试或等待分析结束')
        )
    } finally {
      if (isCurrent()) planCancelling.value = false
    }
  }
  let aiSequence = 0
  const editorRef = ref<EditorInstance | null>(null)
  const aiDialogRef = ref<ArtDialogExpose>()
  const aiDialog = ref({ mode: 'generate' as 'generate' | 'fix', prompt: '' })
  const aiBusy = ref(false)
  const aiApplying = ref<'current' | 'new' | null>(null)
  interface AiSqlProposal {
    sql: string
    summary?: string
    warnings: string[]
    model?: string
    querySchema: string
    sourceSql: string
    sourceEditor: EditorInstance | null
    sourceRevision?: number
    isCurrent: () => boolean
  }
  const aiProposal = shallowRef<AiSqlProposal | null>(null)
  const aiSourceChanged = computed(() => {
    const proposal = aiProposal.value
    const currentSql = sqlCode.value
    return Boolean(
      proposal &&
      (proposal.sourceSql !== currentSql ||
        proposal.sourceEditor !== editorRef.value ||
        proposal.sourceRevision !== editorRef.value?.getContentRevision())
    )
  })
  const aiLoadDisabledReason = computed(() =>
    executing.value
      ? '查询正在执行，完成或取消后可载入 AI SQL。'
      : external.value && !connection.value
        ? '当前数据库连接未就绪，请先重新连接执行端。'
        : ''
  )
  const resetAiState = (): void => {
    aiSequence++
    aiBusy.value = false
    aiApplying.value = null
    aiProposal.value = null
    aiDialog.value.prompt = ''
  }
  watch(
    aiApplying,
    (target) => aiDialogRef.value?.setOptions({ confirmDisabled: Boolean(target) }),
    { flush: 'sync' }
  )
  const closeAiWorkspace = (): void => {
    resetAiState()
    void aiDialogRef.value?.handleClose(true)
  }
  watch(
    [() => aiDialog.value.prompt, () => aiDialog.value.mode],
    () => {
      if (!aiBusy.value && !aiApplying.value) {
        aiSequence++
        aiProposal.value = null
        aiDialogRef.value?.setOptions({
          confirmText: aiDialog.value.mode === 'fix' ? '修复 SQL' : '生成 SQL'
        })
      }
    },
    { flush: 'sync' }
  )
  const executionSource = ref<SqlExecutionTarget['source']>('statement')
  const workbenchDrawerRef = ref<InstanceType<typeof WorkbenchDrawer>>()
  const executing = ref(false)
  const cancelling = ref(false)
  const cancelRequested = ref(false)
  let cancelExecution: (() => Promise<void>) | null = null
  const executionWaitMs = ref<number | null>(null)
  const executionTimeoutMs = ref<number | null>(null)
  let executionStartedAt: number | null = null
  let executionIsCurrent: (() => boolean) | null = null
  const sampleExecutionWait = (): void => {
    if (executionStartedAt !== null && executionIsCurrent?.())
      executionWaitMs.value = Math.max(0, performance.now() - executionStartedAt)
  }
  const { pause: pauseExecutionClock, resume: resumeExecutionClock } = useIntervalFn(
    sampleExecutionWait,
    1000,
    { immediate: false }
  )
  const resetExecutionState = (): void => {
    executionSequence++
    executing.value = false
    cancelling.value = false
    cancelRequested.value = false
    cancelExecution = null
    pauseExecutionClock()
    executionStartedAt = null
    executionIsCurrent = null
    executionWaitMs.value = null
    executionTimeoutMs.value = null
  }
  watch(
    workspaceOwnerScope,
    () => {
      workspaceActionRevision.value++
      resetExecutionState()
      resetPlanState()
      closeAiWorkspace()
    },
    { flush: 'sync' }
  )
  const result = ref<Api.DataCenter.SqlConsole.SqlExecuteResponse | null>(null)
  const validExecutionDuration = computed(
    () =>
      typeof result.value?.durationMs === 'number' &&
      Number.isFinite(result.value.durationMs) &&
      result.value.durationMs >= 0
  )
  const comparisonControlsRef = ref<InstanceType<typeof ResultComparisonControls>>()
  const resultOwnerKey = computed(() =>
    JSON.stringify([
      databaseScope.value,
      connection.value?.updatedAt,
      dialect.value,
      querySchema.value
    ])
  )
  const resultSnapshotInput = computed<SqlResultSnapshotInput | null>(() =>
    result.value?.status === 'ok' && isQueryResult.value
      ? {
          rows: result.value.rows || [],
          columns: result.value.columns || [],
          query: result.value.queryText || '',
          label: connectionLabel.value,
          truncated: Boolean(result.value.truncated)
        }
      : null
  )
  const queryCancelled = computed(() => result.value?.errorCode === 'SQL_QUERY_CANCELLED')
  const handleCancel = async () => {
    const isCurrent = executionIsCurrent
    if (
      !executing.value ||
      !cancelExecution ||
      cancelling.value ||
      cancelRequested.value ||
      !isCurrent?.()
    )
      return
    const cancel = cancelExecution
    cancelling.value = true
    try {
      await cancel()
      if (isCurrent() && executing.value) cancelRequested.value = true
    } catch (error) {
      if (isCurrent() && executing.value)
        ElMessage.warning(
          getFriendlySupabaseErrorMessage(error, '取消查询失败，请重试或等待查询结束')
        )
    } finally {
      if (isCurrent()) cancelling.value = false
    }
  }
  const editorPaneSize = ref<string | number>('50%')
  watch(
    compactResults,
    (compact) => {
      editorPaneSize.value = compact ? '24%' : '50%'
    },
    { immediate: true }
  )
  const {
    databaseMetadata,
    metadataLoading,
    metadataError,
    getMetadata,
    ensureSchema,
    ensureTable,
    ensureFunctions,
    searchMetadata,
    ensureQueryMetadata,
    ensureAiMetadata,
    resetMetadata,
    preloadMetadata,
    refreshMetadata
  } = useSqlMetadata({
    owner: () => scopeKey.value,
    external: () => external.value,
    connection: () => connection.value,
    base: () => gatewayBase.value,
    tenant: () => tenantScopeValue(),
    dialect: () => dialect.value,
    querySchema: () => querySchema.value,
    publish: registerSqlMetadata
  })
  const tenantScopeValue = () =>
    userStore.isPlatformSuper
      ? (userStore.getUserInfo.userId && tenantScope.effectiveTenantId) || 'all'
      : 'all'
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
    } catch (cause) {
      if (owner === scopeKey.value)
        ElMessage.warning(
          getFriendlySupabaseErrorMessage(cause, 'schema 结构加载失败，请刷新后重试')
        )
    }
  }
  const completionError = ref<string | null>(null)
  const loadCompletionMetadata = async (query: string, functions: boolean) => {
    if (metadataError.value) return
    const owner = scopeKey.value
    try {
      await ensureQueryMetadata(querySchema.value || undefined, query)
      if (functions)
        await ensureFunctions(
          querySchema.value ||
            (dialect.value === 'postgres' ? 'public' : connection.value?.database) ||
            'public'
        )
      if (owner === scopeKey.value) completionError.value = null
    } catch (cause) {
      if (owner === scopeKey.value)
        completionError.value = getFriendlySupabaseErrorMessage(cause, '字段补全加载失败，请重试')
      throw cause
    }
  }
  const retryCompletionMetadata = () => {
    if (metadataError.value) preloadMetadata()
    else
      void loadCompletionMetadata(editorRef.value?.getExecutionTarget().sql || '', true).catch(
        () => {
          /* Inline retry feedback owns this failure. */
        }
      )
  }
  let releaseMetadataLoader: (() => void) | undefined
  const bindMetadataLoader = () => {
    releaseMetadataLoader?.()
    releaseMetadataLoader = registerSqlMetadataLoader(loadCompletionMetadata)
  }
  onMounted(bindMetadataLoader)
  onBeforeUnmount(() => {
    workspaceActionAlive = false
    workspaceActionRevision.value++
    resetExecutionState()
    resetPlanState()
    closeAiWorkspace()
    releaseMetadataLoader?.()
    resetMetadata()
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
    resetExecutionState()
    workbenchDrawerRef.value?.reset()
    result.value = null
    editorRef.value?.clearErrorMarkers()
    resetMetadata()
    completionError.value = null
    bindMetadataLoader()
    preloadMetadata()
  })
  watch(
    querySchema,
    () => {
      querySchemaRevision.value++
      resetExecutionState()
      result.value = null
      resetPlanState()
      closeAiWorkspace()
      editorRef.value?.clearErrorMarkers()
    },
    { flush: 'sync' }
  )

  const tabs = ref({
    active: 'result',
    list: [{ name: 'result', label: '结果' }]
  })

  const aiErrorContext = computed(() => result.value?.status === 'error' && !queryCancelled.value)

  // 位置基于本次实际执行的语句；预览保留其行列和有界源码片段。
  const errorCaretPreview = computed(() => {
    if (!result.value?.queryText || !sqlErrorLocation.value) return ''
    return buildCaretDiagnostic(result.value.queryText, sqlErrorLocation.value)
  })

  // 执行逻辑同时负责清空旧标记，并在失败时把错误位置重新画回 Monaco。
  const handleExecute = async () => {
    if (!workspaceActionAlive || executing.value) return
    const ownerKey = scopeKey.value
    const sourceIsCurrent = captureWorkspaceActionGuard()
    if (!(await allowReplaceResult()) || !sourceIsCurrent() || executing.value) return
    if (!canExecute.value) {
      ElMessage.warning('数据库管理操作仅限平台超级管理员，可继续浏览结构或使用 AI 生成 SQL')
      return
    }
    if (external.value && !connection.value) {
      ElMessage.warning('当前数据库连接未就绪，请先重新连接执行端')
      return
    }
    const sourceEditor = editorRef.value
    const target = sourceEditor?.getExecutionTarget()
    const sqlToExecute = target?.sql || ''

    if (!sqlToExecute || !sqlToExecute.trim()) {
      ElMessage.warning('请输入 SQL 查询')
      return
    }

    executing.value = true
    cancelling.value = false
    cancelRequested.value = false
    const sequence = ++executionSequence
    const isCurrent = (): boolean => sourceIsCurrent() && sequence === executionSequence
    const requestId = crypto.randomUUID()
    cancelExecution = createQueryCancel(requestId)
    const sourceSql = sqlCode.value
    const sourceRevision = sourceEditor?.getContentRevision()
    const externalQuery = external.value
    const schemaToExecute = dialect.value === 'dm' ? querySchema.value : undefined
    result.value = null
    sqlErrorLocation.value = null
    editorRef.value?.clearErrorMarkers()

    const reportFailure = (cause: unknown, message: string): void => {
      const failure = normalizeSqlConsoleError(cause)
      const cancelled = failure.code === 'SQL_QUERY_CANCELLED'
      let location: SqlErrorLocation | null = null
      if (!cancelled && !externalQuery) {
        if (failure.hasPosition) {
          if (
            failure.hasQuery &&
            failure.query === sqlToExecute &&
            (typeof failure.position === 'number' || typeof failure.position === 'string')
          )
            location = parseSqlErrorLocation(failure.message || '', {
              query: sqlToExecute,
              position: failure.position
            })
        } else if (!failure.hasQuery || failure.query === sqlToExecute) {
          location = parseSqlErrorLocation(failure.message || '', { query: sqlToExecute })
        }
      }
      // 外接执行端会重新排版 SQL，当前没有可验证的原文坐标，不推测位置。
      sqlErrorLocation.value = location
      if (
        sourceEditor &&
        sourceEditor === editorRef.value &&
        sourceSql === sqlCode.value &&
        sourceRevision === sourceEditor.getContentRevision()
      )
        sourceEditor.applyErrorMarker(location, message, target?.startOffset)
      result.value = {
        status: 'error',
        errorCode: failure.code,
        errorMessage: message,
        durationMs: failure.durationMs,
        queryText: sqlToExecute
      }
      recordExecution(
        {
          sql: sqlToExecute,
          status: cancelled ? 'cancelled' : 'error',
          durationMs: failure.durationMs,
          schema: schemaToExecute
        },
        ownerKey
      )
    }

    try {
      const request = {
        requestId,
        query: sqlToExecute,
        maxRows: maxRows.value,
        timeoutMs: timeoutMs.value
      }
      executionIsCurrent = isCurrent
      executionStartedAt = performance.now()
      executionWaitMs.value = 0
      executionTimeoutMs.value = request.timeoutMs
      resumeExecutionClock()
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
      if (!isCurrent()) return
      if (error || data?.status === 'error') {
        const failure = error || data
        reportFailure(failure, normalizeSqlConsoleError(failure).message || '执行 SQL 时发生错误')
        return
      }

      result.value = data ? { ...data, queryText: sqlToExecute } : data
      if (data)
        recordExecution(
          {
            sql: sqlToExecute,
            status:
              normalizeSqlConsoleError(data).code === 'SQL_QUERY_CANCELLED'
                ? 'cancelled'
                : data.status,
            durationMs: data.durationMs,
            rowCount: data.rowCount,
            schema: schemaToExecute
          },
          ownerKey
        )
      sqlErrorLocation.value = null
      editorRef.value?.clearErrorMarkers()
    } catch (error: unknown) {
      if (!isCurrent()) return
      const errorMessage = getFriendlySupabaseErrorMessage(error, 'SQL 执行失败，请稍后重试')
      reportFailure(error, errorMessage)
    } finally {
      if (isCurrent()) {
        sampleExecutionWait()
        pauseExecutionClock()
        executionStartedAt = null
        executionIsCurrent = null
        executing.value = false
        cancelling.value = false
        cancelRequested.value = false
        cancelExecution = null
      }
    }
  }

  const handleExplain = async (retry = false) => {
    if (!workspaceActionAlive) return
    if (dialect.value === 'dm') return
    if (planLoading.value || executing.value || !canExecute.value) return
    const query = retry ? planQuery.value : editorRef.value?.getExecutionTarget().sql || ''
    if (!query.trim()) {
      ElMessage.warning('请选择或输入需要分析的 SQL')
      return
    }
    const sequence = ++planSequence
    const targetDialect = dialect.value
    const workspaceIsCurrent = captureWorkspaceActionGuard()
    const isCurrent = (): boolean => workspaceIsCurrent() && sequence === planSequence
    planIsCurrent = isCurrent
    const requestId = crypto.randomUUID()
    cancelPlan = createQueryCancel(requestId)
    planCancelled.value = false
    planCancelling.value = false
    planCancelRequested.value = false
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
                  {
                    query,
                    requestId,
                    timeoutMs: timeoutMs.value,
                    maxRows: maxRows.value,
                    action: 'explain'
                  }
                ),
                targetDialect
              ),
              error: null
            }
          : await explainSql({ query, requestId, timeoutMs: timeoutMs.value })
      if (!isCurrent()) return
      if (error || data?.status === 'error') {
        planCancelled.value =
          (data?.errorCode || normalizeSqlConsoleError(error).code) === 'SQL_QUERY_CANCELLED'
        planError.value =
          data?.errorMessage ||
          normalizeSqlConsoleError(error).message ||
          '执行计划加载失败，请重试'
      } else {
        planData.value = data
      }
    } catch (error: unknown) {
      if (isCurrent()) {
        planCancelled.value = normalizeSqlConsoleError(error).code === 'SQL_QUERY_CANCELLED'
        planError.value = getFriendlySupabaseErrorMessage(error, '执行计划加载失败，请重试')
      }
    } finally {
      if (isCurrent()) {
        planLoading.value = false
        planCancelling.value = false
        planCancelRequested.value = false
        cancelPlan = null
        planIsCurrent = null
      }
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
    comparisonControlsRef.value?.reset()
  }

  const openAiDialog = (mode: 'generate' | 'fix' = 'generate') => {
    if (!workspaceActionAlive) return
    resetAiState()
    // 用户填写提示词时并行预取 schema，生成按钮不再额外串行等待元数据。
    preloadMetadata()
    aiDialog.value.mode = mode

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
      autoClose: false,
      onClose: () => {
        resetAiState()
        return true
      },
      onConfirm: handleAiGenerate
    })

  // AI 生成会带上当前 schema 摘要，避免模型在表名和关联关系上瞎猜。
  const handleAiGenerate = async (): Promise<boolean> => {
    if (!workspaceActionAlive || aiBusy.value || aiApplying.value) return false
    if (!aiDialog.value.prompt.trim()) {
      ElMessage.warning('请输入需求描述')
      return false
    }

    if (external.value && !connection.value) {
      ElMessage.warning('当前数据库连接未就绪，请先重新连接执行端')
      return false
    }
    const request: Api.DataCenter.SqlConsole.SqlAiGenerateRequest = {
      prompt: aiDialog.value.prompt,
      mode: aiDialog.value.mode,
      currentSql: sqlCode.value,
      dialect: dialect.value,
      schema:
        dialect.value === 'dm'
          ? querySchema.value || connection.value?.database || undefined
          : undefined,
      connectionKind: external.value ? 'external' : 'builtin'
    }
    const sourceEditor = editorRef.value
    const sourceRevision = sourceEditor?.getContentRevision()
    const sourceSchema = querySchema.value
    const sequence = ++aiSequence
    const workspaceIsCurrent = captureWorkspaceActionGuard()
    const isCurrent = (): boolean => workspaceIsCurrent() && sequence === aiSequence
    aiBusy.value = true
    aiProposal.value = null
    try {
      const metadata = await ensureAiMetadata(
        request.prompt,
        request.currentSql || '',
        request.schema
      )
      if (!isCurrent()) return false
      const aiResponse = await generateSqlByAi({
        ...request,
        metadata
      })
      const { data, error } = aiResponse
      if (!isCurrent()) return false

      if (error || typeof data?.sql !== 'string' || !data.sql.trim()) {
        ElMessage.error(
          getFriendlySupabaseErrorMessage(
            error || data,
            'AI SQL 暂不可用，请稍后重试或联系管理员检查 AI 配置。'
          )
        )
        return false
      }

      aiProposal.value = {
        sql: data.sql,
        summary: typeof data.summary === 'string' ? data.summary : undefined,
        warnings: Array.isArray(data.warnings)
          ? data.warnings.filter((warning) => typeof warning === 'string' && warning.trim())
          : [],
        model: typeof data.model === 'string' ? data.model : undefined,
        querySchema: sourceSchema,
        sourceSql: request.currentSql || '',
        sourceEditor,
        sourceRevision,
        isCurrent
      }
      return true
    } catch (error) {
      if (!isCurrent()) return false
      ElMessage.error(getFriendlySupabaseErrorMessage(error, 'AI SQL 生成失败，请稍后重试'))
      return false
    } finally {
      if (isCurrent()) aiBusy.value = false
    }
  }

  const applyAiSql = async (target: 'current' | 'new'): Promise<void> => {
    const proposal = aiProposal.value
    if (
      !proposal ||
      aiBusy.value ||
      aiApplying.value ||
      aiLoadDisabledReason.value ||
      !proposal.isCurrent()
    )
      return
    if (target === 'new' && historyNewTabDisabledReason.value) return
    aiApplying.value = target
    try {
      if (target === 'new') {
        await openSqlInNewTab(
          proposal.sql,
          proposal.querySchema,
          () => proposal.isCurrent() && aiProposal.value === proposal
        )
        return
      }
      const sourceEditor = editorRef.value
      if (!sourceEditor) {
        ElMessage.info('编辑器尚未就绪，请稍后重试')
        return
      }
      const revision = sourceEditor.getContentRevision()
      if (
        !(await allowReplaceResult()) ||
        !proposal.isCurrent() ||
        aiProposal.value !== proposal ||
        aiLoadDisabledReason.value ||
        sourceEditor !== editorRef.value ||
        revision !== sourceEditor.getContentRevision()
      )
        return
      result.value = null
      loadSql(proposal.sql, proposal.querySchema)
      void aiDialogRef.value?.handleClose()
    } finally {
      if (proposal.isCurrent() && aiProposal.value === proposal) aiApplying.value = null
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
  }
</style>
