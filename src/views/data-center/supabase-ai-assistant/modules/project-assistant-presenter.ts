import type { ColumnOption } from '@/types'
import type { AiAssistantToolResult } from '@/types/ai-assistant'
import type {
  ProjectAssistantCapabilities,
  ProjectAssistantHistoryDetailResponse,
  ProjectAssistantSafetyMode,
  ProjectDatabaseObject,
  ProjectEdgeFunctionResult,
  ProjectObjectColumn,
  ProjectObjectDetail,
  ProjectObjectType,
  ProjectOverview,
  ProjectRelationship
} from '@/types/supabase-ai-assistant'

export interface ProjectAssistantChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  runId?: string
  model?: string
  promptVersion?: string
  latencyMs?: number | null
  tools?: AiAssistantToolResult[]
  usage?: { inputTokens?: number; outputTokens?: number }
  feedback?: -1 | 1
  createdAt?: string
}

export interface ProjectAssistantObjectAiAction {
  label: string
  description: string
  prompt: string
  icon: string
}

export interface ProjectAssistantStatusState {
  loading: boolean
  online: boolean
  capabilities: ProjectAssistantCapabilities | null
}

interface ObjectInsightMetric {
  label: string
  value: string | number
  helper: string
  icon: string
}

interface ObjectGovernanceCheck {
  label: string
  detail: string
  status: 'success' | 'warning' | 'info'
  statusLabel: string
  icon: string
}

export const projectObjectFieldColumns: ColumnOption<ProjectObjectColumn>[] = [
  { prop: 'name', label: '字段', minWidth: 150 },
  { prop: 'dataType', label: '类型', minWidth: 160 },
  {
    prop: 'nullable',
    label: '可空',
    width: 80,
    align: 'center',
    formatter: (row) => (row.nullable ? '是' : '否')
  },
  {
    prop: 'defaultValue',
    label: '默认值',
    minWidth: 180,
    showOverflowTooltip: true
  },
  {
    prop: 'description',
    label: '字段说明',
    minWidth: 180,
    showOverflowTooltip: true
  }
]

export function getProjectObjectIcon(type: ProjectObjectType): string {
  return {
    table: 'ri:table-2',
    view: 'ri:layout-grid-line',
    materialized_view: 'ri:layout-grid-line',
    function: 'ri:function-line',
    trigger: 'ri:flashlight-line',
    policy: 'ri:shield-keyhole-line',
    index: 'ri:list-ordered-2',
    all: 'ri:database-2-line'
  }[type]
}

export function getProjectAssistantToolLabel(name: string): string {
  return (
    {
      get_project_overview: '项目概览',
      list_database_schemas: 'Schema',
      list_database_objects: '对象目录',
      get_database_object_detail: '对象定义',
      get_table_relationships: '关系分析',
      list_edge_functions: 'Edge Functions',
      get_supabase_capability_snapshot: '全域能力',
      get_security_posture: '安全态势',
      get_performance_posture: '性能态势',
      get_auth_overview: 'Auth',
      get_storage_overview: 'Storage',
      get_realtime_overview: 'Realtime',
      get_database_extensions: '数据库扩展',
      get_async_capabilities: 'Cron / Queues / Vectors'
    }[name] ?? name
  )
}

export function getProjectAssistantChatPhase(elapsedMs: number): string {
  if (elapsedMs < 2500) return '正在理解问题'
  if (elapsedMs < 8000) return '正在查询项目元数据'
  return '正在整理分析结果'
}

export function getProjectAssistantFailureMessage(errorMessage: string): string {
  return /aborted|aborterror|signal|timeout|timed out/i.test(errorMessage)
    ? '模型响应超时，请稍后重试；本次请求未修改任何项目数据。'
    : errorMessage
}

export function mapProjectAssistantConversationMessages(
  result: ProjectAssistantHistoryDetailResponse
): ProjectAssistantChatMessage[] {
  let runIndex = 0
  const successfulRuns = result.runs.filter((run) => run.status === 'succeeded')

  return result.messages.map((message) => {
    const run = message.role === 'assistant' ? successfulRuns[runIndex++] : undefined
    return {
      id: String(message.id),
      role: message.role,
      content: message.content,
      createdAt: message.createTime,
      runId: run?.id,
      model: run?.model,
      promptVersion: run?.promptVersion,
      latencyMs: run?.latencyMs,
      tools: run?.toolCalls,
      usage: message.usage
    }
  })
}

