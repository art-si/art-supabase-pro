<template>
  <div class="notification-reminder-page business-workspace-page">
    <BusinessWorkspaceHeader
      density="compact"
      eyebrow="NOTIFICATION OPERATIONS"
      title="消息提醒"
      description="统一配置租户到期与业务单据提醒，集中管理触达规则、渠道凭据、失败重试和发送审计。"
      icon="ri:notification-badge-line"
      :tags="workspaceTags"
      :metrics="workspaceMetrics"
      refreshable
      refresh-label="刷新消息提醒数据"
      :refresh-loading="page.loading"
      @refresh="loadWorkspace"
    >
      <template #actions>
        <ElButton
          v-auth="'System:NotificationReminder:Dispatch'"
          type="primary"
          :loading="page.dispatching"
          :disabled="!selectedTenantId || page.loading || isAllTenants"
          @click="dispatchNow"
        >
          <ArtSvgIcon icon="ri:send-plane-line" />
          执行提醒任务
        </ElButton>
      </template>
    </BusinessWorkspaceHeader>

    <section
      class="notification-reminder-page__control-panel art-card-xs"
      aria-label="提醒运行配置"
    >
      <div class="notification-reminder-page__scope">
        <div class="notification-reminder-page__tenant-summary">
          <span class="notification-reminder-page__scope-icon" aria-hidden="true">
            <ArtSvgIcon icon="ri:building-4-line" />
          </span>
          <div>
            <small>当前配置租户</small>
            <strong :title="workspace?.tenant.tenantName">{{ tenantName }}</strong>
            <span>{{ tenantValidityText }}</span>
            <em v-if="isAllTenants">全部租户模式下仅预览平台租户，切换具体租户后可维护</em>
          </div>
        </div>

        <label class="notification-reminder-page__scope-field">
          <span>提醒场景</span>
          <ElSelect
            v-model="scenarioFilter"
            clearable
            placeholder="全部提醒场景"
            @change="changeScenario"
          >
            <ElOption
              v-for="scenario in workspace?.scenarios ?? []"
              :key="scenario.id"
              :label="`${moduleLabel(scenario.moduleCode)} · ${scenario.scenarioName}`"
              :value="scenario.scenarioCode"
            />
          </ElSelect>
        </label>
      </div>

      <div class="notification-reminder-page__health">
        <div class="notification-reminder-page__health-title">
          <span aria-hidden="true"><ArtSvgIcon icon="ri:pulse-line" /></span>
          <div>
            <strong>投递运行状态</strong>
            <p>失败任务进入重试队列；未启用或未配置的渠道不会被记为发送成功。</p>
          </div>
        </div>
        <div class="notification-reminder-page__health-items">
          <article>
            <span>待处理</span>
            <b>{{ workspace?.summary.pendingDeliveryCount ?? 0 }}</b>
          </article>
          <article :class="{ 'is-danger': (workspace?.summary.failedDeliveryCount ?? 0) > 0 }">
            <span>发送失败</span>
            <b>{{ workspace?.summary.failedDeliveryCount ?? 0 }}</b>
          </article>
          <article>
            <span>启用渠道</span>
            <b>{{ workspace?.summary.enabledChannelCount ?? 0 }}/5</b>
          </article>
        </div>
      </div>
    </section>

    <ArtPageShell
      :loading="page.loading"
      loading-mode="skeleton"
      :error="page.error"
      :empty="!workspace"
      empty-text="暂无提醒配置"
      empty-description="请刷新页面重试，或先创建提醒规则。"
      @retry="loadWorkspace"
    >
      <div v-if="workspace" class="notification-reminder-page__content">
        <ArtTableQuery
          ref="ruleTableRef"
          focusable
          :loading="page.loading"
          :data="visibleRules"
          :table-columns="ruleColumns"
          :pagination="rulePagination"
          :header-actions="ruleHeaderActions"
          :show-table-toolbar="true"
          :table-header-props="{
            layout: 'refresh,size,fullscreen,columns,settings',
            showZebra: true,
            showBorder: true,
            showHeaderBackground: true
          }"
          :table-props="ruleTableProps"
          @refresh="loadWorkspace"
          @pagination:size-change="handleRuleSizeChange"
          @pagination:current-change="handleRulePageChange"
        >
          <template #table-header-top>
            <div class="notification-reminder-page__section-heading">
              <div>
                <ArtSectionTitle :show-line="false">提醒规则</ArtSectionTitle>
                <p>一条规则对应一个提醒阶段；30 天一次与 7 天每天可同时生效。</p>
              </div>
              <span class="notification-reminder-page__section-count">
                <b>{{ filteredRules.length }}</b>
                条规则
              </span>
            </div>
          </template>
        </ArtTableQuery>

        <ArtSectionCard
          class="notification-reminder-page__channel-panel"
          preserve-content-structure
        >
          <template #header
            ><div class="notification-reminder-page__section-heading">
              <div>
                <ArtSectionTitle :show-line="false">通知渠道</ArtSectionTitle>
                <p>渠道凭据加密保存且不回显；跨租户测试发送给目标租户的可用管理员。</p>
              </div>
              <span class="notification-reminder-page__section-count is-success">
                <b>{{ workspace.summary.enabledChannelCount }}</b>
                / 5 已启用
              </span>
            </div></template
          >

          <div class="notification-reminder-page__channels">
            <article
              v-for="channel in workspace.channels"
              :key="channel.channelCode"
              class="notification-reminder-page__channel-card"
              :class="{ 'is-enabled': channel.enabled }"
            >
              <header>
                <span class="notification-reminder-page__channel-icon" aria-hidden="true">
                  <ArtSvgIcon :icon="channelMeta[channel.channelCode].icon" />
                </span>
                <div>
                  <strong>{{ channelMeta[channel.channelCode].label }}</strong>
                  <small>{{ channelMeta[channel.channelCode].description }}</small>
                </div>
                <span
                  class="notification-reminder-page__channel-status"
                  :class="{ 'is-enabled': channel.enabled }"
                >
                  <i aria-hidden="true" />
                  {{ channel.enabled ? '已启用' : '未启用' }}
                </span>
              </header>

              <dl>
                <div>
                  <dt>服务方式</dt>
                  <dd>{{ providerLabel(channel) }}</dd>
                </div>
                <div>
                  <dt>凭据状态</dt>
                  <dd :class="{ 'is-ready': channel.secretConfigured }">
                    {{ channel.secretConfigured ? '已安全配置' : '待配置' }}
                  </dd>
                </div>
                <div>
                  <dt>最近测试</dt>
                  <dd>{{ testStatusText(channel) }}</dd>
                </div>
              </dl>

              <p v-if="channel.lastError" class="notification-reminder-page__channel-error">
                最近一次测试失败，请检查渠道地址与凭据后重试。
              </p>

              <footer>
                <ElButton
                  v-auth="'System:NotificationReminder:EditChannel'"
                  size="small"
                  :disabled="isAllTenants"
                  @click="openChannelDialog(channel)"
                >
                  配置
                </ElButton>
                <ElButton
                  v-auth="'System:NotificationReminder:TestChannel'"
                  size="small"
                  type="primary"
                  plain
                  :disabled="isAllTenants || !channel.secretConfigured"
                  :loading="page.testingChannel === channel.channelCode"
                  @click="testChannel(channel)"
                >
                  测试发送
                </ElButton>
              </footer>
            </article>
          </div>
        </ArtSectionCard>
      </div>
    </ArtPageShell>

    <NotificationRuleDialog
      ref="ruleDialogRef"
      :tenant-id="selectedTenantId"
      :scenarios="workspace?.scenarios ?? []"
      @success="handleDialogSuccess"
    />
    <NotificationChannelDialog
      ref="channelDialogRef"
      :tenant-id="selectedTenantId"
      @success="handleDialogSuccess"
    />
  </div>
