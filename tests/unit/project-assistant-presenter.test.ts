import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getProjectAssistantChatPhase,
  getProjectAssistantFailureMessage,
  getProjectAssistantStats,
  getProjectAssistantToolLabel,
  getProjectObjectInsights,
  mapProjectAssistantConversationMessages
} from '../../src/views/data-center/supabase-ai-assistant/modules/project-assistant-presenter'
import type {
  ProjectDatabaseObject,
  ProjectAssistantHistoryDetailResponse,
  ProjectObjectDetail,
  ProjectRelationship
} from '../../src/types/supabase-ai-assistant'

test('assistant presentation keeps progress phases consistent', () => {
  assert.equal(getProjectAssistantChatPhase(2499), '正在理解问题')
  assert.equal(getProjectAssistantChatPhase(2500), '正在查询项目元数据')
  assert.equal(getProjectAssistantChatPhase(8000), '正在整理分析结果')
})

test('assistant tool labels keep known names friendly and preserve unknown diagnostics', () => {
  assert.equal(getProjectAssistantToolLabel('get_security_posture'), '安全态势')
  assert.equal(getProjectAssistantToolLabel('future_read_only_tool'), 'future_read_only_tool')
})

test('assistant failure copy distinguishes timeouts from safe business errors', () => {
  assert.match(getProjectAssistantFailureMessage('request timed out'), /未修改任何项目数据/)
  assert.equal(getProjectAssistantFailureMessage('当前功能暂不可用'), '当前功能暂不可用')
})

test('conversation restore maps successful runs to assistant messages in order', () => {
  const result: ProjectAssistantHistoryDetailResponse = {
    conversation: {
      id: 'conversation-1',
      title: '安全审计',
      context: {},
      createTime: '2026-08-11T00:00:00Z',
      updateTime: '2026-08-11T00:01:00Z'
    },
    messages: [
      { id: 1, role: 'user', content: '检查 RLS', createTime: '2026-08-11T00:00:00Z' },
      { id: 2, role: 'assistant', content: '第一轮', createTime: '2026-08-11T00:00:30Z' },
      { id: 3, role: 'assistant', content: '第二轮', createTime: '2026-08-11T00:01:00Z' }
    ],
    runs: [
      {
        id: 'run-1',
        status: 'succeeded',
        model: 'model-a',
        startedAt: '2026-08-11T00:00:10Z'
      },
      {
        id: 'run-failed',
        status: 'failed',
        model: 'model-a',
        startedAt: '2026-08-11T00:00:31Z'
      },
      {
        id: 'run-2',
        status: 'succeeded',
        model: 'model-b',
        startedAt: '2026-08-11T00:00:40Z'
      }
    ]
  }

  const messages = mapProjectAssistantConversationMessages(result)
  assert.equal(messages[0].runId, undefined)
  assert.equal(messages[1].runId, 'run-1')
  assert.equal(messages[2].runId, 'run-2')
})

test('assistant stats expose stable placeholders before catalog data arrives', () => {
  const stats = getProjectAssistantStats(null, null)
  assert.equal(stats.length, 6)
  assert.ok(stats.every((item) => item.value === '-'))
  assert.equal(stats.at(-1)?.type, 'all')
})

test('table insights summarize metadata, relationships and safe RLS drafting', () => {
  const selectedObject: ProjectDatabaseObject = {
    schemaName: 'public',
    objectName: 'orders',
    objectType: 'table',
    description: '运输订单'
  }
  const detail: ProjectObjectDetail = {
    ...selectedObject,
    ddl: 'create table public.orders (\n  id uuid primary key\n);',
    columns: [
      { name: 'id', dataType: 'uuid', nullable: false, description: '主键' },
      { name: 'tenant_id', dataType: 'uuid', nullable: false }
    ],
    constraints: [{ name: 'orders_pkey', type: 'PRIMARY KEY', definition: 'PRIMARY KEY (id)' }]
  }
  const relationships: ProjectRelationship[] = [
    {
      constraintName: 'orders_tenant_id_fkey',
      sourceSchema: 'public',
      sourceTable: 'orders',
      sourceColumns: ['tenant_id'],
      targetSchema: 'public',
      targetTable: 'sys_tenant',
      targetColumns: ['id'],
      definition: 'FOREIGN KEY (tenant_id) REFERENCES sys_tenant(id)'
    }
  ]

  const insights = getProjectObjectInsights(detail, selectedObject, relationships)
  assert.deepEqual(
    insights.metrics.map((item) => item.value),
    [2, 1, 3, '67%']
  )
  assert.equal(
    insights.governanceChecks.find((item) => item.label === '外键关系')?.status,
    'success'
  )
  const rlsAction = insights.aiActions.find((item) => item.label === '生成 RLS 方案')
  assert.ok(rlsAction)
  assert.match(rlsAction.prompt, /不要直接执行/)
})