export function getProjectAssistantStatusLabel(
  status: ProjectAssistantStatusState,
  mode: ProjectAssistantSafetyMode
): string {
  if (status.loading) return '能力检测中'
  if (!status.online) return '服务待同步'
  const modeLabel = mode === 'controlled_write' ? '受控变更' : '只读分析'
  return `AI 在线 · ${modeLabel} · v${status.capabilities?.version || '-'}`
}

export function getProjectAssistantStats(
  overview: ProjectOverview | null,
  edgeFunctions: ProjectEdgeFunctionResult | null
): Array<{ label: string; value: string | number; type: ProjectObjectType; icon: string }> {
  return [
    { label: '数据表', value: overview?.tables ?? '-', type: 'table', icon: 'ri:table-2' },
    { label: '视图', value: overview?.views ?? '-', type: 'view', icon: 'ri:layout-grid-line' },
    {
      label: '函数',
      value: overview?.functions ?? '-',
      type: 'function',
      icon: 'ri:function-line'
    },
    {
      label: '触发器',
      value: overview?.triggers ?? '-',
      type: 'trigger',
      icon: 'ri:flashlight-line'
    },
    {
      label: 'RLS 策略',
      value: overview?.policies ?? '-',
      type: 'policy',
      icon: 'ri:shield-keyhole-line'
    },
    {
      label: 'Edge Functions',
      value: edgeFunctions?.functions.length ?? '-',
      type: 'all',
      icon: 'ri:cloud-line'
    }
  ]
}

export function getProjectAssistantSuggestions(
  selectedObject: ProjectDatabaseObject | null
): string[] {
  if (selectedObject) {
    return [
      `解释 ${selectedObject.schemaName}.${selectedObject.objectName} 的设计`,
      '检查当前对象的安全与性能风险',
      '为当前对象生成优化方案'
    ]
  }
  return ['概览当前 Supabase 项目', '检查 RLS 策略概况', '列出项目 Edge Functions']
}

export function getProjectAssistantQuickActions(
  activeObject: ProjectDatabaseObject | null
): Array<{ label: string; icon: string; prompt: string }> {
  return [
    {
      label: '安全审计',
      icon: 'ri:shield-check-line',
      prompt: activeObject
        ? `审计 ${activeObject.schemaName}.${activeObject.objectName} 的安全风险，并给出证据和修复草案`
        : '审计当前项目的 RLS 策略与 Edge Function JWT 配置，按严重程度列出风险'
    },
    {
      label: '影响分析',
      icon: 'ri:git-branch-line',
      prompt: activeObject
        ? `分析修改 ${activeObject.schemaName}.${activeObject.objectName} 可能影响的关系与对象`
        : '分析当前项目的核心对象关系与高影响变更点'
    },
    {
      label: '变更方案',
      icon: 'ri:file-list-3-line',
      prompt: activeObject
        ? `为 ${activeObject.schemaName}.${activeObject.objectName} 生成企业级变更方案，包含校验与回滚步骤`
        : '生成一份当前项目的企业级治理优化路线图，不执行任何变更'
    }
  ]
}