</template>

<script setup lang="tsx">
  import ArtSectionCard from '@/components/core/surfaces/art-section-card/index.vue'
  import dayjs from 'dayjs'
  import { ElButton, ElMessage, ElOption, ElSelect, ElTag } from 'element-plus'
  import type {
    ArtTableQueryExpose,
    ArtTableQueryHeaderAction,
    ArtTableQueryTableProps
  } from '@/components/core/tables/art-table-query/index.vue'
  import type { ColumnOption } from '@/types'
  import ArtButtonTable from '@/components/core/forms/art-button-table/index.vue'
  import BusinessTableRowActions from '@/components/business/business-table-row-actions/index.vue'
  import ArtSectionTitle from '@/components/core/surfaces/art-section-title/index.vue'
  import ArtSvgIcon from '@/components/core/base/art-svg-icon/index.vue'
  import BusinessWorkspaceHeader, {
    type BusinessWorkspaceMetric,
    type BusinessWorkspaceTag
  } from '@/components/business/business-workspace-header/index.vue'
  import {
    deleteNotificationRule,
    fetchNotificationReminderWorkspace,
    runNotificationRemindersNow,
    testNotificationChannel
  } from '@/api/notification-reminder'
  import { useArtFeedback } from '@/hooks/core/useArtFeedback'
  import { useTenantScopeStore } from '@/store/modules/tenant-scope'
  import { useUserStore } from '@/store/modules/user'
  import { resolveTenantWorkspaceId } from '@/utils/tenant-scope-context'
  import NotificationRuleDialog from './modules/notification-rule-dialog.vue'
  import NotificationChannelDialog from './modules/notification-channel-dialog.vue'

  defineOptions({ name: 'NotificationReminder' })

  type Rule = Api.NotificationReminder.Rule
  type ChannelConfig = Api.NotificationReminder.ChannelConfig

  interface DialogExpose<T> {
    handleOpen: (row?: T) => Promise<void>
  }

  interface PageGroup {
    loading: boolean
    dispatching: boolean
    testingChannel: Api.NotificationReminder.ChannelCode | ''
    error: Error | null
  }

  interface RuleTableGroup {
    current: number
    size: number
  }

  const route = useRoute()
  const router = useRouter()
  const { confirmAction } = useArtFeedback()
  const ruleTableRef = ref<ArtTableQueryExpose>()
  const ruleDialogRef = ref<DialogExpose<Rule>>()
  const channelDialogRef = ref<DialogExpose<ChannelConfig>>()
  const workspace = shallowRef<Api.NotificationReminder.Workspace | null>(null)
  const userStore = useUserStore()
  const { effectiveTenantId, isAllTenants } = storeToRefs(useTenantScopeStore())
  const selectedTenantId = computed(() =>
    resolveTenantWorkspaceId(effectiveTenantId.value, userStore.getUserInfo.tenantId)
  )
  const scenarioFilter = ref(typeof route.query.scenario === 'string' ? route.query.scenario : '')

  const page = reactive<PageGroup>({
    loading: false,
    dispatching: false,
    testingChannel: '',
    error: null
  })
  const ruleTable = reactive<RuleTableGroup>({ current: 1, size: 20 })

  const workspaceTags = computed<BusinessWorkspaceTag[]>(() => [
    {
      label: isAllTenants.value ? '平台租户预览' : '站内通知已接入',
      type: isAllTenants.value ? 'warning' : 'success',
      effect: 'plain'
    },
    { label: '外部渠道凭据加密', type: 'primary', effect: 'plain' }
  ])
  const channelMeta: Record<
    Api.NotificationReminder.ChannelCode,
    { label: string; description: string; icon: string }
  > = {
    in_app: { label: '站内通知', description: '顶部通知中心', icon: 'ri:notification-3-line' },
    email: { label: '邮件', description: '邮件服务 API', icon: 'ri:mail-send-line' },
    sms: { label: '手机短信', description: '短信服务网关', icon: 'ri:message-2-line' },
    dingtalk: { label: '钉钉', description: '群机器人', icon: 'ri:dingding-line' },
    wecom: { label: '企业微信', description: '群机器人', icon: 'ri:wechat-2-line' }
  }

  const filteredRules = computed(() => {
    const rules = workspace.value?.rules ?? []
    return scenarioFilter.value
      ? rules.filter((rule) => rule.scenarioCode === scenarioFilter.value)
      : rules
  })
  const visibleRules = computed(() => {
    const start = (ruleTable.current - 1) * ruleTable.size
    return filteredRules.value.slice(start, start + ruleTable.size)
  })
  const rulePagination = computed(() => ({
    current: ruleTable.current,
    size: ruleTable.size,
    total: filteredRules.value.length
  }))
  const tenantName = computed(() => workspace.value?.tenant.tenantName || '正在加载租户配置')
  const tenantValidityText = computed(() => {
    const tenant = workspace.value?.tenant
    if (!tenant) return '请选择租户查看服务期限'
    if (!tenant.serviceStartDate && !tenant.serviceEndDate) return '未设置期限 · 长期有效'
    return `服务期：${tenant.serviceStartDate || '未限制'} 至 ${tenant.serviceEndDate || '未限制'}`
  })
  const workspaceMetrics = computed<BusinessWorkspaceMetric[]>(() => [
    {
      label: '活跃提醒对象',
      value: workspace.value?.summary.activeSubjectCount ?? 0,
      description: '已接入租户与业务单据',
      icon: 'ri:file-list-3-line',
      tone: 'primary'
    },
    {
      label: '30 日内到期',
      value: workspace.value?.summary.dueWithin30Days ?? 0,
      description: '需要提前安排处理',
      icon: 'ri:alarm-warning-line',
      tone: 'warning'
    },
    {
      label: '启用规则',
      value: workspace.value?.summary.enabledRuleCount ?? 0,
      description: '规则按阶段独立执行',
      icon: 'ri:timer-flash-line',
      tone: 'success'
    }
  ])

  const moduleLabel = (moduleCode?: unknown): string =>
    ({ system: '系统', tms: 'TMS', vms: 'VMS', fms: 'FMS', hr: 'HR' })[
      String(moduleCode ?? 'system') as Api.NotificationReminder.ModuleCode
    ] ?? '系统'

  const channelLabel = (channelCode: Api.NotificationReminder.ChannelCode): string =>
    channelMeta[channelCode].label

  const providerLabel = (channel: ChannelConfig): string => {
    if (channel.channelCode === 'in_app') return '系统内置'
    if (channel.channelCode === 'email') return '邮件服务'
    if (channel.channelCode === 'sms') return '通用短信网关'
    return '机器人 Webhook'
  }

  const testStatusText = (channel: ChannelConfig): string => {
    if (!channel.lastTestAt) return '尚未测试'
    const statusLabel: Record<Api.NotificationReminder.TestStatus, string> = {
      pending: '等待投递',
      delivered: '测试成功',
      failed: '测试失败'
    }
    return `${statusLabel[channel.lastTestStatus ?? 'pending']} · ${dayjs(channel.lastTestAt).format('MM-DD HH:mm')}`
  }

  const ruleColumns: ColumnOption<Rule>[] = [
    {
      prop: 'scenarioName',
      label: '业务场景',
      minWidth: 176,
      formatter: (row) => (
        <div class="notification-reminder-page__scenario-cell">
          <ElTag size="small" effect="plain">
            {moduleLabel(row.moduleCode)}
          </ElTag>
          <strong title={row.scenarioName}>{row.scenarioName || '--'}</strong>
        </div>
      )
    },
    {
      prop: 'ruleName',
      label: '规则名称',
      minWidth: 190,
      showOverflowTooltip: true
    },
    {
      prop: 'leadDays',
      label: '执行节奏',
      minWidth: 180,
      formatter: (row) => (
        <div class="notification-reminder-page__schedule-cell">
          <strong>提前 {row.leadDays} 天</strong>
          <span>
            {row.repeatEveryDays ? `每 ${row.repeatEveryDays} 天` : '仅一次'} ·{' '}
            {String(row.sendHour).padStart(2, '0')}:00
          </span>
        </div>
      )
    },
    {
      prop: 'channels',
      label: '通知渠道',
      minWidth: 220,
      formatter: (row) => (
        <div class="notification-reminder-page__tag-list">
          {row.channels.map((code) => (
            <ElTag key={code} size="small" effect="light">
              {channelLabel(code)}
            </ElTag>
          ))}
        </div>
      )
    },
    {
      prop: 'enabled',
      label: '状态',
      width: 96,
      align: 'center',
      formatter: (row) => (
        <span
          class={
            row.enabled
              ? 'notification-reminder-page__status is-enabled'
              : 'notification-reminder-page__status'
          }
        >
          <i aria-hidden="true" />
          {row.enabled ? '已启用' : '已停用'}
        </span>
      )
    },
    {
      prop: 'operation',
      label: '操作',
      width: 104,
      fixed: 'right',
      formatter: (row) => (
        <BusinessTableRowActions>
          <ArtButtonTable
            type="edit"
            label="编辑提醒规则"
            permission="System:NotificationReminder:EditRule"
            disabled={isAllTenants.value}
            onClick={() => openRuleDialog(row)}
          />
          <ArtButtonTable
            type="delete"
            label="删除提醒规则"
            permission="System:NotificationReminder:DeleteRule"
            disabled={isAllTenants.value}
            onClick={() => void removeRule(row)}
          />
        </BusinessTableRowActions>
      )
    }
  ]
  const ruleHeaderActions = computed<ArtTableQueryHeaderAction[]>(() => [
    {
      key: 'add-rule',
      type: 'add',
      label: isAllTenants.value ? '选择租户后新增' : '新增规则',
      permission: 'System:NotificationReminder:AddRule',
      disabled: isAllTenants.value,
      onClick: () => openRuleDialog()
    }
  ])
  const ruleTableProps: ArtTableQueryTableProps = {
    rowKey: 'id',
    tableLayout: 'fixed',
    emptyHeight: '230px',
    emptyText: '当前范围暂无提醒规则',
    emptyDescription: '可切换提醒场景，或创建新的提醒阶段。',
    paginationOptions: {
      pageSizes: [10, 20, 50],
      hideOnSinglePage: true
    }
  }

  const loadWorkspace = async (): Promise<void> => {
    if (!selectedTenantId.value) return
    page.loading = true
    page.error = null
    try {
      const { data, error } = await fetchNotificationReminderWorkspace(selectedTenantId.value)
      if (error || !data) throw error ?? new Error('empty workspace')
      workspace.value = data
      const maxPage = Math.max(1, Math.ceil(filteredRules.value.length / ruleTable.size))
      ruleTable.current = Math.min(ruleTable.current, maxPage)
    } catch (error) {
      workspace.value = null
      page.error = new Error('消息提醒配置加载失败，请刷新后重试。', { cause: error })
    } finally {
      page.loading = false
    }
  }

  const changeScenario = async (): Promise<void> => {
    ruleTable.current = 1
    await router.replace({
      path: route.path,
      query: { ...route.query, scenario: scenarioFilter.value || undefined }
    })
  }

  const handleRuleSizeChange = (size: number): void => {
    ruleTable.size = size
    ruleTable.current = 1
  }

  const handleRulePageChange = (current: number): void => {
    ruleTable.current = current
  }

  const openRuleDialog = (row?: Rule): void => {
    if (isAllTenants.value) return
    void ruleDialogRef.value?.handleOpen(row)
  }

  const openChannelDialog = (row: ChannelConfig): void => {
    if (isAllTenants.value) return
    void channelDialogRef.value?.handleOpen(row)
  }

  const handleDialogSuccess = (): void => {
    void loadWorkspace()
  }

  const removeRule = async (rule: Rule): Promise<void> => {
    if (!rule.id || isAllTenants.value) return
    try {
      await confirmAction(
        `确定删除规则“${rule.ruleName}”吗？已经生成的发送记录会继续保留。`,
        '删除提醒规则',
        {
          type: 'warning',
          confirmButtonText: '确认删除',
          cancelButtonText: '取消'
        }
      )
      await deleteNotificationRule(rule.id)
      await loadWorkspace()
    } catch {
      // 用户取消时无需提示；接口失败由统一响应层提示。
    }
  }

  const testChannel = async (channel: ChannelConfig): Promise<void> => {
    if (isAllTenants.value) return
    page.testingChannel = channel.channelCode
    try {
      await testNotificationChannel(selectedTenantId.value, channel.channelCode)
      ElMessage.success(
        channel.channelCode === 'in_app'
          ? '站内通知测试成功'
          : '测试消息已提交，投递结果会更新到渠道卡片。'
      )
      await loadWorkspace()
    } finally {
      page.testingChannel = ''
    }
  }

  const dispatchNow = async (): Promise<void> => {
    if (!selectedTenantId.value || isAllTenants.value) return
    page.dispatching = true
    try {
      const { data, error } = await runNotificationRemindersNow(selectedTenantId.value)
      if (error) throw error
      ElMessage.success(
        `执行完成：生成 ${data?.createdEventCount ?? 0} 个事件，投递 ${data?.deliveredCount ?? data?.deliveredInAppCount ?? 0} 条。`
      )
      await loadWorkspace()
    } finally {
      page.dispatching = false
    }
  }

  watch(
    () => route.query.scenario,
    (value) => {
      scenarioFilter.value = typeof value === 'string' ? value : ''
      ruleTable.current = 1
    }
  )

  watch(
    [selectedTenantId, isAllTenants],
    () => {
      workspace.value = null
      ruleTable.current = 1
      void loadWorkspace()
    },
    { immediate: true }
  )
