import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { omit } from 'lodash-es'
import ts from 'typescript'
import { keysToSnakeDeep } from '../../src/utils/supabase/key-transform'

// Execute the real provider's serializer and save function without the app/auth runtime.
function provider() {
  const file = 'modules/art-supabase-hr/src/api/modules/employee-experience.ts'
  const source = ts.createSourceFile(
    file,
    readFileSync(new URL('../../' + file, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest,
    true
  )
  const declarations = source.statements.filter(
    (statement) =>
      (ts.isFunctionDeclaration(statement) &&
        statement.name?.text === 'saveEmployeeExperienceRecord') ||
      (ts.isVariableStatement(statement) &&
        statement.declarationList.declarations.some(
          (declaration) =>
            ts.isIdentifier(declaration.name) && declaration.name.text === 'normalizeRecordPayload'
        ))
  )
  assert.equal(declarations.length, 2)
  const code = ts.transpileModule(
    declarations.map((node) => node.getText(source).replace(/^export\s+/, '')).join('\n') +
      '\nsaveEmployeeExperienceRecord',
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } }
  ).outputText
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const save = runInNewContext(
    code,
    {
      omit,
      keysToSnakeDeep,
      supabase: {
        rpc: (name: string, args: Record<string, unknown>) => {
          calls.push({ name, args: JSON.parse(JSON.stringify(args)) as Record<string, unknown> })
          return { data: 'record-id' }
        }
      },
      responseHandle: async (query: () => unknown) => query()
    },
    { timeout: 1000 }
  ) as (kind: string, record: Record<string, unknown>) => Promise<unknown>
  return { save, calls }
}
test('survey save retains its own required identity and tenant while dropping display/audit data', async () => {
  const { save, calls } = provider()
  await save('survey', {
    id: 'survey-id',
    tenantId: 'tenant-own',
    surveyCode: 'PULSE-2027',
    surveyName: '年度员工体验',
    surveyType: 'pulse',
    audienceType: 'all_active',
    minimumGroupSize: 5,
    startDate: '2027-01-01',
    endDate: '2027-01-15',
    description: '调查目的',
    audienceOrganizationName: '展示组织',
    questions: [{ private: 'not-a-write' }],
    events: [{ private: 'not-a-write' }],
    createTime: 'server-managed'
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'hr_save_employee_experience_record_secure')
  assert.equal(calls[0].args.p_kind, 'survey')
  assert.deepEqual(calls[0].args.p_payload, {
    id: 'survey-id',
    tenant_id: 'tenant-own',
    survey_code: 'PULSE-2027',
    survey_name: '年度员工体验',
    survey_type: 'pulse',
    audience_type: 'all_active',
    minimum_group_size: 5,
    start_date: '2027-01-01',
    end_date: '2027-01-15',
    description: '调查目的'
  })
})
for (const kind of ['question', 'action'])
  test(`${kind} save still strips joined survey identity and keeps its parent/tenant`, async () => {
    const { save, calls } = provider()
    await save(kind, {
      id: 'child-id',
      tenantId: 'tenant-own',
      surveyId: 'survey-id',
      surveyCode: 'DISPLAY-ONLY',
      surveyName: '展示调查',
      survey: { id: 'not-a-write' },
      organizationName: '展示组织',
      ownerEmployeeName: '展示人员',
      title: '实际写入标题',
      questionText: '实际写入题目'
    })
    assert.deepEqual(calls[0].args, {
      p_kind: kind,
      p_payload: {
        id: 'child-id',
        tenant_id: 'tenant-own',
        survey_id: 'survey-id',
        title: '实际写入标题',
        question_text: '实际写入题目'
      }
    })
  })