export function getProjectObjectInsights(
  detail: ProjectObjectDetail | null,
  selectedObject: ProjectDatabaseObject | null,
  relationships: ProjectRelationship[]
): {
  metrics: ObjectInsightMetric[]
  governanceChecks: ObjectGovernanceCheck[]
  aiActions: ProjectAssistantObjectAiAction[]
} {
  const columns = detail?.columns ?? []
  const describedColumnCount = columns.filter((column) => column.description?.trim()).length
  const hasDescription = Boolean((detail?.description || selectedObject?.description)?.trim())
  const metadataCoverage = Math.round(
    ((describedColumnCount + (hasDescription ? 1 : 0)) / (columns.length + 1)) * 100
  )
  const hasPrimaryKey = (detail?.constraints ?? []).some((constraint) =>
    /primary\s+key/i.test(`${constraint.type} ${constraint.definition}`)
  )
  const ddlLineCount = detail?.ddl?.split(/\r?\n/).length ?? 0

  const metrics: ObjectInsightMetric[] = [
    {
      label: '字段规模',
      value: columns.length,
      helper: columns.length ? '已读取完整字段元数据' : '当前对象没有字段结构',
      icon: 'ri:table-line'
    },
    {
      label: '约束数量',
      value: detail?.constraints?.length ?? 0,
      helper: hasPrimaryKey ? '已识别主键约束' : '未识别主键约束',
      icon: 'ri:link-m'
    },
    {
      label: '定义行数',
      value: ddlLineCount,
      helper: detail?.ddl ? 'DDL 可查看与复制' : '暂无可显示的 DDL',
      icon: 'ri:code-s-slash-line'
    },
    {
      label: '说明覆盖',
      value: `${metadataCoverage}%`,
      helper: `${describedColumnCount} 个字段已有说明`,
      icon: 'ri:file-list-3-line'
    }
  ]

  const governanceChecks: ObjectGovernanceCheck[] = [
    {
      label: '对象说明',
      detail: hasDescription ? '已配置数据库 COMMENT，业务语义可追溯' : '建议补充用途和数据边界',
      status: hasDescription ? 'success' : 'warning',
      statusLabel: hasDescription ? '完整' : '待补充',
      icon: hasDescription ? 'ri:check-line' : 'ri:error-warning-line'
    },
    {
      label: '对象定义',
      detail: detail?.ddl ? '已获取只读 DDL，可用于评审和变更草案' : '当前对象没有可显示的 DDL',
      status: detail?.ddl ? 'success' : 'warning',
      statusLabel: detail?.ddl ? '可追溯' : '不可用',
      icon: detail?.ddl ? 'ri:check-line' : 'ri:error-warning-line'
    }
  ]

  if (columns.length) {
    const allColumnsDescribed = describedColumnCount === columns.length
    governanceChecks.push({
      label: '字段说明',
      detail: `${describedColumnCount} / ${columns.length} 个字段已有 COMMENT`,
      status: allColumnsDescribed ? 'success' : 'warning',
      statusLabel: allColumnsDescribed ? '完整' : '可提升',
      icon: allColumnsDescribed ? 'ri:check-line' : 'ri:information-line'
    })
  }

  if (selectedObject?.objectType === 'table') {
    governanceChecks.push(
      {
        label: '主键约束',
        detail: hasPrimaryKey ? '已识别 PRIMARY KEY' : '未在对象定义中识别到 PRIMARY KEY',
        status: hasPrimaryKey ? 'success' : 'warning',
        statusLabel: hasPrimaryKey ? '已配置' : '需复核',
        icon: hasPrimaryKey ? 'ri:key-2-line' : 'ri:error-warning-line'
      },
      {
        label: '外键关系',
        detail: relationships.length
          ? `已识别 ${relationships.length} 条关联关系`
          : '当前没有已识别的外键关系',
        status: relationships.length ? 'success' : 'info',
        statusLabel: relationships.length ? '已映射' : '无关系',
        icon: relationships.length ? 'ri:git-branch-line' : 'ri:information-line'
      }
    )
  }

  return {
    metrics,
    governanceChecks,
    aiActions: getProjectObjectAiActions(selectedObject)
  }
}

function getProjectObjectAiActions(
  selectedObject: ProjectDatabaseObject | null
): ProjectAssistantObjectAiAction[] {
  const target = selectedObject
    ? `${selectedObject.schemaName}.${selectedObject.objectName}`
    : '当前对象'
  const actions: ProjectAssistantObjectAiAction[] = [
    {
      label: '解释对象设计',
      description: '结合字段、约束和关系说明设计意图',
      prompt: `深度解释 ${target} 的设计意图、核心字段、约束和上下游关系；所有结论必须基于实时工具查询结果。`,
      icon: 'ri:book-open-line'
    },
    {
      label: '安全与性能审计',
      description: '识别权限、索引和结构风险',
      prompt: `对 ${target} 做企业级安全与性能审计，核对 RLS、策略、索引、约束和潜在高风险变更点，并区分已验证事实与建议。`,
      icon: 'ri:shield-check-line'
    },
    {
      label: '生成数据字典',
      description: '输出可交付的字段与关系文档',
      prompt: `为 ${target} 生成结构化数据字典，包含对象用途、字段、类型、默认值、可空性、约束、关系及缺失说明清单。`,
      icon: 'ri:file-list-3-line'
    }
  ]
  if (selectedObject?.objectType === 'table') {
    actions.push({
      label: '生成 RLS 方案',
      description: '给出策略草案、验证和回滚步骤',
      prompt: `检查 ${target} 当前 RLS 策略并生成企业级优化草案，覆盖 SELECT、INSERT、UPDATE、DELETE、租户隔离、验证 SQL 和回滚步骤；不要直接执行。`,
      icon: 'ri:shield-keyhole-line'
    })
  }
  return actions
}