</script>

<style scoped lang="scss">
  .notification-reminder-page {
    gap: 12px;
    min-width: 0;
    overflow: visible;

    &__control-panel {
      flex: none;
      min-width: 0;
      overflow: hidden;
    }

    &__scope {
      display: grid;
      grid-template-columns: minmax(300px, 1.15fr) minmax(230px, 0.85fr);
      gap: 16px;
      align-items: end;
      padding: 16px;
    }

    &__tenant-summary {
      display: flex;
      gap: 12px;
      align-items: center;
      min-width: 0;

      > div {
        display: grid;
        min-width: 0;
      }

      small,
      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }

      strong {
        margin: 2px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      em {
        margin-top: 3px;
        overflow: hidden;
        text-overflow: ellipsis;
        font-size: 11px;
        font-style: normal;
        color: var(--el-color-warning-dark-2);
        white-space: nowrap;
      }
    }

    &__scope-icon {
      display: grid;
      flex: 0 0 40px;
      place-items: center;
      width: 40px;
      height: 40px;
      color: var(--el-color-primary);
      background: var(--el-color-primary-light-9);
      border-radius: var(--art-control-radius);
    }

    &__scope-field {
      display: grid;
      gap: 7px;
      min-width: 0;

      > span {
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-regular);
      }
    }

    &__health {
      display: flex;
      gap: 24px;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      background: color-mix(in srgb, var(--el-color-primary) 4%, var(--default-box-color));
      border-top: 1px solid
        color-mix(in srgb, var(--el-color-primary) 14%, var(--el-border-color-lighter));
    }

    &__health-title {
      display: flex;
      gap: 11px;
      align-items: center;
      min-width: 0;

      > span {
        display: grid;
        flex: 0 0 36px;
        place-items: center;
        width: 36px;
        height: 36px;
        color: var(--el-color-primary);
        background: var(--el-bg-color);
        border-radius: var(--art-control-radius);
      }

      strong {
        color: var(--el-text-color-primary);
      }

      p {
        margin: 2px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__health-items {
      display: flex;
      gap: 8px;

      article {
        display: grid;
        min-width: 94px;
        padding: 8px 12px;
        background: color-mix(in srgb, var(--el-bg-color) 90%, transparent);
        border: 1px solid var(--el-border-color-lighter);
        border-radius: var(--art-control-radius);

        span {
          font-size: 11px;
          color: var(--el-text-color-secondary);
        }

        b {
          margin-top: 1px;
          font-variant-numeric: tabular-nums;
          color: var(--el-text-color-primary);
        }

        &.is-danger b {
          color: var(--el-color-danger);
        }
      }
    }

    &__content {
      display: grid;
      gap: 12px;
      min-width: 0;
    }

    &__section-heading {
      display: flex;
      gap: 20px;
      align-items: center;
      justify-content: space-between;
      min-width: 0;

      > div {
        min-width: 0;
      }

      p {
        margin: 4px 0 0;
        font-size: 12px;
        line-height: 1.55;
        color: var(--el-text-color-secondary);
      }
    }

    &__section-count {
      display: inline-flex;
      flex: none;
      gap: 4px;
      align-items: baseline;
      min-height: 28px;
      padding: 4px 10px;
      font-size: 12px;
      color: var(--el-text-color-secondary);
      white-space: nowrap;
      background: var(--art-gray-100);
      border-radius: 999px;

      b {
        font-size: 14px;
        font-variant-numeric: tabular-nums;
        color: var(--el-text-color-primary);
      }

      &.is-success {
        color: var(--el-color-success-dark-2);
        background: var(--el-color-success-light-9);

        b {
          color: inherit;
        }
      }
    }

    :deep(.notification-reminder-page__scenario-cell),
    :deep(.notification-reminder-page__schedule-cell) {
      display: grid;
      gap: 4px;
      justify-items: start;
      min-width: 0;

      strong {
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--el-text-color-primary);
        white-space: nowrap;
      }

      span {
        font-size: 12px;
        color: var(--el-text-color-secondary);
      }
    }

    :deep(.notification-reminder-page__tag-list) {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      align-items: center;
    }

    :deep(.notification-reminder-page__status) {
      display: inline-flex;
      gap: 6px;
      align-items: center;
      color: var(--el-text-color-secondary);

      i {
        width: 7px;
        height: 7px;
        background: var(--el-color-info-light-5);
        border-radius: 50%;
      }

      &.is-enabled {
        color: var(--el-color-success);

        i {
          background: currentcolor;
        }
      }
    }

    &__channel-panel {
      min-width: 0;
      padding: 15px 16px 16px;
    }

    &__channels {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 10px;
      margin-top: 13px;
    }

    &__channel-card {
      display: grid;
      gap: 12px;
      min-width: 0;
      padding: 14px;
      background: var(--el-fill-color-extra-light);
      border: 1px solid var(--el-border-color-lighter);
      border-radius: var(--art-surface-radius);

      &.is-enabled {
        background: var(--el-bg-color);
        border-color: color-mix(in srgb, var(--el-color-success) 34%, var(--el-border-color));
      }

      header {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        gap: 9px;
        align-items: center;

        .notification-reminder-page__channel-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          color: var(--el-color-primary);
          background: var(--el-color-primary-light-9);
          border-radius: var(--art-control-radius);
        }

        strong,
        small {
          display: block;
        }

        strong {
          color: var(--el-text-color-primary);
        }

        small {
          margin-top: 2px;
          overflow: hidden;
          text-overflow: ellipsis;
          font-size: 11px;
          color: var(--el-text-color-secondary);
          white-space: nowrap;
        }
      }

      .notification-reminder-page__channel-status {
        display: inline-flex;
        gap: 5px;
        align-items: center;
        min-height: 26px;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 600;
        color: var(--el-text-color-secondary);
        white-space: nowrap;
        background: var(--art-gray-100);
        border-radius: 999px;

        i {
          width: 7px;
          height: 7px;
          background: var(--el-color-info-light-5);
          border-radius: 50%;
        }

        &.is-enabled {
          color: var(--el-color-success-dark-2);
          background: var(--el-color-success-light-9);

          i {
            background: var(--el-color-success);
          }
        }
      }

      dl {
        display: grid;
        gap: 7px;
        margin: 0;

        div {
          display: flex;
          gap: 8px;
          justify-content: space-between;
        }

        dt,
        dd {
          margin: 0;
          font-size: 12px;
        }

        dt {
          color: var(--el-text-color-secondary);
        }

        dd {
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--el-text-color-regular);
          white-space: nowrap;

          &.is-ready {
            color: var(--el-color-success);
          }
        }
      }

      footer {
        display: flex;
        gap: 6px;
        justify-content: flex-end;
        margin-top: auto;
      }
    }

    &__channel-error {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--el-color-danger);
      white-space: nowrap;
    }

    @media (width <= 1100px) {
      &__scope {
        grid-template-columns: 1fr 1fr;
      }

      &__tenant-summary {
        grid-column: 1 / -1;
      }

      &__health {
        align-items: flex-start;
      }
    }

    @media (width <= 720px) {
      &__scope {
        grid-template-columns: 1fr;
      }

      &__tenant-summary {
        grid-column: auto;
      }

      &__health {
        flex-direction: column;
      }

      &__health-items {
        width: 100%;

        article {
          flex: 1;
          min-width: 0;
        }
      }

      &__section-heading {
        align-items: flex-start;
      }
    }
  }
</style>
